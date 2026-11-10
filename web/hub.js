// Versão web: o "processo principal" (o que o main.js faz no Electron), rodando na página do editor.
// Responde aos mesmos canais (settings:*, session:*, overlay:*, engine:*, obs:*, remote:*), então o
// editor, o teleprompter e o motor de voz são exatamente os do app de Windows.
import { DEFAULTS, RANGES } from '../src/settings-defaults.js';
import { buildSrt } from '../src/srt.js';
import { extractNotes } from '../src/pptx.js';
import textLib from '../renderer/shared/text.js';
import QRCode from 'qrcode';
import { ObsClient } from './obs.js';
import { RemotePeer } from './remote.js';

/* global __VERSION__, __MODELS__ */
const { tokenize, grammarWords } = textLib;
const VERSION = __VERSION__;
const MODELS = __MODELS__;
const AUTHOR = 'Luiz Felipe Pitzer';
const WEBSITE = 'https://lfp.app.br';
const HAS_PIP = 'documentPictureInPicture' in window;
const MODEL_CACHE = 'inpromptu-modelos';

const hubId = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const channel = new BroadcastChannel(`inpromptu-${hubId}`);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
};

/* ───────────────────────── Mensagens ───────────────────────── */

function emit(to, ch, payload) {
  if (to === 'editor' || to === '*') window.__inpromptuEditor?.dispatch(ch, payload);
  if (to !== 'editor') channel.postMessage({ t: 'event', to, ch, payload });
}
const broadcast = (ch, payload) => emit('*', ch, payload);
const overlaySend = (ch, payload) => emit('overlay', ch, payload);
const notice = (message) => emit('editor', 'obs:notice', message);

channel.onmessage = async (e) => {
  const m = e.data;
  if (!m) return;
  if (m.t === 'invoke') {
    let reply;
    try {
      reply = { ok: true, value: await invoke(m.from, m.ch, m.args || []) };
    } catch (err) {
      reply = { ok: false, error: err?.message || String(err) };
    }
    channel.postMessage({ t: 'reply', to: m.from, id: m.id, ...reply });
  } else if (m.t === 'send') {
    send(m.from, m.ch, m.payload);
  }
};

/* ───────────────────────── Configurações ───────────────────────── */

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** "Ilha no topo da tela" não existe no navegador: vira a janela flutuante (ou a tela cheia). */
const webOverlay = (kind) => (kind === 'notch' ? (HAS_PIP ? 'floating' : 'fullscreen') : kind);

function loadSettings() {
  const v = { ...DEFAULTS };
  try {
    const saved = JSON.parse(store.get('inpromptu.settings') || '{}');
    for (const key of Object.keys(DEFAULTS)) if (key in saved) v[key] = saved[key];
  } catch { /* primeira vez */ }
  if (!store.get('inpromptu.settings')) v.overlay = HAS_PIP ? 'floating' : 'fullscreen'; // primeira vez
  v.overlay = webOverlay(v.overlay);
  if (!v.remoteToken) v.remoteToken = newToken();
  v.obsPasswordEnc = store.get('inpromptu.obsPassword') ? 'web' : '';
  return v;
}

let settings = loadSettings();
let settingsTimer = null;

function setSettings(patch) {
  for (const [key, raw] of Object.entries(patch || {})) {
    if (!(key in DEFAULTS)) continue;
    let value = raw;
    if (RANGES[key]) {
      const [min, max] = RANGES[key];
      value = Math.min(max, Math.max(min, Number(value) || min));
    }
    settings[key] = value;
  }
  settings.overlay = webOverlay(settings.overlay);
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => store.set('inpromptu.settings', JSON.stringify(settings)), 300);
  return { ...settings };
}

function updateSettings(patch) {
  const prev = { ...settings };
  const next = setSettings(patch);
  broadcast('settings:changed', next);
  applyLiveSettings(prev, next);
  if (prev.mode !== next.mode || prev.speed !== next.speed || prev.highlight !== next.highlight || prev.readingRate !== next.readingRate) {
    remote.broadcast(remoteSettings());
    broadcastIdle();
  }
  return next;
}

