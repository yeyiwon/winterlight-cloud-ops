'use client';
import Link from 'next/link';
import { Legend, Series } from '@/components/charts';
import { Plaza } from '@/components/plaza';
import type { Point } from '@/lib/types';
import { ProbeAlert } from '@/components/probes';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, Reason, Status, Stat, Val, dt, time } from '@/components/ui';

export default function Overview() {
  return (
    <Page title="개요" desc="WINTERLIGHT 전체 서비스 상태를 한눈에 확인합니다.">
      {(s) => { const o = s.overview, inc = s.incidents.items.slice(0, 3), sp = (k: keyof Point) => (s.series.points.length ? s.series.points.map((p) => p[k]) : undefined); return <>
        <ProbeAlert s={s} />
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" lift={false}>
            <CardHead title="지금 광장에 있는 방문자" src={o.visitors.src} note={o.visitors.note} />
            <div className="grid items-center gap-6 sm:grid-cols-[1fr_minmax(0,15rem)]">
              <div className="space-y-3"><Val m={o.visitors} unit="명" className="text-7xl" />{o.capacity.value != null && <p className="text-sm ink2">수용 {o.capacity.value}명 · 점 하나가 방문자 한 명입니다</p>}</div>
              <Plaza visitors={o.visitors} capacity={o.capacity} />
            </div>
          </Card>
          <Card className="space-y-4"><CardHead title="전체 서비스 상태" /><Status m={o.status} />
            <dl className="space-y-3 text-sm"><div><dt className="ink2">현재 배포 버전</dt><dd className="mt-1 break-all font-mono text-xs">{o.revision.value ?? <Reason m={o.revision} />}</dd></div><div><dt className="ink2">최근 장애</dt><dd className="mt-1">{s.incidents.items.some((i) => i.status === 'open') ? '진행 중인 장애가 있습니다' : s.incidents.src === 'unavailable' ? '수집원 없음' : '진행 중인 장애 없음'}</dd></div></dl></Card>
        </div>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-5">
          <Stat label="WebSocket" m={o.sockets} unit="개" spark={sp('sockets')} tint="var(--ice)" /><Stat label="분당 요청" m={o.rpm} unit="rpm" spark={sp('rpm')} tint="var(--lav)" />
          <Stat label="평균 응답" m={o.avg} unit="ms" digits={1} spark={sp('avg')} tint="var(--ice)" /><Stat label="P95 응답" m={o.p95} unit="ms" digits={1} spark={sp('p95')} tint="var(--pink)" /><Stat label="오류율" m={o.err} unit="%" digits={2} spark={sp('err')} tint="var(--lav)" />
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" lift={false}><CardHead title="최근 30분 · 접속자와 응답 시간" src={s.series.src} />
            {s.series.points.length ? <><Legend series={[{ key: 'visitors', label: '접속자', color: 'var(--ice)' }, { key: 'p95', label: 'P95(ms)', color: 'var(--pink)' }]} /><Series data={s.series.points as never} fmt={time} demo={s.series.src === 'demo'} series={[{ key: 'visitors', label: '접속자', color: 'var(--ice)' }, { key: 'p95', label: 'P95(ms)', color: 'var(--pink)' }]} /></> : <Empty src={s.series.src}>시계열 수집원이 연결되면 표시됩니다.</Empty>}</Card>
          <Card lift={false}><CardHead title="최근 장애 이벤트" src={s.incidents.src} right={<Link href="/incidents" className="text-xs underline ink2">전체</Link>} />
            {inc.length ? <ul className="space-y-3">{inc.map((i) => <li key={i.id} className="text-sm"><div className="flex items-center gap-2"><i className={`dot ${i.status === 'open' ? 'down' : 'ok'}`} /><b>{i.feature}</b><span className="ml-auto text-xs ink2">{dt(i.at)}</span></div><p className="mt-0.5 pl-4 text-xs ink2">{i.detail}</p></li>)}</ul> : <Empty src={s.incidents.src}>{s.incidents.src === 'unavailable' ? '자동 수집원이 없어 표시할 수 없습니다.' : '최근 장애가 없습니다.'}</Empty>}</Card>
        </div></>; }}
    </Page>
  );
}
