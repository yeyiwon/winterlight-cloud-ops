'use client';
import { Page } from '@/components/provider';
import { Card, CardHead, Provenance, SrcBadge, Val } from '@/components/ui';

export default function Cost() {
  return (
    <Page title="비용·사용량" desc="검증된 청구 데이터가 있을 때만 금액을 표시합니다. 연결되지 않은 값은 추정하지 않고 사유를 보여 줍니다.">
      {(s) => <>
        <div className="grid gap-5 lg:grid-cols-3">{s.cost.map((c) => { const ratio = c.used.value != null && c.limit.value ? Math.min(1, c.used.value / c.limit.value) : null; return (
          <Card key={c.id} className="space-y-4"><CardHead title={c.name} src={c.used.src} />
            <div><p className="mb-1 text-xs ink2">사용량{c.unit && ` (${c.unit})`}</p><Val m={c.used} className="text-3xl" /><Provenance m={c.used} className="mt-1" /></div>
            <div className="text-sm"><p className="mb-1 text-xs ink2">한도 대비</p>{ratio != null ? <div className="h-2 rounded-full" style={{ background: 'var(--line)' }}><div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: 'var(--accent)' }} /></div> : <span className="ink2">{c.limit.note ?? '한도 설정 필요'}</span>}</div>
            <div className="flex items-center justify-between border-t pt-3 text-sm" style={{ borderColor: 'var(--line)' }}><span className="ink2">청구 금액</span><SrcBadge src={c.cost.src} note={c.cost.note} /></div>
            {c.cost.note && <p className="text-xs ink2">{c.cost.note}</p>}</Card>); })}</div>
        <Card lift={false}><CardHead title="사용량 초과 위험 알림" /><p className="text-sm ink2">플랜 한도와 예산을 설정하면 사용 추세로 초과 시점을 계산합니다. 지금은 한도 값이 없어 위험도를 판단하지 않습니다.</p></Card></>}
    </Page>
  );
}
