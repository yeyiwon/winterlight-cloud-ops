# WINTERLIGHT 저장소 분석 (읽기 전용)

분석 대상: `yeyiwon/moru-winter-park` 기본 브랜치 HEAD `c2fbc3f` (2026-11-20), 얕은 복제. 원본 파일은 수정하지 않았다. 아래는 코드·문서에서 직접 확인한 내용이며, 배포된 운영 환경을 호출해 확인한 값은 없다.

## 1. 실제 구조

```
브라우저 ─ Vercel(정적 파일, icn1) ─ /api/* ─▶ api/proxy.js ─(허용 경로 27개)─▶ "Sites" 백엔드 Worker ─▶ D1 (바인딩 DB)
   └────── 서명 티켓 WebSocket ─▶ Cloudflare Worker `winterlight-realtime` ─▶ Durable Object `WinterWorld` (`winter-plaza` 1개)
Sites 백엔드 ──서명 RPC(HMAC, REALTIME_SECRET)──▶ DO   (authorize / relocate / 좌석 / 공연 / metrics)
```

- Vercel: `vercel.json`은 framework 없음, `build:vercel`, 출력 `web-dist`, 리전 `icn1`, `/api/:path*`를 프록시로 재작성, 크론 1개(`/api/quiz-refresh`, 매일 21:00 UTC). 프록시는 쓰기 요청의 Origin을 검사하고 세션 쿠키만 전달한다.
- 백엔드 Worker(`server/worker.js`)의 원본 주소는 `*.chatgpt.site`(Sites 호스팅)다. D1 스키마는 22개 테이블(`db/schema.js`). 이 Worker가 어느 Cloudflare 계정에 속하는지 저장소만으로는 확인할 수 없다.
- 실시간: `realtime/wrangler.jsonc`의 `winterlight-realtime`, DO 바인딩 `WORLD`, SQLite 클래스 `WinterWorld`. 단일 DO 인스턴스, 최대 100명(HTTP 폴링 대체 경로는 12명).
- 소유자 인증: 외부 OAuth형 로그인 후 8시간 세션 쿠키. 서비스 계정·API 토큰 방식은 없다.

## 2. 지표 분류

### 이미 측정 가능 (대시보드 서버가 공개 GET으로 바로 읽음)
| 지표 | 출처 |
|---|---|
| 백엔드 + D1 생존(`SELECT 1`), 멀티플레이 설정 여부, 리비전 | `GET /api/health` |
| 실시간 Worker 생존, 리비전 | realtime `GET /health` |
| 배포 리비전 | `/release.json` |
| (파생) 프로브 왕복 시간 | 대시보드 서버에서 측정 — 사용자 요청 지연이 아님 |

### 추가 계측 필요 (원본에 이미 있으나 접근 불가, 또는 아예 없음)
| 지표 | 현재 상태 | 필요한 것 |
|---|---|---|
| 접속자·WebSocket 수, 구역별 인원, 재연결, 거절, 처리 메시지, 송신 바이트, RTT/핸들러 지연 | DO의 `metrics` RPC가 이미 계산하지만 **서명 RPC에 묶여 있음**. 같은 비밀로 `authorize`·`relocate`도 호출되므로 대시보드에 공유하면 최소 권한 위반 | 집계 숫자만 반환하는 별도 읽기 전용 `/metrics`와 전용 비밀(원본 수정이므로 승인 필요) |
| 구역·오류·5분 오류 추이·서비스 상태 | 관리자 전용 `GET /api/operations`에 있음. 소유자 세션이 필요해 외부 대시보드는 못 씀 | 읽기 전용 서비스 토큰 엔드포인트 또는 동일 집계의 공개 요약 |
| 요청 지연 평균/P95 | 없음. `latencyMs`는 D1·RPC 호출 1회의 시간 | Worker 요청 지연 계측(또는 Cloudflare 분석 사용) |
| 접속·종료 이벤트, 최대 동시접속 기록 | 없음(DO 카운터는 메모리에만 있고 재시작 시 초기화되는 구조) | 5분 단위 집계 저장 |
| 장애 해결 상태, 영향 기능 | `operational_errors`는 route·code·revision·시각만 저장(의도적으로 메시지·IP 제외) | route→기능 매핑은 대시보드에서, 해결 상태는 수동 입력 |

### 외부 API 연동 필요
| 지표 | API |
|---|---|
| Workers 요청·오류·CPU, DO 요청, D1 읽기/쓰기/용량 | Cloudflare GraphQL Analytics (Account Analytics 읽기 권한) |
| 배포 이력·상태, 트래픽/전송량 | Vercel REST API (읽기 전용 토큰, 프로젝트/팀 ID) |

### 현재 측정 불가
- 청구 금액, 잔여 쿼터: 원본 `OPERATIONS.md`가 Vercel 팀은 `hobby`, 비용 조회가 `404 costs_not_found`, Cloudflare 요금·상한은 UNKNOWN이라고 기록한다. → '연동 필요'/'측정 불가'로 표시.
- 서버 측 end-to-end 동기화 지연: 클라이언트 RTT만 존재.
- 채팅 내용·개인정보: 수집하지 않는다.
- Sites 백엔드 Worker 자체의 Cloudflare 지표: 계정 접근 가능 여부 확인 필요.

## 3. 보안 판단
1. `REALTIME_SECRET`을 대시보드와 공유하지 않는다. 읽기 전용 `/metrics`를 별도 비밀로 분리하는 것이 선행 조건이다.
2. `/api/operations`는 관리자 전용으로 유지한다. 외부에 공개하지 않는다.
3. 대시보드의 모든 토큰은 서버 환경변수에만 둔다.
