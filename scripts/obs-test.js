// Testes do cliente do OBS contra um OBS de mentira. Uso: node scripts/obs-test.js
const assert = require('assert');
const { ObsClient } = require('../src/obs.js');
const { startMockObs } = require('./obs-mock.js');

const waitFor = (client, state, ms = 8000) => new Promise((resolve, reject) => {
  if (client.state === state) { resolve(); return; }
  const timer = setTimeout(() => reject(new Error(`não chegou em "${state}" (está "${client.state}": ${client.message})`)), ms);
  client.on('status', function onStatus(s) {
    if (s.state === state) {
      clearTimeout(timer);
      client.off('status', onStatus);
      resolve();
    }
  });
});

(async () => {
  let failures = 0;
  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failures++;
      console.log(`FAIL ${name}\n     ${err.message}`);
    }
  };

  await test('conecta com senha e grava, troca cena e marca capítulo', async () => {
    const mock = startMockObs(4466, 'segredo');
    const obs = new ObsClient();
    obs.configure({ enabled: true, host: '127.0.0.1', port: 4466, password: 'segredo' });
    await waitFor(obs, 'connected');
    await obs.request('StartRecord');
    await obs.request('SetCurrentProgramScene', { sceneName: 'Câmera 2' });
    await obs.request('CreateRecordChapter', { chapterName: 'Página 2' });
    const stop = await obs.request('StopRecord');
    assert.strictEqual(stop.outputPath, 'C:\\Videos\\2026-11-05 15-00-00.mp4');
    assert.deepStrictEqual(mock.log.map((r) => r.requestType).filter((t) => t !== 'GetVersion'),
      ['StartRecord', 'SetCurrentProgramScene', 'CreateRecordChapter', 'StopRecord']);
    obs.configure({ enabled: false });
    await mock.close();
  });

  await test('senha errada avisa e não fica tentando', async () => {
    const mock = startMockObs(4467, 'certa');
    const obs = new ObsClient();
    obs.configure({ enabled: true, host: '127.0.0.1', port: 4467, password: 'errada' });
    await waitFor(obs, 'error');
    await new Promise((r) => setTimeout(r, 300));
    assert.match(obs.message, /Senha do OBS incorreta/);
    obs.configure({ enabled: false });
    await mock.close();
  });

  await test('OBS fechado: avisa e conecta sozinho quando ele abre', async () => {
    const obs = new ObsClient();
    obs.configure({ enabled: true, host: '127.0.0.1', port: 4468, password: '' });
    await waitFor(obs, 'error');
    assert.match(obs.message, /OBS fechado/);
    const mock = startMockObs(4468, '');
    await waitFor(obs, 'connected', 8000);
    obs.configure({ enabled: false });
    await mock.close();
  });

  console.log(failures ? `\n${failures} teste(s) falharam` : '\nTodos os testes passaram');
  process.exit(failures ? 1 : 0);
})();
