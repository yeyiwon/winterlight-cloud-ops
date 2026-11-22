import { CATEGORY_LABEL, categoryOf } from './probe';
import type { Alert, FailureLog, Incident, MonitorInfo, Point, Probe, TimelineEvent } from './types';

/**
 * 수집 상태를 기억하는 모니터. 원본에는 아무것도 쓰지 않고, 대시보드 서버 메모리에만 보관한다.
 * - 연속 실패 횟수가 failThreshold에 닿으면 장애를 열고, 다음 정상 응답에서 닫는다(발생·복구 시각 기록).
 * - 실시간 Worker의 누적 카운터는 직전 표본과의 차이로 초당 값을 만든다. 카운터가 줄거나 since가 바뀌면 재시작으로 본다.
 * - 서버리스 인스턴스가 바뀌면 기록이 비워진다. 오래 남겨야 하면 store 자리에 외부 저장소를 붙인다(OBSERVABILITY.md).
 */

/** 원본 /metrics 응답 중 대시보드가 쓰는 필드. 허용 목록 밖의 값은 버린다. */
export interface RtMetrics { at: number; since: number; connections: number; capacity: number; accepted: number; closed: number; reconnected: number; received: number; sent: number; rejected: number; bytesOut: number; handlerMeanMs: number | null; handlerP95Ms: number | null; clientRTTMeanMs: number | null; clientRTTP95Ms: number | null; rttSamples: number; regions: Record<string, number>; rejections: Record<string, number> }
const COUNTERS = ['at', 'since', 'connections', 'capacity', 'accepted', 'closed', 'reconnected', 'received', 'sent', 'rejected', 'bytesOut', 'rttSamples'] as const;
const GAUGES = ['handlerMeanMs', 'handlerP95Ms', 'clientRTTMeanMs', 'clientRTTP95Ms'] as const;
const counts = (o: unknown, re: RegExp) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => re.test(k) && Number.isSafeInteger(v) && (v as number) >= 0)) as Record<string, number>;

export function parseRtMetrics(b: Record<string, unknown> | null): RtMetrics | null {
  if (!b || b.ok !== true) return null;
  const out: Record<string, unknown> = {};
  for (const k of COUNTERS) { const v = b[k]; if (!Number.isSafeInteger(v) || (v as number) < 0) return null; out[k] = v; }
  for (const k of GAUGES) { const v = b[k]; out[k] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null; }
  out.regions = counts(b.regions, /^[a-z0-9_-]{1,32}$/); out.rejections = counts(b.rejections, /^[a-z]{1,16}$/);
  return out as unknown as RtMetrics;
}

export interface Derived { inPerSec: number; outPerSec: number; reconnects: number; rejected: number; seconds: number }
/** 같은 DO 수명 안의 두 표본 차이. 재시작·역행·같은 캐시 표본이면 null. */
export function derive(prev: RtMetrics | null, cur: RtMetrics): Derived | null {
  if (!prev || prev.since !== cur.since || cur.at <= prev.at) return null;
  const d = (k: 'received' | 'sent' | 'reconnected' | 'rejected') => cur[k] - prev[k];
  if (d('received') < 0 || d('sent') < 0 || d('reconnected') < 0 || d('rejected') < 0) return null;
  const seconds = (cur.at - prev.at) / 1000;
  return { inPerSec: d('received') / seconds, outPerSec: d('sent') / seconds, reconnects: d('reconnected'), rejected: d('rejected'), seconds };
}

interface Streak { fails: number; firstFailAt: number | null; lastOkAt: number | null; incident: Incident | null; revision: string | null }
const cap = <T,>(list: T[], n: number) => { if (list.length > n) list.splice(0, list.length - n); return list; };
const short = (r: string) => (/^[0-9a-f]{40}$/.test(r) ? r.slice(0, 7) : r);

export class Monitor {
  readonly points: Point[] = [];
  readonly incidents: Incident[] = [];
  readonly failures: FailureLog[] = [];
  readonly timeline: TimelineEvent[] = [];
  readonly streaks = new Map<Probe['id'], Streak>();
  rt: RtMetrics | null = null;
  derived: Derived | null = null;
  collections = 0;
  collectedAt: number | null = null;
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(readonly intervalMs = 30000, readonly failThreshold = 2, readonly startedAt = Date.now(), readonly keep = 120) {}

  /** 외부 API(Vercel·Cloudflare) 호출 속도 제한: ttl 동안 같은 결과를 재사용한다. 실패 결과도 캐시해 재시도 폭주를 막는다. */
  async cached<T>(key: string, ttlMs: number, now: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value as T;
    const value = await fn(); this.cache.set(key, { at: now, value }); return value;
  }

