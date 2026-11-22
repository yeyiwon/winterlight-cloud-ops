'use client';
import { CATEGORY_LABEL } from '@/lib/probe';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, dt, time } from '@/components/ui';

const EV = { outage: ['장애·수집 실패 시작', 'down'], recovery: ['복구', 'ok'], deploy: ['배포 감지', ''], reset: ['카운터 재시작', 'warn'], anomaly: ['이상 징후', 'warn'] } as const;
export default function Incidents() {
  return (
    <Page title="장애" desc="장애 발생·복구 시각과 배포 이력의 관계를 확인합니다. 오류 상세에는 메시지 본문·IP·사용자 식별자를 담지 않습니다.">
      {(s) => { const live = s.mode === 'live', m = s.monitor; return <>
        <Card lift={false}><CardHead title="장애 기록" src={s.incidents.src} />
          {s.incidents.items.length === 0 ? <Empty src={s.incidents.src}>{live ? `모니터 시작(${dt(m.startedAt)}) 이후 연속 ${m.failThreshold}회 이상 실패한 점검이 없습니다.` : '기록된 장애가 없습니다.'}</Empty> :
            <ul className="space-y-3">{s.incidents.items.map((i) => { const dep = s.deploys.items.find((d) => d.rev === i.deploy), gap = dep ? Math.round((i.at - dep.at) / 60000) : null;
              return <li key={i.id} className="rounded-2xl p-4" style={{ border: '1px solid var(--line)' }}>
                <div className="flex flex-wrap items-center gap-2"><i className={`dot ${i.status === 'open' ? (i.category && i.category !== 'outage' ? 'warn' : 'down') : 'ok'}`} /><b>{i.feature}</b><span className="chip">{i.status === 'open' ? '진행 중' : '해결됨'}</span>{i.category && <span className="chip chip-na">{CATEGORY_LABEL[i.category]}</span>}<code className="text-xs ink2">{i.route} · {i.code}</code><span className="ml-auto text-xs tabular-nums ink2">{dt(i.at)}{i.resolvedAt ? ` → ${dt(i.resolvedAt)}` : ''}</span></div>
                <p className="mt-2 text-sm">{i.detail}</p>
                <p className="mt-1 text-xs ink2">{i.fails ? `연속 실패 ${i.fails}회 · ` : ''}{i.resolvedAt ? `지속 ${Math.max(1, Math.round((i.resolvedAt - i.at) / 60000))}분 · ` : ''}{i.deploy ? (gap != null ? `배포 ${i.deploy} 이후 ${gap}분 만에 발생` : `관련 배포 ${i.deploy}`) : '관련 배포 없음'}</p></li>; })}</ul>}</Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card lift={false}><CardHead title="장애·복구·배포 타임라인" src={live ? 'live' : 'demo'} />
            {m.timeline.length ? <ol className="relative space-y-3 border-l pl-4" style={{ borderColor: 'var(--line)' }}>{m.timeline.map((e, n) => <li key={`${e.at}-${n}`} className="text-sm"><div className="flex flex-wrap items-center gap-2"><i className={`dot ${EV[e.kind][1]}`} style={{ marginLeft: '-1.36rem' }} /><b>{e.title}</b><span className="chip">{EV[e.kind][0]}</span><span className="ml-auto text-xs tabular-nums ink2">{dt(e.at)}</span></div><p className="mt-0.5 text-xs ink2">{e.detail}</p></li>)}</ol> : <Empty src={live ? 'live' : 'demo'}>아직 기록된 사건이 없습니다. 장애 발생·복구, 배포 버전 변경, 카운터 재시작이 여기에 남습니다.</Empty>}</Card>
          <Card lift={false}><CardHead title="지표 수집 실패 로그" src={live ? 'live' : 'demo'} />
            {m.failures.length ? <ul className="max-h-96 space-y-2 overflow-auto pr-1 text-sm">{m.failures.map((f, n) => <li key={`${f.at}-${n}`} className="rounded-xl p-2.5" style={{ border: '1px solid var(--line)' }}><div className="flex flex-wrap items-center gap-2"><i className={`dot ${f.category === 'outage' ? 'down' : 'warn'}`} /><b className="text-xs">{f.label}</b><span className="chip chip-na">{CATEGORY_LABEL[f.category]}</span>{f.status != null && <code className="text-[11px] ink2">HTTP {f.status}</code>}<span className="ml-auto text-[11px] tabular-nums ink2">{time(f.at)}</span></div>{f.detail && <p className="mt-1 pl-4 text-xs ink2">{f.detail}</p>}</li>)}</ul> : <Empty src={live ? 'live' : 'demo'}>{live ? '수집 실패가 없습니다.' : 'DEMO 모드는 원본을 호출하지 않아 실패 로그가 없습니다.'}</Empty>}
            <p className="mt-3 text-[11px] ink2">{m.note}</p></Card>
        </div></>; }}
    </Page>
  );
}
