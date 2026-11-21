'use client';
import { useId, type CSSProperties } from 'react';

const W = 120, H = 36, PAD = 3;

/** Catmull-Rom → 베지어. 점 개수가 같으면 path 명령 구조가 같아 CSS `d` 전환이 부드럽게 이어진다. */
function smooth(pts: number[][]): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** 카드 안의 작은 추세선. 마지막 점이 숨 쉬듯 반짝여 '지금'을 가리킨다. */
export function Spark({ values, color = 'var(--ice)' }: { values: number[]; color?: string }) {
  const gid = useId();
  const step = Math.max(1, Math.ceil(values.length / 48)), v = values.filter((_, i) => (values.length - 1 - i) % step === 0);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * W, PAD + (1 - (x - min) / span) * (H - PAD * 2)]);
  const line = smooth(pts), area = `${line} L${W},${H} L0,${H} Z`, last = pts[pts.length - 1];
  const css = (d: string) => ({ d: `path("${d}")` }) as CSSProperties;
  return (
    <div aria-hidden className="reveal relative mt-3 h-9 w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".32" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path className="spark-path" d={area} style={css(area)} fill={`url(#${gid})`} />
        <path className="spark-path" d={line} style={css(line)} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="spark-dot" style={{ top: `${(last[1] / H) * 100}%`, background: color }} />
    </div>
  );
}
