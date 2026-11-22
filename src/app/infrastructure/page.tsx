'use client';
import { useEffect } from 'react';
import { Legend, Series } from '@/components/charts';
import { MonitorCard, ProbeTable } from '@/components/probes';
import { Page } from '@/components/provider';
import { Empty, Metric, SrcBadge, Status, dt } from '@/components/ui';

/** 개요의 서비스 행에서 #probe-… 로 들어오면 해당 점검으로 스크롤한다(하이드레이션 뒤 요소가 생긴다). */
function ScrollToHash() {
  useEffect(() => { const id = location.hash.slice(1); if (!id) return; const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }), 50); return () => clearTimeout(t); }, []);
  return null;
}

export default function Infra() {
  return (
    <Page title="인프라" desc="Vercel 프런트엔드, Sites API와 D1, Cloudflare 실시간 Worker의 상태와 원본 연결 점검 결과입니다.">
      {(s) => { const i = s.infra, hs = [['Sites API Worker', '/api/health', i.workers], ['D1 데이터베이스', '/api/health의 SELECT 1', i.d1], ['실시간 Worker·Durable Object', 'Cloudflare /health', i.realtime], ['Vercel 프런트엔드', '/release.json', i.vercel]] as const;
        const ser = [{ key: 'workers', label: 'Workers 요청', color: 'var(--accent)' }, { key: 'doReq', label: 'DO 요청', color: 'var(--lav)' }]; return <>
        <ScrollToHash />
        <section className="grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border rule sm:grid-cols-2 xl:grid-cols-4" style={{ background: 'var(--line)' }} aria-label="구성 요소 상태">
          {hs.map(([n, via, m]) => <div key={n} className="space-y-1.5 px-4 py-3" style={{ background: 'var(--surface)' }}><p className="text-sm font-semibold">{n}</p><p className="text-[11px] ink3">근거: {via}</p><Status m={m} /></div>)}
        </section>
        <ProbeTable s={s} />
        <MonitorCard s={s} />
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border rule lg:grid-cols-3" style={{ background: 'var(--line)' }} aria-label="사용량 지표">
          <Metric label="Durable Object 요청" m={i.doReq} unit="건" /><Metric label="DO 메시지 누적" m={i.doMsgs} unit="건" /><Metric label="D1 읽기 행" m={i.d1Reads} unit="행" />
          <Metric label="D1 쓰기 행" m={i.d1Writes} unit="행" /><Metric label="D1 저장 용량" m={i.d1Storage} unit="MB" digits={1} /><Metric label="Vercel 전송량" m={i.bandwidth} unit="GB" digits={2} />
        </section>
        <section className="panel"><div className="panel-head"><h3>시간별 요청 (최근 24시간)</h3><SrcBadge src={s.series.hourly.length ? s.series.src : s.mode === 'live' ? 'needs-integration' : s.series.src} /></div>
          <div className="p-4">{s.series.hourly.length ? <><Legend series={ser} /><Series data={s.series.hourly as never} series={ser} fmt={(t) => `${new Date(t).getHours()}시`} demo={s.series.src === 'demo'} /></> : <Empty src="needs-integration">Cloudflare 읽기 전용 토큰(Account Analytics: Read)을 연결하면 시간별 요청이 표시됩니다.</Empty>}</div></section>
        <section className="panel overflow-hidden"><div className="panel-head"><h3>배포 이력</h3><SrcBadge src={s.deploys.src} /></div>
          {s.deploys.items.length ? <table className="table text-sm"><thead><tr><th scope="col">대상</th><th scope="col">커밋</th><th scope="col">상태</th><th scope="col" className="text-right">시각</th></tr></thead><tbody>{s.deploys.items.map((d) => <tr key={d.id}><td className="font-medium">{d.target}</td><td className="code text-xs">{d.rev}</td><td><span className={`chip ${d.state === 'READY' ? 'chip-live' : d.state === 'ERROR' ? 'chip-demo' : ''}`}>{d.state}</span></td><td className="text-right text-xs tabular-nums ink2">{dt(d.at)}</td></tr>)}</tbody></table>
            : <div className="p-4"><Empty src={s.deploys.src}>Vercel 읽기 전용 토큰(VERCEL_TOKEN)을 설정하면 moru-winter-park 배포 이력이 표시됩니다. 5분에 한 번만 조회합니다.</Empty></div>}
          {s.deploys.src === 'live' && <p className="border-t rule px-4 py-2 text-[11px] ink3">출처 Vercel Deployments API, 5분 캐시</p>}</section>
      </>; }}
    </Page>
  );
}
