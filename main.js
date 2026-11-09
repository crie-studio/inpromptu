'use strict';
const {
  app, BrowserWindow, Menu, ipcMain, screen, protocol, net, globalShortcut, dialog, clipboard, shell,
  safeStorage, session: electronSession,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { SettingsStore } = require('./src/settings');
const { createHandler } = require('./src/protocol');
const { ModelManager } = require('./src/models');
const { RemoteServer } = require('./src/remote');
const { extractNotes } = require('./src/pptx');
const { ObsClient } = require('./src/obs');
const { buildSrt } = require('./src/srt');
const { grammarWords, tokenize } = require('./renderer/shared/text.js');

const APP_ROOT = __dirname;
const PRELOAD = path.join(APP_ROOT, 'preload.js');
const ICON = path.join(APP_ROOT, 'assets', 'icon.png');
const PROTOCOL = 'inpromptu';

// Medidas compartilhadas com renderer/overlay.css
const EAR = 14;     // "orelhas" côncavas da ilha no topo da tela
const BAR_H = 40;   // barra de controles

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

// Testes automatizados: pasta de dados separada, para rodar junto com o InPromptu instalado
// sem mexer nas configurações e documentos de quem usa o app.
if (process.env.INPROMPTU_DADOS) app.setPath('userData', process.env.INPROMPTU_DADOS);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let settings;          // SettingsStore
let models;            // ModelManager
let remote;            // RemoteServer
let editorWin = null;
let engineWin = null;
let overlayWin = null;
let outputWin = null;  // segunda tela (segue a sobreposição)
const obs = new ObsClient();
let run = null;        // sessão ativa: { doc, temporary }
let doc = { pages: [''], pageIndex: 0 };
let followTimer = null;
let lastOverlayDoc = null;
let lastOverlayState = null;
let lastLevelBroadcast = 0;
let engineStatus = null; // último estado do motor de voz na sessão (a sobreposição pode abrir depois dele)
let recordingInfo = null; // amostra de voz sendo gravada: { pages, pageIndex, startedAt }
let recordingTimer = null;

const userFile = (name) => path.join(app.getPath('userData'), name);

/* ───────────────────────── Protocolo app:// ───────────────────────── */

function registerAppProtocol() {
  protocol.handle('app', createHandler([['/__models/', models.dir], ['/', APP_ROOT]]));
}

/* ───────────────────────── Documento ───────────────────────── */

function loadDoc() {
  try {
    const saved = JSON.parse(fs.readFileSync(userFile('documento.json'), 'utf8'));
    if (Array.isArray(saved.pages) && saved.pages.length) doc = sanitizeDoc(saved);
  } catch {
    doc = { pages: [EXEMPLO], pageIndex: 0 };
  }
}

function sanitizeDoc(d) {
  const pages = (Array.isArray(d?.pages) ? d.pages : [String(d?.text ?? '')]).map((p) => String(p ?? ''));
  if (!pages.length) pages.push('');
  const pageIndex = Math.min(Math.max(0, d?.pageIndex | 0), pages.length - 1);
  return { pages, pageIndex, filePath: typeof d?.filePath === 'string' ? d.filePath : null };
}

let docSaveTimer = null;
function saveDoc() {
  clearTimeout(docSaveTimer);
  docSaveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(userFile('documento.json'), JSON.stringify(doc));
    } catch (err) {
      console.error(err);
    }
  }, 400);
}

/* ───────────────────────── Janelas ───────────────────────── */

function createEditor() {
  editorWin = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: 'InPromptu',
    icon: ICON,
    backgroundColor: '#0f1013',
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  editorWin.loadURL('app://app/renderer/editor.html');
  editorWin.once('ready-to-show', () => editorWin.show());
  editorWin.on('closed', () => {
    editorWin = null;
    app.quit();
  });
  devtoolsShortcut(editorWin);
}

