'use client';
import { useEffect, useRef } from 'react';

/**
 * 아주 옅은 눈송이. 유리 카드 뒤에서 흐려져 프로스티드 질감을 만든다.
 * 모션 줄이기 설정이면 한 장면만 그리고, 탭이 가려지면 멈춘다.
 */
export function SnowField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let w = 0, h = 0, raf = 0, last = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), count = window.innerWidth < 768 ? 20 : 40;
    const flakes = Array.from({ length: count }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.9 + Math.random() * 2.2, v: 7 + Math.random() * 16, ph: Math.random() * Math.PI * 2, k: i % 3 }));
    const size = () => { w = window.innerWidth; h = window.innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const paint = (t: number) => {
      const dark = document.documentElement.dataset.theme !== 'light';
      const tints = dark ? ['215,235,255', '205,190,255', '255,200,225'] : ['70,120,210', '120,90,220', '215,80,130'];
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        const x = f.x * w + Math.sin(t / 2600 + f.ph) * 14, y = f.y * h;
        ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tints[f.k]},${dark ? 0.5 : 0.3})`; ctx.fill();
      }
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
      for (const f of flakes) { f.y += (f.v * dt) / h; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
      paint(t); raf = requestAnimationFrame(frame);
    };
    const start = () => { cancelAnimationFrame(raf); if (reduce.matches || document.hidden) { paint(0); return; } last = performance.now(); raf = requestAnimationFrame(frame); };
    size(); start();
    const onResize = () => { size(); start(); };
    window.addEventListener('resize', onResize); document.addEventListener('visibilitychange', start); reduce.addEventListener('change', start);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', start); reduce.removeEventListener('change', start); };
  }, []);
  return <canvas ref={ref} aria-hidden data-snow className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: 0 }} />;
}
