'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SnapshotProvider, useSnap } from './provider';
import { SnowField } from './snow';
import { cn, time } from './ui';

const NAV = [['/', '개요', '◐'], ['/infrastructure', '인프라', '◇'], ['/multiplayer', '실시간', '✦'], ['/incidents', '장애', '△'], ['/cost', '비용', '○']] as const;

const Snow = () => <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ice)" strokeWidth="1.6" strokeLinecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" /></svg>;
function Theme() {
  const [t, setT] = useState('dark');
  useEffect(() => setT(document.documentElement.dataset.theme ?? 'dark'), []);
  const flip = () => { const n = t === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; try { localStorage.setItem('wl-theme', n); } catch {} setT(n); };
  return <button onClick={flip} aria-label={t === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} className="chip cursor-pointer px-3 py-1.5 text-sm transition-transform hover:scale-105">{t === 'dark' ? '☾ 다크' : '☀ 라이트'}</button>;
}
/** 데이터 출처 배너. 하트비트가 갱신마다 한 번 퍼지고, 10초 넘게 새 값이 없으면 지연으로 알린다. */
function Banner() {
  const { snap, error, receivedAt } = useSnap();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!snap) return null;
  const demo = snap.mode === 'mock', age = receivedAt && now ? Math.max(0, Math.round((now - receivedAt) / 1000)) : 0, stale = error || age > 10;
  return <div role="note" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs md:px-8', demo ? 'chip-demo' : 'chip-live')} style={{ borderBottom: '1px solid var(--line)', borderRadius: 0 }}>
    <b>{demo ? 'DEMO 모드' : 'LIVE · 읽기 전용'}</b><span>{demo ? '화면의 모든 수치는 시뮬레이션이며 실제 WINTERLIGHT 운영 데이터가 아닙니다.' : '값을 얻지 못한 지표는 숫자 대신 사유를 표시합니다.'}</span>
    <span className="ml-auto inline-flex items-center gap-2 tabular-nums" style={stale ? { color: 'var(--warn)' } : undefined} data-stale={stale ? '' : undefined}>
      <i key={receivedAt ?? 0} className="beat" />{stale ? `갱신 지연 · ${age}초 전 수신` : `${time(snap.at)} 갱신`}
    </span></div>;
}
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const items = NAV.map(([href, label, icon]) => { const on = href === '/' ? path === '/' : path.startsWith(href); return <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-colors max-md:flex-col max-md:gap-0.5 max-md:px-2 max-md:py-1.5 max-md:text-[11px]', on ? 'font-semibold' : 'ink2 hover:text-[color:var(--ink)]')} style={on ? { background: 'var(--glass-hi)', boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink)' } : undefined}><span aria-hidden style={{ color: on ? 'var(--ice)' : undefined }}>{icon}</span>{label}</Link>; });
  return (
    <SnapshotProvider>
      <SnowField />
      <div className="relative z-[1] min-h-screen md:flex">
        <aside className="glass sticky top-4 z-20 m-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col p-4 md:flex" style={{ borderRadius: 26 }}>
          <div className="mb-6 flex items-center gap-2.5 px-1.5 pt-1"><Snow /><div><p className="text-sm font-semibold leading-tight">WINTERLIGHT</p><p className="text-[11px] ink2">클라우드 관제실</p></div></div>
          <nav className="flex flex-col gap-1">{items}</nav>
          <p className="mt-auto px-2 text-[11px] leading-relaxed ink2">원본 서비스를 수정하지 않는 읽기 전용 모니터링입니다.</p>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 backdrop-blur-xl md:px-8" style={{ borderBottom: '1px solid var(--line)', background: 'color-mix(in srgb, var(--bg0) 55%, transparent)' }}>
            <span className="flex items-center gap-2 md:hidden"><Snow /><b className="text-sm">WINTERLIGHT OPS</b></span><span className="hidden text-sm ink2 md:block">moru-winter-park</span><Theme />
          </header>
          <Banner />
          <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
        </div>
        <nav className="glass fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-1 p-1.5 md:hidden" style={{ borderRadius: 22 }}>{items}</nav>
      </div>
    </SnapshotProvider>
  );
}
