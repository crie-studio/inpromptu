'use strict';
// Extrai as anotações do apresentador de um .pptx, na ordem dos slides.
const JSZip = require('jszip');

// Caminhos dentro do .zip (sempre com "/"), sem o módulo path do Node: o mesmo arquivo roda na versão web.
const dirname = (p) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '.' : p.slice(0, i) || '/';
};
const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
function normalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return (p.startsWith('/') ? '/' : '') + out.join('/');
}
const join = (...parts) => normalize(parts.join('/'));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? m;
  });
}

function relsOf(xml) {
  const map = new Map();
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    const type = /\bType="([^"]+)"/.exec(m[0])?.[1] || '';
    if (id && target) map.set(id, { target, type });
  }
  return map;
}

function resolve(fromFile, target) {
  // Alvo absoluto ("/ppt/slides/slide1.xml") é relativo à raiz do pacote.
  return target.startsWith('/') ? normalize(target.slice(1)) : join(dirname(fromFile), target);
}

/** Texto do placeholder "body" das anotações, um parágrafo por linha. */
function notesText(xml) {
  const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || [];
  const out = [];
  for (const sp of shapes) {
    if (!/<p:ph\b[^>]*type="body"/.test(sp)) continue;
    const paras = sp.match(/<a:p\b[\s\S]*?<\/a:p>|<a:p\/>/g) || [];
    for (const p of paras) {
      const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)]
        .map((m) => (m[1] === undefined ? '\n' : decodeXml(m[1])));
      out.push(runs.join(''));
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractNotes(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = (name) => zip.file(name)?.async('string');

  const presentation = await read('ppt/presentation.xml');
  const presRels = await read('ppt/_rels/presentation.xml.rels');
  if (!presentation || !presRels) throw new Error('Arquivo PowerPoint inválido.');
  const rels = relsOf(presRels);

  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const pages = [];
  for (const rid of slideIds) {
    const rel = rels.get(rid);
    if (!rel) continue;
    const slidePath = resolve('ppt/presentation.xml', rel.target);
    const slideRelsPath = join(dirname(slidePath), '_rels', basename(slidePath) + '.rels');
    const slideRels = await read(slideRelsPath);
    if (!slideRels) continue;
    const notesRel = [...relsOf(slideRels).values()].find((r) => r.type.endsWith('/notesSlide'));
    if (!notesRel) continue;
    const notesXml = await read(resolve(slidePath, notesRel.target));
    const text = notesXml ? notesText(notesXml) : '';
    if (text) pages.push(text);
  }
  return pages;
}

module.exports = { extractNotes };
