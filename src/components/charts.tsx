'use client';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface Ser { key: string; label: string; color: string }

/** 가장 최근 값 위에서 숨 쉬는 점. '지금 이 선이 살아 있다'는 신호다. */
function LiveDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx == null || cy == null) return null;
  return <g data-live-dot><circle className="live-ping" cx={cx} cy={cy} r={4} fill={color} /><circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--glass-hi)" strokeWidth={1.5} /></g>;
}

export function Series({ data, series, height = 220, x = 't', fmt, demo, live = true }: { data: Record<string, number>[]; series: Ser[]; height?: number; x?: string; fmt: (t: number) => string; demo?: boolean; live?: boolean }) {
  const last = data[data.length - 1];
  return (
    <div className="relative" style={{ height }}>
      {demo && <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-5xl font-black opacity-[.07]">DEMO</span>}
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <defs>{series.map((s) => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.16} /><stop offset="100%" stopColor={s.color} stopOpacity={0} /></linearGradient>)}</defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey={x} tickFormatter={fmt} tick={{ fill: 'var(--ink2)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={48} />
          <YAxis tick={{ fill: 'var(--ink2)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} />
          <Tooltip labelFormatter={(v) => fmt(Number(v))} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--ink)', fontSize: 12 }} cursor={{ stroke: 'var(--ink3)', strokeWidth: 1 }} />
          {series.map((s) => <Area key={s.key} dataKey={s.key} name={s.label} type="monotone" stroke={s.color} strokeWidth={1.75} fill={`url(#g-${s.key})`} isAnimationActive animationDuration={800} animationEasing="ease-out" connectNulls dot={false} activeDot={{ r: 5, stroke: 'var(--glass-hi)', strokeWidth: 2, fill: s.color }} />)}
          {live && last && series.map((s) => <ReferenceDot key={`live-${s.key}`} x={last[x]} y={last[s.key]} ifOverflow="visible" shape={((p: { cx?: number; cy?: number }) => <LiveDot cx={p.cx} cy={p.cy} color={s.color} />) as never} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export const Legend = ({ series }: { series: Ser[] }) => <div className="mb-2 flex flex-wrap gap-3 text-xs ink2">{series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><i className="dot" style={{ background: s.color }} />{s.label}</span>)}</div>;