function createEngine() {
  engineWin = new BrowserWindow({
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  engineWin.loadURL('app://app/renderer/engine.html');
  engineWin.webContents.once('did-finish-load', () => {
    const s = settings.get();
    if (s.mode === 'tracking' && models.isInstalled(s.language)) {
      engineSend({ cmd: 'preload', modelUrl: models.urlFor(s.language) });
    }
  });
}

function devtoolsShortcut(win) {
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

function engineSend(cmd) {
  if (engineWin && !engineWin.isDestroyed()) engineWin.webContents.send('engine:cmd', cmd);
}

function overlaySend(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function displayById(id) {
  return screen.getAllDisplays().find((d) => d.id === id) || null;
}

function cursorDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function pickDisplay(s) {
  if (s.overlay === 'fullscreen') return displayById(s.fullscreenDisplayId) || cursorDisplay();
  if (s.overlay === 'notch' && !s.followMouse) return displayById(s.displayId) || screen.getPrimaryDisplay();
  return cursorDisplay();
}

/** Tela cheia translúcida (para ver outro app por baixo) em vez de opaca. */
function isTranslucent(s) {
  return s.overlay === 'fullscreen' && s.fsBgOpacity < 100;
}

function overlayBounds(s, display) {
  const b = display.bounds;
  // Translúcida: ocupa a área de trabalho, deixando a barra de tarefas livre.
  if (s.overlay === 'fullscreen') return { ...(isTranslucent(s) ? display.workArea : b) };
  if (s.overlay === 'notch') {
    const width = s.width + EAR * 2;
    return { x: Math.round(b.x + (b.width - width) / 2), y: b.y, width, height: s.height + BAR_H };
  }
  const width = s.width;
  const height = s.height + BAR_H;
  const p = s.floatingPos;
  if (p && screen.getAllDisplays().some((d) => insideRect(p, d.workArea))) {
    return { x: p.x, y: p.y, width, height };
  }
  const wa = display.workArea;
  return { x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + wa.height * 0.12), width, height };
}

function insideRect(p, r) {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
}

function createOverlay() {
  // Tipo de janela e modo de guia ficam fixos durante a sessão.
  const s = { ...settings.get(), overlay: run.overlay, mode: run.mode };
  const display = pickDisplay(s);
  const kind = s.overlay;
  const glass = kind === 'floating' && s.glass;
  const translucent = isTranslucent(s);
  // Tela cheia opaca de verdade (o Windows esconde a barra de tarefas) exige janela
  // não transparente e redimensionável; a translúcida é transparente e só cobre a área de trabalho.
  const realFullscreen = kind === 'fullscreen' && !translucent;
  run.translucent = translucent;
  const win = new BrowserWindow({
    ...overlayBounds(s, display),
    frame: false,
    transparent: !glass && !realFullscreen,
    backgroundColor: realFullscreen ? '#000000' : '#00000000',
    ...(glass ? { backgroundMaterial: 'acrylic', roundedCorners: true } : {}),
    resizable: realFullscreen,
    movable: kind !== 'notch',
    minimizable: false,
    maximizable: realFullscreen,
    fullscreenable: realFullscreen,
    alwaysOnTop: true,
    skipTaskbar: kind !== 'fullscreen',
    hasShadow: false,
    focusable: kind !== 'notch',
    show: false,
    title: 'InPromptu — Teleprompter',
    icon: ICON,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  overlayWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(!!s.hideFromCapture);
  win.loadURL('app://app/renderer/overlay.html');
  devtoolsShortcut(win);
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    if (kind === 'fullscreen') {
      win.show();
      placeFullscreen(win, display, translucent);
      applyClickThrough(win, s);
    } else {
      win.showInactive();
    }
  });
  win.on('moved', () => {
    if (kind === 'floating' && !s.followCursor) {
      const [x, y] = win.getPosition();
      settings.set({ floatingPos: { x, y } });
    }
  });
  win.on('closed', () => {
    if (overlayWin === win) {
      overlayWin = null;
      if (run) stopSession();
    }
  });
  startFollowing(s);
}

/** Tela cheia no monitor escolhido: opaca por cima da barra de tarefas, ou translúcida na área de trabalho. */
function placeFullscreen(win, display, translucent) {
  if (translucent) {
    win.setBounds(display.workArea);
  } else {
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setBounds(display.bounds);
    win.setFullScreen(true);
  }
  // A barra de tarefas só sai da frente quando a janela em tela cheia está em primeiro plano.
  const raise = () => {
    if (win.isDestroyed()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    win.focus();
  };
  raise();
  setTimeout(raise, 200);
}

/**
 * Tela cheia com "clique atravessa": os cliques vão para o app de baixo (ex.: OBS).
 * Os movimentos do mouse continuam chegando à página, que reativa os cliques
 * enquanto o mouse está sobre a barra de controles (ver overlay:mouse).
 */
function applyClickThrough(win, s) {
  if (!win || win.isDestroyed() || s.overlay !== 'fullscreen') return;
  if (s.fsClickThrough) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
}

/** Troca a janela da sessão sem perder a página, a posição nem a pausa. */
function recreateOverlay() {
  if (!run || !overlayWin) return;
  const st = lastOverlayState;
  if (st) {
    run.doc.pageIndex = st.page;
    run.resume = { pos: st.pos, paused: st.paused, muted: st.muted, elapsed: st.elapsed };
  }
  const old = overlayWin;
  overlayWin = null; // assim o 'closed' da janela antiga não encerra a sessão
  clearInterval(followTimer);
  old.destroy();
  createOverlay();
}

function startFollowing(s) {
  clearInterval(followTimer);
  followTimer = null;
  if (!overlayWin) return;
  if (s.overlay === 'notch' && s.followMouse) {
    let currentId = cursorDisplay().id;
    followTimer = setInterval(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const d = cursorDisplay();
      if (d.id === currentId) return;
      currentId = d.id;
      overlayWin.setBounds(overlayBounds(settings.get(), d));
    }, 400);
  } else if (s.overlay === 'floating' && s.followCursor) {
    overlayWin.setIgnoreMouseEvents(true);
    followTimer = setInterval(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const c = screen.getCursorScreenPoint();
      const wa = screen.getDisplayNearestPoint(c).workArea;
      const [w, h] = overlayWin.getSize();
      const x = Math.min(Math.max(c.x + 24, wa.x), wa.x + wa.width - w);
      const y = Math.min(Math.max(c.y + 28, wa.y), wa.y + wa.height - h);
      overlayWin.setPosition(Math.round(x), Math.round(y));
    }, 16);
  }
}

/** Aplica ao vivo as mudanças de configuração que não exigem reiniciar a sessão. */
function applyLiveSettings(prev, next) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    if (prev.hideFromCapture !== next.hideFromCapture) overlayWin.setContentProtection(!!next.hideFromCapture);
    if (next.overlay !== 'fullscreen' && (prev.width !== next.width || prev.height !== next.height)) {
      const bounds = overlayBounds(next, screen.getDisplayMatching(overlayWin.getBounds()));
      if (next.overlay === 'floating') {
        const [x, y] = overlayWin.getPosition();
        Object.assign(bounds, { x, y });
      }
      overlayWin.setBounds(bounds);
    }
    if (prev.followMouse !== next.followMouse || prev.followCursor !== next.followCursor) startFollowing(next);
    const sessionKind = run?.overlay;
    if (sessionKind === 'fullscreen') {
      const nextSession = { ...next, overlay: sessionKind };
      if (isTranslucent(nextSession) !== run.translucent) {
        // Passou de opaca para translúcida (ou o contrário): é preciso outra janela.
        recreateOverlay();
      } else {
        if (prev.fsClickThrough !== next.fsClickThrough) applyClickThrough(overlayWin, nextSession);
        if (prev.fullscreenDisplayId !== next.fullscreenDisplayId) {
          placeFullscreen(overlayWin, displayById(next.fullscreenDisplayId) || cursorDisplay(), run.translucent);
        }
      }
    }
  }
  if (prev.remoteEnabled !== next.remoteEnabled || prev.remotePort !== next.remotePort || prev.remoteToken !== next.remoteToken) {
    syncRemote().then(() => broadcast('remote:changed'));
  }
  if (run && prev.micDeviceId !== next.micDeviceId && run.mode !== 'classic') {
    engineSend(engineStartCmd({ ...next, mode: run.mode }));
  }
  if (prev.voiceSensitivity !== next.voiceSensitivity) {
    engineSend({ cmd: 'config', sensitivity: next.voiceSensitivity });
  }
  if (!run && next.mode === 'tracking' && models.isInstalled(next.language)
    && (prev.mode !== next.mode || prev.language !== next.language)) {
    engineSend({ cmd: 'preload', modelUrl: models.urlFor(next.language) });
  }
  if (['obsEnabled', 'obsHost', 'obsPort', 'obsPasswordEnc'].some((k) => prev[k] !== next[k])) syncObs();
  if (run && ['extraOutput', 'extraDisplayId', 'extraMirror'].some((k) => prev[k] !== next[k])) {
    closeOutput();
    createOutput();
  } else if (outputWin && prev.hideFromCapture !== next.hideFromCapture) {
    outputWin.setContentProtection(!!next.hideFromCapture);
  }
}

