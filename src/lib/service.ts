import 'server-only';
import { createLiveAdapter } from './adapters/live';
import { mockAdapter } from './adapters/mock';
import { Monitor } from './monitor';
import type { Snapshot } from './types';

export const dataMode = (): 'mock' | 'live' => (process.env.DATA_MODE === 'live' ? 'live' : 'mock');
/** 수집 주기: METRICS_INTERVAL_SEC(30~60초, 기본 30초). 범위를 벗어나면 가까운 경계로 맞춘다. */
export const intervalMs = () => Math.min(60, Math.max(30, Number(process.env.METRICS_INTERVAL_SEC) || 30)) * 1000;

const g = globalThis as { __wlOps?: { monitor: Monitor; cache: { at: number; snap: Snapshot } | null; inflight: Promise<Snapshot> | null } };

/**
 * 원본 호출 속도 제한: 보는 사람이 몇 명이든 수집 주기마다 한 번만 원본을 부른다.
 * 동시에 들어온 요청은 진행 중인 수집 하나를 함께 기다린다(single-flight).
 */
export async function getSnapshot(): Promise<Snapshot> {
  if (dataMode() === 'mock') return mockAdapter.snapshot();
  const s = (g.__wlOps ??= { monitor: new Monitor(intervalMs()), cache: null, inflight: null });
  if (s.cache && Date.now() - s.cache.at < s.monitor.intervalMs) return s.cache.snap;
  s.inflight ??= createLiveAdapter(process.env as never, fetch, { monitor: s.monitor }).snapshot()
    .then((snap) => { s.cache = { at: snap.at, snap }; return snap; })
    .finally(() => { s.inflight = null; });
  return s.inflight;
}
