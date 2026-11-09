// Linha do tempo da medição: a cada 0,5 s, onde você estava de verdade x estimativa x reconhecido.
const fs = require('fs');
const [measFile, truthFile, from = '0', to = '999'] = process.argv.slice(2);
const { samples, log } = JSON.parse(fs.readFileSync(measFile, 'utf8'));
const { spokenEnd } = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
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
const truthAt = (a) => {
  if (a <= end[0]) return Math.max(0, a / Math.max(0.3, end[0]));
  for (let i = 1; i < n; i++) if (a <= end[i]) return i + (a - end[i - 1]) / Math.max(0.05, end[i] - end[i - 1]);
  return n;
};
const offsets = log.filter((e) => e.p !== undefined && e.ago !== 0.45 && e.p > 0 && e.p <= n).map((e) => (e.t - e.ago * 1000) / 1000 - end[e.p - 1]).sort((a, b) => a - b);
const offset = offsets[Math.floor(offsets.length / 2)];
let next = 0;
for (const [t, est, pos, speaking, y, rate] of samples) {
  const a = t / 1000 - offset;
  if (a < Number(from) || a > Number(to) || a < next) continue;
  next = Math.ceil(a * 2) / 2 + 0.5;
  const tr = truthAt(a);
  const ev = log.filter((e) => e.p !== undefined && e.t / 1000 - offset > a - 0.5 && e.t / 1000 - offset <= a).map((e) => `${e.p}${e.ago === 0.45 ? 'p' : `f${e.ago.toFixed(1)}`}`).join(',');
  console.log(`${a.toFixed(1).padStart(5)}s ${speaking ? 'FALA' : '----'} verdade=${tr.toFixed(1).padStart(5)} est=${est.toFixed(1).padStart(5)} (${(est - tr).toFixed(1).padStart(5)}) rec=${String(pos).padStart(3)} ritmo=${rate} y=${y} ${ev}`);
}