function applyLiveSettings(prev, next) {
  if (prev.remoteEnabled !== next.remoteEnabled || prev.remoteToken !== next.remoteToken) syncRemote();
  if (run && prev.micDeviceId !== next.micDeviceId && run.mode !== 'classic') engineSend(engineStartCmd({ ...next, mode: run.mode }));
  if (prev.voiceSensitivity !== next.voiceSensitivity) engineSend({ cmd: 'config', sensitivity: next.voiceSensitivity });
  if (!run && next.mode === 'tracking' && installed.has(next.language) && (prev.mode !== next.mode || prev.language !== next.language)) {
    engineSend({ cmd: 'preload', modelUrl: modelUrlFor(next.language) });
  }
  if (['obsEnabled', 'obsHost', 'obsPort', 'obsPasswordEnc'].some((k) => prev[k] !== next[k])) syncObs();
}

/* ───────────────────────── Documento ───────────────────────── */

const EXEMPLO = `# Bem-vindo ao InPromptu
Olá! Este é o InPromptu, o teleprompter que acompanha a sua voz, agora direto no navegador. [sorria]

Cole o seu texto aqui, escolha o modo de leitura e clique em Iniciar. No rastreamento de voz, cada palavra é destacada enquanto você fala e o texto sobe no seu ritmo. Se você pular uma frase, o InPromptu te reencontra.

# Dicas
O que estiver entre colchetes é uma nota para você e não precisa ser lido. [pausa] Linhas que começam com cerquilha viram seções: as teclas de um a nove pulam direto para elas.

Quando terminar, aperte Esc ou o botão de parar.`;

function sanitizeDoc(d) {
  const pages = (Array.isArray(d?.pages) ? d.pages : [String(d?.text ?? '')]).map((p) => String(p ?? ''));
  if (!pages.length) pages.push('');
  const pageIndex = Math.min(Math.max(0, d?.pageIndex | 0), pages.length - 1);
  return { pages, pageIndex, filePath: typeof d?.filePath === 'string' ? d.filePath : null };
}

let doc;
try {
  const savedDoc = JSON.parse(store.get('inpromptu.doc') || 'null');
  doc = savedDoc && Array.isArray(savedDoc.pages) && savedDoc.pages.length ? sanitizeDoc(savedDoc) : { pages: [EXEMPLO], pageIndex: 0, filePath: null };
} catch {
  doc = { pages: [EXEMPLO], pageIndex: 0, filePath: null };
}

let docTimer = null;
function saveDoc() {
  clearTimeout(docTimer);
  docTimer = setTimeout(() => store.set('inpromptu.doc', JSON.stringify(doc)), 400);
}

