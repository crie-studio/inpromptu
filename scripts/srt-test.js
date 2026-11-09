// Testes das legendas .srt. Uso: node scripts/srt-test.js
const assert = require('assert');
const { buildSrt } = require('../src/srt.js');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

/** Palavras faladas a 3 por segundo, começando em `start`. */
const spoken = (text, start = 1) => text.split(' ').map((w, i) => ({ text: w, t: start + (i + 1) / 3 }));
const parse = (srt) => srt.trim().split(/\n\n/).map((block) => {
  const [n, times, ...lines] = block.split('\n');
  const [a, b] = times.split(' --> ').map((s) => {
    const [h, m, rest] = s.split(':');
    const [sec, ms] = rest.split(',');
    return +h * 3600 + +m * 60 + +sec + +ms / 1000;
  });
  return { n: +n, start: a, end: b, lines };
});

test('frase curta vira uma legenda, com o formato do .srt', () => {
  const srt = buildSrt(spoken('Bom dia a todos.'));
  assert.strictEqual(srt, '1\n00:00:01,123 --> 00:00:02,683\nBom dia a todos.\n');
});

test('cada frase vira uma legenda e elas não se sobrepõem', () => {
  const cues = parse(buildSrt(spoken('Primeira frase aqui. Segunda frase vem logo depois. Terceira.')));
  assert.deepStrictEqual(cues.map((c) => c.lines.join(' ')), ['Primeira frase aqui.', 'Segunda frase vem logo depois.', 'Terceira.']);
  for (let i = 1; i < cues.length; i++) assert(cues[i].start >= cues[i - 1].end, `legenda ${i + 1} começa antes da anterior acabar`);
  cues.forEach((c) => assert(c.end > c.start));
});

test('frase longa é dividida em legendas de no máximo duas linhas de 42 caracteres', () => {
  const text = 'Nos dias seguintes, tanto o paciente quanto o assistente desenvolveram infecções graves e não resistiram, e a história virou lenda nos corredores do hospital.';
  for (const c of parse(buildSrt(spoken(text)))) {
    assert(c.lines.length <= 2, 'mais de duas linhas');
    c.lines.forEach((l) => assert(l.length <= 46, `linha longa: ${l}`));
  }
});

test('sem palavras, sem legendas', () => {
  assert.strictEqual(buildSrt([]), '');
});

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exitCode = failures ? 1 : 0;
