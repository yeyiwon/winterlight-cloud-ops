'use client';
import type { Probe, Snapshot } from '@/lib/types';
import { useSnap } from './provider';
import { Card, CardHead, cn, time } from './ui';

const tone = (p: Probe) => (p.state === 'ok' ? 'ok' : p.state === 'skipped' ? '' : p.kind === 'service-unhealthy' || p.kind === 'server' ? 'down' : 'warn');
const label = (p: Probe) => (p.state === 'ok' ? '정상' : p.state === 'skipped' ? (p.kind ? '설정 필요' : '실행 안 함') : p.kind === 'service-unhealthy' || p.kind === 'server' ? '서비스 오류' : '점검 실패');

export function ProbeRow({ p, lastOk }: { p: Probe; lastOk?: number }) {
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
      {p.at != null && <p className="mt-1.5 pl-5 text-[11px] ink2">점검 시각 {time(p.at)}{p.state !== 'ok' ? (lastOk ? ` · 마지막 정상 ${time(lastOk)}` : ' · 이 화면을 연 뒤 정상 응답 없음') : ''}</p>}
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
      <p className="mt-3 text-xs ink2">대시보드 서버가 GET으로만 호출하며 원본에는 아무것도 쓰지 않습니다. 응답이 없다는 이유만으로 서비스 장애로 단정하지 않고, 원인을 구분해 표시합니다.</p>
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
