import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Monitor, derive, parseRtMetrics, type RtMetrics } from '../src/lib/monitor';
import { categoryOf, runProbe } from '../src/lib/probe';
import type { Probe } from '../src/lib/types';

vi.mock('server-only', () => ({}));
const { createLiveAdapter } = await import('../src/lib/adapters/live');

const TOKEN = 'metrics-token-for-tests-only-0123456789';
const base = { ok: true, service: 'winterlight-realtime', revision: 'r1', since: 1, connections: 3, capacity: 100, accepted: 5, closed: 2, reconnected: 1, received: 40, sent: 90, rejected: 0, bytesOut: 9000, handlerMeanMs: 0.2, handlerP95Ms: 0.5, clientRTTMeanMs: 31.4, clientRTTP95Ms: 60, rttSamples: 4, regions: { outdoors: 2, museum: 1 }, rejections: {} };
const rt = (o: Partial<RtMetrics> & { at: number }) => parseRtMetrics({ ...base, ...o }) as RtMetrics;
const probe = (state: Probe['state'], at: number, extra: Partial<Probe> = {}): Probe => ({ id: 'web-health', label: '백엔드', path: '/api/health', target: 'https://x', state, status: state === 'ok' ? 200 : 503, ms: 40, revision: 'r1', kind: state === 'ok' ? null : 'service-unhealthy', message: state === 'ok' ? null : '비정상', hint: null, detail: null, at, fields: [], ...extra });

describe('원본 /metrics 응답 정리', () => {
  it('허용 필드만 남기고 개인정보·잘못된 키는 버린다', () => {
    const m = parseRtMetrics({ ...base, at: 5, name: '닉네임', chat: '안녕', ip: '1.2.3.4', regions: { outdoors: 2, 'Bad Key!': 9, museum: -1 } });
    expect(m).not.toBeNull(); expect(JSON.stringify(m)).not.toMatch(/닉네임|안녕|1\.2\.3\.4|Bad/);
    expect(m!.regions).toEqual({ outdoors: 2 });
  });
  it('필수 숫자가 없거나 ok가 아니면 버린다', () => {
    expect(parseRtMetrics({ ...base, at: 5, connections: '3' })).toBeNull();
    expect(parseRtMetrics({ ...base, at: 5, ok: false })).toBeNull();
    expect(parseRtMetrics(null)).toBeNull();
  });
  it('누적 카운터 차이로 초당 값을 만들고, 재시작·역행·같은 표본은 계산하지 않는다', () => {
    const a = rt({ at: 10_000 }), b = rt({ at: 40_000, received: 100, sent: 240, reconnected: 3, rejected: 2 });
    expect(derive(a, b)).toEqual({ inPerSec: 2, outPerSec: 5, reconnects: 2, rejected: 2, seconds: 30 });
    expect(derive(a, rt({ at: 40_000, since: 2 }))).toBeNull();
    expect(derive(b, rt({ at: 70_000, received: 10 }))).toBeNull();
    expect(derive(a, a)).toBeNull();
  });
});

