'use client';
import { CATEGORY_LABEL, categoryOf } from '@/lib/probe';
import type { Probe, Snapshot } from '@/lib/types';
import { useSnap } from './provider';
import { Card, CardHead, cn, dt, time } from './ui';

const tone = (p: Probe) => (p.state === 'ok' ? 'ok' : p.state === 'skipped' ? '' : categoryOf(p) === 'outage' ? 'down' : 'warn');
const label = (p: Probe) => (p.state === 'ok' ? '정상' : p.state === 'skipped' ? (p.kind ? '설정 필요' : '실행 안 함') : CATEGORY_LABEL[categoryOf(p) ?? 'unmeasured']);

export function ProbeRow({ p, lastOk: seen }: { p: Probe; lastOk?: number }) {
  const lastOk = p.lastOkAt ?? seen;
  return (
    <li className="probe-row rounded-2xl p-3.5" data-state={p.state} data-kind={p.kind ?? ''} style={{ border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--glass) 70%, transparent)' }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <i className={cn('dot', tone(p))} />
        <b className="text-sm">{p.label}</b>
        <span className={cn('chip', p.state === 'ok' ? 'chip-live' : p.state === 'fail' ? 'chip-demo' : 'chip-na')}>{label(p)}</span>
        {p.state === 'ok' && <span className="text-xs tabular-nums ink2">{p.ms}ms · HTTP {p.status}{p.revision ? ` · 버전 ${p.revision.length === 40 ? p.revision.slice(0, 7) : p.revision}` : ''}</span>}
        {p.target && <code className="ml-auto max-w-full truncate text-[11px] ink2">{p.target}</code>}
      </div>
      {p.state === 'ok' && p.fields.length > 0 && <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pl-5 text-xs">{p.fields.map((f) => <div key={f.key} className="flex gap-1.5"><dt className="ink2">{f.label}</dt><dd className="font-medium">{f.value}</dd></div>)}</dl>}
      {p.at != null && <p className="mt-1.5 pl-5 text-[11px] ink2">점검 시각 {time(p.at)}{p.state === 'ok' ? (lastOk ? ` · 마지막 성공 ${time(lastOk)}` : '') : `${lastOk ? ` · 마지막 성공 ${dt(lastOk)}` : ' · 모니터 시작 후 성공 기록 없음'}${p.fails ? ` · 연속 실패 ${p.fails}회` : ''}`}</p>}
      {p.state !== 'ok' && p.message && (
        <div className="mt-2 space-y-1 pl-5 text-sm">
          <p>{p.message}</p>
          {p.hint && <p className="text-xs ink2">확인할 것: {p.hint}</p>}
          {p.detail && <p className="text-[11px] ink2">기술 정보: {p.detail}{p.ms != null ? ` · ${p.ms}ms` : ''}</p>}
        </div>
      )}
    </li>
  );
}

/** 공개 상태 엔드포인트 점검 목록. DEMO에서는 실행하지 않았음을 그대로 보여준다. */
export function ProbeCard({ s }: { s: Snapshot }) {
  const { lastOk } = useSnap();
  const ran = s.probes.items.filter((p) => p.state !== 'skipped'), ok = ran.filter((p) => p.state === 'ok').length;
  return (
    <Card lift={false}>
      <CardHead title="원본 연결 점검 (공개 읽기 전용 상태 경로)" src={s.mode === 'mock' ? 'demo' : 'live'} />
      {s.mode === 'live' && <p data-testid="probe-summary" className="mb-3 text-sm">수집 {ran.length ? `${ok}/${ran.length}건 성공` : '시도 없음 — 점검 주소가 설정되지 않았습니다'} · 마지막 점검 {time(s.at)}{ran.length > 0 && ok === 0 ? ' · 성공한 점검이 없어 수치를 표시하지 않습니다' : ''}</p>}
      <ul className="space-y-2.5">{s.probes.items.map((p) => <ProbeRow key={p.id} p={p} lastOk={lastOk[p.id]} />)}</ul>
      <p className="mt-3 text-xs ink2">대시보드 서버가 GET으로만 호출하며 원본에는 아무것도 쓰지 않습니다. 실패는 실제 서버 장애·인증 문제·DNS/네트워크/프록시 제한·측정 불가로 구분합니다. /metrics만 서버 간 토큰을 보내며, 토큰은 화면으로 내보내지 않습니다.</p>
    </Card>
  );
}

/** 개요 화면용: Live에서 점검이 하나라도 정상이 아닐 때만 나타나는 요약 알림. */
export function ProbeAlert({ s }: { s: Snapshot }) {
  if (s.mode !== 'live') return null;
  const bad = s.probes.items.filter((p) => p.state !== 'ok');
  if (!bad.length) return null;
  const first = bad.find((p) => p.state === 'fail') ?? bad[0];
  return (
    <div role="alert" className="glass flex flex-wrap items-start gap-3 p-4 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--warn) 55%, var(--line))' }}>
      <i className="dot warn mt-1.5" />
      <div className="min-w-0 flex-1">
        <b>{first.state === 'fail' ? `${first.label}: ${first.message}` : `점검 대기: ${first.message}`}</b>
        {first.hint && <p className="mt-1 text-xs ink2">{first.hint}</p>}
        {bad.length > 1 && <p className="mt-1 text-xs ink2">정상이 아닌 항목 {bad.length}개 — 인프라 화면에서 자세히 볼 수 있습니다.</p>}
      </div>
    </div>
  );
}

/** 모니터 경고: 연속 실패·수용 인원·처리 지연·버전 불일치. 회복하면 자동으로 사라진다. */
export function MonitorAlerts({ s }: { s: Snapshot }) {
  if (s.mode !== 'live' || !s.monitor.alerts.length) return null;
  return (
    <div role="alert" className="glass space-y-2.5 p-4 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--down) 45%, var(--line))' }}>
      {s.monitor.alerts.map((a) => <div key={a.id} className="flex flex-wrap items-start gap-3"><i className={cn('dot pulse mt-1.5', a.level)} /><div className="min-w-0 flex-1"><b>{a.title}</b><p className="mt-0.5 text-xs ink2">{a.detail}</p></div><span className="text-xs tabular-nums ink2">{dt(a.since)}부터</span></div>)}
    </div>
  );
}

/** 수집기 자체의 상태: 주기, 횟수, 연속 실패 기준, 기록 보관 범위. */
export function MonitorCard({ s }: { s: Snapshot }) {
  const m = s.monitor;
  return (
    <Card lift={false}>
      <CardHead title="지표 수집기" src={s.mode === 'mock' ? 'demo' : 'live'} />
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs ink2">수집 주기</dt><dd className="num mt-1 text-2xl">{m.intervalMs / 1000}<span className="ml-1 text-xs ink2">초</span></dd></div>
        <div><dt className="text-xs ink2">수집 횟수</dt><dd className="num mt-1 text-2xl">{m.collections}</dd></div>
        <div><dt className="text-xs ink2">장애 판정</dt><dd className="mt-1">연속 {m.failThreshold}회 실패</dd></div>
        <div><dt className="text-xs ink2">마지막 수집</dt><dd className="mt-1 tabular-nums">{m.collectedAt ? time(m.collectedAt) : '없음'}</dd></div>
      </dl>
      <p className="mt-3 text-xs ink2">{m.note} 수집 실패 {m.failures.length}건 기록 중 · 장애 화면에서 확인할 수 있습니다.</p>
    </Card>
  );
}
