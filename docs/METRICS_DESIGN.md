# 실시간 읽기 전용 `/metrics` 설계안

> **상태: 설계만 있음. 구현·배포하지 않았고, 원본 WINTERLIGHT(저장소·Worker·D1)는 수정하지 않았다.**
> 아래 "근거"는 원본 저장소 코드를 읽어 확인한 사실이고, "제안"은 아직 검증되지 않은 설계다.

## 1. 목적
대시보드가 아래 값을 **실측**으로 보여 주려면 실시간 Worker에서 읽기 전용 집계값을 받아야 한다. 지금은 이 값들을 숫자 없이 "연동 필요"로 표시한다.

| 대시보드 항목 | 필요한 원천 |
| --- | --- |
| 지금 접속자 수 / WebSocket 수 | Durable Object가 가진 연결 수 |
| 지연시간(평균·P95) | 클라이언트가 보고한 RTT, DO 핸들러 처리 시간 |
| 거절·재접속·메시지 수 | DO 누적 카운터 |
| 지역별 인원 | 지역 이름별 집계 |

## 2. 근거: 원본에 이미 있는 것 (`realtime/world.js`, `realtime/worker.js`)
- DO `WinterWorld`(`winter-plaza`)는 `metrics` RPC로 이미 집계값을 만든다. 반환 필드: `connections`, `capacity`(100), `regions`(지역→인원), `since`, `accepted`, `closed`, `reconnected`, `received`, `rejected`, `rejections`(거절 코드→횟수), `bytesOut`, `clientRTTMean/P95Ms`, `handlerMean/P95Ms`, `revision`, `protocol`.
- 이 값에는 **방문자 id·닉네임·좌표·채팅이 들어 있지 않다.**
- 그러나 `metrics` RPC는 `POST /rpc`이며 `REALTIME_SECRET`(백엔드↔DO 서명 비밀, 티켓 서명에도 쓰임)으로 서명해야 한다. 이 비밀을 대시보드에 주면 `profile`·`revoke` 같은 **쓰기 RPC도 서명할 수 있게 되므로** 대시보드에는 절대 주지 않는다.
- 공개 `/health`는 `{ok, service, revision}`만 돌려준다(이미 대시보드가 사용).
- `REALTIME_URL`/`REALTIME_SECRET`은 원본 백엔드(Sites)의 환경 값이며 저장소에는 없다. 주소 후보는 `scripts/verify-cloudflare-v46.mjs`와 `qa/*/production/integrity.json`에 `https://winterlight-realtime.winterlight.workers.dev`로 기록돼 있다(현재 응답은 미확인).

## 3. 제안: `GET /metrics`
### 3.1 위치와 인증
- 실시간 Worker(`realtime/worker.js`)에 **새 경로 `GET /metrics`** 를 추가한다. 기존 `/rpc`, `/connect`, `/health`는 바꾸지 않는다.
- 인증: `Authorization: Bearer <METRICS_TOKEN>`.
  - `METRICS_TOKEN`은 **새로 만든 별도 비밀**(32바이트 이상 무작위). `REALTIME_SECRET`과 값·용도·저장 위치를 모두 분리한다. 한 비밀이 유출돼도 다른 쪽이 열리지 않는다.
  - 비교는 상수 시간 비교(HMAC 후 `crypto.subtle.verify` 또는 길이 고정 XOR)로 한다.
  - 토큰이 없거나 틀리면 **본문 없는 404**(경로 존재 여부를 숨김). 설정되지 않은 환경에서는 항상 404.
  - 토큰은 Worker secret(`wrangler secret put METRICS_TOKEN`)과 대시보드 서버 환경변수(`WINTERLIGHT_METRICS_TOKEN`, `NEXT_PUBLIC_` 금지)에만 둔다. 클라이언트로 내려보내지 않는다.
- 선택 강화: Cloudflare Access 서비스 토큰을 앞에 두거나, 요청 출처 IP를 제한한다(Vercel 고정 IP가 없으면 토큰만으로 충분).

### 3.2 DO 내부 경로
- Worker는 `/metrics`를 받으면 인증 후 DO에 **내부 전용 읽기 경로**(예: DO `fetch`의 `/__metrics`)로 전달한다. 외부에서 직접 `/__metrics`를 호출하면 Worker 라우터가 404로 막는다(허용 경로는 `/health`, `/connect`, `/rpc`, `/metrics`뿐).
- DO에서는 기존 `this.world.rpc({action:'metrics'})`가 아니라 **허용 목록 변환 함수**를 거친다(3.3). 이 경로는 상태를 바꾸지 않는다(`prune()` 호출 제외 — 만료 정리가 필요하면 호출 전에 한 번만).