describe('모니터: 연속 오류·회복·기록', () => {
  it('연속 2회 실패에 장애를 열고, 첫 정상 응답에 닫으며 발생·복구 시각을 남긴다', () => {
    const m = new Monitor(30_000, 2, 0);
    m.observe([probe('ok', 1000)], null, 1000);
    m.observe([probe('fail', 31_000)], null, 31_000);
    expect(m.incidents).toHaveLength(0); expect(m.alerts()).toHaveLength(0);
    m.observe([probe('fail', 61_000)], null, 61_000);
    expect(m.incidents[0]).toMatchObject({ status: 'open', at: 31_000, category: 'outage', fails: 2 });
    expect(m.alerts()[0]).toMatchObject({ level: 'down', since: 31_000 });
    const [back] = m.observe([probe('ok', 91_000)], null, 91_000);
    expect(m.incidents[0]).toMatchObject({ status: 'resolved', resolvedAt: 91_000 });
    expect(back).toMatchObject({ fails: 0, lastOkAt: 91_000 }); expect(m.alerts()).toHaveLength(0);
    expect(m.timeline.map((e) => e.kind)).toEqual(['outage', 'recovery']);
    expect(m.failures).toHaveLength(2);
  });
  it('설정 필요로 바뀐 점검의 열린 장애는 닫는다(성공 보고가 오지 않으므로)', () => {
    const m = new Monitor(30_000, 2, 0), nf = (t: number) => probe('fail', t, { kind: 'not-found', status: 404 });
    m.observe([nf(1)], null, 1); m.observe([nf(2)], null, 2); expect(m.incidents[0].status).toBe('open');
    m.observe([probe('skipped', 3, { kind: 'not-found' })], null, 3);
    expect(m.incidents[0]).toMatchObject({ status: 'resolved', resolvedAt: 3 }); expect(m.alerts()).toHaveLength(0);
  });
  it('네트워크 계열 실패는 장애가 아니라 수집 실패(경고)로 분류한다', () => {
    const m = new Monitor(30_000, 2, 0), dns = (t: number) => probe('fail', t, { kind: 'dns', status: null });
    m.observe([dns(1)], null, 1); m.observe([dns(2)], null, 2);
    expect(m.incidents[0].category).toBe('network'); expect(m.alerts()[0].level).toBe('warn');
    expect(categoryOf({ state: 'fail', kind: 'auth' })).toBe('auth');
    expect(categoryOf({ state: 'fail', kind: 'not-found' })).toBe('unmeasured');
  });
  it('배포 버전 변경과 카운터 재시작을 타임라인에 남기고, 수용 90%를 경고한다', () => {
    const m = new Monitor(30_000, 2, 0);
    m.observe([probe('ok', 1)], rt({ at: 1 }), 1);
    m.observe([probe('ok', 2, { revision: 'r2' })], rt({ at: 2, since: 9, connections: 95 }), 2);
    expect(m.timeline.map((e) => e.kind).sort()).toEqual(['deploy', 'reset']);
    expect(m.alerts().map((a) => a.id)).toContain('capacity');
  });
  it('외부 API 결과는 ttl 동안 다시 부르지 않는다(속도 제한)', async () => {
    const m = new Monitor(), fn = vi.fn(async () => 1);
    await m.cached('k', 1000, 0, fn); await m.cached('k', 1000, 999, fn); expect(fn).toHaveBeenCalledTimes(1);
    await m.cached('k', 1000, 1000, fn); expect(fn).toHaveBeenCalledTimes(2);
  });
  it('기록은 정해진 개수만 보관한다', () => {
    const m = new Monitor(30_000, 2, 0, 5);
    for (let i = 0; i < 9; i++) m.observe([probe('ok', i)], null, i);
    expect(m.points).toHaveLength(5); expect(m.points[0].t).toBe(4);
  });
});

