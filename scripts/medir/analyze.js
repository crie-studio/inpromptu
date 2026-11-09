// Compara a estimativa da sobreposição com o gabarito (quando cada palavra foi dita).
// Uso: node analyze.js <medicao.json> <gabarito.json>
const fs = require('fs');
const [measFile, truthFile] = process.argv.slice(2);
const { samples, log } = JSON.parse(fs.readFileSync(measFile, 'utf8'));
const { spokenEnd } = JSON.parse(fs.readFileSync(truthFile, 'utf8'));

// Gabarito completo: interpola as palavras sem tempo entre as vizinhas conhecidas.
const n = spokenEnd.length;
const known = spokenEnd.map((t, i) => [i, t]).filter(([, t]) => t !== null);
const end = new Array(n);
for (let i = 0; i < n; i++) {
  const after = known.find(([k]) => k >= i);
  const before = [...known].reverse().find(([k]) => k <= i);
  if (before && after && after[0] !== before[0]) end[i] = before[1] + ((after[1] - before[1]) * (i - before[0])) / (after[0] - before[0]);
  else end[i] = (before || after)[1];
}
for (let i = 1; i < n; i++) end[i] = Math.max(end[i], end[i - 1]);
// Posição verdadeira (palavra sendo dita, fracionária) num instante do áudio.
function truthAt(a) {
  if (a <= end[0]) return Math.max(0, a / Math.max(0.3, end[0]));
  for (let i = 1; i < n; i++) {
    if (a <= end[i]) return i + (a - end[i - 1]) / Math.max(0.05, end[i] - end[i - 1]);
  }
  return n;
}

// Relógio: cada palavra reconhecida com tempo exato (ago) dá "instante na parede − instante no áudio".
const offsets = log.filter((e) => e.p !== undefined && e.ago !== 0.45 && e.p > 0 && e.p <= n).map((e) => (e.t - e.ago * 1000) / 1000 - end[e.p - 1]);
offsets.sort((a, b) => a - b);
const offset = offsets[Math.floor(offsets.length / 2)];

const errs = [];
let movingSpeaking = 0;
let speakingFrames = 0;
let movingSilent = 0;
let silentFrames = 0;
let backwards = 0;
let maxStep = 0;
let stillSpeaking = 0;
let longestStill = 0;
for (let k = 1; k < samples.length; k++) {
  const [t, est, , speaking, y] = samples[k];
  const [tp, estp, , , yp] = samples[k - 1];
  const a = t / 1000 - offset;
  if (a < 0.5 || a > end[n - 1]) continue;
  errs.push(est - truthAt(a));
  const moving = Math.abs(y - yp) > 0.05;
  if (y > yp + 0.05) backwards++;
  maxStep = Math.max(maxStep, Math.abs(y - yp));
  if (speaking) {
    speakingFrames++;
    if (moving || est > estp + 1e-4) movingSpeaking++;
    stillSpeaking = est > estp + 1e-4 ? 0 : stillSpeaking + (t - tp);
    longestStill = Math.max(longestStill, stillSpeaking);
  } else {
    silentFrames++;
    if (est > estp + 1e-4) movingSilent++;
    stillSpeaking = 0;
  }
}
const abs = errs.map(Math.abs).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.floor(arr.length * p)];
console.log(JSON.stringify({
  amostras: errs.length,
  erroMedianoPalavras: +q(abs, 0.5).toFixed(2),
  erro90Palavras: +q(abs, 0.9).toFixed(2),
  tempoAtrasMaisDe2: `${Math.round((errs.filter((e) => e < -2).length / errs.length) * 100)}%`,
  tempoFrenteMaisDe2: `${Math.round((errs.filter((e) => e > 2).length / errs.length) * 100)}%`,
  andandoComFala: `${Math.round((movingSpeaking / Math.max(1, speakingFrames)) * 100)}%`,
  maiorParadaComFalaMs: Math.round(longestStill),
  andandoNoSilencio: `${Math.round((movingSilent / Math.max(1, silentFrames)) * 100)}%`,
  quadrosVoltando: backwards,
  maiorPassoPx: +maxStep.toFixed(1),
  quadrosAcimaDe5px: samples.filter((s, k) => k && Math.abs(s[4] - samples[k - 1][4]) > 5).length,
  ritmoFinal: samples[samples.length - 1][5],
}));
