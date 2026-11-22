'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SnapshotProvider, staleOf, useSnap } from './provider';
import { Mark, cn, time } from './ui';

const NAV = [['/', '개요'], ['/infrastructure', '인프라'], ['/multiplayer', '실시간'], ['/incidents', '장애'], ['/cost', '비용']] as const;

const Logo = () => <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" /></svg>;
function Theme() {
  const [t, setT] = useState('dark');
  useEffect(() => setT(document.documentElement.dataset.theme ?? 'dark'), []);
  const flip = () => { const n = t === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; try { localStorage.setItem('wl-theme', n); } catch {} setT(n); };
  return <button onClick={flip} aria-label={t === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'} className="chip cursor-pointer px-2 py-1">{t === 'dark' ? '다크' : '라이트'}</button>;
}
function useNow() { const [now, setNow] = useState(0); useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); return now; }

/** 상단 상태 줄: 전체 상태, 데이터 모드, 수집 신선도, 경보 수. 어느 화면에서든 같은 자리에 있다. */
function StatusBar() {
  const { snap, error, receivedAt } = useSnap(), now = useNow();
  if (!snap) return <div className="h-11 border-b rule" />;
  const demo = snap.mode === 'mock', m = snap.monitor, st = snap.overview.status;
  const age = (t: number | null) => (t && now ? Math.max(0, Math.round((now - t) / 1000)) : 0);
  const stale = demo ? error || age(receivedAt) > 10 : error || (now > 0 && staleOf(snap, now)), nextIn = m.nextAt && now ? Math.max(0, Math.round((m.nextAt - now) / 1000)) : 0;
  const down = m.alerts.filter((a) => a.level === 'down').length, warn = m.alerts.length - down;
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b rule px-4 py-2 text-xs md:px-6" style={{ background: 'var(--surface)' }}>
      <span className="text-sm"><Mark h={st.value ?? 'unknown'} label={st.value == null ? '상태 미확인' : st.value === 'ok' ? '전체 정상' : st.value === 'warn' ? '일부 주의' : '장애 발생'} /></span>
      <span className={cn('chip', demo ? 'chip-demo' : 'chip-live')}>{demo ? 'DEMO 시뮬레이션' : 'LIVE 읽기 전용'}</span>
      {!demo && m.alerts.length > 0 && <Link href="/incidents" className="inline-flex items-center gap-2 underline-offset-2 hover:underline">{down > 0 && <Mark h="down" label={`장애 ${down}`} />}{warn > 0 && <Mark h="warn" label={`주의 ${warn}`} />}</Link>}
      <span className={cn('ml-auto inline-flex items-center gap-2 tabular-nums', stale ? 'tone-warn' : 'ink2')} data-stale={stale ? '' : undefined}>
        <i key={(demo ? receivedAt : m.collectedAt) ?? 0} className="beat" />
        {demo ? (stale ? `갱신 지연, ${age(receivedAt)}초 전 수신` : `${time(snap.at)} 갱신 (3초 간격, 실제 데이터 아님)`) : stale ? `오래된 데이터: ${age(m.collectedAt)}초 전 수집` : `${time(snap.at)} 수집, ${nextIn > 0 ? `다음 수집 ${nextIn}초 후` : '다음 수집 대기 중'} (${m.intervalMs / 1000}초 간격)`}
      </span>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const items = (mobile: boolean) => NAV.map(([href, label]) => { const on = href === '/' ? path === '/' : path.startsWith(href); return <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={cn('rounded-md text-sm transition-colors', mobile ? 'px-2 py-2 text-center' : 'px-3 py-1.5', on ? 'font-semibold' : 'ink2 hover:text-[color:var(--ink)]')} style={on ? { background: 'var(--accent-soft)', color: 'var(--ink)' } : undefined}>{label}</Link>; });
  return (
    <SnapshotProvider>
      <div className="min-h-screen md:grid md:grid-cols-[13rem_1fr]">
        <aside className="sticky top-0 hidden h-screen flex-col border-r rule p-4 md:flex" style={{ background: 'var(--surface)' }}>
          <div className="mb-6 flex items-center gap-2 px-1"><Logo /><div><p className="text-sm font-bold leading-tight">WINTERLIGHT</p><p className="text-[11px] ink2">클라우드 운영</p></div></div>
          <nav aria-label="주 메뉴" className="flex flex-col gap-0.5">{items(false)}</nav>
          <div className="mt-auto space-y-2 px-1 text-[11px] leading-relaxed ink3"><p>원본 서비스에 쓰지 않는 읽기 전용 모니터입니다.</p><Theme /></div>
        </aside>
        <div className="min-w-0">
          <header className="flex items-center justify-between border-b rule px-4 py-2.5 md:hidden" style={{ background: 'var(--surface)' }}><span className="flex items-center gap-2"><Logo /><b className="text-sm">WINTERLIGHT 운영</b></span><Theme /></header>
          <div className="sticky top-0 z-10"><StatusBar /></div>
          <main className="mx-auto max-w-[1360px] px-4 pb-24 pt-5 md:px-6 md:pb-10">{children}</main>
        </div>
        <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-1 border-t rule p-1.5 md:hidden" style={{ background: 'var(--surface)' }}>{items(true)}</nav>
      </div>
    </SnapshotProvider>
  );
}