let server: http.Server, url: string, seen: (string | undefined)[] = [];
beforeAll(async () => {
  let n = 0;
  server = http.createServer((req, res) => {
    const send = (s: number, b: unknown) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (req.url === '/api/health') return send(200, { ok: true, multiplayer: true, revision: 'r1', transport: 'websocket-configured' });
    if (req.url === '/release.json') return send(200, { revision: 'r1', apiOrigin: 'https://api.example' });
    if (req.url === '/health') return send(200, { ok: true, service: 'winterlight-realtime', revision: 'r1' });
    if (req.url === '/metrics') { seen.push(req.headers.origin); if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: 'unauthorized' }); n++; return send(200, { ...base, at: n * 30_000, received: 40 + n * 60, sent: 90 + n * 150, name: '닉네임' }); }
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

describe('Live 어댑터 + /metrics', () => {
  const env = () => ({ WINTERLIGHT_WEB_URL: url, WINTERLIGHT_REALTIME_URL: url, WINTERLIGHT_METRICS_TOKEN: TOKEN });
  it('실제 응답으로 접속자·WebSocket·처리량을 채우고 출처와 측정 시각을 붙인다', async () => {
    const mon = new Monitor(30_000, 2, 0), a = createLiveAdapter(env(), fetch, { monitor: mon });
    const first = await a.snapshot(1000);
    expect(first.overview.visitors).toMatchObject({ src: 'live', value: 3, from: '실시간 Worker /metrics', at: 30_000 });
    expect(first.multiplayer.msgsPerSec.value).toBeNull();
    const s = await a.snapshot(31_000);
    expect(s.multiplayer.msgsPerSec).toMatchObject({ src: 'live', value: 7 });
    expect(s.multiplayer.sync).toMatchObject({ src: 'live', value: 31 });
    expect(s.multiplayer.regions.value).toEqual([{ name: 'outdoors', count: 2 }, { name: 'museum', count: 1 }]);
    expect(s.multiplayer.socketState).toMatchObject({ src: 'live', value: 'ok' });
    expect(s.series.points.at(-1)).toMatchObject({ visitors: 3, msgsIn: 2, msgsOut: 5 });
    for (const m of [s.overview.visitors, s.overview.sockets, s.multiplayer.msgsPerSec, s.multiplayer.handler]) { expect(m.from).toBeTruthy(); expect(m.at).toBeTypeOf('number'); }
    const json = JSON.stringify(s);
    expect(json).not.toContain(TOKEN); expect(json).not.toContain('닉네임');
    expect(seen.every((o) => o === undefined)).toBe(true);
  });
  it('토큰이 틀리면 인증 문제로, 토큰이 없으면 실행하지 않고 설정 필요로 둔다', async () => {
    const bad = await createLiveAdapter({ ...env(), WINTERLIGHT_METRICS_TOKEN: 'wrong-token-but-long-enough-0123456789' }).snapshot(1);
    expect(bad.probes.items[3]).toMatchObject({ state: 'fail', kind: 'auth' });
    expect(bad.overview.visitors).toMatchObject({ src: 'unavailable', value: null });
    const none = await createLiveAdapter({ ...env(), WINTERLIGHT_METRICS_TOKEN: undefined }).snapshot(1);
    expect(none.probes.items[3]).toMatchObject({ state: 'skipped', kind: 'not-configured' });
    expect(none.overview.visitors.src).toBe('needs-integration');
  });
  it('원본에 /metrics가 아직 배포되지 않았으면 그렇게 알려 준다', async () => {
    const p = await runProbe({ id: 'realtime-metrics', label: '지표', path: '/nothing', base: url, env: 'X', bearer: TOKEN, bearerEnv: 'T' }, fetch);
    expect(p).toMatchObject({ state: 'fail', kind: 'not-found' });
    const q = await runProbe({ id: 'realtime-metrics', label: '지표', path: '/metrics', base: url, env: 'X', bearer: TOKEN, bearerEnv: 'T' }, fetch);
    expect(JSON.stringify(q)).not.toContain(TOKEN);
  });
});

describe('운영 환경에서 확인한 오경보 방지', () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  // 2026-11-22 운영 실측: 웹·릴리스 c2fbc3f, 실시간 Worker 6c9fa62(코드 변경이 없어 재배포 안 됨), /metrics 404(미배포).
  const prod = async (u: unknown) => { const p = new URL(String(u)).pathname;
    if (p === '/api/health') return res(200, { ok: true, multiplayer: true, revision: 'c2fbc3f', transport: 'websocket-configured' });
    if (p === '/release.json') return res(200, { revision: 'c2fbc3f', apiOrigin: 'https://api.example' });
    if (p === '/health') return res(200, { ok: true, service: 'winterlight-realtime', revision: '6c9fa62ee9e70539f7b9ee0e2fee164cded86b58' });
    return res(404, { error: 'Not found' }); };
  const env = { WINTERLIGHT_WEB_URL: 'https://web.example', WINTERLIGHT_REALTIME_URL: 'https://rt.example', WINTERLIGHT_METRICS_TOKEN: TOKEN };
  it('실시간 Worker 버전이 뒤처진 것만으로는 경고하지 않고, 설명만 붙인다', async () => {
    const s = await createLiveAdapter(env, prod as never, { monitor: new Monitor() }).snapshot(1);
    expect(s.overview.status.value).toBe('ok');
    expect(s.overview.revision.value).toBe('c2fbc3f');
    expect(s.overview.revision.note).toContain('6c9fa62');
    expect(s.monitor.alerts).toHaveLength(0);
  });
  it('/metrics 404는 장애를 열지 않고 설정 필요로 남는다', async () => {
    const mon = new Monitor(30_000, 2, 0), a = createLiveAdapter(env, prod as never, { monitor: mon });
    let s; for (const t of [1, 2, 3]) s = await a.snapshot(t);
    expect(s!.probes.items[3]).toMatchObject({ state: 'skipped', kind: 'not-found' });
    expect(s!.incidents.items).toHaveLength(0); expect(s!.monitor.alerts).toHaveLength(0);
    expect(s!.overview.visitors).toMatchObject({ src: 'needs-integration', note: expect.stringContaining('배포되지 않았습니다') });
  });
  it('프런트엔드와 API의 버전이 다르면 경고한다', async () => {
    const split = async (u: unknown) => (new URL(String(u)).pathname === '/release.json' ? res(200, { revision: 'aaaaaaa' }) : prod(u));
    const s = await createLiveAdapter(env, split as never, { monitor: new Monitor() }).snapshot(1);
    expect(s.overview.status.value).toBe('warn');
    expect(s.monitor.alerts.map((x) => x.id)).toContain('revision');
  });
});
