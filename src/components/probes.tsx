'use client';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { CATEGORY_LABEL, categoryOf } from '@/lib/probe';
import type { Health, Probe, Snapshot } from '@/lib/types';
import { useSnap } from './provider';
import { Mark, SrcBadge, cn, dt, time } from './ui';

const healthOf = (p: Probe): Health | 'unknown' => (p.state === 'ok' ? 'ok' : p.state === 'skipped' ? 'unknown' : categoryOf(p) === 'outage' ? 'down' : 'warn');
const label = (p: Probe) => (p.state === 'ok' ? '정상' : p.state === 'skipped' ? (p.kind ? '설정 필요' : '실행 안 함') : CATEGORY_LABEL[categoryOf(p) ?? 'unmeasured']);
const rev = (r: string | null) => (r ? (r.length === 40 ? r.slice(0, 7) : r) : '—');

/** 점검 하나의 상세. 원인 → 확인할 것 → 기술 정보 순서로, 바로 행동할 수 있게 쓴다. */
function ProbeDetail({ p, lastOk }: { p: Probe; lastOk?: number }) {
  return (
    <div className="grid gap-3 px-4 pb-4 pt-1 text-sm md:grid-cols-[1fr_1fr]">
      <div className="space-y-1.5">
        {p.state !== 'ok' && p.message && <p><b>원인</b> {p.message}</p>}
        {p.state !== 'ok' && p.hint && <p className="ink2"><b className="text-[color:var(--ink)]">확인할 것</b> {p.hint}</p>}
        {p.state === 'ok' && p.fields.length > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">{p.fields.map((f) => <Fragment key={f.key}><dt className="ink2">{f.label}</dt><dd className="font-medium">{f.value}</dd></Fragment>)}</dl>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="ink3">주소</dt><dd className="code break-all">{p.target ?? '설정되지 않음'}</dd>
        <dt className="ink3">점검 시각</dt><dd className="tabular-nums">{p.at ? time(p.at) : '실행 안 함'}</dd>
        <dt className="ink3">마지막 성공</dt><dd className="tabular-nums">{lastOk ? dt(lastOk) : '모니터 시작 후 없음'}</dd>
        <dt className="ink3">연속 실패</dt><dd className="tabular-nums">{p.fails ?? 0}회</dd>
        {p.detail && <><dt className="ink3">기술 정보</dt><dd className="code break-all">{p.detail}</dd></>}
      </dl>
    </div>
  );
}

/** 원본 연결 점검 표. 행을 누르면 상세가 펼쳐진다. 실패 행은 처음부터 펼친다. */
export function ProbeTable({ s }: { s: Snapshot }) {
  const { lastOk } = useSnap();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const ran = s.probes.items.filter((p) => p.state !== 'skipped'), ok = ran.filter((p) => p.state === 'ok').length;
  return (
    <section className="panel overflow-hidden" aria-labelledby="probe-title">
      <div className="panel-head"><h3 id="probe-title">원본 연결 점검</h3><span className="flex items-center gap-2 text-xs ink2">{s.mode === 'live' ? `${ok}/${ran.length || 0}건 성공, ${time(s.at)}` : '실행 안 함'}<SrcBadge src={s.mode === 'mock' ? 'demo' : 'live'} /></span></div>
      <ul>
        {s.probes.items.map((p) => {
          const expanded = open[p.id] ?? p.state === 'fail', seen = p.lastOkAt ?? lastOk[p.id];
          return (
            <li key={p.id} id={`probe-${p.id}`} className="border-b rule last:border-b-0" data-state={p.state} data-kind={p.kind ?? ''}>
              <button type="button" aria-expanded={expanded} aria-controls={`probe-d-${p.id}`} onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))} className="row-btn grid grid-cols-[1rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[1rem_minmax(12rem,1.4fr)_8rem_5rem_6rem_1fr]">
                <span className="caret" aria-hidden>›</span>
                <span className="min-w-0"><b className="text-sm">{p.label}</b></span>
                <span className="text-sm"><Mark h={healthOf(p)} label={label(p)} /></span>
                <span className="hidden text-sm tabular-nums md:block">{p.ms != null ? `${p.ms}ms` : '—'}</span>
                <span className="hidden text-sm md:block">{p.status != null ? `HTTP ${p.status}` : '—'}</span>
                <span className="code hidden truncate text-xs ink2 md:block">{p.revision ? `버전 ${rev(p.revision)}` : ''}</span>
              </button>
              {expanded && <div id={`probe-d-${p.id}`}><ProbeDetail p={p} lastOk={seen} /></div>}
            </li>
          );
        })}
      </ul>
      <p className="border-t rule px-4 py-2.5 text-xs ink2">대시보드 서버가 GET으로만 호출합니다. 실패는 실제 서버 장애, 인증 문제, DNS·네트워크·프록시 제한, 측정 불가로 나눕니다. /metrics에만 서버 간 토큰을 보내며 토큰은 화면에 나오지 않습니다.</p>
    </section>
  );
}

