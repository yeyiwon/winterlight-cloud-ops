# WINTERLIGHT CLOUD OPS v0.1

WINTERLIGHT(`yeyiwon/moru-winter-park`)의 운영 상태를 보는 **별도·읽기 전용** 대시보드. 원본 저장소·배포·DB는 수정하지 않는다. 분석 결과는 [docs/ANALYSIS.md](docs/ANALYSIS.md).

## 실행
```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000  (기본: DATA_MODE=mock)
npm test && npm run build
```

## 데이터 모드
| 모드 | 동작 |
|---|---|
| `mock` (기본) | 시간만의 함수로 만든 시뮬레이션. 값이 있는 모든 지표에 **DEMO** 배지, 상단 DEMO 배너, 차트 DEMO 워터마크. 비용 금액은 mock에서도 만들지 않는다. |
| `live` | 읽기 전용 어댑터. 얻지 못한 지표는 숫자 대신 **연동 필요 / 측정 불가**. `DASHBOARD_PASSWORD`가 없으면 503으로 시작을 거부한다(Basic 인증, `src/proxy.ts`). |

모든 수치는 `M<T> = {src, value, note}` 형태이고 `src ∈ demo | live | needs-integration | unavailable`. 값이 `null`이면 UI는 숫자를 그리지 않는다. 테스트가 이 불변식을 검증한다.

## 구조
```
src/lib/types.ts            스냅샷 스키마 + 출처 타입
src/lib/adapters/mock.ts    시뮬레이션
src/lib/adapters/live.ts    읽기 전용 Live 어댑터 (server-only)
src/lib/service.ts          모드 선택, 5초 캐시(원본·API 부하 억제)
src/app/api/metrics         GET 전용 (POST 405)
src/proxy.ts                인증, live fail-closed
src/app/*                   개요 / 인프라 / 실시간 / 장애 / 비용
```
폴링(3초)은 대시보드 서버 → 브라우저 구간이고, 원본 서비스 호출은 5초 캐시 뒤에서만 일어난다.

## Live 연동 현황
| 항목 | 상태 |
|---|---|
| `/api/health`, `/release.json`, realtime `/health` 프로브 | 구현, 목 응답으로 테스트. 실서비스 호출은 이 환경에서 하지 못함 |
| Vercel 배포 이력 | 구현, 실계정 미검증 |
| Cloudflare Workers 요청·오류(최근 1시간) | 구현, **GraphQL 필드명 실계정 미검증** |
| DO·D1 지표, 접속자·WebSocket·지연 | 미구현 — 원본에 읽기 전용 `/metrics` 추가 및 Cloudflare 쿼리 검증 필요 |
| 비용 | 미구현 — 연동 필요로 표시 |

## 알려진 한계
- shadcn/ui CLI는 이 개발 환경에서 레지스트리에 접근할 수 없어 설치하지 못했다. 대신 shadcn 관례(`cn()` + 토큰 기반 컴포넌트)로 `src/components/ui.tsx`를 직접 구현했다. Motion도 쓰지 않고 숫자 전환은 자체 tween이다.
- 실기기 검증은 하지 않았다. 헤드리스 Chromium의 데스크톱·모바일 폭, 라이트·다크에서 콘솔 오류와 가로 넘침이 없음만 확인했다.
- 한도/예산 입력 UI와 초과 위험 계산은 한도 값이 생긴 뒤 추가한다.

## 원본 연결 점검 (Live 모드)

자세한 근거는 [docs/LIVE_CONNECTION.md](docs/LIVE_CONNECTION.md), `/metrics` 설계는 [docs/METRICS_DESIGN.md](docs/METRICS_DESIGN.md)를 본다.

Live 모드는 원본의 공개 읽기 전용 경로를 **GET으로만** 호출한다(원본에는 아무것도 쓰지 않음, 토큰 불필요).

| 경로 | 표시하는 필드(응답에 있을 때만) |
| --- | --- |
| `{WINTERLIGHT_WEB_URL}/api/health` | 상태, 버전, 멀티플레이, 전송 방식 |
| `{WINTERLIGHT_WEB_URL}/release.json` | 버전, 백엔드 도메인 |
| `{WINTERLIGHT_REALTIME_URL}/health` | 상태, 버전, 서비스 이름 |

