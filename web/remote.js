// Controle pelo celular na versão web. Um site não consegue abrir um servidor na rede local, então
// o celular se conecta direto ao navegador do computador por WebRTC (PeerJS). O servidor público do
// PeerJS só apresenta os dois lados; o texto e os comandos vão de um aparelho ao outro, criptografados.
// O "endereço" do computador é o código secreto do link (remoteToken), que só quem lê o QR code tem.
import { Peer } from 'peerjs';

const ERRORS = {
  'unavailable-id': 'Este link já está aberto em outra aba do InPromptu. Feche a outra aba ou gere um novo link.',
  network: 'Sem conexão com a internet para ligar o celular.',
  'server-error': 'O serviço de conexão (PeerJS) não respondeu. Tentando de novo…',
  'socket-error': 'O serviço de conexão (PeerJS) não respondeu. Tentando de novo…',
  'socket-closed': 'A conexão com o serviço caiu. Tentando de novo…',
  'browser-incompatible': 'Este navegador não permite a conexão com o celular.',
};

export class RemotePeer {
  constructor({ onCommand, snapshot, onChange }) {
    this.onCommand = onCommand;
    this.snapshot = snapshot;
    this.onChange = onChange || (() => {});
    this.peer = null;
    this.token = '';
    this.conns = new Set();
    this.ready = false;
    this.error = null;
    this.retry = null;
  }

  get running() {
    return !!this.peer;
  }

  start(token) {
    if (this.peer && this.token === token) return;
    this.stop();
    this.token = token;
    this.open();
  }

  open() {
    clearTimeout(this.retry);
    const peer = new Peer(`inpromptu-${this.token}`, { debug: 0 });
    this.peer = peer;
    this.ready = false;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.ready = true;
      this.error = null;
      this.onChange();
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.add(conn);
        for (const msg of this.snapshot()) conn.send(JSON.stringify(msg));
        this.onChange();
      });
      conn.on('data', (raw) => {
        let msg;
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          return;
        }
        if (msg && typeof msg.cmd === 'string') this.onCommand(msg);
      });
      const drop = () => {
        if (this.conns.delete(conn)) this.onChange();
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => {
      // Perdeu o servidor de apresentação (as conexões já abertas continuam): volta sozinho.
      if (this.peer === peer && !peer.destroyed) this.retry = setTimeout(() => peer.reconnect(), 3000);
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      this.error = ERRORS[err.type] || err.message || 'Falha na conexão com o celular.';
      this.ready = false;
      this.onChange();
      if (err.type !== 'unavailable-id' && err.type !== 'browser-incompatible' && peer.destroyed) {
        this.retry = setTimeout(() => this.open(), 5000);
      }
    });
  }

  stop() {
    clearTimeout(this.retry);
    for (const c of this.conns) c.close();
    this.conns.clear();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.ready = false;
    this.error = null;
  }

  broadcast(msg) {
    if (!this.conns.size) return;
    const data = JSON.stringify(msg);
    for (const c of this.conns) if (c.open) c.send(data);
  }

  clientCount() {
    return this.conns.size;
  }
}
