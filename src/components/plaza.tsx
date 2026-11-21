'use client';
import { useEffect, useRef, useState } from 'react';
import type { M } from '@/lib/types';

const COLORS = ['var(--ice)', 'var(--lav)', 'var(--pink)', 'var(--silver)'];

/**
 * 수용 인원만큼의 점 중 접속자 수만큼 켠다. 값이 없으면 모두 꺼 둔다.
 * 접속자가 늘면 새 점이 튀어 오르며 켜지고, 줄면 꺼지는 점에 빛 잔상이 남는다.
 */
export function Plaza({ visitors, capacity }: { visitors: M; capacity: M }) {
  const cap = capacity.value ?? 100, on = Math.min(cap, Math.max(0, visitors.value ?? 0)), prev = useRef(on);
  const [delta, setDelta] = useState<{ lo: number; hi: number; kind: 'join' | 'leave' } | null>(null);
  useEffect(() => {
    if (prev.current === on) return;
    setDelta({ lo: Math.min(prev.current, on), hi: Math.max(prev.current, on), kind: on > prev.current ? 'join' : 'leave' });
    prev.current = on;
    const t = setTimeout(() => setDelta(null), 1500);
    return () => clearTimeout(t);
  }, [on]);
  return (
    <div role="img" aria-label={visitors.value == null ? '접속자 수 연동 필요' : `수용 ${cap}명 중 ${on}명 접속`} className="grid gap-2" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}>
      {Array.from({ length: cap }, (_, i) => {
        const lit = i < on, changed = delta && i >= delta.lo && i < delta.hi, c = COLORS[i % 4];
        return <i key={i} data-lit={lit ? '' : undefined} className={`plaza-dot aspect-square rounded-full ${lit ? 'on' : ''} ${changed ? delta.kind : ''}`}
          style={{ '--c': c, background: lit ? c : 'var(--line)', opacity: lit ? 0.95 : 0.55, animationDelay: lit && !changed ? `${(i % 11) * 0.31}s` : undefined, boxShadow: lit ? `0 0 10px ${c}` : undefined } as React.CSSProperties} />;
      })}
    </div>
  );
}
