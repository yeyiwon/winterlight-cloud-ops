import 'server-only';
import type { Alert, Deploy, Health, M, MetricsAdapter, Point, Snapshot } from '../types';
import { NA, UNAVAIL } from '../types';
import { Monitor, parseRtMetrics, type RtMetrics } from '../monitor';
import { healthOf, overallStatus, probeWithBody, revisionOf, type ProbeSpec } from '../probe';

/**
 * 읽기 전용 Live 어댑터. 토큰은 서버 환경변수에서만 읽고 브라우저로 내보내지 않는다.
 * 값을 얻지 못한 지표는 숫자를 만들지 않고 '연동 필요' 또는 '측정 불가'로 남긴다.
 * 모든 Live 값에는 출처(from)와 측정 시각(at)을 붙인다.
 */
export interface LiveEnv { WINTERLIGHT_WEB_URL?: string; WINTERLIGHT_REALTIME_URL?: string; WINTERLIGHT_METRICS_TOKEN?: string; VERCEL_TOKEN?: string; VERCEL_PROJECT_ID?: string; VERCEL_TEAM_ID?: string; CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_WORKER_NAME?: string }
type Fetch = typeof fetch;
type Result<T> = { ok: true; value: T } | { ok: false; error: string } | null;
const live = <T,>(value: T, from: string, at: number, note?: string): M<T> => ({ src: 'live', value, from, at, note });
export interface LiveOptions { probeTimeoutMs?: number; monitor?: Monitor }
/** 외부 관리 API는 수집 주기보다 느리게 부른다(요청 한도 보호). */
const API_TTL = 5 * 60_000;
const SRC = { health: 'WINTERLIGHT /api/health', release: 'WINTERLIGHT /release.json', rt: '실시간 Worker /health', metrics: '실시간 Worker /metrics', vercel: 'Vercel Deployments API', cf: 'Cloudflare GraphQL Analytics' };

async function vercelDeploys(f: Fetch, e: LiveEnv): Promise<Result<Deploy[]>> {
  if (!e.VERCEL_TOKEN || !e.VERCEL_PROJECT_ID) return null;
  const u = new URL('https://api.vercel.com/v6/deployments');
  u.searchParams.set('projectId', e.VERCEL_PROJECT_ID); u.searchParams.set('limit', '10');
  if (e.VERCEL_TEAM_ID) u.searchParams.set('teamId', e.VERCEL_TEAM_ID);
  try {
    const r = await f(u, { headers: { Authorization: `Bearer ${e.VERCEL_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}${r.status === 401 || r.status === 403 ? ' (토큰 권한 확인)' : ''}` };
    const j = await r.json();
    return { ok: true, value: (j.deployments ?? []).map((x: any): Deploy => ({ id: x.uid, at: x.created ?? x.createdAt, target: x.target === 'production' ? 'Vercel 운영' : 'Vercel 미리보기', rev: String(x.meta?.githubCommitSha ?? x.uid).slice(0, 10), state: x.state === 'ERROR' || x.readyState === 'ERROR' ? 'ERROR' : (x.state ?? x.readyState) === 'READY' ? 'READY' : 'BUILDING' })) };
  } catch { return { ok: false, error: '네트워크 오류' }; }
}

/** 최근 1시간 Workers 요청·오류 합계. 실계정 응답으로 아직 검증하지 않았다(OBSERVABILITY.md). */
async function cfWorkers(f: Fetch, e: LiveEnv, now: number): Promise<Result<{ requests: number; errors: number }>> {
  if (!e.CF_API_TOKEN || !e.CF_ACCOUNT_ID || !e.CF_WORKER_NAME) return null;
  const query = `query($a:String!,$n:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:1,filter:{scriptName:$n,datetime_geq:$from,datetime_leq:$to}){sum{requests errors}}}}}`;
  try {
    const r = await f('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${e.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { a: e.CF_ACCOUNT_ID, n: e.CF_WORKER_NAME, from: new Date(now - 3600000).toISOString(), to: new Date(now).toISOString() } }), cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const s = (await r.json())?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0]?.sum;
    return s ? { ok: true, value: { requests: s.requests ?? 0, errors: s.errors ?? 0 } } : { ok: false, error: '응답에 집계 값 없음' };
  } catch { return { ok: false, error: '네트워크 오류' }; }
}

const pct = (xs: number[], q: number) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor((v.length - 1) * q))]; };
const sumSince = (points: Point[], key: 'reconnects' | 'rejected', from: number) => { const xs = points.filter((p) => p.t >= from && p[key] != null); return xs.length ? xs.reduce((a, p) => a + (p[key] as number), 0) : null; };

