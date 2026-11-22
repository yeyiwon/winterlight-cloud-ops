import type { Health, M, Probe, ProbeCategory, ProbeErrorKind } from './types';
import { NA, UNAVAIL } from './types';

/**
 * 원본 WINTERLIGHT의 공개 읽기 전용 상태 엔드포인트 점검.
 *   GET {web}/api/health   → { ok, multiplayer, revision, transport }  (D1 SELECT 1 실패 시 503 { ok:false })
 *   GET {web}/release.json → { revision, apiOrigin }
 *   GET {rt}/health        → { ok, service:'winterlight-realtime', revision }
 *   GET {rt}/metrics       → 집계 지표(서버 간 Bearer 인증, 원본 cloud-ops/metrics-endpoint 브랜치)
 * 네트워크 오류와 서비스 장애를 구분한다. 응답이 없다는 사실만으로 서비스가 내려갔다고 단정하지 않는다.
 */
type Fetch = typeof fetch;

/** bearer: 서버 간 인증 토큰(값). bearerEnv가 있으면 토큰 없이는 실행하지 않는다. 토큰은 결과에 절대 담지 않는다. */
export interface ProbeSpec { id: Probe['id']; label: string; path: string; base: string | undefined; env: string; service?: string; needsRevision?: boolean; bearer?: string; bearerEnv?: string }
export const MAX_BODY = 64 * 1024;

const COPY: Record<ProbeErrorKind, [string, string]> = {
  auth: ['인증에 실패했습니다.', '대시보드의 {env} 값과 원본 Worker의 METRICS_TOKEN이 같은지 확인하세요. 관리자 RPC 비밀(REALTIME_SECRET)은 사용하지 않습니다.'],
  'not-configured': ['점검할 주소가 설정되지 않았습니다.', '서버 환경변수 {env}에 주소를 넣어 주세요.'],
  'invalid-url': ['주소 형식이 올바르지 않습니다.', '{env}를 https://로 시작하는 전체 주소로 고쳐 주세요. (http는 localhost만 허용)'],
  timeout: ['제한 시간 안에 응답이 없습니다.', '서비스가 느리거나 대시보드 서버의 네트워크가 막혀 있을 수 있어 장애로 단정하지 않습니다. 잠시 후에도 같으면 주소와 방화벽을 확인하세요.'],
  dns: ['대시보드 서버에서 이 주소를 찾지 못했습니다(DNS).', '{env}의 도메인 철자를 확인하세요. 철자가 맞다면 대시보드 서버의 외부 도메인 조회가 막힌 환경(방화벽·샌드박스)일 수 있어, 서비스 장애로 단정하지 않습니다.'],
  refused: ['연결이 거부되었습니다.', '서비스가 꺼져 있거나 포트가 다릅니다. 주소의 포트를 확인하세요.'],
  tls: ['보안 인증서를 확인하지 못했습니다.', '인증서가 만료·불일치했거나 대시보드 서버가 인증서를 신뢰하지 못합니다.'],
  blocked: ['접근이 거부되었습니다.', 'Vercel 배포 보호, Cloudflare Access 또는 방화벽이 대시보드 서버를 막고 있을 수 있습니다. 공개 상태 경로만 허용해 주세요.'],
  'not-found': ['경로를 찾을 수 없습니다.', '주소 또는 배포 버전을 확인하세요. 이 경로가 아직 배포되지 않았을 수 있습니다.'],
  'rate-limited': ['요청이 너무 많다는 응답을 받았습니다.', '잠시 후 자동으로 다시 시도합니다. 점검 간격을 늘리는 것도 방법입니다.'],
  server: ['서버가 오류를 반환했습니다.', '원본 서비스의 로그와 최근 배포를 확인하세요.'],
  'service-unhealthy': ['서비스가 스스로 비정상이라고 응답했습니다.', '백엔드의 D1 데이터베이스 점검이 실패했습니다. Cloudflare 대시보드에서 D1 상태를 확인하세요.'],
  format: ['예상한 형식의 응답이 아닙니다.', '로그인·보호 페이지나 다른 서비스가 대신 응답했을 수 있습니다. 주소가 맞는지 확인하세요.'],
  network: ['네트워크 오류로 연결하지 못했습니다.', '대시보드 서버의 외부 접속 허용 목록이나 인터넷 연결을 확인하세요.'],
};

