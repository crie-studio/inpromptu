'use strict';
// Conexão remota: servidor HTTP + WebSocket na rede local. Qualquer celular/tablet
// abre a página pelo QR code, acompanha o texto em tempo real e pode controlar
// a leitura (e enviar um roteiro, no modo diretor). Exige o token do link.
const http = require('http');
const os = require('os');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

class RemoteServer {
  constructor({ htmlPath, iconPath, onCommand, snapshot }) {
    this.htmlPath = htmlPath;
    this.iconPath = iconPath;
    this.onCommand = onCommand;
    this.snapshot = snapshot;
    this.server = null;
    this.wss = null;
    this.port = 0;
    this.token = '';
    this.error = null;
  }

  get running() {
    return !!this.server;
  }

  async start(port, token) {
    if (this.server && this.port === port && this.token === token) return;
    await this.stop();
    this.token = token;
    this.error = null;
    const server = http.createServer((req, res) => this.#http(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname !== '/ws' || url.searchParams.get('t') !== this.token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.#client(ws));
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    }).catch((err) => {
      this.error = err.code === 'EADDRINUSE' ? `A porta ${port} já está em uso.` : err.message;
      throw err;
    });
    this.server = server;
    this.wss = wss;
    this.port = port;
  }

  async stop() {
    if (!this.server) return;
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
    await new Promise((r) => this.server.close(() => r()));
    this.server = null;
    this.wss = null;
  }

  broadcast(msg) {
    if (!this.wss || this.wss.clients.size === 0) return;
    const data = JSON.stringify(msg);
    for (const ws of this.wss.clients) {
      if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(data);
    }
  }

  clientCount() {
    return this.wss ? this.wss.clients.size : 0;
  }

  addresses() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|loopback|tailscale|zerotier/i.test(name);
        out.push({ ip: a.address, name, score: (virtual ? 0 : 2) + (/^192\.168\./.test(a.address) ? 1 : 0) });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  async info() {
    if (!this.server) return { running: false, error: this.error };
    const urls = this.addresses().map((a) => `http://${a.ip}:${this.port}/?t=${this.token}`);
    const url = urls[0] || `http://localhost:${this.port}/?t=${this.token}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } });
    return { running: true, url, urls, qr, clients: this.clientCount() };
  }

  #http(req, res) {
    const url = new URL(req.url, 'http://x');
    // Ícone para "Adicionar à Tela de Início" (não precisa do token: é só a imagem do app).
    if (req.method === 'GET' && url.pathname === '/icon.png' && this.iconPath) {
      fs.readFile(this.iconPath, (err, png) => {
        if (err) res.writeHead(404).end();
        else res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }).end(png);
      });
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    fs.readFile(this.htmlPath, (err, html) => {
      if (err) {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      }).end(html);
    });
  }

  #client(ws) {
    for (const msg of this.snapshot()) ws.send(JSON.stringify(msg));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg && typeof msg.cmd === 'string') this.onCommand(msg);
    });
  }
}

module.exports = { RemoteServer };
