'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Snapshot } from '@/lib/types';

interface State { snap: Snapshot | null; error: boolean; /** 브라우저가 마지막으로 성공 응답을 받은 시각 */ receivedAt: number | null; /** 이 화면을 연 뒤 점검이 정상이었던 마지막 시각(점검 id별). 새로고침하면 비워진다 */ lastOk: Record<string, number> }
const Ctx = createContext<State>({ snap: null, error: false, receivedAt: null, lastOk: {} });
export const useSnap = () => useContext(Ctx);

/** DEMO는 3초. LIVE는 서버가 수집 주기(30~60초)마다만 원본을 부르므로, 화면은 10초마다 새 수집 결과가 있는지만 확인한다. */
const poll = (s: Snapshot) => (s.mode === 'live' ? Math.min(10000, s.monitor.intervalMs) : 3000);
/** 오래된 데이터: 마지막 수집이 주기의 2배 + 화면 확인 간격보다 오래되었는지. */
export const staleOf = (s: Snapshot, now: number) => s.mode === 'live' && s.monitor.collectedAt != null && now - s.monitor.collectedAt > s.monitor.intervalMs * 2 + 10000;

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<State>({ snap: null, error: false, receivedAt: null, lastOk: {} });
  useEffect(() => {
    let stop = false, loaded = false, timer: ReturnType<typeof setTimeout>;
    // 숨겨진 탭에서는 갱신을 쉬지만, 첫 결과는 항상 받아 둔다. 다시 보이면 바로 새로 받는다.
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden && loaded) { timer = setTimeout(load, 3000); return; }
      loaded = true;
      let next = 3000;
      try { const r = await fetch(new URL('/api/metrics', location.origin), { cache: 'no-store' }); if (!r.ok) throw 0; const snap = (await r.json()) as Snapshot; if (!stop) set((prev) => { const lastOk = { ...prev.lastOk }; for (const p of snap.probes.items) if (p.state === 'ok' && p.at) lastOk[p.id] = p.at; return { snap, error: false, receivedAt: Date.now(), lastOk }; }); next = poll(snap); }
      catch { if (!stop) set((s) => ({ ...s, error: true })); }
      if (!stop) timer = setTimeout(load, next);
    };
    const onShow = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onShow);
    load();
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export function Page({ children, title, desc }: { children: (s: Snapshot) => ReactNode; title: string; desc: string }) {
  const { snap, error } = useSnap();
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">{title}</h1><p className="mt-0.5 max-w-[64ch] text-sm ink2">{desc}</p></div>
      {!snap ? <div role="status" className={`panel p-5 text-sm ${error ? '' : 'skeleton h-48'}`}>{error ? <><b>지표 서버에 연결하지 못했습니다.</b><p className="mt-1 ink2">대시보드 서버(/api/metrics)가 응답하지 않습니다. 자동으로 다시 시도합니다. 계속되면 배포 상태와 DASHBOARD_PASSWORD 설정을 확인하세요.</p></> : <span className="ink2">첫 수집 결과를 기다리는 중입니다.</span>}</div>
        : <>{error && <div role="status" className="alert warn panel text-sm"><i className="mark warn mt-1" aria-hidden /><div><b>지표 서버 연결이 끊겼습니다.</b><p className="text-xs ink2">아래 값은 마지막으로 받은 결과이며 오래되었을 수 있습니다. 자동으로 다시 시도합니다.</p></div></div>}{children(snap)}</>}
    </div>
  );
}
