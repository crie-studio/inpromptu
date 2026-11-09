// Copia para renderer/vendor só os arquivos do detector de voz que o app usa
// (o pacote onnxruntime-web inteiro tem ~150 MB). Uso: npm run vendor
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'renderer', 'vendor');
const FILES = [
  ['node_modules/onnxruntime-web/dist/ort.wasm.min.js', 'ort/ort.wasm.min.js'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort/ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.wasm'],
  ['node_modules/@ricky0123/vad-web/dist/silero_vad_v6.onnx', 'silero_vad_v6.onnx'],
];

for (const [from, to] of FILES) {
  const dest = path.join(OUT, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), dest);
  console.log(`${to} (${Math.round(fs.statSync(dest).size / 1024)} KB)`);
}
