// Testes do rastreador de leitura (sem microfone). Uso: npm run test:text
const assert = require('assert');
const { tokenize, sections, grammarWords, Tracker, similar } = require('../renderer/shared/text.js');

const SCRIPT = `Olá a todos! Hoje vamos falar sobre como gravar vídeos melhores em casa.
Primeiro, a iluminação: posicione a luz principal na frente do rosto, um pouco acima dos olhos.

Depois, cuide do áudio. Um microfone simples perto da boca faz mais diferença do que uma câmera cara.
Por fim, olhe para a lente da câmera, e não para a tela. É por isso que este teleprompter fica logo abaixo da webcam.`;

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

/** Simula o Vosk: cada frase chega como parciais crescentes e depois um resultado final. */
function speak(tracker, sentence) {
  const words = sentence.split(' ');
  for (let i = 1; i <= words.length; i++) tracker.feed(words.slice(0, i).join(' '), false);
  return tracker.feed(sentence, true);
}

const tokens = tokenize(SCRIPT);
const indexOf = (word, from = 0) => tokens.findIndex((t, i) => i >= from && t.norm === word);

test('tokenize preserva quebras de parágrafo', () => {
  const t = tokenize('um dois\n\ntrês');
  assert.deepStrictEqual(t.map((x) => [x.norm, x.nl]), [['um', 0], ['dois', 2], ['tres', 0]]);
});

test('similar tolera pequenos erros', () => {
  assert(similar('iluminacao', 'iluminacoes'));
  assert(similar('voce', 'voces'));
  assert(!similar('de', 'do'));
  assert(!similar('falar', 'gravar'));
});

test('leitura perfeita chega ao fim', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como gravar vídeos melhores em casa');
  assert.strictEqual(tr.pos, indexOf('primeiro'));
  speak(tr, 'primeiro a iluminação posicione a luz principal na frente do rosto um pouco acima dos olhos');
  speak(tr, 'depois cuide do áudio um microfone simples perto da boca faz mais diferença do que uma câmera cara');
  speak(tr, 'por fim olhe para a lente da câmera e não para a tela é por isso que este teleprompter fica logo abaixo da webcam');
  assert.strictEqual(tr.pos, tokens.length);
});

test('erros do reconhecedor não travam a leitura', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como grava vídeo melhor em casa');
  assert.strictEqual(tr.pos, indexOf('primeiro'));
  speak(tr, 'primeiro a iluminação posiciona a luz principal na frente do rosto um pouco a sima dos olhos');
  assert.strictEqual(tr.pos, indexOf('depois'));
});

test('palavras curtas fora do roteiro não fazem pular', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos');
  const before = tr.pos;
  speak(tr, 'é que o');
  assert.strictEqual(tr.pos, before, 'não deveria avançar com palavras comuns soltas');
});

test('reencontra o leitor depois de pular uma frase', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como gravar vídeos melhores em casa');
  // Pula a parte da iluminação inteira e começa no áudio.
  speak(tr, 'depois cuide do áudio um microfone simples');
  assert.strictEqual(tr.pos, indexOf('perto'));
});

test('volta quando o leitor repete um trecho anterior', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como gravar vídeos melhores em casa');
  speak(tr, 'primeiro a iluminação posicione a luz principal na frente do rosto');
  speak(tr, 'vamos falar sobre como gravar');
  assert.strictEqual(tr.pos, indexOf('videos'));
});

test('depois de um trecho mal reconhecido, 2 palavras certas bastam para reencontrar', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como gravar vídeos melhores em casa');
  // O leitor seguiu lendo a iluminação, mas o reconhecedor só entendeu ruído.
  speak(tr, 'hum prima ilha rosto tá bom pois é');
  speak(tr, 'depois cuide');
  assert.strictEqual(tr.pos, indexOf('do', indexOf('cuide')));
});

test('duas palavras um pouco mais adiante reencontram o leitor', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos falar sobre como gravar vídeos melhores em casa');
  speak(tr, 'microfone simples');
  assert.strictEqual(tr.pos, indexOf('perto'));
});

test('palavras curtas omitidas (como no reconhecimento guiado) não travam', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá todos hoje vamos falar sobre como gravar vídeos melhores casa');
  speak(tr, 'primeiro iluminação posicione luz principal frente rosto pouco acima olhos');
  assert.strictEqual(tr.pos, indexOf('depois'));
});

test('correções do reconhecedor nos parciais não fazem voltar nem pular', () => {
  const tr = new Tracker(tokens);
  tr.feed('olá a todos hoje', false);
  tr.feed('olá a todos hoje vamos falar', false);
  const p = tr.pos;
  tr.feed('olá a todos hoje vamos', false); // o parcial encolheu
  assert.strictEqual(tr.pos, p);
  tr.feed('olá a todos hoje vamos falar sobre como', true);
  assert.strictEqual(tr.pos, indexOf('gravar'));
});

test('vocabulário do reconhecimento guiado mantém acentos e separa hífens', () => {
  const words = grammarWords('Olá, bem-vindo à sala! "Cronometrem", cavalheiros.');
  assert.deepStrictEqual(words, ['olá', 'bem', 'vindo', 'à', 'sala', 'cronometrem', 'cavalheiros', '[unk]']);
});

test('notas de direção entre colchetes não são lidas', () => {
  const t = tokenize('Olá [pausa longa] mundo [sorrir].');
  assert.deepStrictEqual(t.map((x) => [x.text, x.norm, !!x.note]), [
    ['Olá', 'ola', false], ['[pausa', '', true], ['longa]', '', true], ['mundo', 'mundo', false], ['[sorrir].', '', true],
  ]);
});

test('[cena: …] e [capítulo: …] viram ações para o OBS', () => {
  const t = tokenize('[cena: Câmera 2] Bom dia. [Capítulo: Parte dois]');
  assert.deepStrictEqual(t[0].action, { type: 'scene', name: 'Câmera 2' });
  assert.deepStrictEqual(t[5].action, { type: 'chapter', name: 'Parte dois' });
});

test('linhas com # viram seções, que não são lidas', () => {
  const t = tokenize('# Introdução geral\nTexto aqui.\n\n## Parte dois\nmais texto');
  assert.deepStrictEqual(sections(t), [{ index: 0, title: 'Introdução geral' }, { index: 4, title: 'Parte dois' }]);
  assert.strictEqual(t.filter((x) => x.norm).map((x) => x.norm).join(' '), 'texto aqui mais texto');
});

test('vocabulário guiado não inclui notas nem seções', () => {
  assert.deepStrictEqual(grammarWords('# Título\nUm [pausa] dois'), ['um', 'dois', '[unk]']);
});

test('o rastreador passa direto pelas notas', () => {
  const tr = new Tracker(tokenize('um dois [olhe para a câmera] três quatro cinco'));
  speak(tr, 'um dois três quatro cinco');
  assert.strictEqual(tr.pos, tr.tokens.length);
});

test('falas fora do roteiro (improviso) não movem a posição', () => {
  const tr = new Tracker(tokens);
  speak(tr, 'olá a todos hoje vamos');
  const before = tr.pos;
  speak(tr, 'peraí deixa eu beber uma água rapidinho');
  assert.strictEqual(tr.pos, before);
});

console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
process.exitCode = failures ? 1 : 0;
