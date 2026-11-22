import { describe, expect, it, vi } from 'vitest';
import { mockAdapter } from '../src/lib/adapters/mock';
import type { M, Snapshot } from '../src/lib/types';

vi.mock('server-only', () => ({}));
const { createLiveAdapter } = await import('../src/lib/adapters/live');

/** 스냅샷의 모든 M<T> 값을 모은다. */
const metrics = (o: unknown, out: M<unknown>[] = []): M<unknown>[] => {
  if (o && typeof o === 'object') { const r = o as Record<string, unknown>; if ('src' in r && 'value' in r) out.push(r as unknown as M<unknown>); else Object.values(r).forEach((v) => metrics(v, out)); }
  return out;
};
const T = 1_760_000_000_000;

describe('mock 어댑터', () => {
  it('같은 시각이면 같은 결과를 낸다(상태 없음)', async () => { expect(await mockAdapter.snapshot(T)).toEqual(await mockAdapter.snapshot(T)); });
  it('값이 있는 모든 지표는 DEMO로 표시된다', async () => {
    const s = await mockAdapter.snapshot(T);
    for (const m of metrics(s)) if (m.value != null) expect(m.src).toBe('demo');
    expect(s.series.src).toBe('demo'); expect(s.incidents.src).toBe('demo');
  });
  it('비용 금액은 임의 생성하지 않고 연동 필요로 남긴다', async () => {
    const s = await mockAdapter.snapshot(T);
    for (const c of s.cost) { expect(c.cost.value).toBeNull(); expect(c.cost.src).toBe('needs-integration'); }
  });
  it('접속자는 수용 인원을 넘지 않는다', async () => {
    const s = await mockAdapter.snapshot(T);
    for (const p of s.series.points) { expect(p.visitors).toBeLessThanOrEqual(100); expect(p.sockets).toBeLessThanOrEqual(p.visitors as number); }
  });
});

describe('live 어댑터', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  it('설정이 없으면 어떤 숫자도 만들지 않는다', async () => {
    const f = vi.fn(); const s: Snapshot = await createLiveAdapter({}, f as never).snapshot(T);
    expect(f).not.toHaveBeenCalled();
    for (const m of metrics(s)) expect(m.value).toBeNull();
    expect(s.cost.every((c) => c.used.value === null)).toBe(true);
  });
  it('공개 상태 URL만 있으면 상태·버전·프로브 지연만 LIVE가 된다', async () => {
    const f = vi.fn(async (u: unknown) => String(u).endsWith('/release.json') ? ok({ revision: 'abc123' }) : ok({ ok: true, revision: 'abc123' }));
    const s = await createLiveAdapter({ WINTERLIGHT_WEB_URL: 'https://example.test' }, f as never).snapshot(T);
    expect(s.overview.revision).toMatchObject({ src: 'live', value: 'abc123' });
    expect(s.overview.status.value).toBe('ok');
    expect(s.overview.visitors.value).toBeNull(); expect(s.overview.p95.value).toBeNull();
    expect(metrics(s).some((m) => m.src === 'demo')).toBe(false);
  });
  it('API 실패 시 임의 값 대신 연동 필요로 남고, 토큰은 응답에 포함되지 않는다', async () => {
    const f = vi.fn(async () => { throw new Error('network'); });
    const s = await createLiveAdapter({ VERCEL_TOKEN: 'SECRET-TOKEN', VERCEL_PROJECT_ID: 'p', CF_API_TOKEN: 'SECRET-CF', CF_ACCOUNT_ID: 'a', CF_WORKER_NAME: 'w' }, f as never).snapshot(T);
    expect(s.deploys.src).toBe('needs-integration'); expect(s.overview.rpm.value).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/SECRET/);
  });
});