  observe(probes: Probe[], rt: RtMetrics | null, now: number): Probe[] {
    this.collections++; this.collectedAt = now;
    const out = probes.map((p) => this.track(p, now));
    if (rt) {
      if (this.rt && rt.since !== this.rt.since) this.event(now, 'reset', '실시간 Worker 카운터 재시작 감지', 'Durable Object가 새로 시작되어 누적 카운터가 처음부터 다시 셉니다. 재배포나 유휴 후 재기동일 수 있습니다.');
      const d = derive(this.rt, rt);
      if (d || !this.rt || rt.at !== this.rt.at) this.derived = d;
      this.rt = rt;
    }
    const health = out.find((p) => p.id === 'web-health'), fresh = rt && this.rt === rt;
    const point: Point = { t: now };
    if (health?.state === 'ok' && health.ms != null) point.api = health.ms;
    if (fresh) {
      point.visitors = rt.connections; point.sockets = rt.connections;
      if (rt.clientRTTMeanMs != null) point.sync = Math.round(rt.clientRTTMeanMs);
      if (rt.handlerP95Ms != null) point.p95 = +rt.handlerP95Ms.toFixed(2);
      if (this.derived) { point.msgsIn = +this.derived.inPerSec.toFixed(2); point.msgsOut = +this.derived.outPerSec.toFixed(2); point.msgs = +(this.derived.inPerSec + this.derived.outPerSec).toFixed(2); point.reconnects = this.derived.reconnects; point.rejected = this.derived.rejected; }
    }
    if (Object.keys(point).length > 1) { this.points.push(point); cap(this.points, this.keep); }
    return out;
  }

  private track(p: Probe, now: number): Probe {
    if (p.state === 'skipped') return p;
    const s = this.streaks.get(p.id) ?? { fails: 0, firstFailAt: null, lastOkAt: null, incident: null, revision: null };
    this.streaks.set(p.id, s);
    if (p.state === 'ok') {
      if (s.incident) { s.incident.status = 'resolved'; s.incident.resolvedAt = now; this.event(now, 'recovery', `${p.label} 복구`, `연속 ${s.incident.fails}회 실패 후 정상 응답(HTTP ${p.status}, ${p.ms}ms).`); s.incident = null; }
      if (p.revision && s.revision && p.revision !== s.revision) this.event(now, 'deploy', `${p.label} 배포 버전 변경`, `${short(s.revision)} → ${short(p.revision)}`);
      if (p.revision) s.revision = p.revision;
      s.fails = 0; s.firstFailAt = null; s.lastOkAt = p.at ?? now;
      return { ...p, lastOkAt: s.lastOkAt, fails: 0 };
    }
    const category = categoryOf(p) ?? 'unmeasured';
    s.fails++; s.firstFailAt ??= now;
    this.failures.push({ at: now, probe: p.id, label: p.label, kind: p.kind, category, status: p.status, detail: [p.message, p.detail].filter(Boolean).join(' · ') || null });
    cap(this.failures, 100);
    if (s.incident) { s.incident.fails = s.fails; s.incident.category = category; }
    else if (s.fails >= this.failThreshold) {
      s.incident = { id: `${p.id}-${s.firstFailAt}`, at: s.firstFailAt, route: p.path, feature: p.label, code: p.kind ?? 'unknown', category, fails: s.fails, status: 'open', detail: `${CATEGORY_LABEL[category]}: ${p.message ?? ''}`.trim() };
      this.incidents.push(s.incident); cap(this.incidents, 50);
      this.event(s.firstFailAt, 'outage', `${p.label} ${category === 'outage' ? '장애' : '수집 실패'} 시작`, `${CATEGORY_LABEL[category]} · 연속 ${s.fails}회 실패`);
    }
    return { ...p, lastOkAt: s.lastOkAt, fails: s.fails };
  }

  event(at: number, kind: TimelineEvent['kind'], title: string, detail: string) { this.timeline.push({ at, kind, title, detail }); cap(this.timeline, 100); }

  alerts(extra: Alert[] = []): Alert[] {
    const out: Alert[] = [];
    for (const [id, s] of this.streaks) if (s.fails >= this.failThreshold && s.incident) out.push({ id: `fail-${id}`, level: s.incident.category === 'outage' ? 'down' : 'warn', title: `${s.incident.feature} 연속 ${s.fails}회 실패`, detail: s.incident.detail, since: s.incident.at });
    const rt = this.rt;
    if (rt && rt.capacity && rt.connections / rt.capacity >= 0.9) out.push({ id: 'capacity', level: 'warn', title: '실시간 서버 수용 인원 90% 이상', detail: `${rt.connections} / ${rt.capacity}명. 가득 차면 새 연결은 거절(4008)됩니다.`, since: rt.at });
    if (rt?.handlerP95Ms != null && rt.handlerP95Ms > 50) out.push({ id: 'handler', level: 'warn', title: '실시간 메시지 처리 지연 증가', detail: `서버 처리 P95 ${rt.handlerP95Ms.toFixed(1)}ms(기준 50ms).`, since: rt.at });
    return [...out, ...extra];
  }

  info(now: number, extra: Alert[] = []): MonitorInfo {
    return {
      intervalMs: this.intervalMs, startedAt: this.startedAt, collectedAt: this.collectedAt, nextAt: this.collectedAt ? this.collectedAt + this.intervalMs : now, collections: this.collections, failThreshold: this.failThreshold,
      alerts: this.alerts(extra), failures: [...this.failures].reverse().slice(0, 50), timeline: [...this.timeline].sort((a, b) => b.at - a.at).slice(0, 50),
      note: `이 대시보드 서버가 ${new Date(this.startedAt).toISOString()}부터 메모리에 보관한 기록입니다. 서버 인스턴스가 바뀌면 처음부터 다시 쌓입니다.`,
    };
  }
}