### 3.3 응답 스키마 (허용 목록)
```json
{
  "service": "winterlight-realtime",
  "revision": "<git sha>",
  "at": 1790000000000,
  "uptimeMs": 123456,
  "connections": 37,
  "capacity": 100,
  "regions": { "outdoors": 20, "museum": 8 },
  "counters": { "accepted": 410, "closed": 373, "reconnected": 12, "received": 98211, "rejected": 4, "bytesOut": 5123456 },
  "rejections": { "rate": 3, "size": 1 },
  "latency": { "clientRttMeanMs": 41.2, "clientRttP95Ms": 96, "handlerMeanMs": 0.4, "handlerP95Ms": 1.1, "samples": 300 },
  "window": { "since": 1789990000000, "note": "DO가 재시작하면 카운터와 표본이 0부터 다시 시작" }
}
```
- 값이 없으면 `null`(예: RTT 표본 0개). 대시보드는 `null`을 숫자로 바꾸지 않고 "측정 불가"로 둔다.
- **포함하지 않는 것(금지)**: 방문자 id, 닉네임, 좌표·방향, 채팅 내용, 초대·좌석 정보, IP, 티켓·서명·nonce, `ALLOWED_ORIGINS`, 개별 연결 목록.
- `regions` 키는 서버가 정한 고정 지역 이름(`outdoors`, `museum` 등)만 허용한다. 알 수 없는 키는 `other`로 합쳐 **사용자가 만든 문자열이 응답에 실리지 않게** 한다.
- 인원이 극히 적은 지역의 숫자 자체는 개인을 식별하지 않지만, 지역별 값은 집계 수치로만 제공하고 개별 이동 이력은 만들지 않는다.
- 응답 헤더: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. CORS 헤더는 **붙이지 않는다**(브라우저에서 직접 호출 불가, 서버 간 호출 전용).

### 3.4 부하와 남용 방지
- 계산은 메모리 안의 배열 정렬(최대 300개)뿐이며 D1·스토리지 접근이 없다. 게임 처리와 같은 DO를 쓰므로 **호출 빈도를 제한**한다.
- 대시보드는 서버에서 **15초에 한 번 이하**로 호출하고 결과를 캐시한다(브라우저 폴링은 캐시된 값을 받음).
- Worker 쪽에서도 토큰이 맞는 요청에 한해 분당 N회(예: 12회) 초과 시 429를 돌려준다. 토큰이 틀린 요청은 DO에 닿기 전에 끊는다.
- 시계열(접속자 추이)은 DO가 저장하지 않는다. 대시보드가 받은 값을 자기 쪽에 쌓는 방식으로 시작하고(재시작 시 비워짐), 장기 보존이 필요하면 별도 설계한다.

### 3.5 대시보드 쪽 변경 (구현 계획)
1. `WINTERLIGHT_METRICS_TOKEN`(서버 전용)과 `WINTERLIGHT_REALTIME_URL`이 모두 있을 때만 `/metrics`를 호출한다. 없으면 지금처럼 "연동 필요".
2. `Probe`에 `metrics` 점검 추가 → 실패 원인은 기존 분류(`blocked`=토큰 거부, `not-found`=아직 배포 안 됨 …) 재사용.
3. 응답은 스키마 검증(알려진 키만, 숫자 범위 확인) 후 `M<T>`의 `live`로만 채운다. 검증에 실패하면 `format` 오류로 표시하고 숫자는 비운다.
4. 접속자 수=`connections`, 소켓 수=`connections`(같은 값이면 한 항목으로 표시하고 같은 값을 두 번 센 것처럼 보이지 않게 함), P95=`clientRttP95Ms`(클라이언트 보고 RTT임을 라벨에 명시), 서버 처리 시간은 `handlerP95Ms`로 따로 표시.
5. "접속자 수"는 서버가 연결을 들고 있는 수이고, 지연 값은 클라이언트가 자가 보고한 값(5초당 1회, 0~30000ms)이라 **정확한 종단 지연이 아님**을 화면에 주석으로 남긴다.

## 4. 대안과 선택 이유
| 대안 | 문제 |
| --- | --- |
| 기존 `/rpc`의 `metrics`를 대시보드가 서명해 호출 | `REALTIME_SECRET`이 대시보드로 넘어가 쓰기 RPC까지 가능해짐 → 거부 |
| 기존 `/api/operations`(관리자) 재사용 | 관리자 인증을 대시보드에 주어야 하고 응답에 오류 로그·경로 등 더 많은 정보가 있음 → 보안 검토 전에는 거부 |
| Cloudflare GraphQL만 사용 | 실시간 접속자·소켓 수는 얻지 못함(요청 수·CPU 위주). 비용·사용량 용도로는 별도 병행 |
| **새 `/metrics` + 별도 토큰 (제안)** | 최소 정보, 최소 권한, 기존 경로 불변 |

## 5. 검증되지 않은 가정 (구현 전 확인 필요)
- DO 한 개(`winter-plaza`)가 전체 접속자를 대표한다는 것(저장소 코드상 그렇지만 운영 확인 안 함).
- `metrics` 호출이 게임 처리에 주는 영향이 무시할 만하다는 것(부하 시험 필요, `scripts/load-realtime.mjs` 활용 가능).
- Cloudflare Workers 무료/유료 플랜의 `secret` 개수·요청 한도.
- 원본 저장소 소유자가 이 경로 추가를 승인하는 것 — **승인 전에는 원본을 수정하지 않는다.**

## 6. 적용 순서(승인 후)
1. 원본에 별도 브랜치로 `/metrics`와 단위 테스트(토큰 없음/틀림/맞음, 금지 필드 부재, 인원 0일 때 `null`)를 추가.
2. staging Worker(`winterlight-realtime-staging`)에 배포해 `scripts/load-realtime.mjs`로 부하 시 영향 측정.
3. `METRICS_TOKEN` 발급 → Worker secret 등록 → 운영 배포.
4. 대시보드에 토큰을 넣고 3.5 구현, `npm run verify:live`에 `/metrics` 점검 추가.
