// Sobreposição do teleprompter: desenha o texto, estima onde você está lendo
// (voz, velocidade constante ou ativado por voz) e rola o texto até lá.
(() => {
  'use strict';
  const t = (text, vars) => (window.InPromptuI18n ? window.InPromptuI18n.t(text, vars) : text);
  const api = window.inpromptu;
  const { tokenize, sections, grammarWords, Tracker } = window.InPromptuText;
  const $ = (sel) => document.querySelector(sel);

  const FONTS = {
    sans: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", serif',
    mono: '"Cascadia Mono", Consolas, monospace',
    dyslexic: 'OpenDyslexic, "Segoe UI", sans-serif',
  };
  const SIZES = { xs: 14, sm: 16, lg: 20, xl: 24 };
  const HIGHLIGHTS = {
    white: '#ffffff', yellow: '#ffd60a', green: '#30d158', blue: '#64d2ff', pink: '#ff6fae', orange: '#ff9f0a',
  };

  const textEl = $('#text');
  const viewport = $('#viewport');
  const banner = $('#banner');
  const statusEl = $('#status');
  const wave = $('#wave');
  const waveCtx = wave.getContext('2d');

  let settings = null;
  let pages = [''];
  let pageIndex = 0;
  let tokens = [];
  let spans = [];
  let tracker = null;
  let pos = 0;           // próxima palavra a ler, confirmada (reconhecida ou contada)
  let shownIdx = -1;     // palavra destacada na tela
  let layout = { lines: [], lineOf: [], x: [], w: [], lh: 0, anchor: 0 };

  let paused = false;
  let muted = false;
  let finished = false;
  let advanceTimer = null;

  let follower = false;  // segunda tela: só desenha o que a sobreposição principal manda
  let hasFollower = false;
  let baseCls = [];      // classe de cada palavra (nota, seção)
  let countUntil = 0;    // contagem regressiva antes de começar
  let readMs = 0;        // tempo de leitura (sem pausas nem contagem)
  let lastFrame = 0;
  let holdUntil = 0;
  let wheelAccum = 0;
  const levels = new Array(18).fill(0);
  let lastStateSent = '';
  let lastStateAt = 0;

  /* ───────── Estilo ───────── */

  function applyStyle() {
    const s = settings;
    const root = document.documentElement.style;
    const kind = s.overlay;
    document.body.dataset.kind = kind;
    document.body.dataset.guidance = s.mode;
    document.body.dataset.mirror = kind === 'fullscreen' ? s.mirror : 'none';
    document.body.classList.toggle('glass', kind === 'floating' && !!s.glass);
    document.body.classList.toggle('follow', kind === 'floating' && !!s.followCursor);
    root.setProperty('--glass', String((s.glassOpacity ?? 30) / 100));
    root.setProperty('--hl', HIGHLIGHTS[s.highlight] || HIGHLIGHTS.yellow);
    root.setProperty('--font', FONTS[s.fontFamily] || FONTS.sans);
    let fs = SIZES[s.fontSize] || SIZES.lg;
    if (kind === 'fullscreen') fs = applyFullscreenStyle(s);
    root.setProperty('--fs', `${fs}px`);
    requestAnimationFrame(relayout);
  }

  /** Layout da tela cheia; devolve o tamanho da fonte em px. */
  function applyFullscreenStyle(s) {
    const root = document.documentElement.style;
    document.body.dataset.rotate = s.fsRotate || 'none';
    document.body.classList.toggle('nobar', !s.fsShowBar);
    const box = $('#root');
    // Tamanho definido para uma tela de 1920 px; escala com o monitor (em pé ou deitado).
    const scale = Math.max(box.clientWidth, box.clientHeight) / 1920 || 1;
    root.setProperty('--fs-column', `${s.fsColumn}%`);
    root.setProperty('--fs-align', s.fsAlign);
    root.setProperty('--fs-line', String(s.fsLineHeight));
    root.setProperty('--fs-letter', `${s.fsLetterSpacing / 100}em`);
    root.setProperty('--fs-weight', String({ normal: 400, medium: 500, bold: 700 }[s.fsWeight] || 500));
    root.setProperty('--fs-case', s.fsUppercase ? 'uppercase' : 'none');
    root.setProperty('--fs-text', s.fsTextColor);
    // paint-order: stroke desenha metade do traço por fora da letra, por isso o dobro.
    root.setProperty('--fs-outline', `${(s.fsOutline * 2 * scale).toFixed(1)}px`);
    root.setProperty('--fs-bg', rgba(s.fsBgColor, s.fsBgOpacity / 100));
    const marker = $('#marker');
    marker.hidden = s.fsMarker === 'none';
    marker.className = s.fsMarker;
    syncCamera();
    return Math.round(s.fsFontSize * scale);
  }

  function rgba(hex, alpha) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || [0, '00', '00', '00'];
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
  }

  /* ───────── Câmera de fundo (webcam ou Câmera Virtual do OBS) ───────── */

  const camEl = $('#cam');
  let camStream = null;
  let camWanted = '';
  let camRetry = null;
  let camMessage = '';

  async function syncCamera() {
    const s = settings;
    const want = s.overlay === 'fullscreen' ? (s.camDeviceId || '') : '';
    camEl.classList.toggle('corner', s.camMode === 'corner');
    camEl.style.transform = s.camMirror ? 'scaleX(-1)' : '';
    camEl.style.filter = s.camMode === 'corner' ? '' : `brightness(${1 - s.camDim / 100})`;
    updateCamLayout();
    if (want === camWanted) return;
    camWanted = want;
    clearTimeout(camRetry);
    stopCamera();
    setCamMessage('');
    if (want) openCamera(want);
  }

  async function openCamera(id) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (camWanted !== id) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      camStream = stream;
      camEl.srcObject = stream;
      camEl.hidden = false;
      setCamMessage('');
      updateCamLayout();
      // Se a câmera parar (ex.: câmera virtual do OBS desligada), tenta de novo.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (camWanted !== id) return;
        stopCamera();
        camRetry = setTimeout(() => openCamera(id), 3000);
      });
    } catch {
      if (camWanted !== id) return;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const label = devices.find((d) => d.deviceId === id)?.label || '';
      setCamMessage(/obs/i.test(label)
        ? t('No OBS, clique em “Iniciar câmera virtual”')
        : t('Câmera indisponível (em uso por outro app?)'));
      // A câmera virtual do OBS só funciona com o OBS aberto: tenta de novo até ela aparecer.
      camRetry = setTimeout(() => openCamera(id), 3000);
    }
  }

  function setCamMessage(text) {
    if (!text && statusEl.textContent !== camMessage) return;
    camMessage = text;
    statusEl.classList.toggle('error', !!text);
    statusEl.textContent = text;
  }

  function updateCamLayout() {
    document.body.classList.toggle('cam-bg', !!camStream && settings.camMode !== 'corner');
  }

  function stopCamera() {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    camEl.srcObject = null;
    camEl.hidden = true;
    updateCamLayout();
  }

  /* ───────── Texto ───────── */

  function loadPage(index, { keepPos = false } = {}) {
    clearTimeout(advanceTimer);
    pageIndex = Math.max(0, Math.min(index, pages.length - 1));
    tokens = tokenize(pages[pageIndex] || '');
    baseCls = tokens.map((t) => (t.note ? 'w note' : t.heading ? 'w heading' : 'w'));
    const frag = document.createDocumentFragment();
    spans = tokens.map((t, i) => {
      const span = document.createElement('span');
      span.className = baseCls[i];
      span.textContent = t.text;
      span.dataset.i = i;
      frag.appendChild(span);
      if (t.nl >= 2) {
        const gap = document.createElement('span');
        gap.className = 'gap';
        frag.appendChild(gap);
      } else if (t.nl === 1) {
        frag.appendChild(document.createElement('br'));
      } else {
        frag.appendChild(document.createTextNode(' '));
      }
      return span;
    });
    textEl.replaceChildren(frag);
    relayout();
    const prev = pos;
    tracker = new Tracker(tokens);
    shownIdx = -1;
    finished = false;
    banner.hidden = true;
    lastWordTime = null;
    setPos(keepPos ? prev : 0, { silentEnd: true });
    $('#page').textContent = pages.length > 1 ? `${pageIndex + 1}/${pages.length}` : '';
    if (follower) return;
    api.send('overlay:doc', {
      page: pageIndex,
      pageCount: pages.length,
      tokens: tokens.map((t) => ({ t: t.text, nl: t.nl, n: t.note ? 1 : undefined, h: t.heading ? 1 : undefined })),
      sections: sections(tokens),
      highlight: settings.highlight,
    });
    // Reconhecimento guiado: o reconhecedor só escolhe entre as palavras desta página.
    api.send('overlay:engine', {
      cmd: 'reset',
      grammar: settings.mode === 'tracking' ? grammarWords(pages[pageIndex] || '') : null,
    });
    actionsDone.clear(); // voltar a uma página roda as ações dela de novo
    runActions(0, pos); // notas do começo da página ([cena: …] logo no início)
    $('#b-prev').disabled = pageIndex === 0;
    $('#b-next').disabled = pageIndex >= pages.length - 1;
    sendState(true);
  }

  /** Vai direto para uma palavra (clique, rolagem do mouse, troca de página). */
  function setPos(p, { silentEnd = false } = {}) {
    tracker.setPos(p);
    pos = tracker.pos;
    est = pos;
    vel = 0;
    pending = 0;
    fixedPos = pos;
    speakTime = 0;
    lastWordTime = null; // depois de um pulo, não interpola tempos de fala com o trecho anterior
    renderHighlight();
    updateProgress();
    if (pos >= tokens.length && !silentEnd) onPageEnd();
  }

  /** Palavras lidas pintadas até `pos`; a palavra em que você está, sublinhada. */
  function renderHighlight() {
    const cur = Math.min(spans.length, Math.max(pos, Math.floor(est + 1e-6)));
    const key = pos * 100000 + cur;
    if (key === shownIdx) return;
    shownIdx = key;
    for (let i = 0; i < spans.length; i++) {
      const state = i < pos ? ' read' : i === cur && tokens[i].norm ? ' cur' : '';
      const cls = baseCls[i] + state;
      if (spans[i].className !== cls) spans[i].className = cls;
    }
  }

  /** Pula para a seção n (0 = primeira) da página: teclas 1–9 ou o celular. */
  function jumpSection(n) {
    const list = sections(tokens);
    if (n >= list.length) return;
    resumeIfFinished();
    setPos(list[n].index);
    tracker.resetUtterance();
    holdUntil = performance.now() + 400;
  }

  /* ───────── Ações do roteiro e tempos de fala ───────── */

  const actionsDone = new Set();
  let timeQueue = [];
  let lastFlush = 0;
  let lastWordTime = null; // quando a última palavra registrada foi dita (ms, relógio do sistema)

  /** [cena: …] e [capítulo: …] por onde a leitura acabou de passar vão para o OBS (uma vez só). */
  function runActions(from, to) {
    for (let i = from; i < to && i < tokens.length; i++) {
      const a = tokens[i].action;
      const key = `${pageIndex}:${i}`;
      if (a && !actionsDone.has(key)) {
        actionsDone.add(key);
        api.send('overlay:action', a);
      }
    }
  }

  /**
   * Registra quando as palavras [from, to) foram ditas, para as legendas: a última em `tEnd`,
   * as anteriores (que o reconhecimento pode ter omitido) espalhadas desde a palavra anterior.
   */
  function recordTimes(from, to, tEnd) {
    const idx = [];
    for (let i = from; i < to; i++) if (tokens[i]?.norm) idx.push(i);
    if (!idx.length) return;
    const tStart = lastWordTime ?? tEnd - idx.length * 300;
    idx.forEach((i, k) => {
      const t = Math.round(tStart + ((tEnd - tStart) * (k + 1)) / idx.length);
      timeQueue.push([pageIndex, i, t]);
    });
    lastWordTime = tEnd;
  }

  function flushTimes(now, force = false) {
    if (!timeQueue.length || (!force && now - lastFlush < 300)) return;
    lastFlush = now;
    api.send('overlay:times', timeQueue);
    timeQueue = [];
  }

  /* ───────── Cronômetro e contagem ───────── */

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  /** Palavras de leitura (sem notas nem seções) de cada página, para estimar o tempo que falta. */
  let pageWords = [];
  let lastTimerAt = 0;

  function updateTimer(now) {
    if (now - lastTimerAt < 250) return;
    lastTimerAt = now;
    const el = $('#timer');
    if (!settings.showTimer || follower) {
      el.textContent = '';
      return;
    }
    const remaining = timeLeft();
    const target = (settings.targetMinutes || 0) * 60;
    el.textContent = `${fmt(readMs / 1000)} · faltam ${fmt(remaining)}`;
    el.classList.toggle('over', target > 0 && readMs / 1000 + remaining > target);
    el.title = target > 0 ? `Meta: ${fmt(target)}` : '';
  }

  /** Segundos que faltam até o fim do roteiro, no ritmo atual. */
  function timeLeft() {
    let left = 0;
    for (let i = Math.ceil(est); i < tokens.length; i++) if (tokens[i].norm) left++;
    for (let p = pageIndex + 1; p < pages.length; p++) left += pageWords[p] || 0;
    const pace = settings.mode === 'tracking' ? rate : settings.speed;
    return left / Math.max(0.5, pace);
  }

  /** Contagem antes de começar; durante ela o texto não anda e a voz é ignorada. */
  function startCountdown(n) {
    countUntil = performance.now() + n * 1000;
    const tick = () => {
      const left = Math.ceil((countUntil - performance.now()) / 1000);
      if (left <= 0) {
        banner.hidden = true;
        return;
      }
      showBanner(`<b>${left}</b>Prepare-se`);
      setTimeout(tick, 100);
    };
    tick();
  }

  function updateProgress() {
    $('#progress-fill').style.width = `${Math.min(100, (pos / (tokens.length || 1)) * 100)}%`;
  }

  function lineHeight() {
    const style = getComputedStyle(textEl);
    const lh = parseFloat(style.lineHeight);
    return Number.isFinite(lh) ? lh : parseFloat(style.fontSize) * 1.45;
  }

  /** Mede onde fica cada linha e cada palavra (depois de mudar texto, fonte ou tamanho). */
  function relayout() {
    if (!settings) return;
    const lines = [];
    const lineOf = new Array(spans.length);
    const x = new Array(spans.length);
    const w = new Array(spans.length);
    let cur = null;
    spans.forEach((s, i) => {
      const top = s.offsetTop;
      const left = s.offsetLeft;
      const width = s.offsetWidth;
      if (!cur || Math.abs(top - cur.top) > 2) {
        cur = { start: i, top, left, right: left + width };
        lines.push(cur);
      } else {
        cur.left = Math.min(cur.left, left);
        cur.right = Math.max(cur.right, left + width);
      }
      lineOf[i] = lines.length - 1;
      x[i] = left;
      w[i] = width;
    });
    for (const l of lines) l.width = Math.max(1, l.right - l.left);
    const lh = lineHeight();
    const anchor = settings.overlay === 'fullscreen' ? Math.round(viewport.clientHeight * settings.fsAnchor / 100) : 0;
    layout = { lines, lineOf, x, w, lh, anchor };
    if (settings.overlay === 'fullscreen') {
      const root = document.documentElement.style;
      root.setProperty('--anchor-px', `${anchor}px`);
      root.setProperty('--lh', `${lh}px`);
    }
    snapScroll = true;
  }

  /** Altura (no texto) correspondente à posição `p`: sobe aos poucos ao longo de cada linha. */
  function textY(p) {
    const { lines, lineOf, x, w } = layout;
    p = Math.max(0, Math.min(p, spans.length - 0.001));
    const i = Math.floor(p);
    const line = lines[lineOf[i]];
    const next = lines[lineOf[i] + 1];
    if (!next) return line.top;
    const along = x[i] - line.left + (p - i) * w[i];
    return line.top + Math.min(1, Math.max(0, along / line.width)) * (next.top - line.top);
  }

  function lineStarts() {
    return layout.lines.map((l) => l.start);
  }

  function moveLines(delta) {
    if (!spans.length) return;
    const starts = lineStarts();
    const cur = Math.min(pos, spans.length - 1);
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= cur) line++;
    const target = Math.max(0, Math.min(starts.length - 1, line + delta));
    resumeIfFinished();
    setPos(starts[target]);
    tracker.resetUtterance();
    holdUntil = performance.now() + 700;
  }

  function resumeIfFinished() {
    if (!finished) return;
    finished = false;
    clearTimeout(advanceTimer);
    banner.hidden = true;
  }

  function onPageEnd() {
    if (finished) return;
    finished = true;
    if (!follower) flushTimes(performance.now(), true);
    clearTimeout(advanceTimer);
    const hasNext = pageIndex < pages.length - 1;
    if (hasNext && settings.autoAdvance) {
      let n = settings.overlay === 'floating' && settings.followCursor ? 3 : 1;
      const tick = () => {
        showBanner(`<b>${n}</b>Próxima página`);
        if (n-- <= 0) {
          loadPage(pageIndex + 1);
          return;
        }
        advanceTimer = setTimeout(tick, 1000);
      };
      if (n > 1) tick();
      else advanceTimer = setTimeout(() => loadPage(pageIndex + 1), 900);
    } else if (hasNext) {
      showBanner('Fim da página — ⏭ para continuar');
    } else {
      showBanner('<b>✓</b>Fim do roteiro');
      advanceTimer = setTimeout(() => api.send('overlay:stop'), 1800);
    }
    sendState(true);
  }

  function showBanner(html) {
    banner.innerHTML = html;
    banner.hidden = false;
  }

  /* ───────── Onde você está (estimativa contínua) ─────────
   * `est` é a palavra que você está lendo agora (fracionária). Ela anda no seu ritmo enquanto
   * o detector ouve voz e para no silêncio. No rastreamento de voz, cada palavra reconhecida
   * corrige a estimativa — levando em conta há quanto tempo foi dita — e ensina o seu ritmo.
   * A rolagem só desenha `est`; não há nenhuma outra lógica por cima.
   */
  const RATE_DEFAULT = 2.8;   // palavras/s antes de conhecer o seu ritmo (depois fica salvo)
  const PARTIAL_DELAY = 0.45; // atraso típico entre dizer e reconhecer (medido com a sua voz)
  const MAX_AHEAD_S = 1.6;    // a estimativa não passa disso (em segundos de fala) à frente do reconhecido
  const SLOW_AHEAD_S = 0.5;   // ...e começa a diminuir o passo depois disso além do atraso típico
  const RAMP = 0.18;          // s para acelerar ao começar a falar e frear ao parar
  const CATCH_UP = 0.35;      // s para absorver uma correção (sem tranco)
  let est = 0;                // posição estimada
  let vel = 0;                // palavras/s agora
  let rate = RATE_DEFAULT;    // seu ritmo de leitura, aprendido durante a leitura
  let pending = 0;            // correção ainda por aplicar
  let speaking = false;       // do detector de fala
  let speakTime = 0;          // segundos de fala desde `fixedPos`
  let fixedPos = 0;           // posição reconhecida da última medição do ritmo

  function advance(dt) {
    const mode = settings.mode;
    const now = performance.now();
    const counting = now < countUntil;
    if (!paused && !finished && !counting) readMs += dt * 1000;
    const moving = !paused && !finished && !counting && now > holdUntil
      && (mode === 'classic' || (speaking && !muted));
    let target = 0;
    if (moving) target = mode === 'tracking' ? rate : settings.speed;
    if (mode === 'tracking' && moving) {
      // Já está bem à frente do que foi reconhecido: diminui o passo (nunca volta o texto).
      const excess = est - pos - rate * (PARTIAL_DELAY + SLOW_AHEAD_S);
      if (excess > 0) target *= Math.max(0, 1 - excess / (rate * (MAX_AHEAD_S - PARTIAL_DELAY - SLOW_AHEAD_S)));
    }
    vel += (target - vel) * (1 - Math.exp(-dt / RAMP));
    if (target === 0 && vel < 0.02) vel = 0;
    const take = pending * (1 - Math.exp(-dt / CATCH_UP));
    pending -= take;
    est += vel * dt + take;
    if (mode === 'tracking') {
      if (speaking && !muted && !paused) speakTime += dt;
      est = Math.min(est, pos + rate * MAX_AHEAD_S);
    }
    est = Math.min(est, tokens.length);
    if (mode !== 'tracking') {
      // Clássico e ativado por voz: a posição é a própria estimativa; notas e seções não
      // gastam tempo de leitura (o texto passa direto por elas).
      const k = Math.floor(est);
      if (k < tokens.length && !tokens[k].norm) est = Math.max(est, tracker.skip(k));
      const p = Math.min(Math.floor(est), tokens.length);
      if (p > pos) {
        recordTimes(pos, p, Date.now());
        runActions(pos, p);
      }
      if (p !== pos) {
        pos = p;
        tracker.pos = pos;
        updateProgress();
        if (pos >= tokens.length) onPageEnd();
      }
    }
  }

  /** Uma palavra reconhecida: `p` é a próxima a ler; ela terminou de ser dita há `ago` s. */
  function correct(p, ago) {
    window.__inpromptuLog?.push({ t: Date.now(), p, ago }); // só nos testes automatizados
    if (speakTime > 1.5 && p > fixedPos) {
      // Seu ritmo: palavras avançadas por segundo de fala desde a última medição (janelas de
      // 1,5 s ou mais e média móvel lenta: o reconhecimento chega aos trancos, o ritmo não).
      const r = (p - fixedPos) / speakTime;
      if (r > 0.8 && r < 6) rate += (r - rate) * 0.25;
      fixedPos = p;
      speakTime = 0;
    }
    // Onde você deve estar agora: a palavra reconhecida + o que falou desde então.
    const z = Math.min(tokens.length, p + (speaking ? rate * ago : 0));
    const err = z - (est + pending);
    if (Math.abs(err) > Math.max(6, rate * 2)) {
      // Pulo (você voltou ou adiantou um trecho): vai direto.
      est = z;
      pending = 0;
      fixedPos = p;
      speakTime = 0;
    } else if (err > 0) {
      pending += err; // atrás: alcança aos poucos
    }
    // À frente: não volta o texto; advance() diminui o passo até a leitura alcançar.
  }

  /* ───────── Rolagem ───────── */

  let scrollY = 0;
  let appliedY = null;
  let snapScroll = true; // a próxima rolagem vai direto, sem animação

  /** Leva o texto até a posição estimada; a suavização só tira tremidas de um quadro a outro. */
  function updateScroll(dt) {
    if (!layout.lines.length) return;
    const y = textY(est);
    // Tela cheia: na linha de leitura escolhida. Ilha/flutuante: na 2ª linha visível.
    const target = settings.overlay === 'fullscreen' ? layout.anchor - y : Math.min(0, layout.lh * 1.02 - y);
    if (snapScroll || !dt) {
      scrollY = target;
      snapScroll = false;
    } else {
      scrollY += (target - scrollY) * (1 - Math.exp(-dt / 0.12));
    }
    const out = Math.round(scrollY * 10) / 10;
    if (out !== appliedY) {
      appliedY = out;
      textEl.style.transform = `translateY(${out}px)`;
    }
  }

  /* ───────── Controles ───────── */

  function togglePause(force) {
    paused = typeof force === 'boolean' ? force : !paused;
    document.body.classList.toggle('paused', paused);
    if (!paused) tracker.resetUtterance();
    sendState(true);
  }

  function toggleMute(force) {
    muted = typeof force === 'boolean' ? force : !muted;
    document.body.classList.toggle('muted', muted);
    api.send('overlay:engine', { cmd: 'mute', muted });
    sendState(true);
  }

  function gotoPage(delta) {
    const next = pageIndex + delta;
    if (next < 0 || next >= pages.length) return;
    loadPage(next);
  }

  function onCommand(c) {
    switch (c.cmd) {
      case 'togglePause': togglePause(); break;
      case 'toggleMute': toggleMute(); break;
      case 'nextPage': gotoPage(1); break;
      case 'prevPage': gotoPage(-1); break;
      case 'lineUp': moveLines(-1); break;
      case 'lineDown': moveLines(1); break;
      case 'jump':
        resumeIfFinished();
        setPos(c.index);
        break;
      case 'replaceText':
        pages[pageIndex] = c.text;
        loadPage(pageIndex, { keepPos: true });
        break;
      default:
    }
  }

  $('#b-play').addEventListener('click', () => togglePause());
  $('#b-mute').addEventListener('click', () => toggleMute());
  $('#b-prev').addEventListener('click', () => gotoPage(-1));
  $('#b-next').addEventListener('click', () => gotoPage(1));
  $('#b-stop').addEventListener('click', () => api.send('overlay:stop'));

  // Com "cliques atravessam", a barra continua clicável enquanto o mouse está sobre ela.
  $('#bar').addEventListener('mouseenter', () => api.send('overlay:mouse', { overBar: true }));
  $('#bar').addEventListener('mouseleave', () => api.send('overlay:mouse', { overBar: false }));

  textEl.addEventListener('click', (e) => {
    const i = e.target.dataset?.i;
    if (i === undefined || follower) return;
    resumeIfFinished();
    setPos(Number(i));
    tracker.resetUtterance();
    holdUntil = performance.now() + 400;
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (follower) return;
    wheelAccum += e.deltaY;
    const step = 60;
    while (Math.abs(wheelAccum) >= step) {
      moveLines(Math.sign(wheelAccum));
      wheelAccum -= Math.sign(wheelAccum) * step;
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.send('overlay:stop');
    else if (e.key === ' ') togglePause();
    else if (e.key === 'ArrowUp') moveLines(-1);
    else if (e.key === 'ArrowDown') moveLines(1);
    else if (e.key === 'PageDown' || e.key === 'ArrowRight') gotoPage(1);
    else if (e.key === 'PageUp' || e.key === 'ArrowLeft') gotoPage(-1);
    else if (e.key.toLowerCase() === 'm') toggleMute();
    else if (/^[1-9]$/.test(e.key)) jumpSection(Number(e.key) - 1);
  });

  window.addEventListener('resize', () => {
    applyStyle();
  });

  /* ───────── Voz ───────── */

  function onEngine(ev) {
    switch (ev.type) {
      case 'level':
        levels.push(ev.level);
        levels.shift();
        break;
      case 'speech':
        speaking = ev.speaking;
        break;
      case 'partial':
      case 'result': {
        if (settings.mode !== 'tracking' || paused || muted || finished) return;
        if (performance.now() < countUntil) return; // fala durante a contagem não conta
        window.__inpromptuLog?.push({ t: Date.now(), type: ev.type, text: ev.text }); // só nos testes
        const before = tracker.pos;
        tracker.feed(ev.text, ev.type === 'result');
        if (tracker.pos !== before) {
          pos = tracker.pos;
          const ago = ev.type === 'result' && ev.ago && tracker.lastMatch >= 0 ? ev.ago[tracker.lastMatch] : PARTIAL_DELAY;
          correct(pos, ago ?? PARTIAL_DELAY);
          if (pos > before) {
            recordTimes(before, pos, Date.now() - (ago ?? PARTIAL_DELAY) * 1000);
            runActions(before, pos);
          }
          updateProgress();
          if (pos >= tokens.length) onPageEnd();
        }
        break;
      }
      case 'status':
        showStatus(ev);
        break;
      default:
    }
  }

  function showStatus(ev) {
    statusEl.classList.toggle('error', ev.state === 'error');
    if (ev.state === 'loading') statusEl.textContent = 'Carregando voz…';
    else if (ev.state === 'error' && ev.reason === 'mic') statusEl.textContent = 'Microfone indisponível';
    else if (ev.state === 'error' && ev.reason === 'vad') statusEl.textContent = 'Detector de voz indisponível';
    else if (ev.state === 'error') statusEl.textContent = 'Erro no reconhecimento de voz';
    else statusEl.textContent = '';
  }

  /* ───────── Animação ───────── */

  function frame(ts) {
    const dt = lastFrame ? Math.min(0.25, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    if (tokens.length) {
      if (!follower) advance(dt);
      renderHighlight();
      updateScroll(dt);
    }
    if (!follower) {
      const now = performance.now();
      drawWave();
      updateTimer(now);
      flushTimes(now);
      sendState(false);
      // Segunda tela: segue esta, quadro a quadro.
      if (hasFollower) api.send('overlay:frame', { page: pageIndex, pos, est, banner: banner.hidden ? '' : banner.innerHTML });
    }
    requestAnimationFrame(frame);
  }

  /** Segunda tela: recebe da principal a página, a posição e o aviso na tela (contagem, fim). */
  function onFrame(f) {
    if (f.page !== pageIndex) loadPage(f.page);
    pos = Math.min(f.pos, tokens.length);
    est = f.est;
    if (f.banner) {
      if (banner.innerHTML !== f.banner) banner.innerHTML = f.banner;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function drawWave() {
    if (settings.mode === 'classic') return;
    const w = wave.width;
    const h = wave.height;
    waveCtx.clearRect(0, 0, w, h);
    const n = levels.length;
    const bw = w / n;
    // Cor cheia quando o detector ouve fala; apagada quando é só ruído.
    waveCtx.fillStyle = muted ? 'rgba(255,255,255,0.25)' : speaking ? (HIGHLIGHTS[settings.highlight] || '#fff') : 'rgba(255,255,255,0.45)';
    for (let i = 0; i < n; i++) {
      const v = muted ? 0.04 : Math.max(0.06, levels[i]);
      const bh = Math.max(2, v * h * 0.95);
      const x = i * bw + bw * 0.2;
      const y = (h - bh) / 2;
      waveCtx.globalAlpha = 0.35 + 0.65 * (i / n);
      waveCtx.beginPath();
      waveCtx.roundRect(x, y, bw * 0.6, bh, bw * 0.3);
      waveCtx.fill();
    }
    waveCtx.globalAlpha = 1;
  }

  function sendState(force) {
    const now = performance.now();
    if (!force && now - lastStateAt < 100) return;
    const remaining = Math.round(timeLeft());
    const target = (settings.targetMinutes || 0) * 60;
    const st = {
      page: pageIndex,
      pageCount: pages.length,
      pos,
      total: tokens.length,
      paused,
      muted,
      finished,
      mode: settings.mode,
      speed: settings.speed,
      rate: settings.mode === 'tracking' ? Math.round(rate * 100) / 100 : undefined,
      elapsed: Math.floor(readMs / 1000),
      remaining,
      over: target > 0 && readMs / 1000 + remaining > target,
      counting: Math.max(0, Math.ceil((countUntil - now) / 1000)),
    };
    const key = JSON.stringify(st);
    if (!force && key === lastStateSent && now - lastStateAt < 1000) return;
    lastStateSent = key;
    lastStateAt = now;
    api.send('overlay:state', st);
  }

  // Só leitura, para os testes automatizados medirem a rolagem contra a fala.
  window.__inpromptuState = () => ({ pos, est, vel, rate, speaking, scrollY, t: Date.now() });

  /* ───────── Início ───────── */

  async function init() {
    const data = await api.invoke('overlay:init');
    if (!data) {
      api.send('overlay:stop');
      return;
    }
    settings = data.settings;
    pages = data.pages.length ? data.pages : [''];
    follower = !!data.follower;
    hasFollower = !!data.hasFollower;
    document.body.classList.toggle('follower', follower);
    rate = settings.readingRate || RATE_DEFAULT;
    pageWords = pages.map((p) => tokenize(p).filter((t) => t.norm).length);
    applyStyle();
    loadPage(data.pageIndex);
    api.on('settings:changed', (s) => {
      settings = { ...s, ...data.fixed };
      applyStyle();
    });
    if (follower) {
      api.on('overlay:frame', onFrame);
    } else {
      if (data.resume) {
        // Janela recriada no meio da leitura (ex.: tela cheia ficou translúcida).
        setPos(data.resume.pos, { silentEnd: true });
        readMs = (data.resume.elapsed || 0) * 1000;
        if (data.resume.paused) togglePause(true);
        if (data.resume.muted) toggleMute(true);
      } else if (settings.countdown > 0) {
        startCountdown(settings.countdown);
      }
      if (data.engineStatus) showStatus(data.engineStatus);
      else if (settings.mode === 'tracking') statusEl.textContent = 'Preparando voz…';
      api.on('engine:event', onEngine);
      api.on('overlay:cmd', onCommand);
      api.on('overlay:follower', (on) => { hasFollower = on; });
    }
    // Fontes carregadas depois (ex.: OpenDyslexic) mudam a quebra das linhas.
    document.fonts.ready.then(relayout);
    document.fonts.addEventListener('loadingdone', relayout);
    requestAnimationFrame(frame);
  }

  init();
})();
