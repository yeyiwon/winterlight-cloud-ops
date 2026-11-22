> **2026-11-22 재검증으로 대체됨.** 운영 3개 경로는 실제로 응답을 확인했다. 최신 결과는 [OBSERVABILITY.md](OBSERVABILITY.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md). 아래는 2026-11-21 기록이다.

# Live 연결 준비 기록

## 1. 확인 방법과 결과 요약
| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 공식 주소 `https://moru-winter-park.vercel.app/` | 주소는 사용자 지정 | 요청에 명시 |
| `/api/health`, `/release.json` **현재 응답** | **확인하지 못함** | 개발 환경의 외부 접속이 제한됨(셸은 프록시 403/DNS 실패, 웹 조회 도구는 허용 목록 밖). 우회하지 않았다 |
| 응답 필드(과거 기록) | 아래 2절 | 원본 저장소의 `qa/platform-v59/production/integrity.json`(2026-11-20 기록) |
| 실시간 Worker 주소 | 후보 확인, **현재 응답 미확인** | 아래 3절 |

## 2. 공개 엔드포인트가 제공하는 필드
원본 코드(`server/api.js`, `realtime/worker.js`)와 위 QA 기록이 일치한다.

| 경로 | 필드 | 대시보드 표시 |
| --- | --- | --- |
| `GET /api/health` | `ok`, `multiplayer`, `revision`, `transport`(`websocket-configured`\|`polling`); D1 `SELECT 1` 실패 시 HTTP 503 `{ok:false,multiplayer:false}` | 상태, 버전, 멀티플레이, 전송 방식 |
| `GET /release.json` | `revision`, `apiOrigin` | 버전, 백엔드 **도메인만**(경로·쿼리·계정 제거, https만) |
| `GET {realtime}/health` | `ok`, `service:'winterlight-realtime'`, `revision` | 상태, 버전, 서비스 이름 |

- 허용 목록에 없는 필드는 버린다(`src/lib/probe.ts`의 `pickFields`). 응답에 없는 필드는 만들어 내지 않는다.
- QA 기록 시점의 revision은 `6c9fa62`였다. **현재 운영 버전과 같다는 보장은 없다.**

## 3. 실시간 Worker 주소 분석 (추측 없이 저장소 근거만)
- `realtime/wrangler.jsonc`: 운영 환경 Worker 이름 `winterlight-realtime`, DO 바인딩 `WORLD`→`WinterWorld`, `ALLOWED_ORIGINS`=Vercel 공식 주소와 Sites 주소. **`workers.dev` 계정 하위 도메인은 파일에 없다.**
- 백엔드는 환경값 `REALTIME_URL`, `REALTIME_SECRET`(32자 이상)로 연결한다(`server/realtime.js`의 `realtimeConfigured`). 이 값은 Sites 환경 설정에 있고 **저장소에 없다**.
- 주소가 문자열로 기록된 곳: `scripts/verify-cloudflare-v46.mjs`, `qa/platform-v59/production/integrity.json`, `qa/experience-v55/production-integrity.json`, `qa/chat-world-v60/production/integrity.json`, `qa/final-v58/production-verified-integrity.json` → `https://winterlight-realtime.winterlight.workers.dev`
- 브라우저 쪽은 `/api/realtime`이 돌려주는 `url`(= `REALTIME_URL`의 `wss`형)로 접속하며, 검증 스크립트는 `wss://winterlight-realtime.` 로 시작하는지 확인한다.
- 결론: 위 주소는 **문서화된 후보**다. 그래서 `.env.example`에는 주석으로만 두었고 코드에 기본값으로 넣지 않았다. `npm run verify:live`가 `service === winterlight-realtime`을 확인했을 때만 확정한다.
- 백엔드 주소(참고): `docs/DEPLOYMENT.md`의 Sites 주소 `https://bits-yeiwon-knowledge.expert-bass-1722.chatgpt.site` — 대시보드는 직접 호출하지 않는다(`/release.json`의 `apiOrigin`으로 도메인만 표시).

## 4. 측정 불가 처리
DNS·시간 초과·연결 거부·인증서·접근 거부(401/403) 등 **응답을 받지 못한 경우는 "측정 불가"** 로 표시하고 원인을 적는다. "장애"는 서비스가 `ok:false`로 답했거나 5xx를 반환했을 때만 사용한다.

## 5. 수집 상태 표시 (Live)
- 상단 배너: LIVE 표시, 마지막 갱신 시각, 10초 넘게 새 값이 없으면 "갱신 지연".
- 인프라 > 원본 연결 점검: `수집 N/M건 성공 · 마지막 점검 시각`, 각 점검의 점검 시각, 실패 시 마지막 정상 시각(이 화면을 연 뒤 기준), 원인·확인할 것·기술 정보.
- 개요: 정상이 아닌 점검이 있으면 원인 알림.

## 6. 변경하지 않은 것
원본의 코드·배포·Worker·D1은 읽기만 했다(클론의 `git status` 변경 0). 토큰은 요청하지 않았다.
