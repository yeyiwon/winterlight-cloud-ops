'use client';
import { Legend, Series } from '@/components/charts';
import { Plaza } from '@/components/plaza';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, Provenance, Reason, Stat, Status, Val, dt, time } from '@/components/ui';

const KIND = { join: ['입장', 'ok'], leave: ['퇴장', ''], reconnect: ['재연결', 'warn'], rejected: ['거절', 'down'] } as const;
export default function Multiplayer() {
  return (
    <Page title="실시간 멀티플레이" desc="접속자 추이와 WebSocket 연결 품질입니다. 채팅 내용·닉네임·IP 등 개인정보는 수집하지 않습니다.">
      {(s) => { const m = s.multiplayer, o = s.overview, live = s.mode === 'live', ser = [{ key: 'visitors', label: '접속자', color: 'var(--ice)' }, { key: 'sockets', label: 'WebSocket', color: 'var(--lav)' }];
        const ser2 = live ? [{ key: 'msgsIn', label: '수신/초', color: 'var(--pink)' }, { key: 'msgsOut', label: '송신/초', color: 'var(--ice)' }, { key: 'sync', label: 'RTT(ms)', color: 'var(--silver)' }] : [{ key: 'msgs', label: '메시지/3초', color: 'var(--pink)' }, { key: 'sync', label: '동기화 지연(ms)', color: 'var(--silver)' }];
        const has = (k: string) => s.series.points.some((p) => p[k as keyof typeof p] != null), regions = m.regions.value, max = Math.max(1, ...(regions ?? []).map((r) => r.count)); return <>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" lift={false}><CardHead title="지금 접속 중인 방문자" src={o.visitors.src} note={o.visitors.note} />
            <div className="grid items-center gap-6 sm:grid-cols-[1fr_minmax(0,15rem)]"><div className="space-y-2"><Val m={o.visitors} unit="명" className="text-6xl" />{o.capacity.value != null && <p className="text-sm ink2">수용 {o.capacity.value}명 중</p>}<Provenance m={o.visitors} /></div><Plaza visitors={o.visitors} capacity={o.capacity} /></div></Card>
          <Card className="space-y-3"><CardHead title="WebSocket 연결 상태" /><Status m={m.socketState} /></Card>
        </div>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
          <Stat label="활성 WebSocket" m={o.sockets} unit="개" /><Stat label="메시지 처리량" m={m.msgsPerSec} unit="/초" digits={1} />
          <Stat label={live ? 'WebSocket 왕복(RTT)' : '동기화 지연'} m={m.sync} unit="ms" /><Stat label="서버 처리 지연 P95" m={m.handler} unit="ms" digits={2} />
          <Stat label="수신 메시지" m={m.msgsIn} unit="/초" digits={1} /><Stat label="송신 메시지" m={m.msgsOut} unit="/초" digits={1} />
          <Stat label="재연결 (최근 1분)" m={m.reconnects} unit="회" /><Stat label="거절된 메시지 (최근 1분)" m={m.rejected} unit="건" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card lift={false}><CardHead title={live ? '실시간 접속자 추이' : '접속자 추이 (30분)'} src={s.series.src} />{has('visitors') ? <><Legend series={ser} /><Series data={s.series.points as never} series={ser} fmt={time} demo={s.series.src === 'demo'} /><Provenance m={o.visitors} className="mt-2" /></> : <Empty src={live ? o.visitors.src : s.series.src}>{o.visitors.note ?? '실시간 서버의 읽기 전용 지표가 필요합니다.'}</Empty>}</Card>
          <Card lift={false}><CardHead title="메시지 처리량과 왕복 지연" src={s.series.src} />{has(live ? 'msgsIn' : 'msgs') ? <><Legend series={ser2} /><Series data={s.series.points as never} series={ser2} fmt={time} demo={s.series.src === 'demo'} /><Provenance m={m.msgsPerSec} className="mt-2" /></> : <Empty src={live ? m.msgsPerSec.src : s.series.src}>{m.msgsPerSec.note ?? '실시간 서버의 읽기 전용 지표가 필요합니다.'}</Empty>}</Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card lift={false}><CardHead title="구역별 접속자" src={m.regions.src} />{regions ? regions.length ? <><ul className="space-y-3">{regions.map((r) => <li key={r.name} className="text-sm"><div className="mb-1 flex justify-between"><span>{r.name}</span><b className="tabular-nums">{r.count}</b></div><div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.count / max) * 100}%`, background: 'linear-gradient(90deg, var(--ice), var(--lav), var(--pink))' }} /></div></li>)}</ul><Provenance m={m.regions} className="mt-3" /></> : <Empty src={m.regions.src}>지금 연결된 방문자가 없습니다.</Empty> : <Reason m={m.regions} />}</Card>
          <Card lift={false}><CardHead title="접속·종료 이벤트" src={m.events.src} />{m.events.items.length ? <ul className="max-h-72 space-y-2 overflow-auto pr-1 text-sm">{m.events.items.map((e) => <li key={e.id} className="flex items-center gap-2"><i className={`dot ${KIND[e.kind][1]}`} /><span>{KIND[e.kind][0]}</span><span className="ink2">{e.region}</span><span className="ml-auto text-xs tabular-nums ink2">{time(e.at)}</span></li>)}</ul> : <Empty src={m.events.src}>개별 접속 이벤트는 개인 식별을 피하기 위해 수집하지 않습니다. 누적 카운터(재연결·거절)로 대신 봅니다.</Empty>}</Card>
          <Card lift={false}><CardHead title="최대 동시 접속" src={m.peaks.src} />{m.peaks.items.length ? <><ul className="space-y-3 text-sm">{m.peaks.items.map((p) => <li key={p.at} className="flex items-baseline justify-between"><span className="ink2">{dt(p.at)}</span><b className="num text-2xl">{p.visitors}<span className="ml-1 text-xs ink2">명</span></b></li>)}</ul>{live && <p className="mt-3 text-[11px] ink2">모니터 시작({dt(s.monitor.startedAt)}) 이후 수집한 표본 기준</p>}</> : <Empty src={m.peaks.src}>접속자 표본이 쌓이면 표시됩니다.</Empty>}</Card>
        </div></>; }}
    </Page>
  );
}
