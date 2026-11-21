import type { CostRow, Incident, M, MetricsAdapter, PlayerEvent, Point, Snapshot } from '../types';
import { NA } from '../types';

/** 시간만의 함수 → 서버리스에서도 상태 없이 동일한 시뮬레이션이 재현된다. */
const hash = (n: number) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const STEP = 3000, CAP = 100;
const d = (v: number): M => ({ src: 'demo', value: v });

function pointAt(t: number): Point {
  const b = Math.floor(t / STEP), wave = Math.sin(t / 540000) * 0.5 + Math.sin(t / 143000) * 0.25;
  const visitors = Math.max(3, Math.min(CAP, Math.round(46 + wave * 34 + (hash(b) - 0.5) * 6)));
  const sockets = Math.max(0, visitors - Math.round(hash(b + 7) * 3));
  const spike = hash(Math.floor(t / 600000) + 3) > 0.86 ? 1 : 0;
  const avg = 22 + visitors * 0.18 + hash(b + 1) * 6 + spike * 40;
  return { t, visitors, sockets, rpm: Math.round(180 + visitors * 9 + hash(b + 2) * 60), avg: +avg.toFixed(1), p95: +(avg * 1.9 + hash(b + 3) * 8).toFixed(1), err: +(0.1 + spike * 1.6 + hash(b + 4) * 0.25).toFixed(2), msgs: Math.round(visitors * (7 + hash(b + 5) * 3)), sync: Math.round(48 + visitors * 0.25 + hash(b + 6) * 14 + spike * 60) };
}

