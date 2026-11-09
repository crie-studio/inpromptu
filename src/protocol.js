'use strict';
// Protocolo app:// — serve os arquivos do app (e os modelos de voz) com fs,
// que funciona dentro do .asar e com caminhos longos (> 260 caracteres) do Windows.
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.wav': 'audio/wav',
};

/**
 * @param {Array<[string, string]>} mounts pares [prefixo da URL, pasta], do mais específico ao mais geral.
 */
function createHandler(mounts) {
  return async (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname);
    const mount = mounts.find(([prefix]) => rel.startsWith(prefix));
    if (!mount) return new Response('Não encontrado', { status: 404 });
    const [prefix, dir] = mount;
    const base = path.resolve(dir);
    const file = path.resolve(base, '.' + rel.slice(prefix.length - 1));
    if (!file.startsWith(base + path.sep)) return new Response('Proibido', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, {
        headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
      });
    } catch {
      return new Response('Não encontrado', { status: 404 });
    }
  };
}

module.exports = { createHandler };
