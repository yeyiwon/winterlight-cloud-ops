'use client';
import { useState } from 'react';
import { CATEGORY_LABEL } from '@/lib/probe';
import type { ProbeCategory, Snapshot } from '@/lib/types';
import { Page } from '@/components/provider';
import { Empty, Mark, SrcBadge, dt, time } from '@/components/ui';

const EV = { outage: ['시작', 'down'], recovery: ['복구', 'ok'], deploy: ['배포', 'unknown'], reset: ['재시작', 'warn'], anomaly: ['이상', 'warn'] } as const;
type Cat = ProbeCategory | 'all';
const CATS: Cat[] = ['all', 'outage', 'auth', 'network', 'unmeasured'];

function Seg<T extends string>({ label, value, options, onChange, count }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; count?: (v: T) => number }) {
  return <div role="group" aria-label={label} className="seg">{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}{count && <span className="ml-1 tabular-nums ink3">{count(v)}</span>}</button>)}</div>;
}

function IncidentList({ s }: { s: Snapshot }) {
  const [cat, setCat] = useState<Cat>('all'), [st, setSt] = useState<'all' | 'open' | 'resolved'>('all');
  const live = s.mode === 'live', all = s.incidents.items, match = (c: Cat, x: typeof all[number]) => c === 'all' || x.category === c;
  const items = all.filter((x) => match(cat, x) && (st === 'all' || x.status === st));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head flex-wrap"><h3>장애 기록</h3><SrcBadge src={s.incidents.src} /></div>
      {all.length > 0 && <div className="flex flex-wrap gap-3 border-b rule px-4 py-2.5">
        <Seg label="원인 분류" value={cat} onChange={setCat} options={CATS.map((c) => [c, c === 'all' ? '전체' : CATEGORY_LABEL[c]])} count={(c) => all.filter((x) => match(c, x)).length} />
        <Seg label="진행 상태" value={st} onChange={setSt} options={[['all', '전체'], ['open', '진행 중'], ['resolved', '해결됨']]} />
      </div>}
      {items.length === 0 ? <div className="p-4"><Empty src={s.incidents.src}>{all.length ? '이 조건에 맞는 장애가 없습니다.' : live ? `모니터를 시작한 ${dt(s.monitor.startedAt)} 이후 연속 ${s.monitor.failThreshold}회 이상 실패한 점검이 없습니다.` : '기록된 장애가 없습니다.'}</Empty></div> :
        <ul className="divide-y divide-[color:var(--line)]">{items.map((i) => { const h = i.status === 'resolved' ? 'ok' : i.category && i.category !== 'outage' ? 'warn' : 'down', dep = s.deploys.items.find((d) => d.rev === i.deploy), gap = dep ? Math.round((i.at - dep.at) / 60000) : null;
          return <li key={i.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Mark h={h} label={i.status === 'open' ? '진행 중' : '해결됨'} /><b>{i.feature}</b>{i.category && <span className="chip">{CATEGORY_LABEL[i.category]}</span>}<span className="code text-xs ink2">{i.route} · {i.code}</span><span className="ml-auto text-xs tabular-nums ink2">{dt(i.at)}{i.resolvedAt ? ` → ${dt(i.resolvedAt)}` : ''}</span></div>
            <p className="mt-1.5 text-sm">{i.detail}</p>
            <p className="mt-0.5 text-xs ink2">{[i.fails ? `연속 실패 ${i.fails}회` : null, i.resolvedAt ? `지속 ${Math.max(1, Math.round((i.resolvedAt - i.at) / 60000))}분` : null, i.deploy ? (gap != null ? `배포 ${i.deploy} 이후 ${gap}분 만에 발생` : `관련 배포 ${i.deploy}`) : null].filter(Boolean).join(', ') || '관련 배포 정보 없음'}</p></li>; })}</ul>}
    </section>
  );
}

export default function Incidents() {
  return (
    <Page title="장애" desc="장애가 언제 시작되고 복구됐는지, 무엇이 바뀌었는지, 수집이 왜 실패했는지 봅니다. 오류 기록에는 메시지 본문, IP, 사용자 식별자를 담지 않습니다.">
      {(s) => { const live = s.mode === 'live', m = s.monitor; return <>
        <IncidentList s={s} />
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel"><div className="panel-head"><h3>타임라인</h3><SrcBadge src={live ? 'live' : 'demo'} /></div>
            {m.timeline.length ? <ol className="divide-y divide-[color:var(--line)]">{m.timeline.map((e, n) => <li key={`${e.at}-${n}`} className="grid grid-cols-[auto_1fr] gap-x-3 px-4 py-2.5 text-sm"><span className="text-xs tabular-nums ink2">{dt(e.at)}</span><div><div className="flex flex-wrap items-center gap-2"><Mark h={EV[e.kind][1]} label={EV[e.kind][0]} /><b className="font-medium">{e.title}</b></div><p className="mt-0.5 text-xs ink2">{e.detail}</p></div></li>)}</ol>
              : <div className="p-4"><Empty src={live ? 'live' : 'demo'}>아직 기록된 사건이 없습니다. 장애 시작과 복구, 배포 버전 변경, 카운터 재시작이 여기에 남습니다.</Empty></div>}</section>
          <section className="panel"><div className="panel-head"><h3>수집 실패 로그</h3><span className="flex items-center gap-2 text-xs ink2">{m.failures.length}건<SrcBadge src={live ? 'live' : 'demo'} /></span></div>
            {m.failures.length ? <div className="max-h-[28rem] overflow-auto"><table className="table text-sm"><thead className="sticky top-0" style={{ background: 'var(--surface)' }}><tr><th scope="col">시각</th><th scope="col">점검</th><th scope="col">분류</th><th scope="col">내용</th></tr></thead><tbody>{m.failures.map((f, n) => <tr key={`${f.at}-${n}`}><td className="text-xs tabular-nums ink2">{time(f.at)}</td><td className="min-w-[9rem] text-xs font-medium">{f.label}</td><td className="whitespace-nowrap text-xs"><Mark h={f.category === 'outage' ? 'down' : 'warn'} label={CATEGORY_LABEL[f.category]} /></td><td className="text-xs ink2">{f.detail}</td></tr>)}</tbody></table></div>
              : <div className="p-4"><Empty src={live ? 'live' : 'demo'}>{live ? '수집 실패가 없습니다.' : 'DEMO 모드는 원본을 호출하지 않아 실패 기록이 없습니다.'}</Empty></div>}
            <p className="border-t rule px-4 py-2 text-[11px] ink3">기록 시작 {dt(m.startedAt)}. {m.note}</p></section>
        </div></>; }}
    </Page>
  );
}