/* ───────────────────────── Segunda tela ───────────────────────── */

// Tela cheia extra (ex.: o monitor do vidro do teleprompter) que segue a sobreposição principal,
// com o layout da aba Tela cheia e espelhamento próprio.

function createOutput() {
  const s = settings.get();
  if (!run || !s.extraOutput || outputWin) return;
  const displays = screen.getAllDisplays();
  const mainDisplay = overlayWin && !overlayWin.isDestroyed() ? screen.getDisplayMatching(overlayWin.getBounds()) : null;
  const display = displayById(s.extraDisplayId)
    || displays.find((d) => d.id !== mainDisplay?.id)
    || screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    backgroundColor: '#000000',
    resizable: true,
    fullscreenable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    title: 'InPromptu — Segunda tela',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  outputWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(!!s.hideFromCapture);
  win.loadURL('app://app/renderer/overlay.html');
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    win.setFullScreen(true);
  });
  win.on('closed', () => {
    if (outputWin !== win) return;
    outputWin = null;
    overlaySend('overlay:follower', false);
  });
  overlaySend('overlay:follower', true);
}

function closeOutput() {
  const win = outputWin;
  outputWin = null;
  if (win && !win.isDestroyed()) win.destroy();
  overlaySend('overlay:follower', false);
}

/* ───────────────────────── OBS e legendas ───────────────────────── */

function obsPassword() {
  const enc = settings.get().obsPasswordEnc;
  if (!enc) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return '';
  }
}

function syncObs({ force = false } = {}) {
  const s = settings.get();
  obs.configure({ enabled: s.obsEnabled, host: s.obsHost, port: s.obsPort, password: obsPassword() }, { force });
}

function obsNotice(message) {
  editorWin?.webContents.send('obs:notice', message);
}

/** Começa a gravar no OBS junto com a leitura (se já estiver gravando, só marca o início). */
async function obsStartRecording(r) {
  try {
    const st = await obs.request('GetRecordStatus');
    if (st.outputActive) {
      r.t0 = Date.now() - (st.outputDuration || 0); // as legendas acompanham a gravação que já existia
      r.obsExternal = true;
      return;
    }
    await obs.request('StartRecord');
    r.t0 = Date.now();
    r.obsRecording = true;
  } catch (err) {
    obsNotice(`OBS: não consegui começar a gravar (${err.message}).`);
  }
}

function obsAction(action) {
  if (!obs.connected) return;
  const req = action.type === 'scene'
    ? obs.request('SetCurrentProgramScene', { sceneName: action.name })
    : obs.request('CreateRecordChapter', { chapterName: action.name });
  req.catch((err) => obsNotice(action.type === 'scene'
    ? `OBS: não troquei para a cena "${action.name}" (${err.message}).`
    : `OBS: não marquei o capítulo "${action.name}" (precisa do OBS 30.2+ gravando em MP4 híbrido).`));
}

