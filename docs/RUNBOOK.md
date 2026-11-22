# RUNBOOK — 장애 발생 시 점검·복구 순서

CLOUD OPS는 읽기 전용이다. 아래 복구 조치는 WINTERLIGHT 소유자가 각 서비스 콘솔에서 직접 한다.

## 1. 첫 5분: 범위 확인

1. 상단 상태 줄의 경보 수와 "오래된 데이터" 여부를 본다. 오래된 데이터면 대시보드 쪽 문제부터 확인한다(2절).
2. 개요 → 서비스 상태 표에서 실패한 행을 누른다. 인프라 화면에서 원인·확인할 것·기술 정보가 펼쳐진다.
3. 분류에 따라 갈라진다.

| 분류 | 의미 | 다음 행동 |
|---|---|---|
| 실제 서버 장애 | 5xx 또는 `ok:false` | 3절 |
| 인증 문제 | 401·403 | 4절 |
| DNS·네트워크·프록시 제한 | 대시보드 서버가 닿지 못함 | 다른 네트워크에서 `npm run verify:live`. 거기서 정상이면 서비스는 살아 있다 |
| 측정 불가 / 설정 필요 | 형식 오류, 404, 토큰 없음 | 장애 아님. 설정·배포 상태 확인 |

## 2. 대시보드가 문제일 때

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<대시보드 주소>/api/metrics   # 401이면 정상(인증 필요), 503이면 DASHBOARD_PASSWORD 없음
npx vercel@latest env ls                                                        # DATA_MODE, WINTERLIGHT_* 확인
```

## 3. 실제 서버 장애

| 증상 | 확인 | 조치 |
|---|---|---|
| `/api/health` 503 `{ok:false}` | D1 `SELECT 1` 실패 | Sites 콘솔에서 D1 상태 확인. 데이터 삭제·restore와 코드 롤백을 섞지 않는다 |
| `/api/health` 502 | Vercel 프록시는 살아 있고 Sites API 연결 실패 | Sites API 배포 상태 확인 |
| 실시간 `/health` 실패 | Worker 다운 | Cloudflare 콘솔에서 `winterlight-realtime` 배포·오류 확인. 게임은 HTTP 폴링(12명)으로 계속 동작 |
| 프런트엔드·API 버전 불일치 경보 | 한쪽만 배포됨 | 같은 커밋으로 남은 쪽 배포 완료. 진행 중이면 기다린다 |

롤백: 원본 `docs/DEPLOYMENT.md`의 직전 운영 SHA로 Sites·Vercel·Worker를 되돌린다. Vercel은 대시보드의 Instant Rollback.

## 4. 인증 문제와 토큰 회전 (`/metrics`)

```bash
openssl rand -hex 32                                                    # 새 토큰 (REALTIME_SECRET과 달라야 함)
npx wrangler secret put METRICS_TOKEN --env production                  # 원본 저장소 realtime/ 에서
npx vercel@latest env rm WINTERLIGHT_METRICS_TOKEN production
npx vercel@latest env add WINTERLIGHT_METRICS_TOKEN production
```

순서: Worker를 먼저 바꾸면 대시보드가 잠시 "인증 문제"를 표시한다. 장애가 아니다.

## 5. `/metrics` 처음 켜기 (원본 패치 적용)

1. 원본 저장소에서 별도 브랜치를 만들고 `git apply docs/upstream/moru-winter-park-metrics-endpoint.patch` (이 저장소 경로).
2. 원본 저장소에서 `npm test`를 실행한다. 2026-11-22 결과 600/600(`docs/upstream/test-summary-2026-11-22.txt`).
3. 4절로 토큰 등록 → 원본 절차대로 Worker 배포 → 실시간 `/health` 정상 확인 → 대시보드의 "설정 필요"가 사라지는지 확인한다.
4. 문제가 생기면 Worker를 직전 버전으로 되돌린다. `/metrics`는 읽기 전용이라 데이터 복구는 필요 없다.