const baseName = (p) => String(p || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

/* ───────────────────────── Arquivos ───────────────────────── */

const fileHandles = new Map(); // filePath (web-…/nome.inpromptu) → FileSystemFileHandle

async function readScriptFile(file) {
  const name = file.name;
  const ext = (/\.[^.]+$/.exec(name)?.[0] || '').toLowerCase();
  if (ext === '.pptx') {
    const pages = await extractNotes(await file.arrayBuffer());
    if (!pages.length) throw new Error('Nenhuma anotação do apresentador foi encontrada nesse PowerPoint.');
    return { name, pages, filePath: null };
  }
  const raw = (await file.text()).replace(/^﻿/, '');
  if (ext === '.inpromptu' || ext === '.roteiro' || ext === '.json') {
    const data = JSON.parse(raw);
    return { name, pages: sanitizeDoc(data).pages, filePath: ext === '.inpromptu' ? `web-${Date.now()}/${name}` : null };
  }
  return { name, pages: raw.replace(/\r\n?/g, '\n').split(/\n\s*---+\s*\n/), filePath: null };
}

function openFileDialog() {
  if (window.showOpenFilePicker) {
    return window.showOpenFilePicker({
      types: [{
        description: 'Roteiros e textos',
        accept: { 'application/octet-stream': ['.inpromptu', '.roteiro', '.pptx'], 'text/plain': ['.txt', '.md'] },
      }],
    }).then(async ([handle]) => {
      const res = await readScriptFile(await handle.getFile());
      if (res.filePath) fileHandles.set(res.filePath, handle);
      return res;
    }, () => null);
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.inpromptu,.roteiro,.txt,.md,.pptx';
    input.onchange = () => (input.files[0] ? readScriptFile(input.files[0]).then(resolve, reject) : resolve(null));
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function writeHandle(handle, data) {
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
}

async function saveFile({ filePath, pages, saveAs }) {
  const data = JSON.stringify({ app: 'inpromptu', version: 1, pages: pages.map(String) }, null, 2);
  const existing = !saveAs && filePath ? fileHandles.get(filePath) : null;
  if (existing) {
    await writeHandle(existing, data);
    return { filePath, name: existing.name };
  }
  const suggested = `${filePath ? baseName(filePath) : 'Meu roteiro'}.inpromptu`;
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'Roteiro do InPromptu', accept: { 'application/json': ['.inpromptu'] } }],
      });
    } catch {
      return null;
    }
    await writeHandle(handle, data);
    const key = `web-${Date.now()}/${handle.name}`;
    fileHandles.set(key, handle);
    return { filePath: key, name: handle.name };
  }
  download(suggested, data, 'application/json');
  return { filePath: null, name: suggested };
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ───────────────────────── Modelos de voz ───────────────────────── */

// Os modelos ficam no próprio site (models/…tar.gz). "Baixar" guarda o arquivo no navegador
// (Cache Storage); o service worker o entrega dali, então a voz funciona até sem internet.
const installed = new Set();
const downloads = new Map();
const modelFor = (id) => MODELS.find((m) => m.id === id) || null;
const modelUrlFor = (id) => new URL(`models/${modelFor(id)?.file}.tar.gz`, location.href).href;

let installedReady = Promise.resolve();
async function refreshInstalled() {
  try {
    const cache = await caches.open(MODEL_CACHE);
    for (const m of MODELS) if (await cache.match(modelUrlFor(m.id))) installed.add(m.id);
  } catch { /* sem Cache Storage (site sem https) */ }
}

function downloadModel(id) {
  if (downloads.has(id)) return downloads.get(id);
  const m = modelFor(id);
  if (!m) return Promise.resolve({ ok: false, message: `Modelo desconhecido: ${id}` });
  const job = (async () => {
    const url = modelUrlFor(id);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
    const total = Number(res.headers.get('content-length')) || m.sizeMB * 1024 * 1024;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    let last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (Date.now() - last > 120) {
        last = Date.now();
        broadcast('models:progress', { id, phase: 'download', received, total });
      }
    }
    const blob = new Blob(chunks, { type: 'application/gzip' });
    try {
      const cache = await caches.open(MODEL_CACHE);
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(blob.size) } }));
    } catch { /* sem Cache Storage: o navegador baixa de novo quando precisar */ }
    installed.add(id);
    broadcast('models:progress', { id, phase: 'done' });
    if (settings.mode === 'tracking' && settings.language === id) engineSend({ cmd: 'preload', modelUrl: url });
    return { ok: true };
  })().catch((err) => {
    broadcast('models:progress', { id, phase: 'error', message: err.message });
    return { ok: false, message: err.message };
  }).finally(() => downloads.delete(id));
  downloads.set(id, job);
  return job;
}

/* ───────────────────────── Motor de voz ───────────────────────── */

let engineReady = false;
const engineQueue = [];
let engineStatus = null;
let lastLevelBroadcast = 0;