export const mockAdapter: MetricsAdapter = {
  async snapshot(now = Date.now()): Promise<Snapshot> {
    // 과거 점은 15초 격자에 고정해 새로고침마다 흔들리지 않고, 마지막 한 점만 지금 값으로 갱신된다.
    const grid = Math.floor(now / 15000) * 15000;
    const points = [...Array.from({ length: 119 }, (_, i) => pointAt(grid - (119 - i) * 15000)), pointAt(now)];
    const cur = points[points.length - 1];
    const hourly = Array.from({ length: 24 }, (_, i) => { const t = Math.floor(now / 3600000) * 3600000 - (23 - i) * 3600000, h = hash(t / 3600000); return { t, workers: Math.round(9000 + h * 6000), doReq: Math.round(5000 + hash(t) * 4000), d1R: Math.round(20000 + h * 15000), d1W: Math.round(1500 + h * 900), egress: +(0.4 + h * 0.5).toFixed(2) }; });
    const kinds: PlayerEvent['kind'][] = ['join', 'leave', 'join', 'reconnect', 'join', 'leave', 'rejected'], regions = ['outdoors', 'museum', 'observatory', 'ryokan'];
    const events: PlayerEvent[] = Array.from({ length: 14 }, (_, i) => { const b = Math.floor(now / 7000) - i; return { id: `e${b}`, at: b * 7000, kind: kinds[Math.floor(hash(b) * kinds.length)], region: regions[Math.floor(hash(b + 9) * regions.length)] }; });
    const share = [0.58, 0.16, 0.14, 0.12];
    const hr = 3600000, spikeNow = cur.err > 1;
    const incidents: Incident[] = [
      { id: 'demo-1', at: now - 5 * hr, route: '/api/chat', feature: '채팅', code: 'ServiceError', detail: '샘플 장애: 응답 시간 초과 후 자동 복구', status: 'resolved', resolvedAt: now - 4.6 * hr, deploy: 'demo-rev-a1' },
      { id: 'demo-2', at: now - 27 * hr, route: '/api/ride', feature: '공동 탑승', code: 'TypeError', detail: '샘플 장애: 배포 직후 좌석 예약 검증 오류', status: 'resolved', resolvedAt: now - 26 * hr, deploy: 'demo-rev-a0' },
      ...(spikeNow ? [{ id: 'demo-live', at: now - 40000, route: '/api/presence', feature: '접속 동기화', code: 'ServiceError', detail: '샘플 장애: 오류율 급증 시뮬레이션', status: 'open' as const }] : []),
    ];
    const cost: CostRow[] = [
      { id: 'cf-workers', name: 'Cloudflare Workers 요청', unit: '건/일', used: d(Math.round(hourly.reduce((a, h) => a + h.workers, 0))), limit: NA('한도 설정 필요'), cost: NA('청구 API 연동 필요') },
      { id: 'cf-d1', name: 'Cloudflare D1 읽기 행', unit: '행/일', used: d(Math.round(hourly.reduce((a, h) => a + h.d1R, 0))), limit: NA('한도 설정 필요'), cost: NA('청구 API 연동 필요') },
      { id: 'vercel-bw', name: 'Vercel 전송량', unit: 'GB/일', used: d(+hourly.reduce((a, h) => a + h.egress, 0).toFixed(1)), limit: NA('한도 설정 필요'), cost: NA('청구 API 연동 필요') },
    ];
    return {
      mode: 'mock', at: now,
      overview: { status: { src: 'demo', value: spikeNow ? 'warn' : 'ok' }, visitors: d(cur.visitors), sockets: d(cur.sockets), rpm: d(cur.rpm), avg: d(cur.avg), p95: d(cur.p95), err: d(cur.err), revision: { src: 'demo', value: 'demo-build' }, capacity: { src: 'demo', value: CAP } },
      series: { src: 'demo', points, hourly },
      infra: { workers: { src: 'demo', value: 'ok' }, realtime: { src: 'demo', value: spikeNow ? 'warn' : 'ok' }, d1: { src: 'demo', value: 'ok' }, vercel: { src: 'demo', value: 'ok' }, doReq: d(cur.msgs), doMsgs: d(cur.msgs * 4), d1Reads: d(hourly[23].d1R), d1Writes: d(hourly[23].d1W), d1Storage: NA('D1 분석 API 연동 필요'), bandwidth: d(hourly[23].egress), probeMs: d(Math.round(cur.avg)) },
      multiplayer: { regions: { src: 'demo', value: regions.map((name, i) => ({ name, count: Math.round(cur.sockets * share[i]) })) }, events: { src: 'demo', items: events }, reconnects: d(Math.round(hash(Math.floor(now / 60000)) * 4)), rejected: d(spikeNow ? 3 : 0), msgsPerSec: d(+(cur.msgs / 3).toFixed(1)), sync: d(cur.sync), peaks: { src: 'demo', items: [{ at: now - 2 * hr, visitors: 78 }, { at: now - 9 * hr, visitors: 64 }, { at: now - 26 * hr, visitors: 91 }] } },
      incidents: { src: 'demo', items: incidents },
      deploys: { src: 'demo', items: [{ id: 'd1', at: now - 4.9 * hr, target: 'Vercel', rev: 'demo-rev-a1', state: 'READY' }, { id: 'd2', at: now - 4.9 * hr, target: 'Cloudflare realtime', rev: 'demo-rev-a1', state: 'READY' }, { id: 'd3', at: now - 27 * hr, target: 'Vercel', rev: 'demo-rev-a0', state: 'READY' }] },
      // DEMO 모드는 원본 서비스에 요청하지 않는다. 점검 결과를 꾸며 내지 않고 '실행 안 함'으로 둔다.
      probes: { src: 'demo', items: ([['web-health', '백엔드·D1 (/api/health)', '/api/health'], ['release', 'Vercel 릴리스 (/release.json)', '/release.json'], ['realtime', '실시간 Worker (/health)', '/health']] as const).map(([id, label, path]) => ({ id, label, path, target: null, state: 'skipped' as const, status: null, ms: null, revision: null, kind: null, message: 'DEMO 모드에서는 원본 서비스를 점검하지 않습니다.', hint: 'DATA_MODE=live로 실행하면 실제 응답을 확인합니다.', detail: null, at: null, fields: [] })) },
      cost,
    };
  },
};
