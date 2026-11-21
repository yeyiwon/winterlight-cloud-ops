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
 */
import http from 'node:http';

const SHA = 'c2fbc3f0123456789abcdef0123456789abcdef0';
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

const server = http.createServer((req, res) => {
  const [, scenario = '', ...rest] = (req.url ?? '').split('?')[0].split('/');
  const path = '/' + rest.join('/');
  if (scenario === 'lock') return send(res, 403, { error: 'forbidden' });
  if (scenario === 'slow') return void setTimeout(() => send(res, 200, { ok: true }), 5000);
  if (path === '/api/health') {
    if (scenario === 'bad') return send(res, 503, { ok: false, multiplayer: false });
    if (scenario === 'gw') return send(res, 502, { error: '공간 연결을 확인해 주세요.' });
    if (scenario === 'html') return send(res, 200, '<!doctype html><title>Login</title>', 'text/html');
    if (['ok', 'old'].includes(scenario)) return send(res, 200, { ok: true, multiplayer: true, revision: SHA, transport: 'websocket-configured' });
  }
  if (path === '/release.json' && ['ok', 'old', 'bad', 'gw', 'html'].includes(scenario)) return send(res, 200, { revision: SHA, apiOrigin: 'https://fake-backend.invalid' });
  if (path === '/health' && ['ok', 'bad', 'gw', 'html'].includes(scenario)) return send(res, 200, { ok: true, service: 'winterlight-realtime', revision: SHA });
  if (path === '/health' && scenario === 'old') return send(res, 200, { ok: true, service: 'winterlight-realtime', revision: '6c9fa62ee9e70539f7b9ee0e2fee164cded86b58' });
  send(res, 404, { error: 'not found' });
});
const port = Number(process.argv[2] ?? 4320);
server.listen(port, '127.0.0.1', () => console.log(`가짜 WINTERLIGHT(검증 전용) http://127.0.0.1:${port}/{ok|old|bad|gw|lock|html|slow}`));
