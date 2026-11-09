// Avalia JS numa página do app via DevTools. Uso: node cdp.js <projectDir> <porta> <trecho-da-url> <expressão>
// Com duas sobreposições (principal e segunda tela), use "overlay.html#principal" ou "overlay.html#segunda".
const [projectDir, port, rawMatch, expr] = process.argv.slice(2);
const [match, which] = rawMatch.split('#');
const WebSocket = require(require('path').join(projectDir, 'node_modules', 'ws'));

function evaluate(target, expression) {
  return new Promise((resolve) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.id !== 1) return;
      ws.close();
      resolve(m.result?.result?.value ?? m.result?.exceptionDetails?.exception?.description ?? m);
    });
  });
}

(async () => {
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json())
    .filter((x) => x.type === 'page' && x.url.includes(match));
  let target = targets[0];
  if (which && targets.length) {
    target = null;
    for (const t of targets) {
      const isFollower = await evaluate(t, "document.body.classList.contains('follower')");
      if (isFollower === (which === 'segunda')) target = t;
    }
  }
  if (!target) {
    console.log(`nenhuma página "${rawMatch}"`);
    process.exit(1);
  }
  const v = await evaluate(target, expr);
  console.log(typeof v === 'string' ? v : JSON.stringify(v));
})();