const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');

/** 주소를 검증하고, 계정 정보·쿼리·해시를 제거한 안전한 형태로 돌려준다. */
export function safeTarget(base: string | undefined, path: string): { url: string } | { error: 'not-configured' | 'invalid-url' } {
  if (!base?.trim()) return { error: 'not-configured' };
  try {
    const u = new URL(base.trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal(u.hostname))) return { error: 'invalid-url' };
    u.username = ''; u.password = ''; u.search = ''; u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') + path;
    return { url: u.toString() };
  } catch { return { error: 'invalid-url' }; }
}

export function classifyThrown(e: unknown): { kind: ProbeErrorKind; detail: string | null } {
  const x = e as { name?: string; code?: string; cause?: { code?: string } };
  const code = x?.cause?.code ?? x?.code ?? null;
  if (x?.name === 'TimeoutError' || x?.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return { kind: 'timeout', detail: code ?? x?.name ?? null };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { kind: 'dns', detail: code };
  if (code === 'ECONNREFUSED') return { kind: 'refused', detail: code };
  if (code && /^(CERT_|ERR_TLS|ERR_SSL|DEPTH_ZERO|UNABLE_TO_VERIFY|SELF_SIGNED|HOSTNAME_MISMATCH)/.test(code)) return { kind: 'tls', detail: code };
  return { kind: 'network', detail: code };
}

const clean = (s: unknown) => (typeof s === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(s) ? s : null);

function result(spec: ProbeSpec, target: string | null, patch: Partial<Probe> & Pick<Probe, 'state'>): Probe {
  const kind = patch.kind ?? null, copy = kind ? COPY[kind] : null;
  return {
    id: spec.id, label: spec.label, path: spec.path, target, status: null, ms: null, revision: null, kind, detail: null, at: patch.state === 'skipped' ? null : Date.now(), fields: [],
    message: copy ? copy[0] : null, hint: copy ? copy[1].replace('{env}', spec.env) : null, ...patch,
  };
}

/** 원본이 실제로 돌려주는 필드 중 안전하게 보여 줄 수 있는 것만 고른다(허용 목록). 그 밖의 필드는 버린다. */
export function pickFields(id: Probe['id'], body: Record<string, unknown>): Probe['fields'] {
  const out: Probe['fields'] = [];
  if (id === 'web-health') {
    if (typeof body.multiplayer === 'boolean') out.push({ key: 'multiplayer', label: '멀티플레이', value: body.multiplayer ? '사용 가능' : '사용 불가' });
    if (body.transport === 'websocket-configured' || body.transport === 'polling') out.push({ key: 'transport', label: '전송 방식', value: body.transport === 'websocket-configured' ? 'WebSocket 설정됨' : 'HTTP 폴링' });
  }
  if (id === 'release' && typeof body.apiOrigin === 'string') {
    try { const u = new URL(body.apiOrigin); if (u.protocol === 'https:') out.push({ key: 'apiOrigin', label: '백엔드 도메인', value: u.hostname }); } catch { /* 무시 */ }
  }
  if ((id === 'realtime' || id === 'realtime-metrics') && typeof body.service === 'string' && clean(body.service)) out.push({ key: 'service', label: '서비스 이름', value: body.service });
  if (id === 'realtime-metrics' && Number.isSafeInteger(body.connections) && Number.isSafeInteger(body.capacity)) out.push({ key: 'connections', label: '연결', value: `${body.connections} / ${body.capacity}` });
  return out;
}

export const runProbe = async (spec: ProbeSpec, f: Fetch, timeoutMs = 4000): Promise<Probe> => (await probeWithBody(spec, f, timeoutMs)).probe;

/** 점검 결과와 함께, 정상일 때만 원본 응답 본문을 돌려준다(본문은 서버 안에서만 쓰고 화면으로 보내지 않는다). */
export async function probeWithBody(spec: ProbeSpec, f: Fetch, timeoutMs = 4000): Promise<{ probe: Probe; body: Record<string, unknown> | null }> {
  const t = safeTarget(spec.base, spec.path), none = (probe: Probe) => ({ probe, body: null });
  if ('error' in t) return none(result(spec, null, { state: 'skipped', kind: t.error }));
  if (spec.bearerEnv && !spec.bearer) return none(result({ ...spec, env: spec.bearerEnv }, t.url, { state: 'skipped', kind: 'not-configured', message: '서버 간 인증 토큰이 설정되지 않았습니다.', at: null }));
  const target = t.url, began = performance.now(), took = () => Math.round(performance.now() - began);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (spec.bearer) headers.Authorization = `Bearer ${spec.bearer}`;
  let r: Response;
  try {
    r = await f(target, { cache: 'no-store', headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const c = classifyThrown(e);
    return none(result(spec, target, { state: 'fail', kind: c.kind, detail: c.detail, ms: null }));
  }
  const ms = took(), status = r.status;
  let body: Record<string, unknown> | null = null, textOk = false;
  const type = r.headers.get('content-type') ?? '';
  if (type.includes('json') && Number(r.headers.get('content-length') ?? 0) <= MAX_BODY) {
    try { const text = await r.text(); if (text.length <= MAX_BODY) { const j = JSON.parse(text); if (j && typeof j === 'object' && !Array.isArray(j)) { body = j as Record<string, unknown>; textOk = true; } } } catch { /* 형식 오류로 처리 */ }
  } else { try { await r.body?.cancel(); } catch { /* 무시 */ } }
  const fail = (kind: ProbeErrorKind, extra?: Partial<Probe>) => none(result({ ...spec, env: kind === 'auth' && spec.bearerEnv ? spec.bearerEnv : spec.env }, target, { state: 'fail', kind, status, ms, detail: `HTTP ${status}`, ...extra }));

  if (status === 401 && spec.bearer) return fail('auth');
  if (status === 401 || status === 403) return fail('blocked');
  if (status === 404 && spec.id === 'realtime-metrics') return fail('not-found', { message: '원본 실시간 Worker에 /metrics가 아직 배포되지 않았습니다.', hint: '원본 저장소의 cloud-ops/metrics-endpoint 브랜치를 검토·테스트한 뒤 배포하면 수집이 시작됩니다.' });
  if (status === 404) return fail('not-found');
  if (status === 503 && spec.id === 'realtime-metrics' && body?.error === 'metrics disabled') return fail('not-configured', { message: '원본 Worker에 METRICS_TOKEN이 설정되지 않아 /metrics가 꺼져 있습니다.', hint: 'wrangler secret put METRICS_TOKEN --env production 으로 대시보드와 같은 값을 넣어 주세요(REALTIME_SECRET과 달라야 합니다).' });
  if (status === 429) return fail('rate-limited');
  if (body && body.ok === false) return fail('service-unhealthy');
  if (status === 502 && spec.id === 'web-health') return fail('server', { message: '프론트엔드(Vercel)는 응답했지만 뒤쪽 서버에 연결하지 못했습니다.', hint: '백엔드 Worker 주소와 상태를 확인하세요. 원본 프록시가 HTTP 502를 돌려주는 경우입니다.' });
  if (status >= 500) return fail('server');
  if (status < 200 || status >= 300) return fail('server', { message: `예상하지 못한 응답입니다(HTTP ${status}).` });
  if (!textOk || !body) return fail('format', { detail: type ? `content-type: ${type.split(';')[0]}` : 'JSON 아님' });
  if (spec.service && body.service !== spec.service) return fail('format', { message: '다른 서비스의 응답입니다.', detail: `service=${clean(body.service) ?? '없음'}` });
  const revision = clean(body.revision);
  if (spec.needsRevision && !revision) return fail('format', { message: 'revision 값이 없습니다.' });
  return { probe: result(spec, target, { state: 'ok', status, ms, revision, fields: pickFields(spec.id, body) }), body };
}

const NET: ProbeErrorKind[] = ['dns', 'timeout', 'refused', 'tls', 'network'];
/** 실패 원인 분류. 대시보드 쪽 네트워크 문제는 서비스 장애로 세지 않는다. */
export function categoryOf(p: Pick<Probe, 'state' | 'kind'>): ProbeCategory | null {
  if (p.state !== 'fail') return null;
  if (p.kind === 'server' || p.kind === 'service-unhealthy') return 'outage';
  if (p.kind === 'auth' || p.kind === 'blocked') return 'auth';
  if (p.kind && NET.includes(p.kind)) return 'network';
  return 'unmeasured';
}
export const CATEGORY_LABEL: Record<ProbeCategory, string> = { outage: '실제 서버 장애', auth: '인증 문제', network: 'DNS·네트워크·프록시 제한', unmeasured: '측정 불가' };

/** 점검 결과 → 화면용 상태. 네트워크 계열 실패는 '장애'가 아니라 '측정 불가'로 둔다. */
export function healthOf(p: Probe): M<Health> {
  if (p.state === 'ok') return { src: 'live', value: 'ok', note: p.ms != null ? `응답 ${p.ms}ms` : undefined };
  if (p.state === 'skipped') return NA<Health>(p.message ? `${p.message} ${p.hint ?? ''}`.trim() : undefined);
  const why = [p.message, p.hint].filter(Boolean).join(' ');
  if (p.kind === 'service-unhealthy' || p.kind === 'server') return { src: 'live', value: 'down', note: why };
  return UNAVAIL<Health>(why);
}

export function overallStatus(probes: Probe[], mismatchOverride?: boolean): M<Health> {
  const used = probes.filter((p) => p.state !== 'skipped' && (p.id === 'web-health' || p.id === 'realtime'));
  if (!used.length) return NA<Health>('상태를 확인할 주소(WINTERLIGHT_WEB_URL)를 설정해 주세요.');
  const ok = used.filter((p) => p.state === 'ok').length, down = used.filter((p) => healthOf(p).value === 'down').length, unknown = used.length - ok - down;
  const mismatch = mismatchOverride ?? revisionOf(probes).mismatch;
  if (ok === used.length && !mismatch) return { src: 'live', value: 'ok' };
  if (ok === used.length && mismatch) return { src: 'live', value: 'warn', note: '서비스 간 배포 버전이 서로 다릅니다.' };
  if (ok === 0 && down === 0) return UNAVAIL<Health>(`점검 불가: ${used[0].message ?? ''} 상세는 인프라 화면의 연결 점검을 확인하세요.`.trim());
  if (ok === 0) return { src: 'live', value: 'down', note: '점검한 모든 서비스가 정상 응답을 주지 않았습니다.' };
  return { src: 'live', value: 'warn', note: unknown ? '일부 서비스를 점검하지 못했습니다.' : '일부 서비스가 비정상 응답을 주었습니다.' };
}

const short = (r: string) => (/^[0-9a-f]{40}$/.test(r) ? r.slice(0, 7) : r);
export function revisionOf(probes: Probe[]): { value: M<string>; mismatch: boolean } {
  const got = probes.filter((p) => p.state === 'ok' && p.revision) as (Probe & { revision: string })[];
  const set = [...new Set(got.map((p) => p.revision))];
  if (set.length === 1) return { value: { src: 'live', value: short(set[0]), note: `${got.length}곳에서 같은 버전 확인` }, mismatch: false };
  if (set.length > 1) return { value: { src: 'live', value: got.map((p) => `${p.label} ${short(p.revision)}`).join(' ≠ '), note: '서비스 간 배포 버전이 다릅니다. 배포가 진행 중이거나 일부만 배포되었을 수 있습니다.' }, mismatch: true };
  const failed = probes.find((p) => p.state === 'fail');
  return { value: failed ? UNAVAIL<string>(`${failed.label}: ${failed.message}`) : NA<string>('release.json 주소 설정 필요'), mismatch: false };
}