/** Fim da leitura: para a gravação do OBS (se foi o InPromptu que começou) e salva as legendas. */
async function finishSession(r) {
  let videoPath = null;
  if (r.obsRecording && obs.connected) {
    await new Promise((res) => setTimeout(res, 1500)); // grava o finzinho da última frase
    try {
      videoPath = (await obs.request('StopRecord')).outputPath || null;
    } catch (err) {
      obsNotice(`OBS: não consegui parar a gravação (${err.message}).`);
    }
  }
  if (settings.get().subtitles && r.mode === 'tracking') saveSubtitles(r, videoPath);
}

function saveSubtitles(r, videoPath) {
  const words = [];
  for (const [page, times] of r.times) {
    const tokens = tokenize(r.doc.pages[page] || '');
    for (const [i, t] of times) {
      if (tokens[i]) words.push({ text: tokens[i].text, t: (t - r.t0) / 1000 });
    }
  }
  words.sort((a, b) => a.t - b.t);
  if (words.length < 3) return;
  const d = new Date(r.t0);
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
  // Ao lado do vídeo do OBS, com o mesmo nome; senão, em Documentos\InPromptu\Legendas.
  const file = videoPath
    ? videoPath.replace(/\.[^.\\/]+$/, '') + '.srt'
    : path.join(subtitlesDir(), `${r.name || 'InPromptu'} ${stamp}.srt`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buildSrt(words), 'utf8');
    editorWin?.webContents.send('subtitles:saved', { file, nextToVideo: !!videoPath });
  } catch (err) {
    obsNotice(`Não consegui salvar as legendas: ${err.message}`);
  }
}

const subtitlesDir = () => path.join(app.getPath('documents'), 'InPromptu', 'Legendas');

/* ───────────────────────── Sessão ───────────────────────── */

function engineStartCmd(s) {
  const tracking = s.mode === 'tracking';
  return {
    cmd: 'start',
    deviceId: s.micDeviceId,
    asr: tracking,
    modelUrl: tracking ? models.urlFor(s.language) : null,
    // Reconhecimento guiado: só as palavras da página em que a leitura começa (a sobreposição
    // manda as das páginas seguintes).
    grammar: tracking && run ? grammarWords(run.doc.pages[run.doc.pageIndex] || '') : null,
    vad: !process.env.INPROMPTU_SEM_VAD, // os testes comparam com e sem o detector
    // Testes que tocam uma gravação no microfone simulado: o áudio já passou pelo tratamento uma vez.
    rawAudio: !!process.env.INPROMPTU_AUDIO_CRU,
    sensitivity: s.voiceSensitivity,
  };
}

function startSession(sessionDoc, { temporary = false } = {}) {
  const s = settings.get();
  if (recordingInfo) return { ok: false, reason: 'recording' };
  if (s.mode === 'tracking' && !models.isInstalled(s.language)) {
    return { ok: false, reason: 'model-missing', language: s.language };
  }
  if (run) stopSession({ silent: true });
  run = {
    doc: sanitizeDoc(sessionDoc),
    temporary,
    overlay: s.overlay,
    mode: s.mode,
    name: !temporary && doc.filePath ? path.basename(doc.filePath).replace(/\.[^.]+$/, '') : '',
    t0: Date.now(),      // início da leitura (ou da gravação do OBS), base das legendas
    times: new Map(),    // página → (palavra → quando foi dita)
    lastPage: null,
  };
  lastOverlayDoc = null;
  lastOverlayState = null;
  createOverlay();
  createOutput();
  engineStatus = null;
  if (s.mode !== 'classic') engineSend(engineStartCmd(s));
  if (obs.connected && s.obsRecord) obsStartRecording(run);
  broadcast('session:changed', { running: true });
  return { ok: true };
}

function stopSession({ silent = false } = {}) {
  if (!run) return;
  // Guarda o ritmo de leitura aprendido: a próxima leitura já começa no seu passo.
  if (run.mode === 'tracking' && lastOverlayState?.rate) settings.set({ readingRate: lastOverlayState.rate });
  const ended = run;
  run = null;
  clearInterval(followTimer);
  followTimer = null;
  engineSend({ cmd: 'stop' });
  const win = overlayWin;
  overlayWin = null;
  if (win && !win.isDestroyed()) win.destroy();
  closeOutput();
  lastOverlayState = null;
  finishSession(ended);
  if (!silent) {
    broadcast('session:changed', { running: false });
    remote?.broadcast({ type: 'ended', idle: idleInfo() });
  }
}

function startFromStoredDoc() {
  const res = startSession(doc);
  if (!res.ok && editorWin) {
    editorWin.show();
    editorWin.webContents.send('session:error', res);
  }
}

function readText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const res = startSession({ pages: clean.split(/\n\s*---+\s*\n/), pageIndex: 0 }, { temporary: true });
  if (!res.ok && editorWin) {
    editorWin.show();
    editorWin.webContents.send('session:error', res);
  }
}

/* ───────────────────────── Amostra de voz ───────────────────────── */

