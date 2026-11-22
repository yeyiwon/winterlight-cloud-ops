'use client';
import Link from 'next/link';
import { Legend, Series } from '@/components/charts';
import { Plaza } from '@/components/plaza';
import type { Point } from '@/lib/types';
import { MonitorAlerts, ProbeAlert, ServiceTable } from '@/components/probes';
import { Page } from '@/components/provider';
import { Empty, Metric, Provenance, Reason, SrcBadge, Val, dt, time } from '@/components/ui';

const EV = { outage: 'down', recovery: 'ok', deploy: '', reset: 'warn', anomaly: 'warn' } as const;
export default function Overview() {
  return (
    <Page title="개요" desc="지금 WINTERLIGHT가 정상인지, 무엇이 바뀌었는지, 무엇을 측정하지 못하는지 확인합니다.">
      {(s) => { const o = s.overview, live = s.mode === 'live', sp = (k: keyof Point) => { const v = s.series.points.map((p) => p[k]).filter((x): x is number => x != null); return v.length > 1 ? v : undefined; };
        const ser = [{ key: 'visitors', label: '접속자(명)', color: 'var(--accent)' }, live ? { key: 'api', label: 'API 응답(ms)', color: 'var(--pink)' } : { key: 'p95', label: 'P95(ms)', color: 'var(--pink)' }];
        const events = s.monitor.timeline.slice(0, 6); return <>
        <MonitorAlerts s={s} />
        <ProbeAlert s={s} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="panel overflow-hidden">
            <div className="panel-head"><h3>서비스 상태</h3><span className="text-xs ink2">배포 버전 <b className="code text-[color:var(--ink)]">{o.revision.value ?? '미확인'}</b></span></div>
            <ServiceTable s={s} />
            {o.revision.note && <p className="border-t rule px-4 py-2 text-xs ink2">{o.revision.note}</p>}
          </section>
          <section className="panel">
            <div className="panel-head"><h3>지금 광장에 있는 방문자</h3><SrcBadge src={o.visitors.src} note={o.visitors.note} /></div>
            <div className="space-y-3 p-4">
              <div className="flex items-baseline justify-between gap-3"><Val m={o.visitors} unit="명" className="text-5xl" />{o.capacity.value != null && <span className="text-xs ink2">수용 {o.capacity.value}명</span>}</div>
              <Plaza visitors={o.visitors} capacity={o.capacity} />
              {o.visitors.value != null && live && o.visitors.note && <p className="text-xs ink2">{o.visitors.note}</p>}
              <Provenance m={o.visitors} />
            </div>
          </section>
        </div>
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border rule lg:grid-cols-5" style={{ background: 'var(--line)' }} aria-label="핵심 지표">
          {([['활성 WebSocket', o.sockets, '개', 0, sp('sockets')], ['API 평균 응답', o.avg, 'ms', 1, sp(live ? 'api' : 'avg')], ['API P95 응답', o.p95, 'ms', 1, undefined], ['분당 요청', o.rpm, 'rpm', 0, sp('rpm')], ['Workers 오류율', o.err, '%', 2, undefined]] as const).map(([label, m, unit, digits, spark], i) =>
            <Metric key={label} label={label} m={m} unit={unit} digits={digits} spark={spark ? [...spark] : undefined} tint="var(--accent)" className={i === 4 ? 'max-lg:col-span-2' : undefined} />)}
        </section>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="panel">
            <div className="panel-head"><h3>{live ? '접속자와 API 응답 시간' : '최근 30분 접속자와 응답 시간'}</h3><SrcBadge src={s.series.src} /></div>
            <div className="p-4">{s.series.points.length ? <><Legend series={ser} /><Series data={s.series.points as never} fmt={time} demo={s.series.src === 'demo'} series={ser} />{live && <p className="mt-2 text-[11px] ink3">접속자는 실시간 Worker /metrics, API 응답은 WINTERLIGHT /api/health 왕복. 표본 {s.series.points.length}개, {s.monitor.intervalMs / 1000}초 간격.</p>}</> : <Empty src={s.series.src}>첫 수집이 끝나면 그래프가 그려집니다.</Empty>}</div>
          </section>
          <section className="panel">
            <div className="panel-head"><h3>최근 사건</h3><Link href="/incidents" className="text-xs underline ink2">장애 화면에서 전체 보기</Link></div>
            {events.length ? <ol className="divide-y divide-[color:var(--line)]">{events.map((e, n) => <li key={`${e.at}-${n}`} className="grid grid-cols-[.8rem_1fr_auto] gap-x-2.5 px-4 py-2.5 text-sm"><i aria-hidden className={`dot mt-1.5 ${EV[e.kind]}`} /><div className="min-w-0"><b className="font-medium">{e.title}</b><p className="text-xs ink2">{e.detail}</p></div><span className="text-xs tabular-nums ink3">{dt(e.at)}</span></li>)}</ol>
              : <div className="p-4"><Empty src={live ? 'live' : 'demo'}>{live ? `모니터를 시작한 ${dt(s.monitor.startedAt)} 이후 장애, 복구, 배포 변경이 없습니다.` : '기록된 사건이 없습니다.'}</Empty></div>}
          </section>
        </div>
        {o.status.value == null && <Reason m={o.status} />}
      </>; }}
    </Page>
  );
}
