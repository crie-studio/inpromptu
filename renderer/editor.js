(() => {
  'use strict';
  const api = window.inpromptu;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const HIGHLIGHTS = {
    white: '#ffffff', yellow: '#ffd60a', green: '#30d158', blue: '#64d2ff', pink: '#ff6fae', orange: '#ff9f0a',
  };
  const FONTS = {
    sans: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", serif',
    mono: '"Cascadia Mono", Consolas, monospace',
    dyslexic: 'OpenDyslexic, "Segoe UI", sans-serif',
  };
  const SIZES = { xs: 14, sm: 16, lg: 20, xl: 24 };

  const script = $('#script');
  const pageList = $('#page-list');

  let settings = {};
  let models = [];
  let doc = { pages: [''], pageIndex: 0, filePath: null };
  let fileName = 'Sem título';
  let dirty = false;
  let running = false;
  let readingPage = -1;
  let docTimer = null;
  let toastTimer = null;
  let pendingStart = false;

  /* ───────────────────────── Documento ───────────────────────── */

  function setDoc(next, name) {
    doc = {
      pages: next.pages.length ? next.pages.slice() : [''],
      pageIndex: Math.min(next.pageIndex || 0, Math.max(0, next.pages.length - 1)),
      filePath: next.filePath || null,
    };
    if (name !== undefined) fileName = name;
    script.value = doc.pages[doc.pageIndex];
    renderPages();
    renderStats();
    renderFileName();
    pushDoc(true);
  }

  function pushDoc(now) {
    clearTimeout(docTimer);
    const send = () => api.send('doc:update', doc);
    if (now) send();
    else docTimer = setTimeout(send, 300);
  }

  function selectPage(i) {
    doc.pageIndex = Math.max(0, Math.min(i, doc.pages.length - 1));
    script.value = doc.pages[doc.pageIndex];
    script.scrollTop = 0;
    renderPages();
    renderStats();
    pushDoc(true);
  }

  function renderPages() {
    pageList.replaceChildren(...doc.pages.map((text, i) => {
      const li = document.createElement('li');
      li.className = (i === doc.pageIndex ? 'active' : '') + (i === readingPage ? ' reading' : '');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      const line = document.createElement('span');
      line.className = 'preview-line';
      line.textContent = text.trim().slice(0, 120);
      const actions = document.createElement('span');
      actions.className = 'actions';
      for (const [label, title, fn] of [
        ['↑', 'Mover para cima', () => movePage(i, -1)],
        ['↓', 'Mover para baixo', () => movePage(i, 1)],
        ['✕', 'Excluir página', () => deletePage(i)],
      ]) {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        actions.appendChild(b);
      }
      li.append(num, line, actions);
      li.addEventListener('click', () => selectPage(i));
      return li;
    }));
  }

  function renderStats() {
    // Só o que é lido em voz alta (notas [ ] e seções # não contam).
    const count = (text) => window.InPromptuText.tokenize(text).filter((t) => t.norm).length;
    const words = count(doc.pages[doc.pageIndex]);
    const total = doc.pages.reduce((n, p) => n + count(p), 0);
    const learned = settings.mode === 'tracking' && settings.readingRate;
    const wps = settings.mode === 'tracking' ? settings.readingRate || 2.8 : settings.speed || 2.5;
    const secs = Math.round(total / wps);
    const time = secs >= 60 ? `~${Math.floor(secs / 60)} min ${secs % 60 ? `${secs % 60} s` : ''}` : `~${secs} s`;
    const pageInfo = doc.pages.length > 1 ? `Página ${doc.pageIndex + 1} de ${doc.pages.length} · ${words} palavras · ` : '';
    $('#stats').textContent = `${pageInfo}${total} palavras no total · ${time.trim()}${learned ? ' no seu ritmo' : ''}`;
  }

  function renderFileName() {
    $('#file-name').textContent = (dirty ? '• ' : '') + fileName;
    document.title = 'InPromptu - por Luiz Felipe Pitzer';
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      renderFileName();
    }
  }

  function addPage() {
    doc.pages.splice(doc.pageIndex + 1, 0, '');
    markDirty();
    selectPage(doc.pageIndex + 1);
    script.focus();
  }

  function movePage(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= doc.pages.length) return;
    [doc.pages[i], doc.pages[j]] = [doc.pages[j], doc.pages[i]];
    if (doc.pageIndex === i) doc.pageIndex = j;
    else if (doc.pageIndex === j) doc.pageIndex = i;
    markDirty();
    selectPage(doc.pageIndex);
  }

  function deletePage(i) {
    if (doc.pages[i].trim() && !confirm(`Excluir a página ${i + 1}?`)) return;
    if (doc.pages.length === 1) doc.pages[0] = '';
    else doc.pages.splice(i, 1);
    if (doc.pageIndex >= doc.pages.length || doc.pageIndex > i) doc.pageIndex = Math.max(0, doc.pageIndex - 1);
    markDirty();
    selectPage(doc.pageIndex);
  }

  script.addEventListener('input', () => {
    doc.pages[doc.pageIndex] = script.value;
    markDirty();
    const li = pageList.children[doc.pageIndex];
    if (li) $('.preview-line', li).textContent = script.value.trim().slice(0, 120);
    renderStats();
    pushDoc(false);
  });

  /* ───────────────────────── Arquivos ───────────────────────── */

  function confirmDiscard() {
    return !dirty || confirm('Há alterações não salvas. Continuar mesmo assim?');
  }

  function loadFile(result) {
    if (!result) return;
    dirty = false;
    setDoc({ pages: result.pages, pageIndex: 0, filePath: result.filePath }, result.name.replace(/\.[^.]+$/, ''));
    if (!result.filePath) markDirty();
    toast(`${result.pages.length} página${result.pages.length > 1 ? 's' : ''} carregada${result.pages.length > 1 ? 's' : ''}.`);
  }

  async function openFile() {
    if (!confirmDiscard()) return;
    try {
      loadFile(await api.invoke('file:open'));
    } catch (err) {
      toast(cleanError(err), true);
    }
  }

  async function saveFile(saveAs = false) {
    try {
      const r = await api.invoke('file:save', { filePath: doc.filePath, pages: doc.pages, saveAs });
      if (!r) return;
      doc.filePath = r.filePath;
      fileName = r.name.replace(/\.(inpromptu|roteiro)$/i, '');
      dirty = false;
      renderFileName();
      pushDoc(true);
      toast('Roteiro salvo.');
    } catch (err) {
      toast(cleanError(err), true);
    }
  }

  function newFile() {
    if (!confirmDiscard()) return;
    dirty = false;
    setDoc({ pages: [''], pageIndex: 0, filePath: null }, 'Sem título');
    script.focus();
  }

  $('#f-new').addEventListener('click', newFile);
  $('#f-open').addEventListener('click', openFile);
  $('#f-save').addEventListener('click', () => saveFile(false));
  $('#page-add').addEventListener('click', addPage);

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    dragDepth++;
    $('#drop').hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('#drop').hidden = true;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#drop').hidden = true;
    const file = e.dataTransfer?.files?.[0];
    if (!file || !confirmDiscard()) return;
    try {
      loadFile(await api.invoke('file:read', api.pathForFile(file)));
    } catch (err) {
      toast(cleanError(err), true);
    }
  });

  api.on('file:opened', (result) => {
    if (result.error) toast(result.error, true);
    else if (confirmDiscard()) loadFile(result);
  });

  function cleanError(err) {
    return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }

  /* ───────────────────────── Sessão ───────────────────────── */

  async function toggleSession() {
    if (running) {
      api.invoke('session:stop');
      return;
    }
    if (recording) {
      toast('Termine a gravação da amostra antes de iniciar a leitura.', true);
      return;
    }
    pushDoc(true);
    const res = await api.invoke('session:start', doc);
    if (res.ok) return;
    if (res.reason === 'model-missing') {
      const m = models.find((x) => x.id === res.language);
      toast(`Baixando o modelo de voz (${m?.label || res.language}, ~${m?.sizeMB || 40} MB). Isso só acontece uma vez…`);
      pendingStart = true;
      downloadModel(res.language);
    }
  }

  function setRunning(r) {
    running = r;
    document.body.classList.toggle('running', r);
    $('#start span').textContent = r ? 'Parar' : 'Iniciar';
    if (!r) {
      readingPage = -1;
      $('#run-status').textContent = '';
      renderPages();
      if (!$('#engine-status').classList.contains('error')) $('#engine-status').textContent = '';
    }
  }

  $('#start').addEventListener('click', toggleSession);

  api.on('session:changed', ({ running: r }) => setRunning(r));
  api.on('session:page', (page) => {
    readingPage = page;
    if (page !== doc.pageIndex && page < doc.pages.length) selectPage(page);
    else renderPages();
  });
  api.on('session:state', (st) => {
    if (!running) return;
    const pct = st.total ? Math.round((st.pos / st.total) * 100) : 0;
    const page = st.pageCount > 1 ? `Página ${st.page + 1}/${st.pageCount} · ` : '';
    const flags = st.paused ? ' · pausado' : st.muted ? ' · microfone desligado' : '';
    $('#run-status').textContent = `● Lendo — ${page}${pct}%${flags}`;
  });
  api.on('session:error', (res) => {
    if (res.reason === 'model-missing') {
      pendingStart = true;
      downloadModel(res.language);
    } else if (res.reason === 'recording') {
      toast('Termine a gravação da amostra antes de iniciar a leitura.', true);
    }
  });

  /* ───────────────────────── Amostra de voz ───────────────────────── */

  let recording = false;
  let recTimer = null;

  function setRecording(on) {
    recording = on;
    document.body.classList.toggle('recording', on);
    clearInterval(recTimer);
    const btn = $('#rec-btn');
    btn.disabled = false;
    if (!on) {
      btn.textContent = '● Gravar amostra';
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      btn.textContent = `■ Parar e salvar (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
    };
    tick();
    recTimer = setInterval(tick, 500);
    $('#rec-status').textContent = 'Gravando… leia o roteiro em voz alta, no seu ritmo normal.';
  }

  $('#rec-btn').addEventListener('click', async () => {
    if (recording) {
      clearInterval(recTimer);
      $('#rec-btn').disabled = true;
      $('#rec-btn').textContent = 'Salvando…';
      await api.invoke('recording:stop');
      return;
    }
    if (running) {
      toast('Pare a leitura antes de gravar a amostra.', true);
      return;
    }
    const res = await api.invoke('recording:start');
    if (res.ok) setRecording(true);
  });
  $('#rec-open').addEventListener('click', () => api.invoke('app:openRecordings'));
  api.on('recording:saved', (r) => {
    setRecording(false);
    if (r.error) {
      $('#rec-status').textContent = '';
      toast(`A amostra não foi salva: ${r.error}`, true);
      return;
    }
    $('#rec-status').textContent = `Salva: ${r.name} (${r.seconds} s).`;
    toast('Amostra de voz salva. Obrigado!');
  });

  /* ───────────────────────── Legendas e OBS ───────────────────────── */

  let lastSubtitles = '';
  $('#subs-open').addEventListener('click', () => api.invoke('app:openSubtitles'));
  $('#subs-show').addEventListener('click', () => api.invoke('app:showFile', lastSubtitles));
  api.on('subtitles:saved', ({ file, nextToVideo }) => {
    lastSubtitles = file;
    $('#subs-show').hidden = false;
    $('#subs-status').textContent = `Última: ${file.split(/[\\/]/).pop()}`;
    toast(nextToVideo ? 'Legendas salvas ao lado do vídeo do OBS.' : 'Legendas salvas em Documentos\\InPromptu\\Legendas.');
  });

  function renderObs(st) {
    const el = $('#obs-state');
    el.className = `obs-state ${st.state}`;
    el.textContent = {
      off: 'Desligado.',
      connecting: 'Conectando…',
      connected: `Conectado${st.version ? ` ao OBS ${st.version}` : ''}.`,
      error: st.message || 'Não conectado.',
    }[st.state] || '';
  }
  api.on('obs:status', renderObs);
  api.on('obs:notice', (message) => toast(message, true));
  $('#obs-retry').addEventListener('click', async () => renderObs(await api.invoke('obs:reconnect')));
  $('#obs-pass-save').addEventListener('click', async () => {
    const input = $('#obs-pass');
    const ok = await api.invoke('obs:setPassword', input.value);
    input.value = '';
    $('#obs-pass-note').textContent = ok
      ? 'Senha salva (cifrada pelo Windows).'
      : 'Não deu para guardar a senha com segurança neste computador.';
  });
  api.on('engine:status', (ev) => {
    const el = $('#engine-status');
    el.classList.toggle('error', ev.state === 'error');
    if (ev.state === 'loading') el.textContent = 'Carregando o modelo de voz…';
    else if (ev.state === 'error' && ev.reason === 'mic') {
      el.textContent = 'Não foi possível usar o microfone.';
      const b = document.createElement('button');
      b.className = 'small';
      b.textContent = 'Abrir configurações de privacidade';
      b.addEventListener('click', () => api.invoke('app:openMicSettings'));
      el.appendChild(b);
    } else if (ev.state === 'error') el.textContent = `Erro no reconhecimento de voz: ${ev.message || ''}`;
    else el.textContent = ev.state === 'listening' && running ? 'Microfone ativo' : '';
  });

  /* ───────────────────────── Modelos de voz ───────────────────────── */

  async function refreshModels() {
    models = await api.invoke('models:list');
    const sel = $('#language');
    if (!sel.options.length) {
      sel.replaceChildren(...models.map((m) => new Option(m.label, m.id)));
    }
    sel.value = settings.language;
    renderModelBox();
  }

  function renderModelBox(progress) {
    const m = models.find((x) => x.id === settings.language);
    const box = $('#model-box');
    const meter = $('.meter', box);
    const btn = $('#model-download');
    if (!m) return;
    box.classList.toggle('ok', m.installed);
    if (progress && progress.id === m.id && progress.phase !== 'done' && progress.phase !== 'error') {
      meter.hidden = false;
      btn.hidden = true;
      const pct = progress.total ? Math.round((progress.received / progress.total) * 100) : 0;
      $('#model-text').textContent = progress.phase === 'convert' ? 'Preparando o modelo…' : `Baixando… ${pct}%`;
      $('div', meter).style.width = `${progress.phase === 'convert' ? 100 : pct}%`;
      return;
    }
    meter.hidden = true;
    btn.hidden = m.installed;
    btn.textContent = `Baixar (${m.sizeMB} MB)`;
    $('#model-text').textContent = m.installed
      ? '✓ Modelo de voz instalado (offline)'
      : 'Modelo de voz não instalado.';
  }

  async function downloadModel(id) {
    renderModelBox({ id, phase: 'download', received: 0, total: 1 });
    const r = await api.invoke('models:download', id);
    await refreshModels();
    if (!r.ok) {
      pendingStart = false;
      toast(`Não foi possível baixar o modelo: ${r.message}`, true);
      return;
    }
    toast('Modelo de voz instalado.');
    if (pendingStart) {
      pendingStart = false;
      toggleSession();
    }
  }

  $('#model-download').addEventListener('click', () => downloadModel(settings.language));
  api.on('models:progress', (p) => {
    if (p.phase === 'error') return;
    renderModelBox(p);
  });

  /* ───────────────────────── Configurações ───────────────────────── */

  async function setSetting(key, value) {
    settings = await api.invoke('settings:set', { [key]: value });
    renderSettings();
  }

  function readControl(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    if (el.dataset.type === 'number') return el.value === '' ? null : Number(el.value);
    return el.value;
  }

  for (const el of $$('input[data-key], select[data-key]')) {
    const live = el.type === 'range' || el.type === 'color';
    el.addEventListener(live ? 'input' : 'change', () => {
      if (live) {
        settings[el.dataset.key] = readControl(el);
        renderOutputs();
        renderPreview();
        renderFsPreview();
        clearTimeout(el._t);
        el._t = setTimeout(() => setSetting(el.dataset.key, readControl(el)), 120);
      } else {
        setSetting(el.dataset.key, readControl(el));
      }
    });
  }
  for (const group of $$('.seg[data-key], .cards[data-key], .swatches[data-key]')) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) setSetting(group.dataset.key, b.dataset.value);
    });
  }

  function renderSettings() {
    for (const el of $$('input[data-key], select[data-key]')) {
      const v = settings[el.dataset.key];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el || !['number', 'text'].includes(el.type)) el.value = v ?? '';
    }
    for (const group of $$('.seg[data-key], .cards[data-key], .swatches[data-key]')) {
      for (const b of $$('button[data-value]', group)) {
        b.classList.toggle('active', String(settings[group.dataset.key]) === b.dataset.value);
      }
    }
    for (const el of $$('[data-show-if]')) {
      const [, key, op, val] = /^(\w+)(!?=)(.*)$/.exec(el.dataset.showIf);
      const eq = String(settings[key] ?? '') === val;
      el.hidden = op === '=' ? !eq : eq;
    }
    renderOutputs();
    renderPreview();
    renderFsPreview();
    renderModelBox();
    renderStats();
  }

  function renderOutputs() {
    for (const out of $$('output[data-for]')) {
      const v = settings[out.dataset.for];
      out.textContent = `${v}${out.dataset.suffix || ''}`;
    }
  }

  function renderPreview() {
    const pv = $('#preview');
    const text = $('.pv-text', pv);
    if (!text.childElementCount) {
      const words = 'Seu texto aparece assim, logo abaixo da câmera. As palavras lidas ficam coloridas e o texto rola sozinho enquanto você fala.'.split(' ');
      words.forEach((w, i) => {
        const s = document.createElement('span');
        s.textContent = w;
        if (i < 9) s.className = 'read';
        if (i === 9) s.className = 'cur';
        text.append(s, ' ');
      });
    }
    pv.style.setProperty('--hl', HIGHLIGHTS[settings.highlight] || HIGHLIGHTS.yellow);
    pv.style.width = `${settings.width}px`;
    text.style.height = `${settings.height}px`;
    text.style.fontFamily = FONTS[settings.fontFamily] || FONTS.sans;
    text.style.fontSize = `${SIZES[settings.fontSize] || 20}px`;
    const avail = $('.preview-wrap').clientWidth || 320;
    const scale = Math.min(1, avail / (settings.width + 4));
    pv.style.transform = `scale(${scale})`;
    pv.style.marginBottom = `${-(1 - scale) * (settings.height + 46)}px`;
  }

  /** Prévia em escala da tela cheia: mesmo layout da sobreposição real. */
  function renderFsPreview() {
    const pv = $('#fs-preview');
    const wrap = $('.fs-preview-wrap');
    if (!pv || !wrap.clientWidth) return;
    const s = settings;
    const portrait = s.fsRotate === 'left' || s.fsRotate === 'right';
    const avail = wrap.clientWidth;
    const w = portrait ? Math.round(avail * 0.42) : avail;
    const h = portrait ? Math.round((w * 16) / 9) : Math.round((w * 9) / 16);
    pv.style.width = `${w}px`;
    pv.style.height = `${h}px`;

    const scale = Math.max(w, h) / 1920;
    const size = s.fsFontSize * scale;
    const lh = size * s.fsLineHeight;
    const cam = !!s.camDeviceId;
    pv.classList.toggle('cam-bg', cam && s.camMode !== 'corner');
    pv.classList.toggle('cam-corner', cam && s.camMode === 'corner');
    pv.classList.toggle('nobar', !s.fsShowBar);
    const m = /^#?(..)(..)(..)$/.exec(s.fsBgColor) || [0, '00', '00', '00'];
    const vars = {
      '--hl': HIGHLIGHTS[s.highlight] || HIGHLIGHTS.yellow,
      '--fs-bg': `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${s.fsBgOpacity / 100})`,
      '--fs-text': s.fsTextColor,
      '--size': `${size}px`,
      '--line': String(s.fsLineHeight),
      '--letter': `${s.fsLetterSpacing / 100}em`,
      '--weight': String({ normal: 400, medium: 500, bold: 700 }[s.fsWeight] || 500),
      '--case': s.fsUppercase ? 'uppercase' : 'none',
      '--align': s.fsAlign,
      '--col': `${s.fsColumn}%`,
      '--outline': `${s.fsOutline * 2 * scale}px`,
      '--lh': `${lh}px`,
      '--pad': `${Math.max(w * 0.03, lh * 0.6)}px`,
      '--bar-h': `${Math.max(10, 64 * scale)}px`,
    };
    for (const [k, v] of Object.entries(vars)) pv.style.setProperty(k, v);
    $('.fsp-cam', pv).style.filter = cam && s.camMode !== 'corner' ? `brightness(${1 - s.camDim / 100})` : '';
    const mirror = { horizontal: 'scaleX(-1)', vertical: 'scaleY(-1)', both: 'rotate(180deg)' }[s.mirror] || '';
    $('.fsp-inner', pv).style.transform = mirror;

    const text = $('.fsp-text', pv);
    text.style.fontFamily = FONTS[s.fontFamily] || FONTS.sans;
    if (!text.childElementCount) {
      const sample = 'Bom dia! Hoje vou mostrar como o texto aparece na tela cheia. Ajuste o tamanho, o alinhamento e a largura da coluna até a leitura ficar confortável. A linha de leitura mostra onde seus olhos devem ficar enquanto o texto sobe sozinho.';
      sample.split(' ').forEach((word, i) => {
        const span = document.createElement('span');
        span.textContent = word;
        if (i < 14) span.className = 'read';
        if (i === 14) span.className = 'cur';
        text.append(span, ' ');
      });
    }
    const marker = $('.fsp-marker', pv);
    marker.className = `fsp-marker ${s.fsMarker}`;
    marker.hidden = s.fsMarker === 'none';
    const anchor = Math.round(h * (s.fsAnchor / 100));
    pv.style.setProperty('--anchor', `${anchor}px`);
    const cur = $('.cur', text);
    text.style.transform = `translateY(${anchor - cur.offsetTop}px)`;
  }

  $('#use-fullscreen').addEventListener('click', () => setSetting('overlay', 'fullscreen'));

  async function fillDisplays() {
    const displays = await api.invoke('displays:list');
    const first = {
      '#display': 'Monitor principal',
      '#fs-display': 'Monitor onde está o mouse',
      '#extra-display': 'Outro monitor (automático)',
    };
    for (const [id, label] of Object.entries(first)) {
      $(id).replaceChildren(new Option(label, ''), ...displays.map((d) => new Option(d.label, String(d.id))));
    }
    renderSettings();
  }

  async function fillDevices() {
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch { /* sem permissão ainda */ }
    const real = (d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications';
    const mic = $('#mic');
    mic.replaceChildren(
      new Option('Padrão do Windows', ''),
      ...devices.filter((d) => d.kind === 'audioinput' && real(d))
        .map((d, i) => new Option(d.label || `Microfone ${i + 1}`, d.deviceId)),
    );
    mic.value = settings.micDeviceId || '';
    const cams = devices.filter((d) => d.kind === 'videoinput' && real(d));
    const cam = $('#cam-device');
    cam.replaceChildren(
      new Option('Nenhuma', ''),
      ...cams.map((d, i) => new Option(d.label || `Câmera ${i + 1}`, d.deviceId)),
    );
    // Câmera escolhida antes e agora desconectada: mantém a opção para não perder a escolha.
    if (settings.camDeviceId && !cams.some((d) => d.deviceId === settings.camDeviceId)) {
      cam.appendChild(new Option('Câmera desconectada', settings.camDeviceId));
    }
    cam.value = settings.camDeviceId || '';
  }
  navigator.mediaDevices?.addEventListener('devicechange', fillDevices);

  /* Abas e painel */
  for (const tab of $$('.tabs button')) {
    tab.addEventListener('click', () => {
      for (const t of $$('.tabs button')) t.classList.toggle('active', t === tab);
      for (const p of $$('.pane')) p.classList.toggle('active', p.dataset.pane === tab.dataset.tab);
      if (tab.dataset.tab === 'remoto') refreshRemote();
      if (tab.dataset.tab === 'aparencia') requestAnimationFrame(renderPreview);
      if (tab.dataset.tab === 'telacheia') requestAnimationFrame(renderFsPreview);
    });
  }
  $('#toggle-panel').addEventListener('click', () => {
    const closed = document.body.classList.toggle('panel-closed');
    $('#toggle-panel').classList.toggle('active', !closed);
    try { localStorage.setItem('panelClosed', closed ? '1' : '0'); } catch { /* ignore */ }
  });
  try {
    if (localStorage.getItem('panelClosed') === '1') document.body.classList.add('panel-closed');
  } catch { /* ignore */ }
  $('#toggle-panel').classList.toggle('active', !document.body.classList.contains('panel-closed'));

  for (const a of $$('a[data-href]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      api.invoke('app:openExternal', a.dataset.href);
    });
  }
  api.invoke('app:info').then((info) => { $('#about-version').textContent = `InPromptu ${info.version}`; });

  /* ───────────────────────── Remoto ───────────────────────── */

  async function refreshRemote() {
    const info = await api.invoke('remote:info');
    $('#remote-box').hidden = !info.running;
    $('#remote-error').hidden = !info.error;
    $('#remote-error').textContent = info.error || '';
    if (!info.running) return;
    $('#remote-qr').src = info.qr;
    $('#remote-url').textContent = info.url;
    $('#remote-clients').textContent = info.clients
      ? `${info.clients} dispositivo${info.clients > 1 ? 's' : ''} conectado${info.clients > 1 ? 's' : ''}`
      : 'Nenhum dispositivo conectado';
  }
  api.on('remote:changed', refreshRemote);
  $('#remote-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#remote-url').textContent);
    toast('Link copiado.');
  });
  $('#remote-renew').addEventListener('click', async () => {
    settings = await api.invoke('settings:newRemoteToken');
    toast('Novo link gerado — o anterior deixou de funcionar.');
  });
  setInterval(() => {
    if ($('[data-pane="remoto"]').classList.contains('active') && settings.remoteEnabled) refreshRemote();
  }, 4000);

  /* ───────────────────────── Atalhos de teclado ───────────────────────── */

  async function fillShortcuts() {
    const list = await api.invoke('shortcuts:list');
    $('#shortcut-table').replaceChildren(...list.map((s) => {
      const tr = document.createElement('tr');
      const keys = document.createElement('td');
      keys.innerHTML = s.accel.split(' + ').map((k) => `<kbd>${k.replace('Space', 'Espaço')}</kbd>`).join(' + ');
      const label = document.createElement('td');
      label.textContent = s.label;
      if (s.busy) {
        const warn = document.createElement('small');
        warn.className = 'busy';
        warn.textContent = 'Indisponível: outro programa já usa este atalho.';
        label.appendChild(warn);
      }
      tr.append(keys, label);
      return tr;
    }));
  }

  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') toggleSession();
    else if (k === 's') saveFile(e.shiftKey);
    else if (k === 'o') openFile();
    else if (k === 'n') newFile();
    else return;
    e.preventDefault();
  });

  /* ───────────────────────── Avisos ───────────────────────── */

  function toast(msg, error = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', error);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3200);
  }

  /* ───────────────────────── Início ───────────────────────── */

  async function init() {
    settings = await api.invoke('settings:get');
    const saved = await api.invoke('doc:get');
    if (saved.filePath) fileName = saved.filePath.split(/[\\/]/).pop().replace(/\.(inpromptu|roteiro)$/i, '');
    setDoc(saved);
    await refreshModels();
    renderSettings();
    fillDisplays();
    fillDevices();
    fillShortcuts();
    renderObs(await api.invoke('obs:status'));
    if (settings.obsPasswordEnc) $('#obs-pass-note').textContent = 'Há uma senha salva.';
    setRunning(await api.invoke('session:running'));
    api.on('settings:changed', (s) => {
      settings = s;
      renderSettings();
    });
    window.addEventListener('resize', () => {
      renderPreview();
      renderFsPreview();
    });
    script.focus();
  }

  init();
})();