// Grava o microfone enquanto você lê o roteiro aberto no editor (sem teleprompter), para
// ajustar o reconhecimento com a sua voz. Fica em %APPDATA%\InPromptu\amostras.

const recordingsDir = () => userFile('amostras');

function finishRecording(payload) {
  clearTimeout(recordingTimer);
  recordingInfo = null;
  editorWin?.webContents.send('recording:saved', payload);
}

function saveRecording(wav) {
  const info = recordingInfo || { pages: doc.pages, pageIndex: doc.pageIndex, startedAt: new Date() };
  const d = info.startedAt;
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
  const base = path.join(recordingsDir(), `amostra-${stamp}`);
  const bytes = Buffer.from(wav);
  const seconds = Math.round((bytes.length - 44) / 2 / 16000);
  try {
    fs.mkdirSync(recordingsDir(), { recursive: true });
    fs.writeFileSync(`${base}.wav`, bytes);
    fs.writeFileSync(`${base}.txt`, info.pages[info.pageIndex] || '');
    fs.writeFileSync(`${base}.json`, JSON.stringify({
      startedAt: info.startedAt, seconds, pageIndex: info.pageIndex, pages: info.pages,
      micDeviceId: settings.get().micDeviceId,
    }, null, 2));
    finishRecording({ name: path.basename(base), seconds });
  } catch (err) {
    finishRecording({ error: err.message });
  }
}

/* ───────────────────────── Atalhos globais ───────────────────────── */

const SHORTCUTS = [
  ['CommandOrControl+Alt+P', 'Iniciar / pausar / retomar', () => (run ? overlaySend('overlay:cmd', { cmd: 'togglePause' }) : startFromStoredDoc())],
  ['CommandOrControl+Alt+S', 'Parar', () => stopSession()],
  ['CommandOrControl+Alt+M', 'Ligar / desligar microfone', () => overlaySend('overlay:cmd', { cmd: 'toggleMute' })],
  ['CommandOrControl+Alt+PageDown', 'Próxima página', () => overlaySend('overlay:cmd', { cmd: 'nextPage' })],
  ['CommandOrControl+Alt+PageUp', 'Página anterior', () => overlaySend('overlay:cmd', { cmd: 'prevPage' })],
  ['CommandOrControl+Alt+Up', 'Voltar uma linha', () => overlaySend('overlay:cmd', { cmd: 'lineUp' })],
  ['CommandOrControl+Alt+Down', 'Avançar uma linha', () => overlaySend('overlay:cmd', { cmd: 'lineDown' })],
  ['CommandOrControl+Alt+V', 'Ler o texto copiado (área de transferência)', () => readText(clipboard.readText())],
  ['CommandOrControl+Alt+T', 'Tela cheia: cliques atravessam para o app de baixo (liga/desliga)', () => updateSettings({ fsClickThrough: !settings.get().fsClickThrough })],
];

/** Atalhos que outro programa já usa (o Windows não deixa registrar de novo). */
const busyShortcuts = new Set();

function registerShortcuts() {
  for (const [accel, , fn] of SHORTCUTS) {
    try {
      if (!globalShortcut.register(accel, fn)) busyShortcuts.add(accel);
    } catch {
      busyShortcuts.add(accel);
    }
  }
}

/* ───────────────────────── Remoto ───────────────────────── */

async function syncRemote() {
  const s = settings.get();
  try {
    if (s.remoteEnabled) await remote.start(s.remotePort, s.remoteToken);
    else await remote.stop();
  } catch (err) {
    console.error('Remoto:', err.message);
  }
}

/** Resumo do roteiro aberto no editor, para o celular mostrar antes de começar. */
function idleInfo() {
  const s = settings.get();
  let words = 0;
  for (const page of doc.pages) for (const t of tokenize(page)) if (t.norm) words++;
  const pace = s.mode === 'tracking' ? s.readingRate || 2.5 : s.speed;
  // Prévia só com o que se lê em voz alta (sem notas [ ] nem títulos #).
  let preview = tokenize(doc.pages[doc.pageIndex] || '').filter((t) => t.norm).map((t) => t.text).join(' ');
  if (preview.length > 180) {
    const cut = preview.lastIndexOf(' ', 180);
    preview = preview.slice(0, cut > 0 ? cut : 180) + '…';
  }
  return {
    name: doc.filePath ? path.basename(doc.filePath, path.extname(doc.filePath)) : null,
    pages: doc.pages.length,
    pageIndex: doc.pageIndex,
    words,
    minutes: words ? Math.max(1, Math.round(words / pace / 60)) : 0,
    preview,
  };
}

function remoteSettings() {
  const s = settings.get();
  return { type: 'settings', mode: run ? run.mode : s.mode, speed: s.speed, highlight: s.highlight };
}

let idleBroadcastTimer = null;
function broadcastIdle() {
  if (run || !remote?.clientCount()) return;
  clearTimeout(idleBroadcastTimer);
  idleBroadcastTimer = setTimeout(() => {
    if (!run) remote.broadcast({ type: 'ended', idle: idleInfo() });
  }, 400);
}

function remoteSnapshot() {
  const out = [remoteSettings()];
  if (run && lastOverlayDoc) out.push({ type: 'doc', ...lastOverlayDoc });
  if (run && lastOverlayState) out.push({ type: 'state', ...lastOverlayState });
  if (!run) out.push({ type: 'ended', idle: idleInfo() });
  return out;
}

