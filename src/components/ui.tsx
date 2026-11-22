'use client';
import clsx, { type ClassValue } from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import type { Health, M, Src } from '@/lib/types';
import { Spark } from './spark';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const dt = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const SRC: Record<Src, [string, string]> = { demo: ['DEMO', 'chip-demo'], live: ['LIVE', 'chip-live'], 'needs-integration': ['연동 필요', 'chip-na'], unavailable: ['측정 불가', 'chip-un'] };
export const SrcBadge = ({ src, note }: { src: Src; note?: string }) => <span title={note} className={cn('chip', SRC[src][1])}>{SRC[src][0]}</span>;

/** Live 값의 출처와 측정 시각. 실측 수치 아래에 항상 붙는다. */
export const Provenance = ({ m, className }: { m: M<unknown>; className?: string }) => (m.src === 'live' && (m.from || m.at) ? (
  <p data-provenance className={cn('text-[11px] leading-snug ink3', className)}>{m.from}{m.from && m.at ? ', ' : ''}{m.at ? `${time(m.at)} 측정` : null}</p>
) : null);

/** 단색 패널. lift는 이전 API 호환용으로 받기만 한다(호버 장식 없음). */
export function Card({ className, children }: { className?: string; children: ReactNode; lift?: boolean }) {
  return <section className={cn('panel p-4', className)}>{children}</section>;
}
export const CardHead = ({ title, src, note, right }: { title: string; src?: Src; note?: string; right?: ReactNode }) => (
  <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[.9rem] font-semibold">{title}</h3><span className="flex items-center gap-2">{right}{src && <SrcBadge src={src} note={note} />}</span></header>
);

export function AnimatedNumber({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const [shown, setShown] = useState(value), from = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null), seen = useRef(+value.toFixed(digits));
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches, start = performance.now(), a = from.current;
    if (reduce || a === value) { from.current = value; setShown(value); return; }
    let raf = 0;
    const tick = (n: number) => { const p = Math.min(1, (n - start) / 500), e = 1 - Math.pow(1 - p, 3); from.current = a + (value - a) * e; setShown(from.current); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  useEffect(() => {
    const r = +value.toFixed(digits);
    if (r === seen.current) return;
    const dir = r > seen.current ? 'up' : 'down';
    seen.current = r; setFlash(dir);
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [value, digits]);
  return <span data-flash={flash ?? undefined} className={cn('num', flash && `flash-${flash}`, className)}>{shown.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

/** 값이 없으면 숫자 대신 사유를 보여준다. */
export const Reason = ({ m }: { m: M<unknown> }) => <span className="inline-flex flex-col items-start gap-1"><SrcBadge src={m.src} note={m.note} />{m.note && <span className="max-w-[18rem] text-xs ink2">{m.note}</span>}</span>;
export function Val({ m, digits = 0, unit, className = 'text-3xl' }: { m: M; digits?: number; unit?: string; className?: string }) {
  if (m.value == null) return <Reason m={m} />;
  return <span className="inline-flex items-baseline gap-1"><AnimatedNumber value={m.value} digits={digits} className={className} />{unit && <span className="text-xs ink2">{unit}</span>}</span>;
}

/** 지표 한 칸(띠 안에서 쓰는 비카드형). 라벨 · 값 · 근거 순서. */
export function Metric({ label, m, digits, unit, spark, tint, className }: { label: string; m: M; digits?: number; unit?: string; spark?: number[]; tint?: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 px-4 py-3', className)} style={{ background: 'var(--surface)' }}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium ink2">{label}</span>{m.value != null && <SrcBadge src={m.src} note={m.note} />}</div>
      <Val m={m} digits={digits} unit={unit} className="text-2xl" />
      {m.value != null && spark && spark.length > 1 && <Spark values={spark} color={tint} />}
      {m.value != null && m.src === 'live' && m.note && <p className="text-[11px] leading-snug ink2">{m.note}</p>}
      <Provenance m={m} />
    </div>
  );
}
/** 패널형 지표. 페이지에 지표가 몇 개 없을 때만 쓴다. */
export function Stat(props: { label: string; m: M; digits?: number; unit?: string; hint?: string; spark?: number[]; tint?: string }) {
  return <section className="panel"><Metric {...props} /></section>;
}

const H: Record<Health | 'unknown', [string, string]> = { ok: ['정상', 'ok'], warn: ['주의', 'warn'], down: ['장애', 'down'], unknown: ['미확인', 'unknown'] };
/** 상태 표지. 색·모양·글자로 함께 말하고, 바뀌는 순간에만 파문이 한 번 퍼진다. */
export function Mark({ h, label, ripple }: { h: Health | 'unknown'; label?: string; ripple?: number }) {
  return <span className={cn('inline-flex items-center gap-1.5 font-semibold', `tone-${H[h][1]}`)}><span className="relative inline-grid"><i aria-hidden className={cn('mark', H[h][1])} />{ripple ? <i key={ripple} aria-hidden className={cn('ripple', H[h][1])} /> : null}</span>{label ?? H[h][0]}</span>;
}
export function Status({ m, compact }: { m: M<Health>; compact?: boolean }) {
  const prev = useRef(m.value), [tick, setTick] = useState(0);
  useEffect(() => { if (prev.current !== m.value) { if (prev.current != null && m.value != null) setTick((t) => t + 1); prev.current = m.value; } }, [m.value]);
  const h: Health | 'unknown' = m.value ?? 'unknown', label = m.value == null ? (m.src === 'needs-integration' ? '설정 필요' : '미확인') : undefined;
  return (
    <span className="inline-flex flex-col items-start gap-1" data-health={m.value ?? 'unknown'}>
      <span className="inline-flex items-center gap-2 text-sm"><Mark h={h} label={label} ripple={tick} />{!compact && <SrcBadge src={m.src} note={m.note} />}</span>
      {!compact && m.note && <span className="max-w-[26rem] text-xs ink2">{m.note}</span>}
      {!compact && <Provenance m={m} />}
    </span>
  );
}
export const Empty = ({ src, children }: { src: Src; children: ReactNode }) => <div className="flex min-h-20 flex-col items-start justify-center gap-2 text-sm ink2"><SrcBadge src={src} /><p className="max-w-[36rem]">{children}</p></div>;
