// Tokenização do roteiro e rastreamento da posição de leitura a partir do
// reconhecimento de voz. Usado pela sobreposição (navegador) e pelos testes (Node).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InPromptuText = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  // Pontuação do alinhamento (ver Tracker.align).
  const MATCH = 2;            // palavra reconhecida igual à do roteiro
  const MATCH_SHORT = 1;      // idem, mas palavra curta (“a”, “de”, “o”): diz pouco sobre a posição
  const MISMATCH = -1;
  const SKIP_SCRIPT = -0.4;   // palavra do roteiro sem reconhecimento (o guiado omite muitas curtas)
  const SKIP_HEARD = -1;      // palavra reconhecida que não está no roteiro
  const START_AHEAD = -0.08;  // por palavra que a frase começa adiante de onde você estava
  const START_BEHIND = -0.6;  // por palavra que ela começa atrás
  const MIN_SCORE = 2;        // abaixo disso, não move
  const BACK = 4;             // palavras para trás na janela de alinhamento
  const AHEAD = 25;           // palavras à frente (além do tamanho da própria frase)
  const RELOCATE_MIN_WORDS = 4;
  const RELOCATE_MIN_SCORE = 6;

  function normalize(word) {
    return String(word)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Divide o texto em palavras, guardando quantas quebras de linha vêm depois de cada uma.
   * O que não é para ler em voz alta fica com `norm` vazio (o rastreador pula):
   * - notas de direção entre [colchetes] → `note`; [cena: Nome] e [capítulo: Nome] (ou [scene:] e [chapter:]) também
   *   viram `action` (para o OBS), na primeira palavra da nota;
   * - linhas que começam com # → `heading` (seções, para pular direto até elas).
   */
  function tokenize(text) {
    const tokens = [];
    let lineStart = true;
    let heading = false;
    let note = null;
    for (const m of String(text).replace(/\r\n?/g, '\n').matchAll(/\S+|\n/g)) {
      const s = m[0];
      if (s === '\n') {
        if (tokens.length) tokens[tokens.length - 1].nl += 1;
        lineStart = true;
        heading = false;
        continue;
      }
      if (lineStart && !note && s.startsWith('#')) heading = true;
      lineStart = false;
      if (heading) {
        const title = s.replace(/^#+/, '');
        if (title) tokens.push({ text: title, norm: '', nl: 0, heading: true });
        continue;
      }
      const t = { text: s, norm: normalize(s), nl: 0 };
      if (note || s.startsWith('[')) {
        note = note || [];
        note.push(t);
        t.note = true;
        t.norm = '';
        if (s.includes(']')) {
          noteAction(note);
          note = null;
        }
      }
      tokens.push(t);
    }
    if (note) noteAction(note);
    return tokens;
  }

  function noteAction(words) {
    const inner = words.map((w) => w.text).join(' ').replace(/^\[|\][^\]]*$/g, '').trim();
    const m = /^(cena|scene|cap[ií]tulo|chapter)\s*:\s*(.+)$/i.exec(inner);
    if (m) words[0].action = { type: /^(cena|scene)$/i.test(m[1]) ? 'scene' : 'chapter', name: m[2].trim() };
  }

  /** Seções da página (linhas com #): [{ index, title }], na ordem. */
  function sections(tokens) {
    const out = [];
    tokens.forEach((t, i) => {
      if (!t.heading) return;
      const prev = out[out.length - 1];
      if (prev && prev.end === i - 1 && !tokens[i - 1].nl) {
        prev.title += ` ${t.text}`;
        prev.end = i;
      } else {
        out.push({ index: i, end: i, title: t.text });
      }
    });
    return out.map(({ index, title }) => ({ index, title }));
  }

  /**
   * Vocabulário do roteiro para o reconhecimento guiado do Vosk: minúsculas, com acentos,
   * sem pontuação, palavras com hífen separadas, mais "[unk]" para o que não é do roteiro.
   * Notas e seções ficam de fora (não são ditas).
   */
  function grammarWords(text) {
    const words = new Set();
    for (const t of tokenize(text)) {
      if (!t.norm) continue;
      for (const raw of t.text.toLowerCase().split(/[\-–—]+/)) {
        const w = raw.replace(/[^\p{L}\p{N}]+/gu, '');
        if (w) words.add(w);
      }
    }
    return [...words, '[unk]'];
  }

  function levenshtein(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /** Igualdade tolerante a pequenos erros do reconhecedor ("voce" ~ "voces"). */
  function similar(a, b) {
    if (a === b) return true;
    const longest = Math.max(a.length, b.length);
    if (Math.min(a.length, b.length) < 3) return false;
    const max = longest >= 8 ? 2 : 1;
    if (levenshtein(a, b, max) <= max) return true;
    // Prefixo comum longo cobre flexões ("apresentação" ~ "apresentações").
    return longest >= 7 && a.slice(0, 6) === b.slice(0, 6);
  }

  /**
   * Acompanha onde você está no roteiro. Cada resultado do reconhecedor (parcial ou final) é
   * a frase dita desde a última pausa; ela é alinhada inteira contra o trecho do roteiro a partir
   * de onde a frase começou — como um corretor que compara duas sequências e tolera palavras
   * faltando, sobrando ou trocadas. Assim, correções que o reconhecedor faz nos parciais não
   * bagunçam a posição, e palavras omitidas não travam a leitura.
   */
  class Tracker {
    constructor(tokens) {
      this.tokens = tokens;
      this.idx = [];                          // índices das palavras "de verdade" (sem pontuação solta)
      tokens.forEach((t, i) => { if (t.norm) this.idx.push(i); });
      this.pos = this.skip(0);                // próxima palavra a ler
      this.utteranceStart = null;             // posição quando a frase atual começou
      this.lastMatch = -1;                    // índice, na frase, da última palavra alinhada
    }

    skip(i) {
      while (i < this.tokens.length && !this.tokens[i].norm) i++;
      return i;
    }

    setPos(i) {
      this.pos = this.skip(Math.max(0, Math.min(i, this.tokens.length)));
      this.utteranceStart = null;
    }

    /** Começa uma nova frase do reconhecedor (ex.: depois de trocar de página ou clicar). */
    resetUtterance() {
      this.utteranceStart = null;
    }

    /**
     * Recebe a frase atual do reconhecedor. `lastMatch` passa a indicar qual palavra da frase
     * casou por último (para saber quando ela foi dita).
     */
    feed(text, isFinal) {
      const words = String(text).split(/\s+/).map(normalize).filter((w) => w && w !== 'unk');
      if (this.utteranceStart === null) this.utteranceStart = this.pos;
      this.lastMatch = -1;
      if (words.length) {
        const local = this.align(words, this.utteranceStart, false);
        if (local && local.end > this.pos) {
          this.pos = local.end;
          this.lastMatch = local.lastMatch;
        } else if (!local && words.length >= RELOCATE_MIN_WORDS) {
          // Nada bate perto: você pode ter pulado ou voltado. Procura as últimas palavras na página toda.
          const tail = words.slice(-6);
          const found = this.align(tail, this.pos, true);
          if (found && found.score >= RELOCATE_MIN_SCORE) {
            this.pos = found.end;
            this.lastMatch = words.length - tail.length + found.lastMatch;
            this.utteranceStart = found.start;
          }
        }
      }
      if (isFinal) this.utteranceStart = null;
      return this.pos;
    }

    /**
     * Alinha `words` contra o roteiro (programação dinâmica, como num corretor de diferenças).
     * Local: só perto de `start`, preferindo começar ali. Global: na página toda, sem preferência.
     * Devolve { end, start, score, lastMatch } ou null se nada bate o suficiente.
     */
    align(words, start, global) {
      const { idx, tokens } = this;
      let a = 0;
      let b = idx.length;
      if (!global) {
        const at = this.indexOf(start);
        a = Math.max(0, at - BACK);
        b = Math.min(idx.length, at + words.length * 2 + AHEAD);
      }
      const n = b - a;
      const m = words.length;
      if (!n) return null;
      // D[i][j]: melhor pontuação alinhando as i primeiras palavras ditas até a palavra j da janela.
      const D = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
      const from = Array.from({ length: m + 1 }, () => new Int32Array(n + 1)); // de onde veio (para recuperar o início)
      const lastM = Array.from({ length: m + 1 }, () => new Int32Array(n + 1).fill(-1));
      for (let j = 0; j <= n; j++) {
        const offset = a + j - this.indexOf(start);
        D[0][j] = global ? 0 : offset >= 0 ? offset * START_AHEAD : -offset * START_BEHIND;
        from[0][j] = j;
      }
      for (let i = 1; i <= m; i++) {
        D[i][0] = D[i - 1][0] + SKIP_HEARD;
        from[i][0] = from[i - 1][0];
        const w = words[i - 1];
        for (let j = 1; j <= n; j++) {
          const t = tokens[idx[a + j - 1]].norm;
          const same = similar(w, t);
          const diag = D[i - 1][j - 1] + (same ? (w.length <= 2 ? MATCH_SHORT : MATCH) : MISMATCH);
          const up = D[i - 1][j] + SKIP_HEARD;
          const left = D[i][j - 1] + SKIP_SCRIPT;
          if (diag >= up && diag >= left) {
            D[i][j] = diag;
            from[i][j] = from[i - 1][j - 1];
            lastM[i][j] = same ? i - 1 : lastM[i - 1][j - 1];
          } else if (up >= left) {
            D[i][j] = up;
            from[i][j] = from[i - 1][j];
            lastM[i][j] = lastM[i - 1][j];
          } else {
            D[i][j] = left;
            from[i][j] = from[i][j - 1];
            lastM[i][j] = lastM[i][j - 1];
          }
        }
      }
      let bestJ = -1;
      for (let j = 1; j <= n; j++) if (bestJ < 0 || D[m][j] > D[m][bestJ]) bestJ = j;
      const score = D[m][bestJ];
      if (bestJ < 0 || score < MIN_SCORE || lastM[m][bestJ] < 0) return null;
      return {
        end: this.skip(idx[a + bestJ - 1] + 1),
        start: idx[a + from[m][bestJ]] ?? this.tokens.length,
        score,
        lastMatch: lastM[m][bestJ],
      };
    }

    /** Posição de `pos` na lista de palavras (sem pontuação solta). */
    indexOf(pos) {
      let lo = 0;
      let hi = this.idx.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.idx[mid] < pos) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
  }

  return { normalize, tokenize, sections, grammarWords, similar, Tracker };
}));
