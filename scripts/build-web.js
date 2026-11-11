// Monta o site em site/: a página de apresentação na raiz (web/landing) e a versão web do app em
// site/app/, com as mesmas telas do app (editor, teleprompter, motor de voz, celular), web/bridge.js
// no lugar do preload do Electron e web/hub.js no lugar do main.js.
// Uso: node scripts/build-web.js   (INPROMPTU_WEB_MODELS=pt para incluir só alguns modelos de voz)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { ModelManager, CATALOG } = require('../src/models');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'site');
const APP = path.join(OUT, 'app');
// Endereço público do site (sitemap, links canônicos, dados estruturados). Troque ao usar um domínio próprio.
const SITE_URL = (process.env.INPROMPTU_SITE_URL || 'https://crie-studio.github.io/inpromptu/').replace(/\/?$/, '/');
const MODEL_CACHE = path.join(ROOT, '.cache', 'web-models');
const pkg = require('../package.json');
const WEB_MODELS = (process.env.INPROMPTU_WEB_MODELS || 'pt,en,es').split(',').map((s) => s.trim()).filter(Boolean);

const from = (...p) => path.join(ROOT, ...p);
const to = (...p) => path.join(APP, ...p);
const toSite = (...p) => path.join(OUT, ...p);

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/** Troca um trecho que precisa existir: se o arquivo do app mudar, o build avisa em vez de sair errado. */
function replaceOnce(text, search, replacement, file) {
  const found = typeof search === 'string' ? text.includes(search) : search.test(text);
  if (!found) throw new Error(`build-web: não achei ${search} em ${file}`);
  return text.replace(search, replacement);
}

function page(file, out, edits) {
  let html = fs.readFileSync(from('renderer', file), 'utf8');
  for (const [search, replacement] of edits) html = replaceOnce(html, search, replacement, file);
  fs.writeFileSync(to(out), html);
}