export const createLiveAdapter = (env: LiveEnv, f: Fetch = fetch, opts: LiveOptions = {}): MetricsAdapter => ({
  async snapshot(now = Date.now()): Promise<Snapshot> {
    const mon = opts.monitor ?? new Monitor();
    const specs: ProbeSpec[] = [
      { id: 'web-health', label: '백엔드·D1 (/api/health)', path: '/api/health', base: env.WINTERLIGHT_WEB_URL, env: 'WINTERLIGHT_WEB_URL' },
      { id: 'release', label: 'Vercel 릴리스 (/release.json)', path: '/release.json', base: env.WINTERLIGHT_WEB_URL, env: 'WINTERLIGHT_WEB_URL', needsRevision: true },
      { id: 'realtime', label: '실시간 Worker (/health)', path: '/health', base: env.WINTERLIGHT_REALTIME_URL, env: 'WINTERLIGHT_REALTIME_URL', service: 'winterlight-realtime' },
      { id: 'realtime-metrics', label: '실시간 지표 (/metrics)', path: '/metrics', base: env.WINTERLIGHT_REALTIME_URL, env: 'WINTERLIGHT_REALTIME_URL', service: 'winterlight-realtime', bearer: env.WINTERLIGHT_METRICS_TOKEN, bearerEnv: 'WINTERLIGHT_METRICS_TOKEN' },
    ];
    const [results, deploys, cf] = await Promise.all([
      Promise.all(specs.map((s) => probeWithBody(s, f, opts.probeTimeoutMs))),
      mon.cached('vercel', API_TTL, now, () => vercelDeploys(f, env)),
      mon.cached('cf', API_TTL, now, () => cfWorkers(f, env, now)),
    ]);
    const parsed = parseRtMetrics(results[3].body);
    const raw = results.map((r) => r.probe);
    if (raw[3].state === 'ok' && !parsed) Object.assign(raw[3], { state: 'fail', kind: 'format', message: '지표 응답의 형식이 예상과 다릅니다.', hint: '원본 /metrics 버전과 대시보드 버전이 맞는지 확인하세요.', detail: '필수 숫자 필드 누락' });
    // /metrics 404는 장애가 아니라 아직 배포하지 않은 설정 단계다. 장애·경보를 만들지 않고 '설정 필요'로 둔다.
    if (raw[3].state === 'fail' && raw[3].kind === 'not-found') Object.assign(raw[3], { state: 'skipped' });
    // 프런트엔드와 Sites API는 같은 커밋으로 함께 배포된다. 실시간 Worker는 자기 코드가 바뀐 배포에서만 다시 배포되므로
    // (원본 docs/DEPLOYMENT.md v60), Worker 버전이 뒤처진 것만으로는 경고하지 않는다.
    const rev = revisionOf(raw.filter((p) => p.id === 'web-health' || p.id === 'release'));
    const rtRev = raw[2].state === 'ok' && raw[2].revision && rev.value.value && !rev.mismatch && !String(rev.value.value).startsWith(raw[2].revision.slice(0, 7)) ? raw[2].revision.slice(0, 7) : null;
    if (rtRev) rev.value = { ...rev.value, note: `${rev.value.note ? `${rev.value.note}. ` : ''}실시간 Worker는 ${rtRev}이며, Worker 코드가 바뀐 배포에서만 갱신됩니다.` };
    const extra: Alert[] = rev.mismatch ? [{ id: 'revision', level: 'warn', title: '프런트엔드와 API의 배포 버전 불일치', detail: `${String(rev.value.value)}. 배포가 진행 중이거나 한쪽만 배포되었을 수 있습니다.`, since: now }] : [];
    const items = mon.observe(raw, parsed, now);
    const [health, release, realtime, metricsProbe] = items;
    const rt: RtMetrics | null = parsed, d = rt ? mon.derived : null, at = rt?.at ?? now;
    const status = overallStatus(items, rev.mismatch);
    const needRt = <T = number,>(what: string): M<T> => metricsProbe.state === 'skipped' ? NA<T>(`${what}: ${metricsProbe.message ?? 'WINTERLIGHT_METRICS_TOKEN 설정 필요'}`) : metricsProbe.state === 'fail' ? UNAVAIL<T>(`${what}: ${metricsProbe.message ?? '지표 수집 실패'}`) : NA<T>(`${what}: 다음 수집 때 계산됩니다(직전 표본 필요)`);
    const rpm: M = cf?.ok ? live(Math.round(cf.value.requests / 60), SRC.cf, now, '최근 1시간 평균') : NA(cf && !cf.ok ? `Cloudflare API 실패: ${cf.error}` : 'Cloudflare 읽기 전용 토큰 필요');
    const err: M = cf?.ok && cf.value.requests ? live(+((cf.value.errors / cf.value.requests) * 100).toFixed(2), SRC.cf, now, '최근 1시간 Workers 오류율') : NA(cf && !cf.ok ? `Cloudflare API 실패: ${cf.error}` : 'Cloudflare 읽기 전용 토큰 필요');
    const apiMs = mon.points.map((p) => p.api).filter((v): v is number => v != null).slice(-20);
    const apiNote = `대시보드 서버에서 잰 /api/health 왕복, 최근 ${apiMs.length}회`;
    const pm: M = health.state === 'ok' && health.ms != null ? live(health.ms, SRC.health, health.at ?? now, '대시보드 서버에서 잰 /api/health 왕복') : health.state === 'skipped' ? NA('WINTERLIGHT_WEB_URL 설정 필요') : UNAVAIL(health.message ?? '점검 실패');
    const d1: M<Health> = health.state === 'ok' ? live<Health>('ok', SRC.health, health.at ?? now, '/api/health의 D1 SELECT 1 통과') : health.kind === 'service-unhealthy' ? live<Health>('down', SRC.health, health.at ?? now, '/api/health가 D1 점검 실패(503)를 보고함') : healthOf(health);
    const tagged = (m: M<Health>, from: string, p: typeof health): M<Health> => (m.src === 'live' ? { ...m, from, at: p.at ?? now } : m);
    const wsField = health.fields.find((x) => x.key === 'transport')?.value;
    const socketState: M<Health> = realtime.state === 'ok' && rt ? live<Health>('ok', `${SRC.rt} · ${SRC.metrics}`, at, `Worker 정상 · 활성 연결 ${rt.connections}개${wsField ? ` · 백엔드 ${wsField}` : ''}`) : realtime.state === 'ok' ? live<Health>('ok', SRC.rt, realtime.at ?? now, `Worker 정상 응답. 연결 수는 /metrics 연동 후 표시${wsField ? ` · 백엔드 ${wsField}` : ''}`) : tagged(healthOf(realtime), SRC.rt, realtime);
    const recent = now - 60_000 - mon.intervalMs / 2, peaks = mon.points.filter((p) => p.visitors != null).sort((a, b) => (b.visitors as number) - (a.visitors as number) || b.t - a.t).slice(0, 3).map((p) => ({ at: p.t, visitors: p.visitors as number }));
    const reconnects = sumSince(mon.points, 'reconnects', recent), rejected = sumSince(mon.points, 'rejected', recent);
    const rtNote = 'WebSocket으로 접속한 방문자(같은 방문자의 다른 탭은 1명). HTTP 폴링 폴백 방문자는 포함되지 않음';
    return {
      mode: 'live', at: now,
      overview: {
        status, revision: rev.value, rpm, err,
        visitors: rt ? live(rt.connections, SRC.metrics, at, rtNote) : needRt('접속자 수'),
        sockets: rt ? live(rt.connections, SRC.metrics, at, 'Durable Object가 수락한 활성 WebSocket') : needRt('WebSocket 연결 수'),
        capacity: rt ? live(rt.capacity, SRC.metrics, at, '원본 realtimeLimits.capacity') : NA('원본 설정값은 /metrics 연동 후 표시'),
        avg: apiMs.length ? live(+(apiMs.reduce((a, b) => a + b, 0) / apiMs.length).toFixed(1), SRC.health, now, apiNote) : pm.src === 'live' ? NA('표본 수집 중') : pm,
        p95: apiMs.length >= 5 ? live(pct(apiMs, 0.95), SRC.health, now, apiNote) : NA(`P95는 표본 5개부터 계산(현재 ${apiMs.length}개)`),
      },
      series: { src: mon.points.length ? 'live' : 'needs-integration', points: [...mon.points], hourly: [] },
      probes: { src: 'live', items },
      infra: {
        workers: tagged(healthOf(health), SRC.health, health), realtime: tagged(healthOf(realtime), SRC.rt, realtime), d1, vercel: tagged(healthOf(release), SRC.release, release),
        doReq: NA('Cloudflare GraphQL(Durable Objects) 연동 필요'),
        doMsgs: rt ? live(rt.received + rt.sent, SRC.metrics, at, `Durable Object 시작 이후 누적: 수신 ${rt.received.toLocaleString('ko-KR')}, 송신 ${rt.sent.toLocaleString('ko-KR')}`) : needRt('DO 메시지'),
        d1Reads: NA('Cloudflare GraphQL(D1) 연동 필요'), d1Writes: NA('Cloudflare GraphQL(D1) 연동 필요'), d1Storage: NA('Cloudflare GraphQL(D1) 연동 필요'), bandwidth: NA('Vercel 사용량 API 연동 필요'), probeMs: pm,
      },
      multiplayer: {
        regions: rt ? live(Object.entries(rt.regions).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), SRC.metrics, at, '구역별 연결 수(개인 식별 정보 없음)') : needRt<{ name: string; count: number }[]>('구역별 접속'),
        events: { src: 'unavailable', items: [] },
        reconnects: reconnects != null ? live(reconnects, SRC.metrics, at, '최근 약 60초 동안 늘어난 재연결 카운터') : needRt('재연결'),
        rejected: rejected != null ? live(rejected, SRC.metrics, at, '최근 약 60초 동안 거절된 메시지(형식·속도·이동 검증)') : needRt('거절'),
        msgsPerSec: d ? live(+(d.inPerSec + d.outPerSec).toFixed(1), SRC.metrics, at, `수신 ${d.inPerSec.toFixed(1)}/초 · 송신 ${d.outPerSec.toFixed(1)}/초, 최근 ${Math.round(d.seconds)}초 평균`) : needRt('메시지 처리량'),
        msgsIn: d ? live(+d.inPerSec.toFixed(1), SRC.metrics, at) : needRt('수신 메시지'),
        msgsOut: d ? live(+d.outPerSec.toFixed(1), SRC.metrics, at) : needRt('송신 메시지'),
        sync: rt?.clientRTTMeanMs != null ? live(Math.round(rt.clientRTTMeanMs), SRC.metrics, at, `브라우저가 보고한 WebSocket 왕복 평균(표본 ${rt.rttSamples}개${rt.clientRTTP95Ms != null ? `, P95 ${Math.round(rt.clientRTTP95Ms)}ms` : ''})`) : rt ? NA('아직 RTT를 보고한 접속자가 없습니다') : needRt('WebSocket 왕복'),
        handler: rt?.handlerP95Ms != null ? live(+rt.handlerP95Ms.toFixed(2), SRC.metrics, at, 'Durable Object 메시지 처리 시간 P95(최근 300건)') : rt ? NA('처리한 메시지가 아직 없습니다') : needRt('서버 처리 지연'),
        socketState,
        peaks: peaks.length ? { src: 'live', items: peaks } : { src: 'unavailable', items: [] },
      },
      incidents: { src: 'live', items: [...mon.incidents].reverse() },
      deploys: deploys?.ok ? { src: 'live', items: deploys.value } : { src: 'needs-integration', items: [] },
      cost: [
        { id: 'cf', name: 'Cloudflare Workers', unit: '요청/최근 1시간', used: cf?.ok ? live(cf.value.requests, SRC.cf, now) : NA(cf && !cf.ok ? `Cloudflare API 실패: ${cf.error}` : 'Cloudflare 읽기 전용 토큰 필요'), limit: NA('플랜 한도 설정 필요'), cost: NA('검증된 청구 데이터 없음') },
        { id: 'vercel', name: 'Vercel', unit: '', used: NA('Vercel 사용량 API 연동 필요'), limit: NA('플랜 한도 설정 필요'), cost: UNAVAIL('2026-11-20 팀 비용 조회가 404(costs_not_found)를 반환. 0원의 증거가 아님') },
      ],
      monitor: mon.info(now, extra),
    };
  },
});