function createEngine() {
  const frame = document.createElement('iframe');
  frame.src = `engine.html?role=engine&hub=${hubId}`;
  frame.allow = 'microphone';
  frame.hidden = true;
  frame.title = 'Motor de voz';
  frame.addEventListener('load', () => {
    engineReady = true;
    for (const cmd of engineQueue.splice(0)) emit('engine', 'engine:cmd', cmd);
  });
  document.body.append(frame);
}

function engineSend(cmd) {
  if (engineReady) emit('engine', 'engine:cmd', cmd);
  else engineQueue.push(cmd);
}

function engineStartCmd(s) {
  const tracking = s.mode === 'tracking';
  return {
    cmd: 'start',
    deviceId: s.micDeviceId,
    asr: tracking,
    modelUrl: tracking ? modelUrlFor(s.language) : null,
    grammar: tracking && run ? grammarWords(run.doc.pages[run.doc.pageIndex] || '') : null,
    vad: true,
    rawAudio: false,
    sensitivity: s.voiceSensitivity,
  };
}

/* ───────────────────────── Teleprompter (janelas) ───────────────────────── */

let run = null;
let stage = null;      // { kind, frame, win?, close() }
let follower = null;   // janela da segunda tela
let followerTimer = null;
let lastOverlayDoc = null;
let lastOverlayState = null;

/**
 * Abre o teleprompter. Precisa ser chamado direto do clique (sem await antes): tela cheia e janela
 * flutuante só são permitidas com um gesto da pessoa. Sem gesto (ex.: começou pelo celular), o
 * teleprompter ocupa a janela do navegador, e "F" põe em tela cheia.
 */
function openStage(kind) {
  const url = `overlay.html?role=overlay&hub=${hubId}`;
  if (kind === 'floating' && HAS_PIP) {
    const pending = { kind, frame: null, win: null, close() { this.closed = true; } };
    stage = pending;
    window.documentPictureInPicture.requestWindow({ width: settings.width, height: settings.height + 40 }).then((pip) => {
      if (stage !== pending || pending.closed) {
        pip.close();
        return;
      }
      pip.document.title = 'InPromptu';
      pip.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
      const frame = pip.document.createElement('iframe');
      frame.src = new URL(url, location.href).href;
      frame.allow = 'camera; microphone; fullscreen';
      frame.style.cssText = 'border:0;display:block;width:100vw;height:100vh';
      pip.document.body.append(frame);
      pip.addEventListener('pagehide', () => {
        if (stage?.win === pip) {
          stage = null;
          if (run) stopSession();
        }
      });
      stage = { kind, frame, win: pip, close: () => pip.close() };
    }, () => {
      // Sem janela flutuante (sem gesto da pessoa, ou o navegador recusou): o teleprompter ocupa
      // a página, com o visual da tela cheia.
      if (stage !== pending || pending.closed) return;
      if (run) run.overlay = 'fullscreen';
      openLayer(url, 'layer');
    });
    return;
  }
  openLayer(url, kind);
}

function openLayer(url, kind) {
  const frame = document.createElement('iframe');
  frame.className = 'inpromptu-stage';
  frame.src = url;
  frame.allow = 'camera; microphone; fullscreen';
  frame.title = 'Teleprompter';
  document.body.append(frame);
  stage = {
    kind,
    frame,
    close: () => {
      if (document.fullscreenElement === frame) document.exitFullscreen().catch(() => {});
      frame.remove();
    },
  };
  if (kind === 'fullscreen') frame.requestFullscreen?.().catch(() => {});
  frame.focus();
}

function closeStage() {
  const s = stage;
  stage = null;
  s?.close();
}

function openFollower() {
  if (!run) {
    notice('A segunda tela abre durante a leitura.');
    return;
  }
  if (follower && !follower.closed) {
    follower.focus();
    return;
  }
  const w = window.open(`overlay.html?role=follower&hub=${hubId}`, 'inpromptu-segunda-tela', 'popup,width=960,height=540');
  if (!w) {
    notice('O navegador bloqueou a segunda tela. Permita janelas pop-up para este site ou use o botão "Abrir a segunda tela".');
    return;
  }
  follower = w;
  overlaySend('overlay:follower', true);
  clearInterval(followerTimer);
  followerTimer = setInterval(() => {
    if (follower && !follower.closed) return;
    follower = null;
    clearInterval(followerTimer);
    overlaySend('overlay:follower', false);
  }, 1000);
}

