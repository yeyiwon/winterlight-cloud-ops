'use client';
import { Page } from '@/components/provider';
import { Card, CardHead, Empty, dt } from '@/components/ui';

export default function Incidents() {
  return (
    <Page title="장애" desc="서비스 오류와 배포 이력의 관계를 확인합니다. 오류 상세에는 메시지·IP·사용자 식별자를 담지 않습니다.">
      {(s) => <Card lift={false}><CardHead title="장애 기록" src={s.incidents.src} />
        {s.incidents.items.length === 0 ? <Empty src={s.incidents.src}>{s.incidents.src === 'unavailable' ? '원본의 오류 기록(관리자 전용)을 읽을 수 없어 표시하지 못합니다.' : '기록된 장애가 없습니다.'}</Empty> :
          <ul className="space-y-3">{s.incidents.items.map((i) => { const dep = s.deploys.items.find((d) => d.rev === i.deploy), gap = dep ? Math.round((i.at - dep.at) / 60000) : null;
            return <li key={i.id} className="rounded-2xl p-4" style={{ border: '1px solid var(--line)' }}>
              <div className="flex flex-wrap items-center gap-2"><i className={`dot ${i.status === 'open' ? 'down' : 'ok'}`} /><b>{i.feature}</b><span className="chip">{i.status === 'open' ? '진행 중' : '해결됨'}</span><code className="text-xs ink2">{i.route} · {i.code}</code><span className="ml-auto text-xs tabular-nums ink2">{dt(i.at)}{i.resolvedAt ? ` → ${dt(i.resolvedAt)}` : ''}</span></div>
              <p className="mt-2 text-sm">{i.detail}</p>
              <p className="mt-1 text-xs ink2">{i.deploy ? (gap != null ? `배포 ${i.deploy} 이후 ${gap}분 만에 발생` : `관련 배포 ${i.deploy}`) : '관련 배포 없음'}</p></li>; })}</ul>}</Card>}
    </Page>
  );
}
