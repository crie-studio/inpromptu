// OBS de mentira (obs-websocket v5) para testar a integração sem mexer no OBS de verdade.
// Uso: node scripts/obs-mock.js [porta] [senha] [caminho-do-vídeo] — mostra cada pedido recebido.
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

function startMockObs(port = 4466, password = '', outputPath = 'C:\\Videos\\2026-11-05 15-00-00.mp4') {
  const log = [];
  let recording = false;
  const server = new WebSocketServer({ port });
  server.on('connection', (ws) => {
    const salt = crypto.randomBytes(8).toString('base64');
    const challenge = crypto.randomBytes(8).toString('base64');
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, ...(password ? { authentication: { salt, challenge } } : {}) } }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === 1) {
        if (password) {
          const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
          const expected = crypto.createHash('sha256').update(secret + challenge).digest('base64');
          if (msg.d.authentication !== expected) {
            ws.close(4009, 'Authentication failed.');
            return;
          }
        }
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (msg.op === 6) {
        const { requestType, requestId, requestData } = msg.d;
        log.push({ requestType, requestData });
        let responseData = {};
        if (requestType === 'GetVersion') responseData = { obsVersion: '31.0.0' };
        if (requestType === 'GetRecordStatus') responseData = { outputActive: recording, outputDuration: 0 };
        if (requestType === 'StartRecord') recording = true;
        if (requestType === 'StopRecord') {
          recording = false;
          responseData = { outputPath };
        }
        ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData } }));
      }
    });
  });
  return { server, log, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { startMockObs };

if (require.main === module) {
  const mock = startMockObs(Number(process.argv[2]) || 4466, process.argv[3] || '', process.argv[4]);
  setInterval(() => {
    while (mock.log.length) console.log(JSON.stringify(mock.log.shift()));
  }, 200);
}