- 실패 원인을 구분해 한국어로 안내한다: 주소 미설정, 형식 오류, 시간 초과, DNS, 연결 거부, 인증서, 접근 거부(401/403), 404, 429, 서버 오류, 서비스 자체 비정상, 응답 형식 오류.
- 네트워크 계열 실패는 "장애"가 아니라 **"측정 불가"**. 서비스가 `ok:false`라고 답했거나 5xx일 때만 "장애".
- 서비스 간 revision이 다르면 "주의". 접속자·소켓·지연은 `/metrics`가 생기기 전까지 숫자 없이 "연동 필요".

### 연결 검증 절차 (실제 접근 가능한 환경에서)
1. **원본 직접 확인** (대시보드 없이, 읽기 전용):
   ```bash
   WINTERLIGHT_WEB_URL=https://moru-winter-park.vercel.app \
   WINTERLIGHT_REALTIME_URL=https://winterlight-realtime.winterlight.workers.dev \
   npm run verify:live
   ```
   - 종료 코드 `0` 모두 정상 / `1` 서비스가 비정상 응답 / `2` 측정 불가 포함(장애 단정 아님) / `3` 설정 오류.
   - 실시간 주소는 저장소 문서에 기록된 **후보**다. `service=winterlight-realtime`이 나와야 확정한다. 다르면 운영자가 알려 준 주소로 바꾼다.
   - `2`가 나오면 원인 줄을 본다. DNS/시간 초과는 실행 환경의 네트워크 제한일 수 있다. 접근 거부(401/403)는 배포 보호나 방화벽이다.
2. **대시보드 Live 실행**:
   ```bash
   cp .env.example .env.local   # DATA_MODE=live, DASHBOARD_PASSWORD=긴 임의 문자열, 위 두 주소 입력
   npm run build && npm start
   ```
   - `DASHBOARD_PASSWORD` 없이 Live로 시작하면 모든 요청이 503이다(의도된 안전장치).
3. **대시보드와 원본 결과 비교**:
   ```bash
   DASHBOARD_PASSWORD=... npm run verify:live -- --dashboard http://localhost:3000
   ```
   원본 직접 점검과 대시보드 `probes`의 상태가 같아야 한다.
4. **화면 확인**: `LIVE · 읽기 전용` 배너, 인프라 > "원본 연결 점검"의 `수집 N/3건 성공 · 마지막 점검 시각`, 각 줄의 버전·필드, 세 서비스 버전 일치 여부. `DEMO` 문구가 어디에도 없어야 한다.
5. **인증 확인**: 비밀번호 없이 접근하면 401, `POST /api/metrics`는 405.
6. **실패 재현**(선택): 존재하지 않는 도메인을 넣으면 "측정 불가(DNS)", 포트가 닫힌 `http://127.0.0.1:1`은 "연결 거부", 개발용 가짜 원본(아래)으로 D1 장애·버전 불일치를 확인한다.

### 검증용 가짜 원본
`node scripts/fake-winterlight.mjs` 는 **실제 WINTERLIGHT가 아닌** 검증 전용 서버다. `/ok /old /bad /gw /lock /html /slow` 시나리오로 정상·버전 불일치·D1 장애·게이트웨이 오류·접근 거부·형식 오류·시간 초과 표시를 확인한다. 예: `WINTERLIGHT_WEB_URL=http://127.0.0.1:4320/bad`.

### 알려진 한계
- 개발 환경은 외부 접속이 제한되어 실제 `moru-winter-park.vercel.app` 응답은 **확인하지 못했다**(DNS 실패 → "측정 불가").
- 실시간 Worker 주소는 저장소에 기록된 후보이며 실제 응답은 미확인이다.
- Cloudflare GraphQL 필드명은 실제 계정으로 검증하지 않았다. Vercel/Cloudflare 토큰은 요청하지 않았다.
- "마지막 정상 시각"은 화면을 연 뒤 브라우저 메모리 기준이며 새로고침하면 비워진다.
