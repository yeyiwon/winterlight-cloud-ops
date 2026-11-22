'use client';
import { Legend, Series } from '@/components/charts';
import { Plaza } from '@/components/plaza';
import { Page } from '@/components/provider';
import { Empty, Metric, Provenance, Reason, SrcBadge, Status, Val, dt, time } from '@/components/ui';

const KIND = { join: ['입장', 'ok'], leave: ['퇴장', ''], reconnect: ['재연결', 'warn'], rejected: ['거절', 'down'] } as const;
export default function Multiplayer() {
  return (
    <Page title="실시간 멀티플레이" desc="Durable Object의 WebSocket 연결과 메시지 처리 품질입니다. 채팅 내용, 닉네임, IP 같은 개인정보는 수집하지 않습니다.">
      {(s) => { const m = s.multiplayer, o = s.overview, live = s.mode === 'live', ser = [{ key: 'visitors', label: '접속자(명)', color: 'var(--accent)' }];
        const ser2 = live ? [{ key: 'msgsIn', label: '수신/초', color: 'var(--accent)' }, { key: 'msgsOut', label: '송신/초', color: 'var(--lav)' }, { key: 'sync', label: 'RTT(ms)', color: 'var(--pink)' }] : [{ key: 'msgs', label: '메시지/3초', color: 'var(--accent)' }, { key: 'sync', label: '동기화 지연(ms)', color: 'var(--pink)' }];
        const has = (k: string) => s.series.points.some((p) => p[k as keyof typeof p] != null), regions = m.regions.value, max = Math.max(1, ...(regions ?? []).map((r) => r.count)); return <>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="panel"><div className="panel-head"><h3>지금 접속 중인 방문자</h3><SrcBadge src={o.visitors.src} note={o.visitors.note} /></div>
            <div className="grid items-center gap-5 p-4 sm:grid-cols-[auto_1fr]"><div className="space-y-1"><Val m={o.visitors} unit="명" className="text-5xl" />{o.capacity.value != null && <p className="text-xs ink2">수용 {o.capacity.value}명 중</p>}<Provenance m={o.visitors} /></div><Plaza visitors={o.visitors} capacity={o.capacity} /></div></section>
          <section className="panel"><div className="panel-head"><h3>WebSocket 연결 상태</h3></div><div className="p-4"><Status m={m.socketState} /></div></section>
        </div>
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border rule xl:grid-cols-4" style={{ background: 'var(--line)' }} aria-label="연결 품질 지표">
          <Metric label="활성 WebSocket" m={o.sockets} unit="개" /><Metric label="메시지 처리량" m={m.msgsPerSec} unit="/초" digits={1} />
          <Metric label={live ? 'WebSocket 왕복(RTT)' : '동기화 지연'} m={m.sync} unit="ms" /><Metric label="서버 처리 지연 P95" m={m.handler} unit="ms" digits={2} />
          <Metric label="수신 메시지" m={m.msgsIn} unit="/초" digits={1} /><Metric label="송신 메시지" m={m.msgsOut} unit="/초" digits={1} />
          <Metric label="재연결 (최근 1분)" m={m.reconnects} unit="회" /><Metric label="거절된 메시지 (최근 1분)" m={m.rejected} unit="건" />
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel"><div className="panel-head"><h3>{live ? '접속자 추이' : '접속자 추이 (30분)'}</h3><SrcBadge src={has('visitors') ? s.series.src : o.visitors.src} /></div><div className="p-4">{has('visitors') ? <><Legend series={ser} /><Series data={s.series.points as never} series={ser} fmt={time} demo={s.series.src === 'demo'} /></> : <Empty src={o.visitors.src}>{o.visitors.note ?? '실시간 Worker의 /metrics가 필요합니다.'}</Empty>}</div></section>
          <section className="panel"><div className="panel-head"><h3>메시지 처리량과 왕복 지연</h3><SrcBadge src={has(live ? 'msgsIn' : 'msgs') ? s.series.src : m.msgsPerSec.src} /></div><div className="p-4">{has(live ? 'msgsIn' : 'msgs') ? <><Legend series={ser2} /><Series data={s.series.points as never} series={ser2} fmt={time} demo={s.series.src === 'demo'} /></> : <Empty src={m.msgsPerSec.src}>{m.msgsPerSec.note ?? '실시간 Worker의 /metrics가 필요합니다.'}</Empty>}</div></section>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel"><div className="panel-head"><h3>구역별 접속자</h3><SrcBadge src={m.regions.src} /></div><div className="p-4">{regions ? regions.length ? <><ul className="space-y-2.5">{regions.map((r) => <li key={r.name} className="text-sm"><div className="mb-1 flex justify-between"><span className="code text-xs">{r.name}</span><b className="tabular-nums">{r.count}</b></div><div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(r.count / max) * 100}%`, background: 'var(--accent)' }} /></div></li>)}</ul><Provenance m={m.regions} className="mt-3" /></> : <Empty src={m.regions.src}>지금 연결된 방문자가 없습니다.</Empty> : <Reason m={m.regions} />}</div></section>
          <section className="panel"><div className="panel-head"><h3>접속·종료 이벤트</h3><SrcBadge src={m.events.src} /></div><div className="p-4">{m.events.items.length ? <ul className="max-h-72 space-y-1.5 overflow-auto pr-1 text-sm">{m.events.items.map((e) => <li key={e.id} className="flex items-center gap-2"><i className={`dot ${KIND[e.kind][1]}`} /><span>{KIND[e.kind][0]}</span><span className="code text-xs ink2">{e.region}</span><span className="ml-auto text-xs tabular-nums ink3">{time(e.at)}</span></li>)}</ul> : <Empty src={m.events.src}>개별 접속 이벤트는 방문자를 식별할 수 있어 수집하지 않습니다. 재연결·거절 카운터로 대신 봅니다.</Empty>}</div></section>
          <section className="panel"><div className="panel-head"><h3>최대 동시 접속</h3><SrcBadge src={m.peaks.src} /></div><div className="p-4">{m.peaks.items.length ? <><ul className="divide-y divide-[color:var(--line)] text-sm">{m.peaks.items.map((p) => <li key={p.at} className="flex items-baseline justify-between py-2"><span className="text-xs ink2">{dt(p.at)}</span><b className="num text-xl">{p.visitors}<span className="ml-1 text-xs font-normal ink2">명</span></b></li>)}</ul>{live && <p className="mt-2 text-[11px] ink3">모니터를 시작한 {dt(s.monitor.startedAt)} 이후 표본 기준</p>}</> : <Empty src={m.peaks.src}>접속자 표본이 쌓이면 표시됩니다.</Empty>}</div></section>
        </div></>; }}
    </Page>
  );
}
