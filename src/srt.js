'use strict';
// Legendas .srt a partir de quando cada palavra do roteiro foi dita (rastreamento de voz).

const MAX_LINE = 42;       // caracteres por linha (padrão comum de legendas)
const MAX_CUE_CHARS = 84;  // duas linhas
const MAX_CUE_S = 6;       // uma legenda não fica mais que isso na tela
const MIN_CUE_S = 0.9;
const HOLD_S = 0.35;       // fica um pouquinho depois da última palavra
const MIN_GAP_S = 0.05;

/** Quanto tempo a palavra leva para ser dita, aproximado pelo tamanho (só o fim dela é medido). */
const wordDuration = (text) => Math.min(0.9, Math.max(0.2, text.length * 0.07));

/**
 * @param {{ text: string, t: number }[]} words palavras em ordem, com o instante (s) em que
 *   terminaram de ser ditas, contado do início da gravação.
 * @returns {string} conteúdo do arquivo .srt ('' se não houver palavras)
 */
function buildSrt(words) {
  const groups = [];
  let cur = [];
  const close = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (const w of words) {
    const text = [...cur, w].map((x) => x.text).join(' ');
    if (cur.length && (text.length > MAX_CUE_CHARS || w.t - cur[0].t > MAX_CUE_S)) close();
    cur.push(w);
    const length = cur.map((x) => x.text).join(' ').length;
    // Fecha no fim de frase; numa vírgula, só se já estiver comprida.
    if (/[.!?…]["'”»)]*$/.test(w.text) || (/[,;:—]["'”»)]*$/.test(w.text) && length > MAX_LINE)) close();
  }
  close();

  const cues = groups.map((g) => ({
    start: Math.max(0, g[0].t - wordDuration(g[0].text)),
    end: g[g.length - 1].t + HOLD_S,
    text: wrap(g.map((x) => x.text).join(' ')),
  }));
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const prev = cues[i - 1];
    if (prev && c.start < prev.end + MIN_GAP_S) {
      // Encurta a anterior até o início desta; se não der, esta começa logo depois.
      prev.end = Math.max(prev.start + 0.3, c.start - MIN_GAP_S);
      c.start = Math.max(c.start, prev.end + MIN_GAP_S);
    }
    c.end = Math.max(c.end, c.start + MIN_CUE_S);
    const next = cues[i + 1];
    if (next) c.end = Math.min(c.end, Math.max(c.start + 0.3, next.start - MIN_GAP_S));
  }
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}

/** Quebra em duas linhas, no espaço mais perto do meio. */
function wrap(text) {
  if (text.length <= MAX_LINE) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const two = (n) => String(n).padStart(2, '0');
  return `${two(Math.floor(ms / 3600000))}:${two(Math.floor(ms / 60000) % 60)}:${two(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, '0')}`;
}

module.exports = { buildSrt };
