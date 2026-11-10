// Gera build/icon.png e assets/icon.png (512×512) e assets/icon-192.png a partir de build/icon.svg.
// Uso: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png = img.resize({ width: 512, height: 512 }).toPNG();
  // build/ é usado pelo instalador; assets/ vai dentro do app.
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), png);
  fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), png);
  // Versão web (app instalável): o navegador pede também um ícone de 192×192.
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon-192.png'), img.resize({ width: 192, height: 192, quality: 'best' }).toPNG());
  app.quit();
});
