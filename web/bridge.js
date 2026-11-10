// Versão web: faz o papel do preload do Electron. Cada página (editor, teleprompter, segunda tela,
// motor de voz) ganha o mesmo window.inpromptu { invoke, send, on }; o "processo principal"
// (web/hub.js) roda na página do editor e conversa com as outras por um BroadcastChannel.
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const role = document.currentScript?.dataset.role || params.get('role') || 'editor';
  const listeners = new Map();

  function on(channel, fn) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(fn);
    return () => listeners.get(channel)?.delete(fn);
  }

  function dispatch(channel, payload) {
    for (const fn of listeners.get(channel) || []) {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  document.documentElement.classList.add('web');

  if (role === 'editor') {
    // O hub é carregado logo depois deste arquivo, na mesma página: chamadas diretas, sem mensagens.
    window.inpromptu = {
      invoke: (channel, ...args) => window.__inpromptuHub.invoke('editor', channel, args),
      send: (channel, payload) => window.__inpromptuHub.send('editor', channel, payload),
      on,
      pathForFile: (file) => file,
    };
    window.__inpromptuEditor = { dispatch };
    return;
  }

  const channel = new BroadcastChannel(`inpromptu-${params.get('hub') || ''}`);
  const pending = new Map();
  let nextId = 1;
  channel.onmessage = (e) => {
    const m = e.data;
    if (!m || (m.to !== role && m.to !== '*')) return;
    if (m.t === 'reply') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.value);
      else p.reject(new Error(m.error));
    } else if (m.t === 'event') {
      dispatch(m.ch, m.payload);
    }
  };

  window.inpromptu = {
    invoke: (ch, ...args) => new Promise((resolve, reject) => {
      const id = `${role}:${nextId++}`;
      pending.set(id, { resolve, reject });
      channel.postMessage({ t: 'invoke', from: role, id, ch, args });
    }),
    send: (ch, payload) => channel.postMessage({ t: 'send', from: role, ch, payload }),
    on,
    pathForFile: (file) => file,
  };

  // Teleprompter e segunda tela: "F" ou clique duplo (na barra, no teleprompter) alternam a tela cheia.
  if (role === 'overlay' || role === 'follower') {
    const toggleFullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) toggleFullscreen();
    });
    addEventListener('dblclick', (e) => {
      if (role === 'follower' || e.target.closest?.('#bar')) toggleFullscreen();
    });
  }
})();
