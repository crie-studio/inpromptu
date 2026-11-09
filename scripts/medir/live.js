// Roda na sobreposição: grava, a cada quadro, a estimativa e a rolagem por N segundos.
(async () => {
  window.__inpromptuLog = [];
  const samples = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const s = window.__inpromptuState();
      samples.push([s.t, +s.est.toFixed(3), s.pos, s.speaking ? 1 : 0, +s.scrollY.toFixed(1), +s.rate.toFixed(2)]);
      if (performance.now() - t0 < DURATION_MS) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return JSON.stringify({ samples, log: window.__inpromptuLog });
})()
