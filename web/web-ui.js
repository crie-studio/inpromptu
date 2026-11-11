// Versão web: ajusta a tela do editor (a mesma do app de Windows) ao que existe no navegador.
// Esconde o que não tem como funcionar num site e troca os textos que falam do Windows.
(() => {
  'use strict';
  const $ = (s, el = document) => el?.querySelector(s) || null;
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const hide = (el) => el?.classList.add('web-hidden');
  const toggleOf = (key) => $(`[data-key="${key}"]`)?.closest('label.toggle') || null;
  const fieldOf = (sel) => $(sel)?.closest('.field') || null;
  const hub = window.__inpromptuHub;
  // A tela pode já estar em inglês: os títulos são procurados pelo texto traduzido.
  const T = (text) => (window.InPromptuI18n ? window.InPromptuI18n.t(text) : text);

  function heading(pane, title) {
    return $$(`[data-pane="${pane}"] h3`).find((h) => h.textContent.trim() === T(title)) || null;
  }
  function hideSection(pane, title) {
    const h = heading(pane, title);
    if (!h) return;
    hide(h);
    for (let el = h.nextElementSibling; el && el.tagName !== 'H3'; el = el.nextElementSibling) hide(el);
  }
  function setSmall(key, html) {
    const small = $('small', toggleOf(key));
    if (small) small.innerHTML = html;
  }
  function note(html) {
    const p = document.createElement('p');
    p.className = 'note web-note';
    p.innerHTML = html;
    return p;
  }

  // Onde o texto aparece: a ilha no topo da tela e as opções do Windows não existem no navegador.
  $$('[data-key="overlay"] [data-value="notch"]').forEach(hide);
  hide($('[data-show-if="overlay=notch"]'));
  hide(toggleOf('followCursor'));
  hide(toggleOf('glass'));
  hide(fieldOf('[data-key="glassOpacity"]'));
  hideSection('janela', 'Privacidade');
  const floatText = $('.cards[data-key="overlay"] [data-value="floating"] span');
  if (floatText) {
    floatText.textContent = hub?.hasPip
      ? 'Uma janelinha sempre por cima dos outros programas. Arraste e redimensione como quiser.'
      : 'Neste navegador ela ocupa a janela do site. No Chrome ou no Edge, fica sempre por cima dos outros programas.';
  }
  const fsText = $('.cards[data-key="overlay"] [data-value="fullscreen"] span');
  if (fsText) fsText.textContent = 'Ocupa a tela toda (ideal para monitor externo ou espelho). Esc sai da tela cheia; Esc de novo encerra a leitura.';

  // Tela cheia: o navegador usa o monitor da janela; sem transparência nem cliques atravessando.
  hide(heading('telacheia', 'Monitor'));
  hide(fieldOf('#fs-display'));
  hide(fieldOf('[data-key="fsBgOpacity"]'));
  hide(toggleOf('fsClickThrough'));
  const bgTitle = heading('telacheia', 'Fundo e transparência');
  if (bgTitle) bgTitle.textContent = 'Fundo';

  // Segunda tela: uma janela que você leva para o outro monitor.
  hide(fieldOf('#extra-display'));
  setSmall('extraOutput', 'Abre também uma janela que acompanha a leitura, com este mesmo layout. Leve-a para o outro monitor (por exemplo, o do vidro do teleprompter) e aperte <kbd>F</kbd> para tela cheia. O navegador pode pedir para permitir janelas pop-up.');
  const extra = toggleOf('extraOutput');
  if (extra) {
    const row = document.createElement('div');
    row.className = 'rec-row';
    const b = document.createElement('button');
    b.className = 'small';
    b.textContent = 'Abrir a segunda tela agora';
    b.addEventListener('click', () => hub?.openFollower());
    row.append(b);
    extra.after(row);
  }

  // Legendas: são baixadas ao terminar. Amostra de voz: só no app de Windows.
  setSmall('subtitles', 'No rastreamento de voz, com o instante em que cada palavra foi dita. O arquivo <b>.srt</b> é baixado ao terminar a leitura (com o nome do vídeo, se o OBS gravou).');
  hide($('#subs-open')?.closest('.rec-row'));
  hide($('#subs-status'));
  hideSection('leitura', 'Amostra de voz');

  // Celular: pela internet, em qualquer rede.
  const cel = heading('remoto', 'Celular (rede local)');
  if (cel) cel.textContent = 'Celular';
  hide(fieldOf('#remote-port'));
  const lanNote = $('#remote-lan-note');
  if (lanNote) {
    lanNote.innerHTML = 'Funciona em qualquer rede: o celular e o computador só precisam de internet. A conexão é direta entre os dois aparelhos (WebRTC, criptografada); o serviço público do <a href="#" data-href="https://peerjs.com">PeerJS</a> só apresenta um ao outro. Deixe esta aba aberta durante a leitura.';
    $('a', lanNote).addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://peerjs.com', '_blank', 'noopener');
    });
  }

  // OBS: a senha fica neste navegador; o acesso ao OBS do computador pode pedir permissão.
  const passNote = $('#obs-pass-note');
  if (passNote) {
    new MutationObserver(() => {
      if (passNote.textContent.includes('Windows')) passNote.textContent = 'Senha salva neste navegador.';
    }).observe(passNote, { childList: true, characterData: true, subtree: true });
    passNote.closest('.field, div')?.after(note('Na primeira conexão, o navegador pode pedir permissão para acessar os aparelhos da rede local: é o OBS no seu computador.'));
  }

  // Dicas dos botões: na web não há atalhos globais.
  for (const el of $$('[title*="global:"]')) el.title = el.title.replace(' · global: ', ' · ').replace('global: ', '');

  // Atalhos: só com o InPromptu em foco.
  const sc = heading('atalhos', 'Atalhos globais');
  if (sc) {
    sc.textContent = 'Atalhos';
    const p = sc.nextElementSibling;
    if (p?.classList.contains('note')) p.textContent = 'Na versão web, funcionam com o InPromptu em foco.';
  }

  // Sobre: o que fica só no app de Windows.
  const credits = $('#about-credits');
  if (credits) {
    const p = note('Esta é a versão web. O <a href="#" data-href="https://github.com/crie-studio/inpromptu/releases/latest">app para Windows</a> tem ainda a faixa no topo da tela, perto da câmera, o modo escondido das gravações e atalhos que funcionam com outros programas na frente.');
    $('a', p).addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://github.com/crie-studio/inpromptu/releases/latest', '_blank', 'noopener');
    });
    credits.before(p);
    const tour = note('<a href="../" target="_blank" rel="noopener">Conheça o InPromptu</a>: a página com tudo o que ele faz, em demonstrações ao vivo.');
    credits.before(tour);
  }

  // Funciona sem internet depois da primeira visita, e pode ser instalado como app.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
