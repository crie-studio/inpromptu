'use strict';
// Controle do OBS Studio pelo obs-websocket (v5, já incluído no OBS 28+): gravar junto com a
// leitura, trocar de cena e marcar capítulos. Reconecta sozinho se o OBS for aberto depois.
const crypto = require('crypto');
const { EventEmitter } = require('events');
const WebSocket = require('ws');

const RETRY_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
const AUTH_FAILED = 4009; // código de fechamento do obs-websocket para senha errada

class ObsClient extends EventEmitter {
  constructor() {
    super();
    this.cfg = null;
    this.cfgKey = '';
    this.ws = null;
    this.state = 'off'; // off | connecting | connected | error
    this.message = '';
    this.version = '';
    this.pending = new Map();
    this.nextId = 1;
    this.retry = null;
  }

  get connected() {
    return this.state === 'connected';
  }

  status() {
    return { state: this.state, message: this.message, version: this.version };
  }

  setState(state, message = '') {
    this.state = state;
    this.message = message;
    this.emit('status', this.status());
  }

  /** { enabled, host, port, password }: (re)conecta só se algo mudou. */
  configure(cfg, { force = false } = {}) {
    const key = JSON.stringify(cfg);
    if (key === this.cfgKey && !force) return;
    this.cfgKey = key;
    this.cfg = cfg;
    this.disconnect();
    if (cfg.enabled) this.connect();
    else this.setState('off');
  }

  connect() {
    clearTimeout(this.retry);
    const { host, port, password } = this.cfg;
    this.setState('connecting');
    const ws = new WebSocket(`ws://${host}:${port}`, { handshakeTimeout: 4000 });
    this.ws = ws;
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.onMessage(ws, msg, password);
    });
    ws.on('close', (code) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending('a conexão com o OBS caiu');
      if (code === AUTH_FAILED) {
        this.setState('error', 'Senha do OBS incorreta.');
        return; // tentar de novo com a mesma senha não adianta
      }
      if (this.state !== 'error' || !this.message) {
        this.setState('error', 'OBS fechado ou servidor WebSocket desligado. Tentando de novo…');
      }
      if (this.cfg?.enabled) this.retry = setTimeout(() => this.connect(), RETRY_MS);
    });
    ws.on('error', () => { /* o 'close' vem logo em seguida */ });
  }

  onMessage(ws, msg, password) {
    if (msg.op === 0) {
      // Hello: responde com Identify (e a senha, se o OBS pedir).
      const auth = msg.d?.authentication;
      const identify = { rpcVersion: 1, eventSubscriptions: 0 };
      if (auth) {
        if (!password) {
          this.setState('error', 'O OBS pede senha: informe a senha do servidor WebSocket.');
          this.cfg = { ...this.cfg, enabled: false };
          ws.close();
          return;
        }
        const secret = crypto.createHash('sha256').update(password + auth.salt).digest('base64');
        identify.authentication = crypto.createHash('sha256').update(secret + auth.challenge).digest('base64');
      }
      ws.send(JSON.stringify({ op: 1, d: identify }));
    } else if (msg.op === 2) {
      this.setState('connected');
      this.request('GetVersion').then((v) => {
        this.version = v.obsVersion || '';
        this.emit('status', this.status());
      }).catch(() => {});
    } else if (msg.op === 7) {
      const p = this.pending.get(msg.d?.requestId);
      if (!p) return;
      this.pending.delete(msg.d.requestId);
      clearTimeout(p.timer);
      const st = msg.d.requestStatus || {};
      if (st.result) p.resolve(msg.d.responseData || {});
      else p.reject(new Error(st.comment || `o OBS recusou (código ${st.code})`));
    }
  }

  request(requestType, requestData) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('o OBS não está conectado'));
        return;
      }
      const requestId = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('o OBS não respondeu'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  failPending(why) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(why));
    }
    this.pending.clear();
  }

  disconnect() {
    clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    this.failPending('desconectado');
    if (ws) ws.close();
  }
}

module.exports = { ObsClient };
