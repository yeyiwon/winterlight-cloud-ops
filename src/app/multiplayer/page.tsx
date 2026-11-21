'use client';
import { Legend, Series } from '@/components/charts';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, Reason, Stat, dt, time } from '@/components/ui';

const KIND = { join: ['입장', 'ok'], leave: ['퇴장', ''], reconnect: ['재연결', 'warn'], rejected: ['거절', 'down'] } as const;
export default function Multiplayer() {
  return (
    <Page title="실시간 멀티플레이" desc="접속자 추이와 WebSocket 연결 품질입니다. 채팅 내용과 개인정보는 수집하지 않습니다.">
      {(s) => { const m = s.multiplayer, ser = [{ key: 'visitors', label: '접속자', color: 'var(--ice)' }, { key: 'sockets', label: 'WebSocket', color: 'var(--lav)' }], ser2 = [{ key: 'msgs', label: '메시지/3초', color: 'var(--pink)' }, { key: 'sync', label: '동기화 지연(ms)', color: 'var(--silver)' }]; const regions = m.regions.value, max = Math.max(1, ...(regions ?? []).map((r) => r.count)); return <>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4"><Stat label="메시지 처리량" m={m.msgsPerSec} unit="/초" digits={1} /><Stat label="동기화 지연" m={m.sync} unit="ms" /><Stat label="재연결 (최근 1분)" m={m.reconnects} unit="회" /><Stat label="거절된 연결" m={m.rejected} unit="건" /></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card lift={false}><CardHead title="접속자 추이 (30분)" src={s.series.src} />{s.series.points.length ? <><Legend series={ser} /><Series data={s.series.points as never} series={ser} fmt={time} demo={s.series.src === 'demo'} /></> : <Empty src={s.series.src}>실시간 서버의 읽기 전용 지표가 필요합니다.</Empty>}</Card>
          <Card lift={false}><CardHead title="메시지 처리량과 동기화 지연" src={s.series.src} />{s.series.points.length ? <><Legend series={ser2} /><Series data={s.series.points as never} series={ser2} fmt={time} demo={s.series.src === 'demo'} /></> : <Empty src={s.series.src}>서버 측 동기화 지연은 현재 계측되지 않습니다.</Empty>}</Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card lift={false}><CardHead title="구역별 접속자" src={m.regions.src} />{regions ? <ul className="space-y-3">{regions.map((r) => <li key={r.name} className="text-sm"><div className="mb-1 flex justify-between"><span>{r.name}</span><b className="tabular-nums">{r.count}</b></div><div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.count / max) * 100}%`, background: 'linear-gradient(90deg, var(--ice), var(--lav), var(--pink))' }} /></div></li>)}</ul> : <Reason m={m.regions} />}</Card>
          <Card lift={false}><CardHead title="접속·종료 이벤트" src={m.events.src} />{m.events.items.length ? <ul className="max-h-72 space-y-2 overflow-auto pr-1 text-sm">{m.events.items.map((e) => <li key={e.id} className="flex items-center gap-2"><i className={`dot ${KIND[e.kind][1]}`} /><span>{KIND[e.kind][0]}</span><span className="ink2">{e.region}</span><span className="ml-auto text-xs tabular-nums ink2">{time(e.at)}</span></li>)}</ul> : <Empty src={m.events.src}>이벤트 스트림 수집원이 없습니다.</Empty>}</Card>
          <Card lift={false}><CardHead title="동시 접속 부하 기록" src={m.peaks.src} />{m.peaks.items.length ? <ul className="space-y-3 text-sm">{m.peaks.items.map((p) => <li key={p.at} className="flex items-baseline justify-between"><span className="ink2">{dt(p.at)}</span><b className="num text-2xl">{p.visitors}<span className="ml-1 text-xs ink2">명</span></b></li>)}</ul> : <Empty src={m.peaks.src}>최대 접속 기록은 지표 저장소가 생기면 표시됩니다.</Empty>}</Card>
        </div></>; }}
    </Page>
  );
}
