'use client';
import clsx, { type ClassValue } from 'clsx';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import type { Health, M, Src } from '@/lib/types';
import { Spark } from './spark';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
const SRC: Record<Src, [string, string]> = { demo: ['DEMO', 'chip-demo'], live: ['LIVE', 'chip-live'], 'needs-integration': ['연동 필요', 'chip-na'], unavailable: ['측정 불가', 'chip-un'] };
export const SrcBadge = ({ src, note }: { src: Src; note?: string }) => <span title={note} className={cn('chip', SRC[src][1])}>{SRC[src][0]}</span>;

/** lift 카드는 포인터 위치를 CSS 변수로 넘겨 유리 표면의 빛 반사가 따라오게 한다(React 리렌더 없음). */
export function Card({ className, children, lift = true }: { className?: string; children: ReactNode; lift?: boolean }) {
  const move = lift ? (e: PointerEvent<HTMLElement>) => { const t = e.currentTarget, r = t.getBoundingClientRect(); t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`); } : undefined;
  return <section onPointerMove={move} className={cn('glass p-5', lift && 'lift', className)}>{children}</section>;
}
export const CardHead = ({ title, src, note, right }: { title: string; src?: Src; note?: string; right?: ReactNode }) => (
  <header className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold ink2">{title}</h3><span className="flex items-center gap-2">{right}{src && <SrcBadge src={src} note={note} />}</span></header>
);

export function AnimatedNumber({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const [shown, setShown] = useState(value), from = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null), seen = useRef(+value.toFixed(digits));
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches, start = performance.now(), a = from.current;
    if (reduce || a === value) { from.current = value; setShown(value); return; }
    let raf = 0;
    const tick = (n: number) => { const p = Math.min(1, (n - start) / 650), e = 1 - Math.pow(1 - p, 3); from.current = a + (value - a) * e; setShown(from.current); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  // 화면에 보이는 자릿수가 실제로 달라졌을 때만 방향을 알린다. 소수점 아래 흔들림은 무시한다.
  useEffect(() => {
    const r = +value.toFixed(digits);
    if (r === seen.current) return;
    const dir = r > seen.current ? 'up' : 'down';
    seen.current = r; setFlash(dir);
    const t = setTimeout(() => setFlash(null), 1000);
    return () => clearTimeout(t);
  }, [value, digits]);
  return <span data-flash={flash ?? undefined} className={cn('num', flash && `flash-${flash}`, className)}>{shown.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}</span>;
}

/** 값이 없으면 숫자 대신 사유 배지를 보여준다. */
export const Reason = ({ m }: { m: M<unknown> }) => <span className="inline-flex flex-col items-start gap-1"><SrcBadge src={m.src} note={m.note} />{m.note && <span className="max-w-[16rem] text-xs ink2">{m.note}</span>}</span>;
export function Val({ m, digits = 0, unit, className = 'text-4xl' }: { m: M; digits?: number; unit?: string; className?: string }) {
  if (m.value == null) return <Reason m={m} />;
  return <span className="inline-flex items-baseline gap-1.5"><AnimatedNumber value={m.value} digits={digits} className={className} />{unit && <span className="text-sm ink2">{unit}</span>}</span>;
}
/** spark: 같은 지표의 최근 시계열. 시계열 출처가 없으면 넘기지 않는다. */
export function Stat({ label, m, digits, unit, hint, spark, tint }: { label: string; m: M; digits?: number; unit?: string; hint?: string; spark?: number[]; tint?: string }) {
  return <Card className="flex min-h-[8.5rem] flex-col justify-between"><CardHead title={label} src={m.value == null ? undefined : m.src} /><div><Val m={m} digits={digits} unit={unit} />{hint && m.value != null && <p className="mt-2 text-xs ink2">{hint}</p>}{m.value != null && spark && spark.length > 1 && <Spark values={spark} color={tint} />}</div></Card>;
}
const H: Record<Health, [string, string]> = { ok: ['정상', 'ok'], warn: ['주의', 'warn'], down: ['장애', 'down'] };
/** 상태는 점의 숨쉬기 속도로도 구분되고, 바뀌는 순간 파문이 한 번 퍼진다. */
export function Status({ m }: { m: M<Health> }) {
  const prev = useRef(m.value), [tick, setTick] = useState(0);
  useEffect(() => { if (prev.current !== m.value) { if (prev.current != null && m.value != null) setTick((t) => t + 1); prev.current = m.value; } }, [m.value]);
  if (m.value == null) return <span className="inline-flex flex-col items-start gap-1"><SrcBadge src={m.src} note={m.note} />{m.note && <span className="max-w-[24rem] text-xs ink2">{m.note}</span>}</span>;
  const tone = H[m.value][1];
  return (
    <span className="inline-flex flex-col items-start gap-1" data-health={m.value}>
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="relative inline-flex"><i className={cn('dot pulse', tone)} />{tick > 0 && <i key={tick} className={cn('ripple', tone)} />}</span>
        {H[m.value][0]}<SrcBadge src={m.src} note={m.note} />
      </span>
      {m.note && <span className="max-w-[24rem] text-xs ink2">{m.note}</span>}
    </span>
  );
}
export const Empty = ({ src, children }: { src: Src; children: ReactNode }) => <div className="flex min-h-24 flex-col items-start justify-center gap-2 text-sm ink2"><SrcBadge src={src} />{children}</div>;
export const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const dt = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
