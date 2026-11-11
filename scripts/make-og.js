// Gera as imagens de compartilhamento (1200×630) usadas quando o link do site é colado no
// WhatsApp, LinkedIn, X etc.: assets/og.png (português) e assets/og-en.png (inglês).
// Uso: npx electron scripts/make-og.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const icon = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');

const TEXTS = {
  'og.png': {
    title: 'O teleprompter que acompanha a sua <u>voz.</u>',
    tags: 'Grátis · Windows e web · voz offline · código aberto',
    lines: ['<r>Oi! Eu sou o InPromptu.</r> <n>[sorria]</n>', '<r>Enquanto você</r> <c>fala</c>, eu destaco', 'cada palavra e subo o texto', 'no seu ritmo.'],
  },
  'og-en.png': {
    title: 'The teleprompter that follows your <u>voice.</u>',
    tags: 'Free · Windows and web · offline voice · open source',
    lines: ['<r>Hi! I am InPromptu.</r> <n>[smile]</n>', '<r>While you</r> <c>speak</c>, I highlight', 'every word and move the text', 'at your pace.'],
  },
};

const page = ({ title, tags, lines }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #0b0c10; color: #edece6; font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; display: grid; grid-template-columns: 1fr 470px; gap: 56px; padding: 72px 72px 64px; overflow: hidden; }
  .left { display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 700; letter-spacing: -0.01em; }
  .brand svg { width: 76px; height: 76px; }
  h1 { font-size: 70px; line-height: 1.02; font-weight: 700; letter-spacing: -0.03em; }
  h1 u { color: #ffd60a; text-decoration-thickness: 6px; text-underline-offset: 10px; }
  .tags { font: 500 22px/1.3 "Cascadia Mono", Consolas, monospace; color: #9c9da8; }
  .glass { align-self: center; border-radius: 28px; background: #13141a; border: 2px solid #272934; overflow: hidden; }
  .text { padding: 34px 34px 26px; font-size: 31px; font-weight: 700; line-height: 1.42; color: rgba(237,236,230,.93); }
  r { color: #ffd60a; opacity: .5; } c { color: #ffd60a; text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 6px; }
  n { color: #7dd3fc; font-style: italic; font-weight: 400; font-size: .74em; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 18px 28px; border-top: 2px solid #272934; background: #101116; }
  .bar i { width: 9px; border-radius: 5px; background: #ffd60a; }
  .bar b { flex: 1; height: 6px; margin-left: 14px; border-radius: 3px; background: linear-gradient(90deg, #ffd60a 38%, #24252d 38%); }
</style></head><body>
  <div class="left">
    <div class="brand">${icon.replace('<svg ', '<svg ')}InPromptu</div>
    <h1>${title}</h1>
    <p class="tags">${tags}</p>
  </div>
  <div class="glass">
    <div class="text">${lines.join(' ')}</div>
    <div class="bar">${[18, 34, 52, 26, 44, 60, 30, 16, 40, 24].map((h) => `<i style="height:${h}px"></i>`).join('')}<b></b></div>
  </div>
</body></html>`;

app.on('window-all-closed', () => {}); // entre uma imagem e outra não há janela aberta: não encerrar
app.whenReady().then(async () => {
  for (const [file, texts] of Object.entries(TEXTS)) {
    const win = new BrowserWindow({ width: 1200, height: 630, show: false, useContentSize: true, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(texts)));
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
    fs.writeFileSync(path.join(ROOT, 'assets', file), img.resize({ width: 1200, height: 630 }).toPNG());
    win.destroy();
  }
  app.quit();
});
