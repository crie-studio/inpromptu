// Versão web do src/obs.js: o mesmo obs-websocket v5, com o WebSocket e o SHA-256 do navegador.
// O navegador permite conectar ao OBS do próprio computador (ws://127.0.0.1) mesmo num site https;
// alguns navegadores pedem permissão para acessar a rede local na primeira vez.

const RETRY_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
const AUTH_FAILED = 4009;

async function sha256Base64(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export class ObsClient {
  constructor() {
    this.cfg = null;
    this.cfgKey = '';
    this.ws = null;
    this.state = 'off';
    this.message = '';
    this.version = '';
    this.pending = new Map();
    this.nextId = 1;
    this.retry = null;
    this.listeners = new Set();
  }

  get connected() {
    return this.state === 'connected';
  }

  onStatus(fn) {
    this.listeners.add(fn);
  }

  status() {
    return { state: this.state, message: this.message, version: this.version };
  }

  setState(state, message = '') {
    this.state = state;
    this.message = message;
    for (const fn of this.listeners) fn(this.status());
  }

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
    let ws;
    try {
      ws = new WebSocket(`ws://${host}:${port}`);
    } catch {
      this.setState('error', 'Endereço do OBS inválido.');
      return;
    }
    this.ws = ws;
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage(ws, msg, password);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending('a conexão com o OBS caiu');
      if (e.code === AUTH_FAILED) {
        this.setState('error', 'Senha do OBS incorreta.');
        return;
      }
      if (this.state !== 'error' || !this.message) {
        this.setState('error', 'OBS fechado ou servidor WebSocket desligado. Tentando de novo…');
      }
      if (this.cfg?.enabled) this.retry = setTimeout(() => this.connect(), RETRY_MS);
    };
  }

  async onMessage(ws, msg, password) {
    if (msg.op === 0) {
      const auth = msg.d?.authentication;
      const identify = { rpcVersion: 1, eventSubscriptions: 0 };
      if (auth) {
        if (!password) {
          this.setState('error', 'O OBS pede senha: informe a senha do servidor WebSocket.');
          this.cfg = { ...this.cfg, enabled: false };
          ws.close();
          return;
        }
        const secret = await sha256Base64(password + auth.salt);
        identify.authentication = await sha256Base64(secret + auth.challenge);
      }
      ws.send(JSON.stringify({ op: 1, d: identify }));
    } else if (msg.op === 2) {
      this.setState('connected');
      this.request('GetVersion').then((v) => {
        this.version = v.obsVersion || '';
        this.setState('connected');
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
