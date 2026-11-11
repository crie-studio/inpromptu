// Lista os textos das telas que ainda não têm tradução para inglês (renderer/shared/i18n-en.js).
// Uso: npx electron scripts/i18n-check.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['renderer/editor.html', 'renderer/overlay.html', 'renderer/remote.html'];

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>i18n</title>');
  const lib = ['renderer/shared/i18n-en.js', 'renderer/shared/i18n.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  await win.webContents.executeJavaScript(`${lib};0`);
  let total = 0;
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const missing = await win.webContents.executeJavaScript(`(() => {
      const doc = new DOMParser().parseFromString(${JSON.stringify(html)}, 'text/html');
      const out = InPromptuI18n.missing(doc.body);
      const title = doc.title && !InPromptuI18n.known(doc.title) ? [doc.title] : [];
      return [...title, ...out];
    })()`);
    total += missing.length;
    console.log(`\n## ${page}: ${missing.length} sem tradução`);
    for (const m of missing) console.log(JSON.stringify(m));
  }
  console.log(`\nTotal: ${total}`);
  app.exit(total ? 1 : 0);
});