function onRemoteCommand(msg) {
  switch (msg.cmd) {
    case 'togglePause':
    case 'nextPage':
    case 'prevPage':
    case 'toggleMute':
    case 'lineUp':
    case 'lineDown':
      if (run) overlaySend('overlay:cmd', { cmd: msg.cmd });
      else if (msg.cmd === 'togglePause') startFromStoredDoc();
      break;
    case 'start':
      if (!run) startFromStoredDoc();
      break;
    case 'jump':
      overlaySend('overlay:cmd', { cmd: 'jump', index: msg.index | 0 });
      break;
    case 'restartPage':
      overlaySend('overlay:cmd', { cmd: 'jump', index: 0 });
      break;
    case 'speed': {
      const speed = Math.round((settings.get().speed + (Number(msg.delta) || 0)) * 100) / 100;
      updateSettings({ speed });
      break;
    }
    case 'setMode':
      if (!run && ['tracking', 'classic', 'voice'].includes(msg.mode)) updateSettings({ mode: msg.mode });
      break;
    case 'stop':
      stopSession();
      break;
    case 'setText':
      if (typeof msg.text === 'string' && msg.text.trim()) {
        startSession({ pages: [msg.text], pageIndex: 0 }, { temporary: true });
      }
      break;
    case 'updateText':
      if (run && typeof msg.text === 'string') {
        if (typeof lastOverlayDoc?.page === 'number') run.doc.pages[lastOverlayDoc.page] = msg.text;
        overlaySend('overlay:cmd', { cmd: 'replaceText', text: msg.text });
      }
      break;
    default:
  }
}

/* ───────────────────────── Arquivos ───────────────────────── */

async function readScriptFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (ext === '.pptx') {
    const pages = await extractNotes(fs.readFileSync(filePath));
    if (!pages.length) throw new Error('Nenhuma anotação do apresentador foi encontrada nesse PowerPoint.');
    return { name, pages, filePath: null };
  }
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  // .inpromptu é o formato atual; .roteiro é o mesmo formato, da época em que o app se chamava Roteiro.
  if (ext === '.inpromptu' || ext === '.roteiro' || ext === '.json') {
    const data = JSON.parse(raw);
    return { name, pages: sanitizeDoc(data).pages, filePath: ext === '.inpromptu' ? filePath : null };
  }
  return { name, pages: raw.replace(/\r\n?/g, '\n').split(/\n\s*---+\s*\n/), filePath: null };
}

function writeScriptFile(filePath, pages) {
  fs.writeFileSync(filePath, JSON.stringify({ app: 'inpromptu', version: 1, pages }, null, 2));
}

/* ───────────────────────── IPC ───────────────────────── */

