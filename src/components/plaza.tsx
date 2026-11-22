'use client';
import { useEffect, useRef, useState } from 'react';
import type { M } from '@/lib/types';

/**
 * 광장: 수용 인원만큼의 점 중 접속자 수만큼 켠다. 점 하나가 방문자 한 명이다.
 * 값이 없으면 모두 꺼 두고(빈 격자), 숫자를 지어내지 않는다.
 * 접속자가 늘면 새 점이 한 번 튀어 오르고, 줄면 꺼지는 점에 잔상이 남는다. 그 밖에는 움직이지 않는다.
 */
export function Plaza({ visitors, capacity }: { visitors: M; capacity: M }) {
  const cap = capacity.value ?? 100, on = Math.min(cap, Math.max(0, visitors.value ?? 0)), prev = useRef(on);
  const [delta, setDelta] = useState<{ lo: number; hi: number; kind: 'join' | 'leave' } | null>(null);
  useEffect(() => {
    if (prev.current === on) return;
    setDelta({ lo: Math.min(prev.current, on), hi: Math.max(prev.current, on), kind: on > prev.current ? 'join' : 'leave' });
    prev.current = on;
    const t = setTimeout(() => setDelta(null), 1300);
    return () => clearTimeout(t);
  }, [on]);
  return (
    <div role="img" aria-label={visitors.value == null ? '접속자 수를 아직 받지 못했습니다' : `수용 ${cap}명 중 ${on}명 접속`} className="grid max-w-[26rem] gap-[4px]" style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}>
      {Array.from({ length: cap }, (_, i) => {
        const lit = i < on, changed = delta && i >= delta.lo && i < delta.hi;
        return <i key={i} data-lit={lit ? '' : undefined} className={`plaza-dot aspect-square rounded-full ${lit ? 'on' : ''} ${changed ? delta.kind : ''}`}
          style={{ '--c': 'var(--accent)', background: lit ? 'var(--accent)' : 'var(--line)' } as React.CSSProperties} />;
      })}
    </div>
  );
}