/** 개요용 서비스 상태 표. 각 행은 인프라 화면의 해당 점검 상세로 이어진다. */
export function ServiceTable({ s }: { s: Snapshot }) {
  return (
    <div className="overflow-x-auto">
      <table className="table text-sm">
        <thead><tr><th scope="col">서비스</th><th scope="col">상태</th><th scope="col" className="text-right">응답</th><th scope="col" className="hidden sm:table-cell">버전</th><th scope="col" className="hidden sm:table-cell">마지막 성공</th></tr></thead>
        <tbody>{s.probes.items.map((p) => <tr key={p.id}>
          <td><Link href={`/infrastructure#probe-${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.label}</Link></td>
          <td><Mark h={healthOf(p)} label={label(p)} />{p.fails ? <span className="ml-1.5 text-xs ink2">연속 {p.fails}회</span> : null}</td>
          <td className="text-right tabular-nums">{p.ms != null ? `${p.ms}ms` : '—'}</td>
          <td className="code hidden text-xs sm:table-cell">{rev(p.revision)}</td>
          <td className="hidden tabular-nums text-xs ink2 sm:table-cell">{p.lastOkAt ? time(p.lastOkAt) : p.state === 'skipped' ? '—' : '없음'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

/** 모니터 경보. 장애는 ■와 붉은 선, 주의는 ▲. 회복하면 자동으로 사라진다. */
export function MonitorAlerts({ s }: { s: Snapshot }) {
  if (s.mode !== 'live' || !s.monitor.alerts.length) return null;
  const sorted = [...s.monitor.alerts].sort((a, b) => (a.level === b.level ? a.since - b.since : a.level === 'down' ? -1 : 1));
  return (
    <section role="alert" aria-label="진행 중인 경보" className="panel overflow-hidden">
      {sorted.map((a) => <div key={a.id} className={cn('alert border-b rule last:border-b-0', a.level)}><i aria-hidden className={cn('mark mt-1', a.level)} /><div className="min-w-0 flex-1"><b className="text-sm">{a.title}</b><p className="text-xs ink2">{a.detail}</p></div><span className="text-xs tabular-nums ink2">{dt(a.since)}부터</span></div>)}
    </section>
  );
}

/** 설정이 빠진 점검 안내. 경보가 아니라 해야 할 일이다. */
export function ProbeAlert({ s }: { s: Snapshot }) {
  if (s.mode !== 'live') return null;
  const todo = s.probes.items.filter((p) => p.state === 'skipped');
  if (!todo.length) return null;
  return (
    <section className="panel flex flex-wrap items-start gap-3 p-3.5 text-sm">
      <i aria-hidden className="mark unknown mt-1" />
      <div className="min-w-0 flex-1"><b>설정이 필요한 점검 {todo.length}개</b>{todo.map((p) => <p key={p.id} className="mt-0.5 text-xs ink2">{p.label}: {p.hint ?? p.message}</p>)}</div>
    </section>
  );
}

/** 수집기 자체의 상태. */
export function MonitorCard({ s }: { s: Snapshot }) {
  const m = s.monitor;
  return (
    <section className="panel">
      <div className="panel-head"><h3>지표 수집기</h3><SrcBadge src={s.mode === 'mock' ? 'demo' : 'live'} /></div>
      <dl className="grid grid-cols-2 divide-x divide-[color:var(--line)] sm:grid-cols-4">
        {[['수집 간격', `${m.intervalMs / 1000}초`], ['수집 횟수', `${m.collections}회`], ['장애 판정', `연속 ${m.failThreshold}회 실패`], ['마지막 수집', m.collectedAt ? time(m.collectedAt) : '없음']].map(([k, v]) => <div key={k} className="px-4 py-3"><dt className="text-xs ink2">{k}</dt><dd className="num mt-1 text-lg">{v}</dd></div>)}
      </dl>
      <p className="border-t rule px-4 py-2.5 text-xs ink2">기록 시작 {dt(m.startedAt)}. {m.note} 수집 실패 {m.failures.length}건은 <Link href="/incidents" className="underline">장애 화면</Link>에서 볼 수 있습니다.</p>
    </section>
  );
}