function updateSettings(patch) {
  const prev = settings.get();
  const next = settings.set(patch || {});
  broadcast('settings:changed', next);
  applyLiveSettings(prev, next);
  if (prev.mode !== next.mode || prev.speed !== next.speed || prev.highlight !== next.highlight || prev.readingRate !== next.readingRate) {
    remote?.broadcast(remoteSettings());
    broadcastIdle();
  }
  return next;
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:set', (_e, patch) => updateSettings(patch));
  ipcMain.handle('settings:newRemoteToken', () => {
    const prev = settings.get();
    const next = settings.set({ remoteToken: SettingsStore.newToken() });
    applyLiveSettings(prev, next);
    return next;
  });

  ipcMain.handle('displays:list', () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `${d.label || `Monitor ${i + 1}`} — ${d.size.width}×${d.size.height}${d.id === primary ? ' (principal)' : ''}`,
    }));
  });

  ipcMain.handle('doc:get', () => doc);
  ipcMain.on('doc:update', (_e, d) => {
    doc = sanitizeDoc(d);
    saveDoc();
    broadcastIdle();
  });

  ipcMain.handle('file:open', async () => {
    const r = await dialog.showOpenDialog(editorWin, {
      title: 'Abrir roteiro',
      properties: ['openFile'],
      filters: [
        { name: 'Roteiros e textos', extensions: ['inpromptu', 'roteiro', 'txt', 'md', 'pptx'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return readScriptFile(r.filePaths[0]);
  });
  ipcMain.handle('file:read', (_e, filePath) => readScriptFile(String(filePath)));
  ipcMain.handle('file:save', async (_e, { filePath, pages, saveAs }) => {
    let target = !saveAs && filePath && filePath.toLowerCase().endsWith('.inpromptu') ? filePath : null;
    if (!target) {
      const r = await dialog.showSaveDialog(editorWin, {
        title: 'Salvar roteiro',
        defaultPath: filePath ? filePath.replace(/\.[^.\\/]+$/, '.inpromptu') : 'Meu roteiro.inpromptu',
        filters: [{ name: 'Roteiro do InPromptu', extensions: ['inpromptu'] }],
      });
      if (r.canceled || !r.filePath) return null;
      target = r.filePath;
    }
    writeScriptFile(target, pages.map(String));
    return { filePath: target, name: path.basename(target) };
  });

  ipcMain.handle('models:list', () => models.list());
  ipcMain.handle('models:download', async (_e, id) => {
    let last = 0;
    try {
      await models.download(id, (p) => {
        const now = Date.now();
        if (p.phase !== 'download' || now - last > 120) {
          last = now;
          broadcast('models:progress', { id, ...p });
        }
      });
      const s = settings.get();
      if (s.mode === 'tracking' && s.language === id) engineSend({ cmd: 'preload', modelUrl: models.urlFor(id) });
      return { ok: true };
    } catch (err) {
      broadcast('models:progress', { id, phase: 'error', message: err.message });
      return { ok: false, message: err.message };
    }
  });

  ipcMain.handle('session:start', (_e, d) => {
    if (d) {
      doc = sanitizeDoc(d);
      saveDoc();
    }
    return startSession(doc);
  });
  ipcMain.handle('session:stop', () => stopSession());
  ipcMain.handle('session:running', () => !!run);

  ipcMain.handle('overlay:init', (e) => {
    if (!run) return null;
    const s = settings.get();
    if (outputWin && e.sender === outputWin.webContents) {
      // Segunda tela: tela cheia, sem controles nem câmera, com o espelhamento dela.
      const fixed = {
        mode: run.mode, overlay: 'fullscreen', mirror: s.extraMirror, fsShowBar: false,
        camDeviceId: '', fsBgOpacity: 100, showTimer: false, countdown: 0,
      };
      return {
        pages: run.doc.pages,
        pageIndex: lastOverlayDoc?.page ?? run.doc.pageIndex,
        settings: { ...s, ...fixed },
        fixed,
        follower: true,
      };
    }
    const resume = run.resume || null;
    run.resume = null;
    const fixed = { overlay: run.overlay, mode: run.mode };
    return {
      pages: run.doc.pages,
      pageIndex: run.doc.pageIndex,
      settings: { ...s, ...fixed },
      fixed,
      resume,
      engineStatus,
      hasFollower: !!outputWin,
    };
  });
  ipcMain.on('overlay:doc', (_e, d) => {
    // O texto original da página (com # e [ ]) vai junto, para o celular poder editá-lo.
    lastOverlayDoc = { ...d, text: typeof d.page === 'number' ? run?.doc.pages[d.page] : undefined };
    remote?.broadcast({ type: 'doc', ...lastOverlayDoc });
    if (run && typeof d.page === 'number' && d.page !== run.lastPage) {
      // Capítulo na gravação do OBS a cada página nova.
      const s = settings.get();
      if (run.lastPage !== null && s.obsChapters && (run.obsRecording || run.obsExternal)) {
        obsAction({ type: 'chapter', name: `Página ${d.page + 1}` });
      }
      run.lastPage = d.page;
    }
    if (run && !run.temporary && typeof d.page === 'number') {
      doc.pageIndex = d.page;
      editorWin?.webContents.send('session:page', d.page);
    }
  });
  ipcMain.on('overlay:times', (_e, entries) => {
    if (!run || !Array.isArray(entries)) return;
    for (const [page, index, t] of entries) {
      if (!run.times.has(page)) run.times.set(page, new Map());
      run.times.get(page).set(index, t);
    }
  });
  ipcMain.on('overlay:action', (_e, action) => {
    if (run && action && typeof action.name === 'string') obsAction(action);
  });
  ipcMain.on('overlay:frame', (e, f) => {
    if (outputWin && !outputWin.isDestroyed() && e.sender !== outputWin.webContents) {
      outputWin.webContents.send('overlay:frame', f);
    }
  });

  ipcMain.handle('obs:status', () => obs.status());
  ipcMain.handle('obs:reconnect', () => {
    syncObs({ force: true });
    return obs.status();
  });
  ipcMain.handle('obs:setPassword', (_e, password) => {
    const value = String(password || '');
    const enc = value && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value).toString('base64')
      : '';
    updateSettings({ obsPasswordEnc: enc });
    return !!enc || !value;
  });
  ipcMain.handle('app:openSubtitles', () => {
    fs.mkdirSync(subtitlesDir(), { recursive: true });
    return shell.openPath(subtitlesDir());
  });
  ipcMain.handle('app:showFile', (_e, file) => {
    if (typeof file === 'string' && fs.existsSync(file)) shell.showItemInFolder(file);
  });
  ipcMain.on('overlay:state', (_e, st) => {
    lastOverlayState = st;
    remote?.broadcast({ type: 'state', ...st });
    editorWin?.webContents.send('session:state', st);
  });
  ipcMain.on('overlay:stop', () => stopSession());
  ipcMain.on('overlay:mouse', (_e, { overBar } = {}) => {
    if (!overlayWin || run?.overlay !== 'fullscreen' || !settings.get().fsClickThrough) return;
    if (overBar) overlayWin.setIgnoreMouseEvents(false);
    else overlayWin.setIgnoreMouseEvents(true, { forward: true });
  });
  ipcMain.on('overlay:engine', (_e, cmd) => {
    if (cmd && (cmd.cmd === 'mute' || cmd.cmd === 'reset')) engineSend(cmd);
  });

  ipcMain.handle('recording:start', () => {
    if (run) return { ok: false, reason: 'running' };
    if (!recordingInfo) {
      recordingInfo = { pages: doc.pages.slice(), pageIndex: doc.pageIndex, startedAt: new Date() };
      engineSend({ cmd: 'start', deviceId: settings.get().micDeviceId, asr: false, record: true });
    }
    return { ok: true };
  });
  ipcMain.handle('recording:stop', () => {
    if (!recordingInfo) return { ok: false };
    engineSend({ cmd: 'stop' });
    // Sem áudio (ex.: microfone indisponível) o motor não manda nada: não fica esperando para sempre.
    recordingTimer = setTimeout(() => finishRecording({ error: 'Nenhum áudio foi gravado.' }), 5000);
    return { ok: true };
  });
  ipcMain.on('engine:recording', (_e, wav) => saveRecording(wav));
  ipcMain.handle('app:openRecordings', () => {
    fs.mkdirSync(recordingsDir(), { recursive: true });
    return shell.openPath(recordingsDir());
  });

  ipcMain.on('engine:event', (_e, ev) => {
    if (ev.type === 'status' && run) engineStatus = ev;
    overlaySend('engine:event', ev);
    if (ev.type === 'level') {
      const now = Date.now();
      if (now - lastLevelBroadcast > 90) {
        lastLevelBroadcast = now;
        remote?.broadcast({ type: 'level', level: ev.level });
      }
    } else if (ev.type === 'status') {
      editorWin?.webContents.send('engine:status', ev);
    }
  });

  ipcMain.handle('remote:info', () => remote.info());
  ipcMain.handle('shortcuts:list', () => SHORTCUTS.map(([accel, label]) => ({
    accel: accel.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + '),
    label,
    busy: busyShortcuts.has(accel),
  })));
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('app:openMicSettings', () => shell.openExternal('ms-settings:privacy-microphone'));
}

/* ───────────────────────── Ciclo de vida ───────────────────────── */

function handleDeepLink(argv) {
  const link = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (!link) return false;
  try {
    const url = new URL(link);
    if (url.hostname === 'read') readText(url.searchParams.get('text'));
  } catch { /* link inválido */ }
  return true;
}

/** Arquivo aberto pelo Explorer (duplo clique num .inpromptu, "Abrir com"…). */
function handleFileArg(argv) {
  const file = argv.slice(1).find((a) => /\.(inpromptu|roteiro|txt|md|pptx)$/i.test(a) && fs.existsSync(a));
  if (!file || !editorWin) return false;
  const send = () => readScriptFile(file)
    .then((result) => editorWin?.webContents.send('file:opened', result))
    .catch((err) => editorWin?.webContents.send('file:opened', { error: err.message }));
  if (editorWin.webContents.isLoading()) editorWin.webContents.once('did-finish-load', send);
  else send();
  return true;
}

app.on('second-instance', (_e, argv) => {
  if (handleDeepLink(argv)) return;
  handleFileArg(argv);
  if (editorWin) {
    if (editorWin.isMinimized()) editorWin.restore();
    editorWin.show();
    editorWin.focus();
  }
});

/**
 * O app se chamava Roteiro (dados em %APPDATA%\Roteiro). Na primeira abertura como InPromptu, traz
 * as configurações, o roteiro aberto, o modelo de voz e as amostras — copiando, sem apagar nada.
 */
function migrateFromRoteiro() {
  if (process.env.INPROMPTU_DADOS) return;
  const dir = app.getPath('userData');
  const old = path.join(app.getPath('appData'), 'Roteiro');
  if (fs.existsSync(path.join(dir, 'settings.json')) || !fs.existsSync(path.join(old, 'settings.json'))) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ['settings.json', 'documento.json', 'modelos', 'amostras']) {
      const from = path.join(old, name);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, name), { recursive: true });
    }
  } catch (err) {
    console.error('Migração do Roteiro:', err.message);
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  migrateFromRoteiro();
  settings = new SettingsStore(app.getPath('userData'));
  models = new ModelManager(userFile('modelos'), (url) => net.fetch(url));
  remote = new RemoteServer({
    htmlPath: path.join(APP_ROOT, 'renderer', 'remote.html'),
    iconPath: path.join(APP_ROOT, 'assets', 'icon.png'),
    onCommand: onRemoteCommand,
    snapshot: remoteSnapshot,
  });
  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);

  const ses = electronSession.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  registerAppProtocol();
  loadDoc();
  registerIpc();
  createEngine();
  createEditor();
  registerShortcuts();
  syncRemote();
  obs.on('status', (st) => editorWin?.webContents.send('obs:status', st));
  syncObs();
  if (!handleDeepLink(process.argv)) handleFileArg(process.argv);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  obs.disconnect();
  settings?.flush();
  try {
    fs.writeFileSync(userFile('documento.json'), JSON.stringify(doc));
  } catch { /* ignore */ }
});

app.on('window-all-closed', () => app.quit());

const EXEMPLO = `# Bem-vindo ao InPromptu
Olá! Este é o InPromptu, o teleprompter que acompanha a sua voz. [sorria]

Cole o seu texto aqui, escolha o modo de leitura e clique em Iniciar. No rastreamento de voz, cada palavra é destacada enquanto você fala e o texto sobe no seu ritmo. Se você pular uma frase, o InPromptu te reencontra.

# Dicas
O que estiver entre colchetes é uma nota para você e não precisa ser lido. [pausa] Linhas que começam com cerquilha viram seções: as teclas de um a nove pulam direto para elas.

Quando terminar, a sobreposição fecha sozinha.`;
