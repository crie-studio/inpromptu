'use strict';
// Modelos de voz offline (Vosk). Os modelos oficiais vêm em .zip; o vosk-browser
// espera um .tar.gz com uma pasta raiz, então convertemos uma única vez no download.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const JSZip = require('jszip');

const BASE_URL = 'https://alphacephei.com/vosk/models/';

const CATALOG = [
  { id: 'pt', label: 'Português (Brasil)', file: 'vosk-model-small-pt-0.3', sizeMB: 31 },
  { id: 'en', label: 'English (US)', file: 'vosk-model-small-en-us-0.15', sizeMB: 39 },
  { id: 'es', label: 'Español', file: 'vosk-model-small-es-0.42', sizeMB: 38 },
  { id: 'fr', label: 'Français', file: 'vosk-model-small-fr-0.22', sizeMB: 40 },
  { id: 'de', label: 'Deutsch', file: 'vosk-model-small-de-0.15', sizeMB: 44 },
  { id: 'it', label: 'Italiano', file: 'vosk-model-small-it-0.22', sizeMB: 47 },
];

class ModelManager {
  constructor(dir, fetchImpl) {
    this.dir = dir;
    this.fetch = fetchImpl;
    this.downloads = new Map();
  }

  find(id) {
    return CATALOG.find((m) => m.id === id) || null;
  }

  archiveName(id) {
    const m = this.find(id);
    return m ? `${m.file}.tar.gz` : null;
  }

  isInstalled(id) {
    const name = this.archiveName(id);
    return !!name && fs.existsSync(path.join(this.dir, name));
  }

  /** URL servida pelo protocolo app:// (ver main.js). */
  urlFor(id) {
    return `app://app/__models/${this.archiveName(id)}`;
  }

  list() {
    return CATALOG.map((m) => ({
      ...m,
      installed: this.isInstalled(m.id),
      downloading: this.downloads.has(m.id),
    }));
  }

  download(id, onProgress) {
    if (this.downloads.has(id)) return this.downloads.get(id);
    const m = this.find(id);
    if (!m) return Promise.reject(new Error(`Modelo desconhecido: ${id}`));
    const job = this.#run(m, onProgress).finally(() => this.downloads.delete(id));
    this.downloads.set(id, job);
    return job;
  }

  async #run(m, onProgress) {
    const res = await this.fetch(BASE_URL + m.file + '.zip');
    if (!res.ok) throw new Error(`Falha no download (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || m.sizeMB * 1024 * 1024;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress({ phase: 'download', received, total });
    }
    onProgress({ phase: 'convert', received, total });

    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    const entries = [];
    const dirs = new Set();
    for (const entry of Object.values(zip.files)) {
      // Troca a pasta raiz do zip por "model/" (o vosk-browser descarta o 1º componente).
      const rel = entry.name.split('/').slice(1).join('/');
      if (!rel) continue;
      const name = 'model/' + rel;
      const parts = name.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/');
      if (entry.dir) dirs.add(name.endsWith('/') ? name : name + '/');
      else entries.push({ name, data: await entry.async('nodebuffer') });
    }
    const blocks = [];
    for (const d of [...dirs].sort()) blocks.push(tarHeader(d, 0, '5'));
    for (const e of entries) {
      blocks.push(tarHeader(e.name, e.data.length, '0'), e.data, padding(e.data.length));
    }
    blocks.push(Buffer.alloc(1024));
    const gz = zlib.gzipSync(Buffer.concat(blocks), { level: 6 });

    fs.mkdirSync(this.dir, { recursive: true });
    const finalPath = path.join(this.dir, `${m.file}.tar.gz`);
    fs.writeFileSync(finalPath + '.part', gz);
    fs.renameSync(finalPath + '.part', finalPath);
    onProgress({ phase: 'done', received, total });
    return finalPath;
  }
}

function padding(size) {
  const rest = size % 512;
  return Buffer.alloc(rest ? 512 - rest : 0);
}

function tarHeader(name, size, type) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', name.length - 2);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  h.write(name, 0, 100, 'utf8');
  h.write(type === '5' ? '0000755\0' : '0000644\0', 100, 'ascii');
  h.write('0000000\0', 108, 'ascii');
  h.write('0000000\0', 116, 'ascii');
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'ascii');
  h.write('        ', 148, 'ascii');
  h.write(type, 156, 'ascii');
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return h;
}

module.exports = { ModelManager, CATALOG };