function closeFollower() {
  clearInterval(followerTimer);
  if (follower && !follower.closed) follower.close();
  follower = null;
  overlaySend('overlay:follower', false);
}

/* ───────────────────────── Sessão ───────────────────────── */

function startSession(sessionDoc, { temporary = false } = {}) {
  const s = settings;
  if (s.mode === 'tracking' && !installed.has(s.language)) return { ok: false, reason: 'model-missing', language: s.language };
  if (run) stopSession({ silent: true });
  run = {
    doc: sanitizeDoc(sessionDoc),
    temporary,
    overlay: s.overlay === 'floating' ? 'floating' : 'fullscreen',
    mode: s.mode,
    name: !temporary && doc.filePath ? baseName(doc.filePath) : '',
    t0: Date.now(),
    times: new Map(),
    lastPage: null,
  };
  lastOverlayDoc = null;
  lastOverlayState = null;
  engineStatus = null;
  openStage(run.overlay);
  if (s.extraOutput) openFollower();
  if (s.mode !== 'classic') engineSend(engineStartCmd(s));
  if (obs.connected && s.obsRecord) obsStartRecording(run);
  broadcast('session:changed', { running: true });
  return { ok: true };
}

function stopSession({ silent = false } = {}) {
  if (!run) return;
  if (run.mode === 'tracking' && lastOverlayState?.rate) setSettings({ readingRate: lastOverlayState.rate });
  const ended = run;
  run = null;
  engineSend({ cmd: 'stop' });
  closeStage();
  closeFollower();
  lastOverlayState = null;
  finishSession(ended);
  if (!silent) {
    broadcast('session:changed', { running: false });
    remote.broadcast({ type: 'ended', idle: idleInfo() });
  }
}

function startFromStoredDoc() {
  const res = startSession(doc);
  if (!res.ok) emit('editor', 'session:error', res);
}

function readText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const res = startSession({ pages: clean.split(/\n\s*---+\s*\n/), pageIndex: 0 }, { temporary: true });
  if (!res.ok) emit('editor', 'session:error', res);
}

/* ───────────────────────── OBS e legendas ───────────────────────── */

const obs = new ObsClient();
obs.onStatus((st) => emit('editor', 'obs:status', st));

function syncObs({ force = false } = {}) {
  obs.configure({
    enabled: settings.obsEnabled,
    host: settings.obsHost,
    port: settings.obsPort,
    password: store.get('inpromptu.obsPassword') || '',
  }, { force });
}

async function obsStartRecording(r) {
  try {
    const st = await obs.request('GetRecordStatus');
    if (st.outputActive) {
      r.t0 = Date.now() - (st.outputDuration || 0);
      r.obsExternal = true;
      return;
    }
    await obs.request('StartRecord');
    r.t0 = Date.now();
    r.obsRecording = true;
  } catch (err) {
    notice(`OBS: não consegui começar a gravar (${err.message}).`);
  }
}

function obsAction(action) {
  if (!obs.connected) return;
  const req = action.type === 'scene'
    ? obs.request('SetCurrentProgramScene', { sceneName: action.name })
    : obs.request('CreateRecordChapter', { chapterName: action.name });
  req.catch((err) => notice(action.type === 'scene'
    ? `OBS: não troquei para a cena "${action.name}" (${err.message}).`
    : `OBS: não marquei o capítulo "${action.name}" (precisa do OBS 30.2+ gravando em MP4 híbrido).`));
}

