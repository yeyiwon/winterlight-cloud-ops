# ARCHITECTURE — 서버 구성과 데이터 흐름

확인 기준일 2026-11-22. "확인"은 코드·응답·CLI로 직접 본 것, "미확인"은 근거가 없어 비워 둔 것이다.

## 1. WINTERLIGHT 운영 구성 (원본 `yeyiwon/moru-winter-park` @ `c2fbc3f`)

```
브라우저 ── https://moru-winter-park.vercel.app ── Vercel 정적 파일(web-dist, 리전 icn1)
   │            └─ /api/:path* → api/proxy.js (허용 경로 27개, 쓰기는 Origin 검사)
   │                     └──▶ Sites API Worker (*.chatgpt.site) ──▶ D1 (바인딩 DB)
   │                                 └── 서명 RPC (HMAC-SHA256, REALTIME_SECRET) ──┐
   └── 서명 티켓 WebSocket (aud=winter-realtime, 2분 만료) ──▶ Cloudflare Worker winterlight-realtime
                                                                    └──▶ Durable Object WinterWorld ("winter-plaza" 1개, 최대 100명)
```

| 구성 요소 | 관리 계정 | 근거 | 접근·계측 가능 범위 |
|---|---|---|---|
| Vercel 프런트엔드 `moru-winter-park` | Vercel 팀 `yeyiwon's projects` | `vercel project inspect` (2026-11-22), GitHub 저장소 연결 확인 | 공개 `/release.json`. 배포 이력은 읽기 전용 토큰이 있으면 Vercel API로 조회 가능 |
| Sites API Worker + D1 | ChatGPT Sites 호스팅 (`appgprj_…`, `.openai/hosting.json`) | 저장소 파일, `/release.json`의 `apiOrigin` | 공개 `/api/health`만. D1 분석·로그는 이 계정 권한이 없어 접근 불가 |
| Cloudflare 실시간 Worker + DO | workers.dev 하위 도메인 `winterlight`인 Cloudflare 계정 | 응답 `service=winterlight-realtime`, 원본 QA 기록 | 공개 `/health`. 계정 ID·Analytics 토큰은 **미확인**(추측하지 않음) |
| CLOUD OPS 대시보드 | Vercel 팀 `yeyiwon's projects`, 프로젝트 `winterlight-cloud-ops` | `vercel link` (2026-11-21) | 이 저장소 |

버전 정책(원본 `docs/DEPLOYMENT.md` v60): 프런트엔드와 Sites API는 같은 커밋으로 함께 배포한다. 실시간 Worker는 자기 코드가 바뀐 배포에서만 다시 배포한다. 그래서 2026-11-22 운영은 웹·API `c2fbc3f`, Worker `6c9fa62`이며 정상이다.

## 2. CLOUD OPS 데이터 흐름

```
브라우저 ──(10초마다 확인, Basic 인증)──▶ /api/metrics (Next.js, server-only)
                                             │  수집 주기(30~60초)마다 한 번, single-flight
                                             ├─ GET {web}/api/health           공개
                                             ├─ GET {web}/release.json         공개
                                             ├─ GET {rt}/health                공개
                                             ├─ GET {rt}/metrics               Bearer METRICS_TOKEN (서버 간)
                                             ├─ Vercel Deployments API         5분 캐시, 토큰 있을 때만
                                             └─ Cloudflare GraphQL             5분 캐시, 토큰 있을 때만
                                             ▼
                                        Monitor (메모리): 연속 실패 → 장애 열기/닫기, 실패 로그, 타임라인, 시계열 120점
```

- 원본에는 GET만 보낸다. 쓰기·관리자 RPC는 하지 않는다.
- 토큰은 서버 환경변수에만 있고 `/api/metrics` 응답에 들어가지 않는다(테스트로 확인).
- 기록은 함수 인스턴스 메모리에 있다. 인스턴스가 바뀌면 다시 쌓인다. 유료 저장소는 추가하지 않았다.

## 3. 원본에 제안한 변경 (미배포)

`docs/upstream/moru-winter-park-metrics-endpoint.patch` — 실시간 Worker에 서버 간 전용 `GET /metrics`를 추가한다. 이유·위험·검증은 [OBSERVABILITY.md](OBSERVABILITY.md)와 [SECURITY.md](SECURITY.md).

## 4. 코드 위치

| 파일 | 역할 |
|---|---|
| `src/lib/probe.ts` | 점검 실행, 응답 허용 필드, 실패 원인 분류 |
| `src/lib/monitor.ts` | 연속 실패·장애·타임라인·시계열, 외부 API 캐시 |
| `src/lib/adapters/live.ts` | 수집 결과 → 화면 스냅샷(출처·측정 시각 포함) |
| `src/lib/service.ts` | 수집 주기, single-flight |
| `src/proxy.ts` | 대시보드 Basic 인증, Live 모드 fail-closed |
| `scripts/fake-winterlight.mjs` | 로컬 검증용 가짜 원본(`/ok`, `/flap` 등) |
