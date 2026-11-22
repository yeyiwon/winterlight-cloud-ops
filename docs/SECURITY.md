# SECURITY — 인증과 최소 권한

## 1. 비밀값과 위치

| 값 | 위치 | 용도 | 비고 |
|---|---|---|---|
| `DASHBOARD_PASSWORD` | CLOUD OPS 서버 환경변수 | 대시보드 Basic 인증 | Live 모드에서 없으면 모든 경로 503 (fail-closed, `src/proxy.ts`) |
| `WINTERLIGHT_METRICS_TOKEN` | CLOUD OPS 서버 환경변수 | 실시간 Worker `/metrics` Bearer | 32자 이상. `NEXT_PUBLIC_` 금지 |
| `METRICS_TOKEN` | 원본 실시간 Worker secret (미설정) | `/metrics` 검증 | `REALTIME_SECRET`과 같으면 Worker가 503으로 거부 |
| `VERCEL_TOKEN` | CLOUD OPS 서버 환경변수 (미설정) | 배포 이력 읽기 | 읽기 전용 범위로 발급 |
| `CF_API_TOKEN` | CLOUD OPS 서버 환경변수 (미설정) | Workers 분석 읽기 | `Account Analytics: Read`만 |

관리자 RPC 비밀(`REALTIME_SECRET`)은 CLOUD OPS에 두지 않는다. 쓰기 권한이 있는 RPC를 서명할 수 있기 때문이다.

## 2. `/metrics` 보호 (원본 패치)

- Bearer 토큰을 SHA-256 다이제스트로 비교한다(길이·접두사 타이밍 노출 방지).
- `Origin` 헤더가 있는 요청은 403. 브라우저는 교차 출처 fetch에 항상 Origin을 붙인다. CORS 헤더는 반환하지 않는다.
- 토큰 미설정이거나 `REALTIME_SECRET`과 같으면 503.
- GET만 허용(POST는 404). 응답은 집계 숫자만 담고 id·닉네임·채팅·위치·IP는 없다.
- 인증은 Worker 진입점에서 먼저 하므로, 인증 실패 요청은 Durable Object까지 가지 않는다.

테스트(원본, Miniflare 실제 Workers 런타임): 무인증 401, 틀린 토큰 401, RPC 비밀을 Bearer로 써도 401, Origin 403(CORS 헤더 없음), POST 404, 토큰 미설정 503, RPC 비밀과 같은 토큰 503, 정상 200 + `no-store`, 5초 캐시. 4/4 통과.

## 3. CLOUD OPS 쪽 방어

- 원본 응답은 허용 목록 필드만 받는다(`pickFields`, `parseRtMetrics`). 테스트: 닉네임·채팅·IP·잘못된 키가 결과에 남지 않음.
- 점검 대상 주소에서 계정 정보·쿼리·해시를 제거하고, `http`는 localhost만 허용한다.
- `/api/metrics`는 GET 전용(POST 405), `Cache-Control: no-store`, CORS 헤더 없음.
- 토큰이 응답 JSON에 나오지 않음을 테스트한다(`tests/monitor.test.ts`, `tests/probe.test.ts`).

## 4. 남은 위험

- Basic 인증은 단일 공유 비밀번호다. 여러 사람이 쓰면 Vercel 배포 보호나 SSO로 바꾸는 것이 낫다.
- `/metrics`가 배포되면 공개 인터넷에 경로가 생긴다. 토큰 유출 시 집계 숫자만 노출되며 회전 절차는 RUNBOOK 4절.
- Preview 배포에는 `DASHBOARD_PASSWORD`가 없어 503이다(의도). Preview에 Live를 열려면 Preview 환경변수를 따로 설정한다.