async function finishSession(r) {
  let videoPath = null;
  if (r.obsRecording && obs.connected) {
    await new Promise((res) => setTimeout(res, 1500));
    try {
      videoPath = (await obs.request('StopRecord')).outputPath || null;
    } catch (err) {
      notice(`OBS: não consegui parar a gravação (${err.message}).`);
    }
  }
  if (settings.subtitles && r.mode === 'tracking') saveSubtitles(r, videoPath);
}

/** Na web, as legendas são baixadas (com o nome do vídeo do OBS, se houver gravação). */
function saveSubtitles(r, videoPath) {
  const words = [];
  for (const [page, times] of r.times) {
    const tokens = tokenize(r.doc.pages[page] || '');
    for (const [i, t] of times) if (tokens[i]) words.push({ text: tokens[i].text, t: (t - r.t0) / 1000 });
  }
  words.sort((a, b) => a.t - b.t);
  if (words.length < 3) return;
  const d = new Date(r.t0);
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
  const name = videoPath ? `${baseName(videoPath)}.srt` : `${r.name || 'InPromptu'} ${stamp}.srt`;
  download(name, buildSrt(words), 'application/x-subrip');
  notice(videoPath
    ? `Legendas baixadas como "${name}". Coloque-as na pasta do vídeo do OBS.`
    : `Legendas baixadas: "${name}".`);
}

/* ───────────────────────── Celular ───────────────────────── */

function idleInfo() {
  let words = 0;
  for (const page of doc.pages) for (const t of tokenize(page)) if (t.norm) words++;
  const pace = settings.mode === 'tracking' ? settings.readingRate || 2.5 : settings.speed;
  let preview = tokenize(doc.pages[doc.pageIndex] || '').filter((t) => t.norm).map((t) => t.text).join(' ');
  if (preview.length > 180) {
    const cut = preview.lastIndexOf(' ', 180);
    preview = preview.slice(0, cut > 0 ? cut : 180) + '…';
  }
  return {
    name: doc.filePath ? baseName(doc.filePath) : null,
    pages: doc.pages.length,
    pageIndex: doc.pageIndex,
    words,
    minutes: words ? Math.max(1, Math.round(words / pace / 60)) : 0,
    preview,
  };
}

function remoteSettings() {
  return { type: 'settings', mode: run ? run.mode : settings.mode, speed: settings.speed, highlight: settings.highlight };
}

let idleTimer = null;
function broadcastIdle() {
  if (run || !remote.clientCount()) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
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
    case 'speed':
      updateSettings({ speed: Math.round((settings.speed + (Number(msg.delta) || 0)) * 100) / 100 });
      break;
    case 'setMode':
      if (!run && ['tracking', 'classic', 'voice'].includes(msg.mode)) updateSettings({ mode: msg.mode });
      break;
    case 'stop':
      stopSession();
      break;
    case 'setText':
      if (typeof msg.text === 'string' && msg.text.trim()) startSession({ pages: [msg.text], pageIndex: 0 }, { temporary: true });
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

const remote = new RemotePeer({ onCommand: onRemoteCommand, snapshot: remoteSnapshot, onChange: () => emit('editor', 'remote:changed') });

function syncRemote() {
  if (settings.remoteEnabled) remote.start(settings.remoteToken);
  else remote.stop();
  emit('editor', 'remote:changed');
}

async function remoteInfo() {
  if (!remote.running) return { running: false, error: null };
  const url = new URL(`celular.html?p=${settings.remoteToken}`, location.href).href;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } });
  return { running: true, url, urls: [url], qr, clients: remote.clientCount(), error: remote.error };
}

/* ───────────────────────── Atalhos (com o InPromptu em foco) ───────────────────────── */

