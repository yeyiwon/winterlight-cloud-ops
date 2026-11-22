#!/usr/bin/env node
/**
 * 개발·검증 전용 가짜 원본. 실제 WINTERLIGHT가 아니다.
 * 원본의 공개 읽기 전용 상태 경로와 같은 응답 형태만 흉내 내어, 외부 접속 없이 Live 화면을 점검한다.
 *
 *   node scripts/fake-winterlight.mjs [포트=4320]
 *
 * 시나리오는 경로 접두사로 고른다. 예) WINTERLIGHT_WEB_URL=http://127.0.0.1:4320/ok
 *   /ok      3개 경로 모두 정상, 같은 버전
 *   /old     실시간 Worker만 이전 버전(버전 불일치)
 *   /bad     /api/health가 503 {ok:false} (D1 점검 실패)
 *   /gw      /api/health가 502 (프록시는 살아 있고 뒤쪽 서버 연결 실패)
 *   /lock    모든 경로 403 (배포 보호·방화벽)
 *   /html    /api/health가 JSON이 아닌 HTML 로그인 페이지
 *   /slow    5초 뒤 응답(시간 초과 확인)
 *   /flap    /api/health가 2회 정상·2회 503을 반복(장애 열림·복구 확인)
 *
 * /ok, /old, /flap의 /metrics는 원본 cloud-ops/metrics-endpoint 응답 형태를 흉내 낸다.
 * Authorization: Bearer $FAKE_METRICS_TOKEN(기본 fake-metrics-token-for-local-checks-only)이 필요하다.
 */
import http from 'node:http';

const SHA = 'c2fbc3f0123456789abcdef0123456789abcdef0';
const TOKEN = process.env.FAKE_METRICS_TOKEN || 'fake-metrics-token-for-local-checks-only', since = Date.now();
let received = 0, sent = 0, reconnected = 0, rejected = 0, flap = 0;
/** 시간에 따라 접속자 수가 천천히 바뀌고 누적 카운터는 계속 늘어난다(가짜 값). */
function metrics() {
  const t = Date.now(), connections = Math.max(0, Math.round(18 + Math.sin(t / 90000) * 12 + Math.random() * 3));
  received += connections * (8 + Math.random() * 4) * 3; sent += connections * (20 + Math.random() * 6) * 3; if (Math.random() < 0.3) reconnected++; if (Math.random() < 0.15) rejected++;
  const out = Math.round(connections * 0.55), museum = Math.round(connections * 0.25);
  return { ok: true, service: 'winterlight-realtime', revision: SHA, at: t, since, connections, capacity: 100, accepted: connections + reconnected + 40, closed: reconnected + 40, reconnected, received: Math.round(received), sent: Math.round(sent), rejected, rejections: rejected ? { rate: rejected } : {}, bytesOut: Math.round(sent * 180), handlerMeanMs: 0.31, handlerP95Ms: +(0.6 + Math.random() * 0.4).toFixed(3), clientRTTMeanMs: +(34 + Math.random() * 10).toFixed(1), clientRTTP95Ms: 71, rttSamples: 120, regions: { outdoors: out, museum, ryokan: Math.max(0, connections - out - museum) } };
}
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

const server = http.createServer((req, res) => {
  const [, scenario = '', ...rest] = (req.url ?? '').split('?')[0].split('/');
  const path = '/' + rest.join('/');
  if (scenario === 'lock') return send(res, 403, { error: 'forbidden' });
  if (scenario === 'slow') return void setTimeout(() => send(res, 200, { ok: true }), 5000);
  if (path === '/metrics' && ['ok', 'old', 'flap'].includes(scenario)) return req.headers.authorization === `Bearer ${TOKEN}` ? send(res, 200, metrics()) : send(res, 401, { error: 'unauthorized' });
  if (path === '/api/health' && scenario === 'flap') return (flap++ % 4) < 2 ? send(res, 200, { ok: true, multiplayer: true, revision: SHA, transport: 'websocket-configured' }) : send(res, 503, { ok: false, multiplayer: false });
  if (path === '/api/health') {
    if (scenario === 'bad') return send(res, 503, { ok: false, multiplayer: false });
    if (scenario === 'gw') return send(res, 502, { error: '공간 연결을 확인해 주세요.' });
    if (scenario === 'html') return send(res, 200, '<!doctype html><title>Login</title>', 'text/html');
    if (['ok', 'old'].includes(scenario)) return send(res, 200, { ok: true, multiplayer: true, revision: SHA, transport: 'websocket-configured' });
  }
  if (path === '/release.json' && ['ok', 'old', 'bad', 'gw', 'html', 'flap'].includes(scenario)) return send(res, 200, { revision: SHA, apiOrigin: 'https://fake-backend.invalid' });
  if (path === '/health' && ['ok', 'bad', 'gw', 'html', 'flap'].includes(scenario)) return send(res, 200, { ok: true, service: 'winterlight-realtime', revision: SHA });
  if (path === '/health' && scenario === 'old') return send(res, 200, { ok: true, service: 'winterlight-realtime', revision: '6c9fa62ee9e70539f7b9ee0e2fee164cded86b58' });
  send(res, 404, { error: 'not found' });
});
const port = Number(process.argv[2] ?? 4320);
server.listen(port, '127.0.0.1', () => console.log(`가짜 WINTERLIGHT(검증 전용) http://127.0.0.1:${port}/{ok|old|bad|gw|lock|html|slow|flap}`));
