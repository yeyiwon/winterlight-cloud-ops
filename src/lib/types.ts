/** 모든 수치는 출처(src)를 함께 가진다. 출처 없는 숫자는 화면에 그리지 않는다. */
export type Src = 'demo' | 'live' | 'needs-integration' | 'unavailable';
export type Health = 'ok' | 'warn' | 'down';
export interface M<T = number> { src: Src; value: T | null; note?: string }

export interface Point { t: number; visitors: number; sockets: number; rpm: number; avg: number; p95: number; err: number; msgs: number; sync: number }
export interface HourPoint { t: number; workers: number; doReq: number; d1R: number; d1W: number; egress: number }
export interface Incident { id: string; at: number; route: string; feature: string; code: string; detail: string; status: 'open' | 'resolved'; resolvedAt?: number; deploy?: string }
export interface PlayerEvent { id: string; at: number; kind: 'join' | 'leave' | 'reconnect' | 'rejected'; region: string }
export interface Deploy { id: string; at: number; target: string; rev: string; state: 'READY' | 'BUILDING' | 'ERROR' }
export interface CostRow { id: string; name: string; unit: string; used: M; limit: M; cost: M }

/** 공개 상태 엔드포인트 한 건의 점검 결과. 실패하면 원인 종류와 사용자용 설명을 함께 남긴다. */
export type ProbeErrorKind = 'not-configured' | 'invalid-url' | 'timeout' | 'dns' | 'refused' | 'tls' | 'blocked' | 'not-found' | 'rate-limited' | 'server' | 'service-unhealthy' | 'format' | 'network';
export interface Probe {
  id: 'web-health' | 'release' | 'realtime';
  label: string;
  path: string;
  /** 점검한 주소(쿼리·계정 정보 제거). 설정되지 않았으면 null */
  target: string | null;
  state: 'ok' | 'fail' | 'skipped';
  status: number | null;
  ms: number | null;
  revision: string | null;
  kind: ProbeErrorKind | null;
  /** 한국어 원인 설명 */
  message: string | null;
  /** 해결을 위해 확인할 것 */
  hint: string | null;
  /** 기술적 세부(오류 코드 등). 비밀 값은 담지 않는다 */
  detail: string | null;
  /** 점검을 시도한 시각(ms). 실행하지 않았으면 null */
  at: number | null;
  /** 응답에서 허용 목록에 있는 필드만 정리한 값. 응답에 없는 필드는 만들어 내지 않는다 */
  fields: { key: string; label: string; value: string }[];
}

export interface Snapshot {
  mode: 'mock' | 'live';
  at: number;
  overview: { status: M<Health>; visitors: M; sockets: M; rpm: M; avg: M; p95: M; err: M; revision: M<string>; capacity: M };
  series: { src: Src; points: Point[]; hourly: HourPoint[] };
  infra: { workers: M<Health>; realtime: M<Health>; d1: M<Health>; vercel: M<Health>; doReq: M; doMsgs: M; d1Reads: M; d1Writes: M; d1Storage: M; bandwidth: M; probeMs: M };
  multiplayer: { regions: M<{ name: string; count: number }[]>; events: { src: Src; items: PlayerEvent[] }; reconnects: M; rejected: M; msgsPerSec: M; sync: M; peaks: { src: Src; items: { at: number; visitors: number }[] } };
  incidents: { src: Src; items: Incident[] };
  deploys: { src: Src; items: Deploy[] };
  probes: { src: Src; items: Probe[] };
  cost: CostRow[];
}

export interface MetricsAdapter { snapshot(now?: number): Promise<Snapshot> }
export const NA = <T = number>(note?: string): M<T> => ({ src: 'needs-integration', value: null, note });
export const UNAVAIL = <T = number>(note?: string): M<T> => ({ src: 'unavailable', value: null, note });