const SHORTCUTS = [
  ['Ctrl+Alt+P', 'Iniciar / pausar / retomar', () => (run ? overlaySend('overlay:cmd', { cmd: 'togglePause' }) : startFromStoredDoc())],
  ['Ctrl+Alt+S', 'Parar', () => stopSession()],
  ['Ctrl+Alt+M', 'Ligar / desligar microfone', () => overlaySend('overlay:cmd', { cmd: 'toggleMute' })],
  ['Ctrl+Alt+PageDown', 'Próxima página', () => overlaySend('overlay:cmd', { cmd: 'nextPage' })],
  ['Ctrl+Alt+PageUp', 'Página anterior', () => overlaySend('overlay:cmd', { cmd: 'prevPage' })],
  ['Ctrl+Alt+Up', 'Voltar uma linha', () => overlaySend('overlay:cmd', { cmd: 'lineUp' })],
  ['Ctrl+Alt+Down', 'Avançar uma linha', () => overlaySend('overlay:cmd', { cmd: 'lineDown' })],
  ['Ctrl+Alt+V', 'Ler o texto copiado (área de transferência)', () => navigator.clipboard?.readText().then(readText, () => {})],
];
const KEY_NAMES = { pagedown: 'PageDown', pageup: 'PageUp', arrowup: 'Up', arrowdown: 'Down' };

window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || !e.altKey) return;
  const key = KEY_NAMES[e.key.toLowerCase()] || e.key.toUpperCase();
  const hit = SHORTCUTS.find(([accel]) => accel === `Ctrl+Alt+${key}`);
  if (!hit) return;
  e.preventDefault();
  hit[2]();
});

/* ───────────────────────── Canais ───────────────────────── */

const HANDLERS = {
  'settings:get': () => ({ ...settings }),
  'settings:set': (_from, patch) => updateSettings(patch),
  'settings:newRemoteToken': () => {
    const prev = { ...settings };
    const next = setSettings({ remoteToken: newToken() });
    applyLiveSettings(prev, next);
    return next;
  },
  'displays:list': () => [],
  'doc:get': () => doc,
  'file:open': () => openFileDialog(),
  'file:read': (_from, file) => (file instanceof Blob ? readScriptFile(file) : null),
  'file:save': (_from, req) => saveFile(req),
  'models:list': () => installedReady.then(() => MODELS.map((m) => ({ ...m, installed: installed.has(m.id), downloading: downloads.has(m.id) }))),
  'models:download': (_from, id) => downloadModel(id),
  'session:start': (_from, d) => {
    if (d) {
      doc = sanitizeDoc(d);
      saveDoc();
    }
    return startSession(doc);
  },
  'session:stop': () => stopSession(),
  'session:running': () => !!run,
  'overlay:init': (from) => {
    if (!run) return null;
    if (from === 'follower') {
      const fixed = {
        mode: run.mode, overlay: 'fullscreen', mirror: settings.extraMirror, fsShowBar: false,
        camDeviceId: '', fsBgOpacity: 100, showTimer: false, countdown: 0,
      };
      return { pages: run.doc.pages, pageIndex: lastOverlayDoc?.page ?? run.doc.pageIndex, settings: { ...settings, ...fixed }, fixed, follower: true };
    }
    const resume = run.resume || null;
    run.resume = null;
    const fixed = { overlay: run.overlay, mode: run.mode, fsBgOpacity: 100, fsClickThrough: false, glass: false, followCursor: false };
    return {
      pages: run.doc.pages,
      pageIndex: run.doc.pageIndex,
      settings: { ...settings, ...fixed },
      fixed,
      resume,
      engineStatus,
      hasFollower: !!follower && !follower.closed,
    };
  },
  'remote:info': () => remoteInfo(),
  'shortcuts:list': () => SHORTCUTS.map(([accel, label]) => ({ accel: accel.replace(/\+/g, ' + '), label, busy: false })),
  'app:openExternal': (_from, url) => {
    if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener');
  },
  'app:openMicSettings': () => notice('Permita o microfone para este site: clique no ícone ao lado do endereço e ative "Microfone".'),
  'app:info': () => ({ version: VERSION, author: AUTHOR, website: WEBSITE, title: `InPromptu - por ${AUTHOR}` }),
  'recording:start': () => ({ ok: false, reason: 'web' }),
  'recording:stop': () => ({ ok: false }),
  'app:openRecordings': () => {},
  'obs:status': () => obs.status(),
  'obs:reconnect': () => {
    syncObs({ force: true });
    return obs.status();
  },
  'obs:setPassword': (_from, password) => {
    const value = String(password || '');
    if (value) store.set('inpromptu.obsPassword', value);
    else store.remove('inpromptu.obsPassword');
    updateSettings({ obsPasswordEnc: value ? 'web' : '' });
    return true;
  },
  'app:openSubtitles': () => {},
  'app:showFile': () => {},
};

