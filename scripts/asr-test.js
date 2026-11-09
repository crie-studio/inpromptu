// Teste ponta a ponta do reconhecimento de voz sem microfone:
// baixa o modelo (se preciso), reconhece um WAV e passa o resultado pelo rastreador.
// Uso: npx electron scripts/asr-test.js <arquivo.wav> <arquivo-roteiro.txt> [idioma] [--guiado]
// --guiado limita o reconhecimento às palavras do roteiro (gramática do Vosk).
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { ModelManager } = require('../src/models');
const { createHandler } = require('../src/protocol');
const { tokenize, grammarWords, Tracker } = require('../renderer/shared/text.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(1).filter((a) => !a.startsWith('--') && !a.endsWith('asr-test.js'));
const [wavPath, scriptPath, lang = 'pt'] = args;
const guided = process.argv.includes('--guiado');
console.log('Áudio:', wavPath, fs.existsSync(wavPath) ? '(ok)' : '(NÃO ENCONTRADO)', guided ? '— reconhecimento guiado' : '— reconhecimento livre');

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const p90 = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : NaN);

app.setName('InPromptu');
// Dados próprios do teste: não disputa a pasta com o InPromptu aberto. O modelo é lido da pasta do app.
const APP_DATA = path.join(app.getPath('appData'), 'InPromptu');
app.setPath('userData', process.env.INPROMPTU_DADOS || path.join(app.getPath('temp'), 'inpromptu-teste'));
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

app.whenReady().then(async () => {
  const models = new ModelManager(path.join(APP_DATA, 'modelos'), (u) => net.fetch(u));
  protocol.handle('app', createHandler([
    ['/__models/', models.dir],
    ['/__test/', path.dirname(path.resolve(wavPath))],
    ['/', ROOT],
  ]));

  if (!models.isInstalled(lang)) {
    console.log(`Baixando modelo "${lang}"…`);
    let last = -1;
    await models.download(lang, (p) => {
      const pct = Math.floor((p.received / p.total) * 10) * 10;
      if (pct !== last) { last = pct; console.log(`  ${p.phase} ${pct}%`); }
    });
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (e) => console.log('[engine]', e.message));
  ipcMain.on('engine:event', (_e, ev) => { if (ev.type === 'status') console.log('[status]', JSON.stringify(ev)); });
  await win.loadURL('app://app/renderer/engine.html');
  const scriptText = fs.readFileSync(scriptPath, 'utf8');
  const grammar = guided ? grammarWords(scriptText) : null;
  const t0 = Date.now();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado (300 s)')), 300000));
  const events = await Promise.race([timeout, win.webContents.executeJavaScript(
    `__recognizeUrl(${JSON.stringify(models.urlFor(lang))}, ${JSON.stringify(`app://app/__test/${encodeURIComponent(path.basename(wavPath))}`)}, ${JSON.stringify(grammar)})`,
  )]);
  console.log(`Reconhecimento concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s (inclui carregar o modelo)`);

  const tokens = tokenize(scriptText);
  const tracker = new Tracker(tokens);
  const recognizedAt = new Array(tokens.length).fill(null); // tempo de áudio em que cada palavra foi alcançada
  let lastProgress = 0;
  let longestStall = 0;
  for (const ev of events) {
    const before = tracker.pos;
    tracker.feed(ev.text, ev.type === 'result');
    for (let k = before; k < tracker.pos; k++) if (recognizedAt[k] === null) recognizedAt[k] = ev.t;
    if (tracker.pos > before) {
      longestStall = Math.max(longestStall, ev.t - lastProgress);
      lastProgress = ev.t;
    }
    if (ev.type === 'result') console.log(`  final: "${ev.text}"  → posição ${tracker.pos}/${tokens.length}`);
  }

  // Quando cada palavra do roteiro foi de fato dita: tempos dos resultados finais, alinhados ao roteiro.
  const spokenEnd = new Array(tokens.length).fill(null);
  const aligner = new Tracker(tokens);
  for (const ev of events.filter((e) => e.type === 'result')) {
    const ws = ev.words.map((w) => w.word);
    ev.words.forEach((w, k) => {
      const before = aligner.pos;
      aligner.feed(ws.slice(0, k + 1).join(' '), k === ws.length - 1);
      if (aligner.pos > before && aligner.lastMatch === k) spokenEnd[aligner.pos - 1] = w.end;
    });
  }
  if (guided) {
    // "Gabarito" para medir a rolagem: instante (s, desde o início do áudio) em que cada palavra terminou.
    const out = wavPath.replace(/\.wav$/i, '.gabarito.json');
    fs.writeFileSync(out, JSON.stringify({ words: tokens.map((t) => t.text), spokenEnd }));
    console.log(`Gabarito salvo em ${out}`);
  }
  const delays = [];
  for (let k = 0; k < tokens.length; k++) {
    if (recognizedAt[k] !== null && spokenEnd[k] !== null) delays.push(recognizedAt[k] - spokenEnd[k]);
  }
  const ok = tracker.pos >= tokens.length - 1;
  console.log(`\nPosição final: ${tracker.pos}/${tokens.length} — ${ok ? 'OK, chegou ao fim do roteiro' : 'NÃO chegou ao fim'}`);
  console.log(`Atraso palavra dita → reconhecida: mediana ${median(delays).toFixed(2)} s, 90% até ${p90(delays).toFixed(2)} s (${delays.length} palavras medidas)`);
  console.log(`Maior tempo sem avançar: ${longestStall.toFixed(1)} s`);
  process.exitCode = ok ? 0 : 1;
  app.quit();
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
  app.quit();
});