const CSP = /<meta http-equiv="Content-Security-Policy"[^>]*>/;
const csp = (policy) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
// Telas internas do app (teleprompter, motor de voz, celular): fora dos resultados de busca.
const NOINDEX = '\n  <meta name="robots" content="noindex">';

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });

  // 1. Arquivos do app, como estão.
  for (const f of ['editor.css', 'overlay.css', 'editor.js', 'overlay.js', 'engine.js']) copy(from('renderer', f), to(f));
  copy(from('renderer', 'shared'), to('shared'));
  if (!fs.existsSync(from('renderer', 'vendor', 'silero_vad_v6.onnx'))) throw new Error('Rode "npm install" (ou "npm run vendor") antes.');
  copy(from('renderer', 'vendor'), to('vendor'));
  copy(from('node_modules', 'vosk-browser', 'dist', 'vosk.js'), to('vendor', 'vosk.js'));
  copy(from('node_modules', 'peerjs', 'dist', 'peerjs.min.js'), to('vendor', 'peerjs.min.js'));
  const fontDir = from('node_modules', '@fontsource', 'opendyslexic', 'files');
  for (const w of ['400', '700']) copy(path.join(fontDir, `opendyslexic-latin-${w}-normal.woff2`), to('fonts', `opendyslexic-latin-${w}-normal.woff2`));
  fs.writeFileSync(to('fonts.css'), fs.readFileSync(from('renderer', 'fonts.css'), 'utf8').replaceAll('../node_modules/@fontsource/opendyslexic/files/', 'fonts/'));
  copy(from('assets', 'icon.png'), to('icon.png'));
  copy(from('assets', 'icon-192.png'), to('icon-192.png'));
  for (const f of ['bridge.js', 'web-ui.js', 'web.css']) copy(from('web', f), to('web', f));
  copy(from('LICENSE'), to('LICENSE.txt'));
  copy(from('THIRD_PARTY_NOTICES.md'), to('THIRD_PARTY_NOTICES.md'));

  // 2. Páginas: a ponte web antes dos scripts do app e regras de segurança para o navegador.
  page('editor.html', 'index.html', [
    [CSP, csp("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self' ws: wss: https:; frame-src 'self'")],
    ['../assets/icon.png', 'icon.png'],
    ['</head>', `  <meta name="description" content="Versão web do InPromptu: teleprompter online e grátis que acompanha a sua voz, direto no navegador.">
  <link rel="canonical" href="${SITE_URL}app/">
  <meta name="theme-color" content="#0f1013">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icon.png">
  <link rel="apple-touch-icon" href="icon-192.png">
  <link rel="stylesheet" href="web/web.css">
</head>`],
    ['<script src="shared/text.js"></script>', '<script src="web/bridge.js" data-role="editor"></script>\n  <script src="web/hub.js"></script>\n  <script src="shared/text.js"></script>'],
    ['<script src="editor.js"></script>', '<script src="editor.js"></script>\n  <script src="web/web-ui.js"></script>'],
  ]);
  page('overlay.html', 'overlay.html', [
    [CSP, csp("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: mediastream:") + NOINDEX],
    ['<script src="shared/text.js"></script>', '<script src="web/bridge.js"></script>\n  <script src="shared/text.js"></script>'],
  ]);
  page('engine.html', 'engine.html', [
    [CSP, csp("default-src 'self'; script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:") + NOINDEX],
    ['<script src="../node_modules/vosk-browser/dist/vosk.js"></script>', '<script src="web/bridge.js"></script>\n  <script src="vendor/vosk.js"></script>'],
  ]);
  page('remote.html', 'celular.html', [
    ['<link rel="apple-touch-icon" href="/icon.png">', '<link rel="apple-touch-icon" href="icon-192.png">'],
    ['<link rel="icon" href="/icon.png">', '<link rel="icon" href="icon.png">'],
    ['<img src="/icon.png" alt="">', '<img src="icon.png" alt="">'],
    ['<title>', '<meta name="robots" content="noindex">\n  <title>'],
  ]);

  // 3. Modelos de voz, hospedados no próprio site (o site do Vosk não deixa outro site baixar direto).
  const models = [];
  for (const id of WEB_MODELS) {
    const m = CATALOG.find((x) => x.id === id);
    if (!m) throw new Error(`Modelo desconhecido: ${id}`);
    const file = `${m.file}.tar.gz`;
    const cached = path.join(MODEL_CACHE, file);
    if (!fs.existsSync(cached)) {
      const installed = path.join(process.env.APPDATA || '', 'InPromptu', 'modelos', file);
      if (process.env.APPDATA && fs.existsSync(installed)) {
        copy(installed, cached);
      } else {
        process.stdout.write(`Baixando o modelo ${m.label}…\n`);
        await new ModelManager(MODEL_CACHE, (url) => fetch(url)).download(id, () => {});
      }
    }
    copy(cached, to('models', file));
    models.push({ id: m.id, label: m.label, file: m.file, sizeMB: Math.max(1, Math.round(fs.statSync(cached).size / 1048576)) });
  }

  // 4. O "processo principal" da web num arquivo só.
  await esbuild.build({
    entryPoints: [from('web', 'hub.js')],
    outfile: to('web', 'hub.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
    minify: true,
    legalComments: 'eof',
    define: { __VERSION__: JSON.stringify(pkg.version), __MODELS__: JSON.stringify(models) },
    logLevel: 'warning',
  });

  // 5. App instalável e funcionando sem internet.
  fs.writeFileSync(to('manifest.webmanifest'), JSON.stringify({
    name: 'InPromptu',
    short_name: 'InPromptu',
    description: pkg.description,
    lang: 'pt-BR',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#0f1013',
    theme_color: '#0f1013',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, null, 2));
  const shell = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(APP, full).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (rel !== 'models') walk(full); // os modelos vão para o cache só quando a pessoa baixa
      } else if (!rel.endsWith('.map') && rel !== 'sw.js') {
        shell.push(rel);
      }
    }
  })(APP);
  shell.sort();
  const hash = crypto.createHash('sha256');
  for (const f of shell) hash.update(f).update(fs.readFileSync(to(f)));
  const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
  const precache = ['./', ...shell.filter((f) => f !== 'index.html')];
  fs.writeFileSync(to('sw.js'), fs.readFileSync(from('web', 'sw.js'), 'utf8')
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(precache)));
  fs.writeFileSync(toSite('.nojekyll'), '');
  buildLanding();

  const size = shell.reduce((n, f) => n + fs.statSync(to(f)).size, 0);
  console.log(`site/ pronto: versão ${version}, ${shell.length} arquivos (${(size / 1048576).toFixed(1)} MB) + modelos ${models.map((m) => m.id).join(', ')}`);
}

/* ───────── Página de apresentação, versão em inglês, sitemap e arquivos para robôs ───────── */
function buildLanding() {
  const today = new Date().toISOString().slice(0, 10);
  const fill = (text) => text.replaceAll('__SITE__', SITE_URL).replaceAll('__VERSION__', pkg.version).replaceAll('__DATE__', today);
  const land = (src, dest) => {
    fs.mkdirSync(path.dirname(toSite(dest)), { recursive: true });
    fs.writeFileSync(toSite(dest), fill(fs.readFileSync(from('web', 'landing', src), 'utf8')));
  };
  land('index.html', 'index.html');
  land('en/index.html', 'en/index.html');
  land('404.html', '404.html');
  land('llms.txt', 'llms.txt');
  land('sitemap.xml', 'sitemap.xml');
  land('redirect-sobre.html', 'sobre/index.html');      // endereço antigo da apresentação
  land('redirect-celular.html', 'celular.html');         // links antigos do celular (…/celular.html?p=…)
  land('sw-root.js', 'sw.js');                           // desliga o service worker antigo da raiz
  if (fs.existsSync(from('web', 'public'))) fs.cpSync(from('web', 'public'), OUT, { recursive: true }); // arquivos de verificação (Search Console, Bing)
  copy(from('docs', 'images', 'editor.png'), toSite('editor.png'));
  for (const f of ['icon.png', 'icon-192.png', 'og.png', 'og-en.png']) copy(from('assets', f), toSite(f));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
