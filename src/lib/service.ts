import 'server-only';
import { createLiveAdapter } from './adapters/live';
import { mockAdapter } from './adapters/mock';
import type { Snapshot } from './types';

export const dataMode = (): 'mock' | 'live' => (process.env.DATA_MODE === 'live' ? 'live' : 'mock');
let cache: { at: number; snap: Snapshot } | null = null;

/** 외부 API 호출은 5초 캐시 뒤에 둬서 폴링이 원본 서비스와 API 한도에 부담을 주지 않게 한다. */
export async function getSnapshot(): Promise<Snapshot> {
  if (dataMode() === 'mock') return mockAdapter.snapshot();
  if (cache && Date.now() - cache.at < 5000) return cache.snap;
  const snap = await createLiveAdapter(process.env as never).snapshot();
  cache = { at: Date.now(), snap };
  return snap;
}
