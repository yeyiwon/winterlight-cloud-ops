import 'server-only';
import type { Deploy, Health, M, MetricsAdapter, Snapshot } from '../types';
import { NA, UNAVAIL } from '../types';
import { healthOf, overallStatus, revisionOf, runProbe, type ProbeSpec } from '../probe';

/**
 * 읽기 전용 Live 어댑터. 토큰은 서버 환경변수에서만 읽고 브라우저로 내보내지 않는다.
 * 값을 얻지 못한 지표는 숫자를 만들지 않고 '연동 필요' 또는 '측정 불가'로 남긴다.
 */
export interface LiveEnv { WINTERLIGHT_WEB_URL?: string; WINTERLIGHT_REALTIME_URL?: string; VERCEL_TOKEN?: string; VERCEL_PROJECT_ID?: string; VERCEL_TEAM_ID?: string; CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_WORKER_NAME?: string }
type Fetch = typeof fetch;
const live = <T,>(value: T, note?: string): M<T> => ({ src: 'live', value, note });
export interface LiveOptions { probeTimeoutMs?: number }

async function vercelDeploys(f: Fetch, e: LiveEnv): Promise<Deploy[] | null> {
  if (!e.VERCEL_TOKEN || !e.VERCEL_PROJECT_ID) return null;
  const u = new URL('https://api.vercel.com/v6/deployments');
  u.searchParams.set('projectId', e.VERCEL_PROJECT_ID); u.searchParams.set('limit', '10');
  if (e.VERCEL_TEAM_ID) u.searchParams.set('teamId', e.VERCEL_TEAM_ID);
  try {
    const r = await f(u, { headers: { Authorization: `Bearer ${e.VERCEL_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.deployments ?? []).map((x: any): Deploy => ({ id: x.uid, at: x.created ?? x.createdAt, target: 'Vercel', rev: String(x.meta?.githubCommitSha ?? x.uid).slice(0, 10), state: x.state === 'ERROR' || x.readyState === 'ERROR' ? 'ERROR' : (x.state ?? x.readyState) === 'READY' ? 'READY' : 'BUILDING' }));
  } catch { return null; }
}

/** 최근 1시간 Workers 요청·오류 합계. 실계정 응답으로 검증하지 않았다(README 참고). */
async function cfWorkers(f: Fetch, e: LiveEnv, now: number): Promise<{ requests: number; errors: number } | null> {
  if (!e.CF_API_TOKEN || !e.CF_ACCOUNT_ID || !e.CF_WORKER_NAME) return null;
  const query = `query($a:String!,$n:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:1,filter:{scriptName:$n,datetime_geq:$from,datetime_leq:$to}){sum{requests errors}}}}}`;
  try {
    const r = await f('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${e.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { a: e.CF_ACCOUNT_ID, n: e.CF_WORKER_NAME, from: new Date(now - 3600000).toISOString(), to: new Date(now).toISOString() } }), cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const s = (await r.json())?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0]?.sum;
    return s ? { requests: s.requests ?? 0, errors: s.errors ?? 0 } : null;
  } catch { return null; }
}

export const createLiveAdapter = (env: LiveEnv, f: Fetch = fetch, opts: LiveOptions = {}): MetricsAdapter => ({
  async snapshot(now = Date.now()): Promise<Snapshot> {
    const specs: ProbeSpec[] = [
      { id: 'web-health', label: '백엔드·D1 (/api/health)', path: '/api/health', base: env.WINTERLIGHT_WEB_URL, env: 'WINTERLIGHT_WEB_URL' },
      { id: 'release', label: 'Vercel 릴리스 (/release.json)', path: '/release.json', base: env.WINTERLIGHT_WEB_URL, env: 'WINTERLIGHT_WEB_URL', needsRevision: true },
      { id: 'realtime', label: '실시간 Worker (/health)', path: '/health', base: env.WINTERLIGHT_REALTIME_URL, env: 'WINTERLIGHT_REALTIME_URL', service: 'winterlight-realtime' },
    ];
    const [items, deploys, cf] = await Promise.all([Promise.all(specs.map((s) => runProbe(s, f, opts.probeTimeoutMs))), vercelDeploys(f, env), cfWorkers(f, env, now)]);
    const [health, release, realtime] = items;
    const status = overallStatus(items), rev = revisionOf(items);
    const rpm: M = cf ? live(Math.round(cf.requests / 60), '최근 1시간 평균') : NA('Cloudflare 토큰 필요');
    const err: M = cf && cf.requests ? live(+((cf.errors / cf.requests) * 100).toFixed(2), '최근 1시간 Workers 오류율') : NA('Cloudflare 토큰 필요');
    const pm: M = health.state === 'ok' && health.ms != null ? live(health.ms, '대시보드 서버에서 잰 /api/health 왕복') : health.state === 'skipped' ? NA('WINTERLIGHT_WEB_URL 설정 필요') : UNAVAIL(health.message ?? '점검 실패');
    const d1: M<Health> = health.state === 'ok' ? live<Health>('ok', '/api/health의 D1 SELECT 1 통과') : health.kind === 'service-unhealthy' ? live<Health>('down', '/api/health가 D1 점검 실패(503)를 보고함') : healthOf(health);
    return {
      mode: 'live', at: now,
      overview: { status, visitors: NA('실시간 서버에 읽기 전용 /metrics 추가 필요'), sockets: NA('실시간 서버에 읽기 전용 /metrics 추가 필요'), rpm, avg: NA('요청 지연 분포 계측 필요'), p95: NA('요청 지연 분포 계측 필요'), err, revision: rev.value, capacity: NA('원본 설정값(100명)은 연동 후 표시') },
      series: { src: 'needs-integration', points: [], hourly: [] },
      probes: { src: 'live', items },
      infra: { workers: healthOf(health), realtime: healthOf(realtime), d1, vercel: healthOf(release), doReq: NA('Cloudflare GraphQL(DO) 연동 필요'), doMsgs: NA('실시간 서버 /metrics 필요'), d1Reads: NA('Cloudflare GraphQL(D1) 연동 필요'), d1Writes: NA('Cloudflare GraphQL(D1) 연동 필요'), d1Storage: NA('Cloudflare GraphQL(D1) 연동 필요'), bandwidth: NA('Vercel 사용량 API 연동 필요'), probeMs: pm },
      multiplayer: { regions: NA('실시간 서버 /metrics 필요'), events: { src: 'unavailable', items: [] }, reconnects: NA('실시간 서버 /metrics 필요'), rejected: NA('실시간 서버 /metrics 필요'), msgsPerSec: NA('실시간 서버 /metrics 필요'), sync: UNAVAIL('서버 측 동기화 지연은 현재 계측되지 않음(클라이언트 RTT만 존재)'), peaks: { src: 'unavailable', items: [] } },
      incidents: { src: 'unavailable', items: [] },
      deploys: deploys ? { src: 'live', items: deploys } : { src: 'needs-integration', items: [] },
      cost: [
        { id: 'cf', name: 'Cloudflare', unit: '', used: NA('Cloudflare 분석 API 연동 필요'), limit: NA('한도 설정 필요'), cost: NA('청구 API 연동 필요') },
        { id: 'vercel', name: 'Vercel', unit: '', used: NA('Vercel 사용량 API 연동 필요'), limit: NA('한도 설정 필요'), cost: UNAVAIL('앱 소유 팀의 비용 조회가 404(costs_not_found)를 반환한 이력') },
      ],
    };
  },
});
