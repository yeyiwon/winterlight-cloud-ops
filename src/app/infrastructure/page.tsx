'use client';
import { Legend, Series } from '@/components/charts';
import { MonitorCard, ProbeCard } from '@/components/probes';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, Provenance, SrcBadge, Stat, Status, dt } from '@/components/ui';

export default function Infra() {
  return (
    <Page title="인프라" desc="Cloudflare Workers · Durable Objects · D1 · Vercel 상태와 시간별 지표입니다.">
      {(s) => { const i = s.infra, hs = [['Cloudflare Workers', i.workers], ['실시간 Worker · Durable Object', i.realtime], ['D1 데이터베이스', i.d1], ['Vercel 프런트엔드', i.vercel]] as const;
        const ser = [{ key: 'workers', label: 'Workers 요청', color: 'var(--ice)' }, { key: 'doReq', label: 'DO 요청', color: 'var(--lav)' }]; return <>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">{hs.map(([n, m]) => <Card key={n} className="space-y-3"><p className="text-sm font-semibold ink2">{n}</p><Status m={m} /></Card>)}</div>
        <ProbeCard s={s} />
        <MonitorCard s={s} />
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          <Stat label="Durable Object 요청" m={i.doReq} unit="건" /><Stat label="DO 메시지" m={i.doMsgs} unit="건" /><Stat label="D1 읽기 행" m={i.d1Reads} unit="행" />
          <Stat label="D1 쓰기 행" m={i.d1Writes} unit="행" /><Stat label="D1 저장 용량" m={i.d1Storage} unit="MB" digits={1} /><Stat label="Vercel 전송량" m={i.bandwidth} unit="GB" digits={2} />
        </div>
        <Card lift={false}><CardHead title="시간별 요청 (최근 24시간)" src={s.series.src} />{s.series.hourly.length ? <><Legend series={ser} /><Series data={s.series.hourly as never} series={ser} fmt={(t) => `${new Date(t).getHours()}시`} demo={s.series.src === 'demo'} /></> : <Empty src={s.series.src}>Cloudflare 분석 API 연동 후 시간별 지표가 표시됩니다.</Empty>}</Card>
        <Card lift={false}><CardHead title="배포 이력" src={s.deploys.src} />
          {s.deploys.items.length ? <ul className="divide-y divide-[color:var(--line)]">{s.deploys.items.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm"><b className="w-44">{d.target}</b><code className="text-xs ink2">{d.rev}</code><span className="chip">{d.state}</span><span className="ml-auto text-xs ink2">{dt(d.at)}</span></li>)}</ul> : <Empty src={s.deploys.src}>Vercel 읽기 전용 토큰(VERCEL_TOKEN)을 설정하면 moru-winter-park 배포 이력이 표시됩니다. 5분마다 한 번만 조회합니다.</Empty>}{s.deploys.src === 'live' && <p className="mt-2 text-[11px] ink2">출처 Vercel Deployments API · 5분 캐시</p>}</Card>
        <p className="flex items-center gap-2 text-xs ink2">대시보드 서버에서 잰 /api/health 왕복: {i.probeMs.value == null ? <SrcBadge src={i.probeMs.src} /> : <b>{i.probeMs.value}ms <SrcBadge src={i.probeMs.src} /></b>}</p>
        <Provenance m={i.probeMs} /></>; }}
    </Page>
  );
}
