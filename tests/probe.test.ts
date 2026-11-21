import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { classifyThrown, healthOf, overallStatus, pickFields, revisionOf, runProbe, safeTarget, type ProbeSpec } from '../src/lib/probe';
import type { M, Snapshot } from '../src/lib/types';

vi.mock('server-only', () => ({}));
const { createLiveAdapter } = await import('../src/lib/adapters/live');

const SHA = 'c2fbc3f0123456789abcdef0123456789abcdef0';
const json = (res: http.ServerResponse, status: number, body: unknown, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

/** 원본 WINTERLIGHT의 응답 형태를 흉내 내는 로컬 서버. 실제 서비스가 아니다. */
let server: http.Server, base: string, closedBase: string;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = req.url ?? '';
    if (p === '/ok/api/health') return json(res, 200, { ok: true, multiplayer: true, revision: SHA, transport: 'websocket-configured' });
    if (p === '/ok/release.json') return json(res, 200, { revision: SHA, apiOrigin: 'https://backend.example' });
    if (p === '/ok/health') return json(res, 200, { ok: true, service: 'winterlight-realtime', revision: SHA });
    if (p === '/old/health') return json(res, 200, { ok: true, service: 'winterlight-realtime', revision: 'aaaaaaa' });
    if (p === '/bad/api/health') return json(res, 503, { ok: false, multiplayer: false });
    if (p === '/gw/api/health') return json(res, 502, { error: '공간 연결을 확인해 주세요.' });
    if (p === '/html/api/health') return json(res, 200, '<html>login</html>', 'text/html');
    if (p === '/lock/api/health') return json(res, 403, { error: 'forbidden' });
    if (p === '/other/health') return json(res, 200, { ok: true, service: 'something-else', revision: 'x' });
    if (p === '/norev/release.json') return json(res, 200, { apiOrigin: 'x' });
    if (p === '/slow/api/health') return void setTimeout(() => json(res, 200, { ok: true }), 600);
    json(res, 404, { error: 'nope' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const tmp = http.createServer(); await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r));
  closedBase = `http://127.0.0.1:${(tmp.address() as AddressInfo).port}`; await new Promise((r) => tmp.close(r));
});
afterAll(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

const web = (b: string | undefined): ProbeSpec => ({ id: 'web-health', label: '백엔드', path: '/api/health', base: b, env: 'WINTERLIGHT_WEB_URL' });
const rel = (b: string | undefined): ProbeSpec => ({ id: 'release', label: '릴리스', path: '/release.json', base: b, env: 'WINTERLIGHT_WEB_URL', needsRevision: true });
const rt = (b: string | undefined): ProbeSpec => ({ id: 'realtime', label: '실시간', path: '/health', base: b, env: 'WINTERLIGHT_REALTIME_URL', service: 'winterlight-realtime' });

describe('safeTarget', () => {
  it('계정 정보·쿼리·해시를 제거하고 슬래시를 정리한다', () => {
    expect(safeTarget('https://user:pw@example.com/base/?token=1#x', '/api/health')).toEqual({ url: 'https://example.com/base/api/health' });
  });
  it('미설정과 잘못된 형식·평문 http(원격)를 구분한다', () => {
    expect(safeTarget(undefined, '/x')).toEqual({ error: 'not-configured' });
    expect(safeTarget('  ', '/x')).toEqual({ error: 'not-configured' });
    expect(safeTarget('not a url', '/x')).toEqual({ error: 'invalid-url' });
    expect(safeTarget('http://example.com', '/x')).toEqual({ error: 'invalid-url' });
    expect(safeTarget('ftp://example.com', '/x')).toEqual({ error: 'invalid-url' });
    expect('url' in safeTarget('http://localhost:3000', '/x')).toBe(true);
  });
});

describe('classifyThrown', () => {
  const cause = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
  it.each([
    ['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'], ['ECONNREFUSED', 'refused'], ['UND_ERR_CONNECT_TIMEOUT', 'timeout'], ['ETIMEDOUT', 'timeout'],
    ['CERT_HAS_EXPIRED', 'tls'], ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'], ['ECONNRESET', 'network'],
  ])('%s → %s', (code, kind) => expect(classifyThrown(cause(code)).kind).toBe(kind));
  it('시간 초과 예외와 알 수 없는 오류', () => {
    expect(classifyThrown(new DOMException('x', 'TimeoutError')).kind).toBe('timeout');
    expect(classifyThrown(new Error('boom')).kind).toBe('network');
  });
});

describe('runProbe (실제 로컬 HTTP 서버)', () => {
  it('정상 응답: 상태·버전·지연을 읽는다', async () => {
    const p = await runProbe(web(`${base}/ok`), fetch);
    expect(p).toMatchObject({ state: 'ok', status: 200, revision: SHA, kind: null, message: null });
    expect(p.ms).toBeGreaterThanOrEqual(0);
    expect((await runProbe(rel(`${base}/ok`), fetch)).revision).toBe(SHA);
    expect((await runProbe(rt(`${base}/ok`), fetch)).state).toBe('ok');
  });
  it('주소 없음 → 점검하지 않고 설정 안내', async () => {
    const p = await runProbe(rt(undefined), fetch);
    expect(p).toMatchObject({ state: 'skipped', kind: 'not-configured' });
    expect(p.hint).toContain('WINTERLIGHT_REALTIME_URL');
  });
  it('503 + ok:false → 서비스 스스로 비정상(D1)', async () => {
    const p = await runProbe(web(`${base}/bad`), fetch);
    expect(p).toMatchObject({ state: 'fail', kind: 'service-unhealthy', status: 503 });
    expect(p.hint).toContain('D1');
  });
  it('502 → 프론트는 응답했지만 뒤쪽 서버 연결 실패', async () => {
    const p = await runProbe(web(`${base}/gw`), fetch);
    expect(p).toMatchObject({ kind: 'server', status: 502 });
    expect(p.message).toContain('뒤쪽 서버');
  });
  it('HTML 응답 → 형식 오류(보호 페이지 가능성)', async () => {
    const p = await runProbe(web(`${base}/html`), fetch);
    expect(p).toMatchObject({ kind: 'format', status: 200 });
    expect(p.detail).toContain('text/html');
  });
  it('403 → 접근 거부, 404 → 경로 없음', async () => {
    expect((await runProbe(web(`${base}/lock`), fetch)).kind).toBe('blocked');
    expect((await runProbe(web(`${base}/missing`), fetch)).kind).toBe('not-found');
  });
  it('다른 서비스·revision 누락은 형식 오류', async () => {
    expect((await runProbe(rt(`${base}/other`), fetch)).message).toContain('다른 서비스');
    expect((await runProbe(rel(`${base}/norev`), fetch)).message).toContain('revision');
  });
  it('시간 초과와 연결 거부를 구분한다', async () => {
    expect((await runProbe(web(`${base}/slow`), fetch, 100)).kind).toBe('timeout');
    expect((await runProbe(web(closedBase), fetch)).kind).toBe('refused');
  });
});

describe('상태 요약 — 임의의 정상 수치를 만들지 않는다', () => {
  const ok = async (b = `${base}/ok`) => [await runProbe(web(b), fetch), await runProbe(rel(b), fetch), await runProbe(rt(b), fetch)];
  it('모두 정상이고 버전이 같으면 정상', async () => {
    const items = await ok();
    expect(overallStatus(items)).toMatchObject({ src: 'live', value: 'ok' });
    expect(revisionOf(items)).toMatchObject({ mismatch: false, value: { value: 'c2fbc3f' } });
  });
  it('서비스 간 버전이 다르면 주의', async () => {
    const items = [await runProbe(web(`${base}/ok`), fetch), await runProbe(rt(`${base}/old`), fetch)];
    expect(revisionOf(items).mismatch).toBe(true);
    expect(overallStatus(items)).toMatchObject({ value: 'warn' });
  });
  it('네트워크 실패만 있으면 장애가 아니라 측정 불가', async () => {
    const items = [await runProbe(web(closedBase), fetch), await runProbe(rel(closedBase), fetch), await runProbe(rt(undefined), fetch)];
    const s = overallStatus(items);
    expect(s).toMatchObject({ src: 'unavailable', value: null });
    expect(healthOf(items[0])).toMatchObject({ src: 'unavailable', value: null });
    expect(revisionOf(items).value.value).toBeNull();
  });
  it('백엔드 503만 실패하고 실시간이 정상이면 주의, 둘 다 비정상이면 장애', async () => {
    expect(overallStatus([await runProbe(web(`${base}/bad`), fetch), await runProbe(rt(`${base}/ok`), fetch)]).value).toBe('warn');
    expect(overallStatus([await runProbe(web(`${base}/bad`), fetch), await runProbe(rt(`${base}/missing`), fetch)]).value).not.toBe('ok');
    expect(overallStatus([await runProbe(web(`${base}/bad`), fetch)]).value).toBe('down');
  });
  it('주소가 하나도 없으면 연동 필요', () => expect(overallStatus([])).toMatchObject({ src: 'needs-integration', value: null }));
});

const metrics = (o: unknown, out: M<unknown>[] = []): M<unknown>[] => {
  if (o && typeof o === 'object') { const r = o as Record<string, unknown>; if ('src' in r && 'value' in r) out.push(r as unknown as M<unknown>); else Object.values(r).forEach((v) => metrics(v, out)); }
  return out;
};

describe('Live 어댑터 통합', () => {
  it('공개 경로 3개가 정상이면 해당 항목만 LIVE이고 나머지는 숫자가 없다', async () => {
    const s: Snapshot = await createLiveAdapter({ WINTERLIGHT_WEB_URL: `${base}/ok`, WINTERLIGHT_REALTIME_URL: `${base}/ok` }).snapshot();
    expect(s.overview.status).toMatchObject({ src: 'live', value: 'ok' });
    expect(s.overview.revision.value).toBe('c2fbc3f');
    expect(s.probes.items.map((p) => p.state)).toEqual(['ok', 'ok', 'ok']);
    expect(s.infra.d1).toMatchObject({ src: 'live', value: 'ok' });
    for (const k of ['visitors', 'sockets', 'rpm', 'avg', 'p95', 'err'] as const) expect(s.overview[k].value).toBeNull();
    expect(metrics(s).some((m) => m.src === 'demo')).toBe(false);
  });
  it('백엔드 D1 실패(503)는 D1 장애로, 연결 실패는 측정 불가로 표시된다', async () => {
    const bad = await createLiveAdapter({ WINTERLIGHT_WEB_URL: `${base}/bad` }).snapshot();
    expect(bad.infra.d1).toMatchObject({ src: 'live', value: 'down' });
    const dead = await createLiveAdapter({ WINTERLIGHT_WEB_URL: closedBase }).snapshot();
    expect(dead.infra.d1.value).toBeNull();
    expect(dead.overview.status.src).toBe('unavailable');
    expect(dead.probes.items[0]).toMatchObject({ kind: 'refused' });
  });
  it('응답에 토큰이나 주소의 비밀 부분이 새지 않는다', async () => {
    const s = await createLiveAdapter({ WINTERLIGHT_WEB_URL: `${base.replace('http://', 'http://user:SECRETPW@')}/ok?token=SECRETQ`, VERCEL_TOKEN: 'SECRET-V', CF_API_TOKEN: 'SECRET-C' }).snapshot();
    expect(JSON.stringify(s)).not.toMatch(/SECRET/);
  });
});

describe('실제 응답 필드만 표시', () => {
  it('원본이 주는 허용 필드만 정리하고 점검 시각을 남긴다', async () => {
    const before = Date.now();
    const w = await runProbe(web(`${base}/ok`), fetch);
    expect(w.fields).toEqual([{ key: 'multiplayer', label: '멀티플레이', value: '사용 가능' }, { key: 'transport', label: '전송 방식', value: 'WebSocket 설정됨' }]);
    expect(w.at).toBeGreaterThanOrEqual(before);
    expect((await runProbe(rel(`${base}/ok`), fetch)).fields).toEqual([{ key: 'apiOrigin', label: '백엔드 도메인', value: 'backend.example' }]);
    expect((await runProbe(rt(`${base}/ok`), fetch)).fields).toEqual([{ key: 'service', label: '서비스 이름', value: 'winterlight-realtime' }]);
  });
  it('응답에 없는 필드는 만들지 않고, 알 수 없는 값·경로 포함 주소·http 주소는 버린다', () => {
    expect(pickFields('web-health', { ok: true })).toEqual([]);
    expect(pickFields('web-health', { transport: 'ws://evil', multiplayer: 'yes', secret: 'x' })).toEqual([]);
    expect(pickFields('release', { apiOrigin: 'http://backend.example' })).toEqual([]);
    expect(pickFields('release', { apiOrigin: 'https://user:pw@backend.example/path?token=1' })).toEqual([{ key: 'apiOrigin', label: '백엔드 도메인', value: 'backend.example' }]);
    expect(pickFields('realtime', { service: '<script>' })).toEqual([]);
  });
  it('실행하지 않은 점검은 시각이 없고, 실패한 점검은 필드가 비어 있다', async () => {
    const skipped = await runProbe(web(undefined), fetch);
    expect(skipped).toMatchObject({ state: 'skipped', at: null, fields: [] });
    const bad = await runProbe(web(`${base}/bad`), fetch);
    expect(bad).toMatchObject({ state: 'fail', fields: [] });
    expect(bad.at).not.toBeNull();
  });
});