function invoke(from, ch, args) {
  const handler = HANDLERS[ch];
  if (!handler) throw new Error(`Canal não permitido: ${ch}`);
  return handler(from, ...args);
}

function send(from, ch, payload) {
  switch (ch) {
    case 'doc:update':
      doc = sanitizeDoc(payload);
      saveDoc();
      broadcastIdle();
      break;
    case 'overlay:doc': {
      const d = payload;
      lastOverlayDoc = { ...d, text: typeof d.page === 'number' ? run?.doc.pages[d.page] : undefined };
      remote.broadcast({ type: 'doc', ...lastOverlayDoc });
      if (run && typeof d.page === 'number' && d.page !== run.lastPage) {
        if (run.lastPage !== null && settings.obsChapters && (run.obsRecording || run.obsExternal)) {
          obsAction({ type: 'chapter', name: `Página ${d.page + 1}` });
        }
        run.lastPage = d.page;
      }
      if (run && !run.temporary && typeof d.page === 'number') {
        doc.pageIndex = d.page;
        saveDoc();
        emit('editor', 'session:page', d.page);
      }
      break;
    }
    case 'overlay:times':
      if (!run || !Array.isArray(payload)) return;
      for (const [page, index, t] of payload) {
        if (!run.times.has(page)) run.times.set(page, new Map());
        run.times.get(page).set(index, t);
      }
      break;
    case 'overlay:action':
      if (run && payload && typeof payload.name === 'string') obsAction(payload);
      break;
    case 'overlay:frame':
      if (follower && !follower.closed) emit('follower', 'overlay:frame', payload);
      break;
    case 'overlay:state':
      lastOverlayState = payload;
      remote.broadcast({ type: 'state', ...payload });
      emit('editor', 'session:state', payload);
      break;
    case 'overlay:stop':
      stopSession();
      break;
    case 'overlay:engine':
      if (payload && (payload.cmd === 'mute' || payload.cmd === 'reset')) engineSend(payload);
      break;
    case 'engine:event': {
      const ev = payload;
      if (ev.type === 'status' && run) engineStatus = ev;
      overlaySend('engine:event', ev);
      if (ev.type === 'level') {
        const now = Date.now();
        if (now - lastLevelBroadcast > 90) {
          lastLevelBroadcast = now;
          remote.broadcast({ type: 'level', level: ev.level });
        }
      } else if (ev.type === 'status') {
        emit('editor', 'engine:status', ev);
      }
      break;
    }
    default:
  }
}

/* ───────────────────────── Início ───────────────────────── */

window.__inpromptuHub = {
  invoke: (from, ch, args) => {
    try {
      return Promise.resolve(invoke(from, ch, args));
    } catch (err) {
      return Promise.reject(err);
    }
  },
  send: (from, ch, payload) => send(from, ch, payload),
  openFollower,
  hasPip: HAS_PIP,
};

createEngine();
installedReady = refreshInstalled().then(() => {
  if (settings.mode === 'tracking' && installed.has(settings.language)) {
    engineSend({ cmd: 'preload', modelUrl: modelUrlFor(settings.language) });
  }
});
syncRemote();
syncObs();

// Link para ler um texto direto: ...?ler=Olá%20mundo
const ler = new URLSearchParams(location.search).get('ler');
if (ler) setTimeout(() => readText(ler), 800);
