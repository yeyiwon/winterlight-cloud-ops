# OBSERVABILITY — 지표 수집과 모니터링 구조

## 1. 수집하는 신호와 현재 상태 (2026-11-22 운영 실측)

| 신호 | 출처 | 운영 결과 |
|---|---|---|
| Sites API·D1 생존, 버전, 전송 방식 | `GET /api/health` | 정상, HTTP 200, 195~1138ms, `c2fbc3f`, websocket-configured |
| 프런트엔드 릴리스 버전, 백엔드 도메인 | `GET /release.json` | 정상, HTTP 200, 63~85ms, `c2fbc3f` |
| 실시간 Worker 생존, 버전 | `GET {rt}/health` | 정상, HTTP 200, 204~657ms, `6c9fa62` |
| 접속자·WebSocket·재연결·메시지·지연·구역 | `GET {rt}/metrics` | **404: 원본 미배포**. 화면에 "설정 필요"로 표시 |
| Workers 요청·오류율 | Cloudflare GraphQL | 토큰 없음: "연동 필요" |
| 배포 이력 | Vercel Deployments API | 토큰 없음: "연동 필요" |
| 비용 | 없음 | 검증된 청구 데이터 없음: 표시하지 않음 |

응답 시간은 대시보드 서버(이 Mac, 서울)에서 잰 왕복이며 사용자 체감 지연이 아니다.

## 2. 실시간 지표 설계 (`/metrics`)

원본 `RealtimeWorld`는 이미 관리자 RPC `metrics`용 카운터를 갖고 있다. 이를 재사용하고 새 계측은 송신 메시지 수(`sent`) 하나만 추가했다.

| 지표 | 원본 값 | 대시보드 계산 |
|---|---|---|
| 현재 접속자 / 활성 WebSocket | `clients.size` | 그대로 (같은 방문자의 다른 탭은 1명) |
| 재연결 | `reconnected` 누적 | 최근 약 60초 증가분 |
| 수신·송신 메시지 | `received`, `sent` 누적 | 직전 표본과의 차이 ÷ 경과 초 |
| 서버 처리 지연 | `samples` 최근 300건 | P95 |
| 클라이언트 RTT | 브라우저 보고 `rttMs` 최근 300개 | 평균·P95 |
| 거절 | `rejected`, 코드별 | 최근 약 60초 증가분 |
| 마지막 갱신 | DO `at` (5초 캐시) | 측정 시각으로 표시 |

`since`가 바뀌거나 카운터가 줄면 DO 재시작으로 보고 그 표본의 증가분은 계산하지 않는다(타임라인에 "카운터 재시작" 기록).

## 3. 모니터 동작

- 수집 주기 `METRICS_INTERVAL_SEC` 30~60초(기본 30초). 보는 사람 수와 무관하게 주기마다 한 번.
- 실패 분류: 실제 서버 장애(5xx, `ok:false`) / 인증 문제(401·403) / DNS·네트워크·프록시 제한(DNS, 시간 초과, 연결 거부, TLS) / 측정 불가(형식 오류, 404 등).
- 연속 2회 실패 → 장애 열림(시작 시각은 첫 실패). 다음 정상 → 복구 시각 기록. 설정 필요로 바뀐 점검의 장애는 닫는다.
- 경보: 연속 실패, 수용 인원 90% 이상, 서버 처리 P95 > 50ms, 프런트엔드·API 버전 불일치.
- 오래된 데이터: 마지막 수집이 `2 × 주기 + 10초`보다 오래되면 상단 줄에 표시.
- 실패 로그 100건, 장애 50건, 타임라인 100건, 시계열 120점을 보관한다.

## 4. 확장 지점

- 오래 보관: `Monitor`의 배열을 외부 저장소로 바꾸면 된다. 비용이 생기므로 승인 후 진행.
- 새 수집원: `live.ts`에서 `mon.cached(key, ttl, now, fn)`으로 감싸 호출 한도를 지킨다.

## 5. 확인 방법

```bash
npm run verify:live
node scripts/fake-winterlight.mjs 4320
DATA_MODE=live DASHBOARD_PASSWORD=<로컬 값> WINTERLIGHT_WEB_URL=http://127.0.0.1:4320/flap WINTERLIGHT_REALTIME_URL=http://127.0.0.1:4320/ok WINTERLIGHT_METRICS_TOKEN=fake-metrics-token-for-local-checks-only npm run dev
```

`/flap`에서 31초 간격 수집 5회 결과(2026-11-22): 실패 2회째에 장애 열림·경보, 다음 정상에 복구·경보 해제, 다시 2회 실패에 새 장애. 이 시나리오는 자동 테스트(`tests/monitor.test.ts`)로도 검증한다.
