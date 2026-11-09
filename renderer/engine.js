// Motor de áudio (janela oculta): microfone, nível de voz, detector de fala (Silero VAD) e
// reconhecimento offline (Vosk) guiado pelo vocabulário do roteiro.
// Fica sempre aberto para manter o modelo carregado entre uma leitura e outra.
(() => {
  'use strict';
  const api = window.inpromptu;
  const SAMPLE_RATE = 16000;

  let model = null;
  let modelUrl = null;
  let modelPromise = null;

  let running = false;
  let wantAsr = false;
  let muted = false;
  let stream = null;
  let ctx = null;
  let analyser = null;
  let recognizer = null;
  let grammar = null;    // vocabulário da página atual (reconhecimento guiado); null = livre
  let recSamples = 0;    // áudio entregue ao reconhecedor atual (para saber quando cada palavra foi dita)
  let levelTimer = null;
  let levelBuf = null;
  let recording = null;  // pedaços de áudio enquanto grava uma amostra de voz

  const emit = (ev) => api.send('engine:event', ev);
  const status = (state, extra = {}) => emit({ type: 'status', state, ...extra });

  function ensureModel(url) {
    if (model && modelUrl === url) return Promise.resolve(model);
    if (modelPromise && modelUrl === url) return modelPromise;
    if (model) {
      model.terminate();
      model = null;
    }
    modelUrl = url;
    status('loading');
    // O worker do Vosk não avisa se morrer durante o carregamento; evita esperar para sempre.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('o modelo demorou demais para carregar')), 180000));
    const promise = Promise.race([Vosk.createModel(url, -1), timeout]).then((m) => {
      if (modelUrl !== url) {
        m.terminate();
        throw new Error('modelo substituído');
      }
      model = m;
      modelPromise = null;
      status('ready');
      return m;
    }, (err) => {
      modelPromise = null;
      modelUrl = null;
      status('error', { reason: 'model', message: String(err?.message || err) });
      throw err;
    });
    modelPromise = promise;
    return promise;
  }

  function newRecognizer() {
    if (recognizer) {
      try { recognizer.remove(); } catch { /* já removido */ }
      recognizer = null;
    }
    if (!model || !running || !wantAsr) return;
    const r = grammar
      ? new model.KaldiRecognizer(SAMPLE_RATE, JSON.stringify(grammar))
      : new model.KaldiRecognizer(SAMPLE_RATE);
    r.setWords(true);
    recSamples = 0;
    r.on('partialresult', (m) => {
      if (r === recognizer && m.result.partial) emit({ type: 'partial', text: m.result.partial });
    });
    r.on('result', (m) => {
      if (r !== recognizer || !m.result.text) return;
      // Há quantos segundos cada palavra terminou de ser dita (o reconhecimento chega depois).
      const now = recSamples / SAMPLE_RATE;
      const ago = (m.result.result || []).map((w) => Math.max(0, now - w.end));
      emit({ type: 'result', text: m.result.text, ago });
    });
    recognizer = r;
  }

  /* ───────── Detector de fala (Silero VAD): distingue voz de ruído ───────── */

  const VAD_FRAME = 512;     // 32 ms
  const VAD_CONTEXT = 64;    // fim do quadro anterior, como no silero-vad original
  const VAD_HANGOVER = 250;  // ms de silêncio antes de considerar que você parou de falar
  let vadOn = false;
  let vad = null;
  let vadPromise = null;
  let vadBuf = new Float32Array(0);
  let vadBusy = false;
  let speaking = false;
  let lastVoice = 0;
  let sensitivity = 50;      // 0..100

  function loadVad() {
    if (vad) return Promise.resolve(vad);
    if (vadPromise) return vadPromise;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
    vadPromise = ort.InferenceSession.create('vendor/silero_vad_v6.onnx').then((session) => {
      vad = { session, sr: new ort.Tensor('int64', BigInt64Array.from([16000n]), [1]) };
      resetVad();
      return vad;
    }, (err) => {
      vadPromise = null;
      status('error', { reason: 'vad', message: String(err?.message || err) });
      throw err;
    });
    return vadPromise;
  }

  function resetVad() {
    vadBuf = new Float32Array(0);
    if (vad) {
      vad.state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
      vad.context = new Float32Array(VAD_CONTEXT);
    }
    setSpeaking(false);
  }

  function queueVad(samples) {
    const merged = new Float32Array(vadBuf.length + samples.length);
    merged.set(vadBuf);
    merged.set(samples, vadBuf.length);
    vadBuf = merged;
    pumpVad();
  }

  async function pumpVad() {
    if (vadBusy || !vad) return;
    vadBusy = true;
    try {
      while (vadBuf.length >= VAD_FRAME && running) {
        const frame = vadBuf.slice(0, VAD_FRAME);
        vadBuf = vadBuf.slice(VAD_FRAME);
        const input = new Float32Array(VAD_CONTEXT + VAD_FRAME);
        input.set(vad.context);
        input.set(frame, VAD_CONTEXT);
        vad.context = frame.slice(-VAD_CONTEXT);
        const out = await vad.session.run({
          input: new ort.Tensor('float32', input, [1, input.length]),
          state: vad.state,
          sr: vad.sr,
        });
        vad.state = out.stateN;
        onVoiceProbability(out.output.data[0]);
      }
    } catch (err) {
      console.error('VAD', err);
    } finally {
      vadBusy = false;
    }
  }

  /** Liga ao passar do limiar e só desliga depois de um tempinho abaixo do limiar mais baixo. */
  function onVoiceProbability(p) {
    const on = 0.8 - (sensitivity / 100) * 0.6; // sensibilidade 50 → 0,5 (o padrão do Silero)
    const off = Math.max(0.15, on - 0.15);
    const now = performance.now();
    if (p >= on) {
      lastVoice = now;
      setSpeaking(true);
    } else if (speaking && p >= off) {
      lastVoice = now;
    } else if (speaking && now - lastVoice > VAD_HANGOVER) {
      setSpeaking(false);
    }
  }

  function setSpeaking(value) {
    if (speaking === value) return;
    speaking = value;
    emit({ type: 'speech', speaking });
  }

  /* ───────── Microfone ───────── */

  async function start({ deviceId, asr, modelUrl: url, record, vad: wantVad, grammar: words, sensitivity: sens, rawAudio }) {
    await stop();
    running = true;
    wantAsr = !!asr;
    muted = false;
    recording = record ? [] : null;
    vadOn = !!wantVad;
    grammar = words || null;
    if (typeof sens === 'number') sensitivity = sens;
    const myRun = Symbol('run');
    start.current = myRun;

    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: !rawAudio,
          noiseSuppression: !rawAudio,
          autoGainControl: !rawAudio,
        },
        video: false,
      });
    } catch (err) {
      if (start.current === myRun) status('error', { reason: 'mic', message: err.name || String(err) });
      return;
    }
    if (start.current !== myRun || !running) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    levelBuf = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    const proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0);
      if (recording) recording.push(new Float32Array(samples)); // o buffer é reaproveitado: copia
      if (muted) return;
      if (vadOn && vad) queueVad(samples);
      if (recognizer) {
        recognizer.acceptWaveformFloat(samples, SAMPLE_RATE);
        recSamples += samples.length;
      }
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    levelTimer = setInterval(sendLevel, 40);
    if (vadOn) loadVad().catch(() => {});

    if (wantAsr && url) {
      try {
        await ensureModel(url);
      } catch {
        return;
      }
      if (start.current !== myRun) return;
      newRecognizer();
    }
    status('listening');
  }

  function sendLevel() {
    if (!analyser) return;
    let level = 0;
    if (!muted) {
      analyser.getFloatTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
      level = Math.min(1, Math.sqrt(Math.sqrt(sum / levelBuf.length)) * 2);
    }
    emit({ type: 'level', level });
  }

  async function stop() {
    if (recording?.length) api.send('engine:recording', encodeWav(recording, SAMPLE_RATE));
    recording = null;
    running = false;
    start.current = null;
    clearInterval(levelTimer);
    levelTimer = null;
    if (recognizer) {
      try { recognizer.remove(); } catch { /* ignore */ }
      recognizer = null;
    }
    resetVad();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    if (ctx) {
      const c = ctx;
      ctx = null;
      await c.close().catch(() => {});
    }
  }

  /** WAV PCM 16 bits mono a partir dos pedaços gravados. */
  function encodeWav(chunks, rate) {
    const n = chunks.reduce((sum, c) => sum + c.length, 0);
    const view = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (off, s) => [...s].forEach((ch, i) => view.setUint8(off + i, ch.charCodeAt(0)));
    text(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, n * 2, true);
    let off = 44;
    for (const c of chunks) {
      for (let i = 0; i < c.length; i++, off += 2) {
        view.setInt16(off, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
      }
    }
    return view.buffer;
  }

  api.on('engine:cmd', (c) => {
    switch (c.cmd) {
      case 'start': start(c); break;
      case 'stop': stop(); break;
      case 'mute':
        muted = !!c.muted;
        if (muted) setSpeaking(false);
        break;
      case 'reset':
        // Nova página (vocabulário novo) ou recomeço depois de um clique/pulo.
        if ('grammar' in c) grammar = c.grammar || null;
        newRecognizer();
        break;
      case 'config':
        if (typeof c.sensitivity === 'number') sensitivity = c.sensitivity;
        break;
      case 'preload': ensureModel(c.modelUrl).catch(() => {}); break;
      default:
    }
  });

  async function decodeAt16k(wavUrl) {
    const audio = await (await fetch(wavUrl)).arrayBuffer();
    const off = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const decoded = await off.decodeAudioData(audio);
    const resampled = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
    const src = resampled.createBufferSource();
    src.buffer = decoded;
    src.connect(resampled.destination);
    src.start();
    return (await resampled.startRendering()).getChannelData(0);
  }

  // Teste automatizado (scripts/asr-test.js): reconhece um WAV sem microfone, no ritmo real.
  // `grammar` (opcional) limita o reconhecimento a essas palavras. `t` de cada evento é o
  // tempo de áudio (s) já entregue quando ele chegou; resultados finais trazem o tempo de cada palavra.
  window.__recognizeUrl = async (url, wavUrl, words) => {
    const m = await ensureModel(url);
    const pcm = await decodeAt16k(wavUrl);
    const events = [];
    const r = words
      ? new m.KaldiRecognizer(SAMPLE_RATE, JSON.stringify(words))
      : new m.KaldiRecognizer(SAMPLE_RATE);
    r.setWords(true);
    let fed = 0;
    r.on('partialresult', (msg) => events.push({ t: fed / SAMPLE_RATE, type: 'partial', text: msg.result.partial }));
    r.on('result', (msg) => events.push({ t: fed / SAMPLE_RATE, type: 'result', text: msg.result.text, words: msg.result.result || [] }));
    for (let i = 0; i < pcm.length; i += 2048) {
      r.acceptWaveformFloat(pcm.slice(i, i + 2048), SAMPLE_RATE);
      fed = Math.min(pcm.length, i + 2048);
      await new Promise((res) => setTimeout(res, 128));
    }
    r.retrieveFinalResult();
    await new Promise((res) => setTimeout(res, 1500));
    r.remove();
    return events;
  };

  // Teste automatizado: probabilidade de fala do detector a cada 32 ms de um WAV.
  window.__vadUrl = async (wavUrl) => {
    const v = await loadVad();
    resetVad();
    const pcm = await decodeAt16k(wavUrl);
    const probs = [];
    for (let i = 0; i + VAD_FRAME <= pcm.length; i += VAD_FRAME) {
      const frame = pcm.slice(i, i + VAD_FRAME);
      const input = new Float32Array(VAD_CONTEXT + VAD_FRAME);
      input.set(v.context);
      input.set(frame, VAD_CONTEXT);
      v.context = frame.slice(-VAD_CONTEXT);
      const out = await v.session.run({ input: new ort.Tensor('float32', input, [1, input.length]), state: v.state, sr: v.sr });
      v.state = out.stateN;
      probs.push(out.output.data[0]);
    }
    resetVad();
    return probs;
  };
})();
