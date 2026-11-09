// Mostra quando o detector de fala (Silero VAD) acha que há voz num WAV.
// Uso: npx electron scripts/vad-test.js <arquivo.wav>
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const { createHandler } = require('../src/protocol');

const ROOT = path.join(__dirname, '..');
const wavPath = process.argv.slice(1).find((a) => /\.wav$/i.test(a));

app.setName('InPromptu');
app.setPath('userData', process.env.INPROMPTU_DADOS || path.join(app.getPath('temp'), 'inpromptu-teste'));
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

app.whenReady().then(async () => {
  protocol.handle('app', createHandler([['/__test/', path.dirname(path.resolve(wavPath))], ['/', ROOT]]));
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(ROOT, 'preload.js'), sandbox: true } });
  win.webContents.on('console-message', (e) => console.log('[engine]', e.message));
  await win.loadURL('app://app/renderer/engine.html');
  const probs = await win.webContents.executeJavaScript(
    `__vadUrl(${JSON.stringify(`app://app/__test/${encodeURIComponent(path.basename(wavPath))}`)})`,
  );
  // Trechos de fala com o limiar padrão (0,5), em segundos.
  const segs = [];
  probs.forEach((p, i) => {
    const t = (i * 512) / 16000;
    const last = segs[segs.length - 1];
    if (p >= 0.5) {
      if (last && t - last[1] <= 0.25) last[1] = t + 0.032;
      else segs.push([t, t + 0.032]);
    }
  });
  const speech = segs.reduce((s, [a, b]) => s + b - a, 0);
  const pauses = segs.slice(1).map((s, i) => s[0] - segs[i][1]).filter((g) => g > 0.25);
  console.log(`Duração: ${((probs.length * 512) / 16000).toFixed(1)} s · fala: ${speech.toFixed(1)} s em ${segs.length} trechos`);
  console.log(`Pausas: ${pauses.length}, maior ${Math.max(0, ...pauses).toFixed(2)} s, média ${(pauses.reduce((a, b) => a + b, 0) / Math.max(1, pauses.length)).toFixed(2)} s`);
  console.log(segs.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join('  '));
  app.quit();
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
  app.quit();
});
