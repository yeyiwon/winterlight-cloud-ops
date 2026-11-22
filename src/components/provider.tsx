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
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.hidden) { timer = setTimeout(load, 3000); return; }
      let next = 3000;
      try { const r = await fetch('/api/metrics', { cache: 'no-store' }); if (!r.ok) throw 0; const snap = (await r.json()) as Snapshot; if (!stop) set((prev) => { const lastOk = { ...prev.lastOk }; for (const p of snap.probes.items) if (p.state === 'ok' && p.at) lastOk[p.id] = p.at; return { snap, error: false, receivedAt: Date.now(), lastOk }; }); next = poll(snap); }
      catch { if (!stop) set((s) => ({ ...s, error: true })); }
      if (!stop) timer = setTimeout(load, next);
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export function Page({ children, title, desc }: { children: (s: Snapshot) => ReactNode; title: string; desc: string }) {
  const { snap, error } = useSnap();
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm ink2">{desc}</p></div>
      {!snap ? <div className="glass skeleton h-64 p-6 text-sm ink2">{error ? '지표 서버에 연결하지 못했습니다. 잠시 후 다시 시도합니다.' : '지표를 불러오는 중…'}</div> : <>{error && <div role="status" className="glass p-3 text-sm" style={{ color: 'var(--warn)' }}>지표 서버에 연결하지 못해 마지막으로 받은 값을 표시 중입니다. 값이 오래되었을 수 있으며 자동으로 다시 시도합니다.</div>}{children(snap)}</>}
    </div>
  );
}
