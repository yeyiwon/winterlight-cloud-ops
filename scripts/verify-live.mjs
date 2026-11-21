#!/usr/bin/env node
/**
 * 실제 접근 가능한 환경에서 Live 연결을 재현·검증하는 읽기 전용 스크립트. (의존성 없음, Node 20+)
 *
 *   WINTERLIGHT_WEB_URL=https://moru-winter-park.vercel.app \
 *   WINTERLIGHT_REALTIME_URL=https://winterlight-realtime.winterlight.workers.dev \
 *   node scripts/verify-live.mjs [--dashboard http://localhost:3000]
 *
 * - 원본에는 GET만 보낸다(쓰기·인증·토큰 없음).
 * - 응답이 없으면 원인을 구분해 출력한다. 네트워크 계열 실패는 "측정 불가"이며 서비스 장애가 아니다.
 * - 종료 코드: 0 모두 정상 / 1 서비스가 비정상이라 응답 / 2 측정 불가가 있음(장애 단정 아님) / 3 설정 오류
 * - --dashboard 를 주면 대시보드 /api/metrics 가 같은 결론을 내는지 비교한다(DASHBOARD_PASSWORD 환경변수 필요).
 */
const web = (process.env.WINTERLIGHT_WEB_URL || 'https://moru-winter-park.vercel.app').replace(/\/+$/, '');
const rt = (process.env.WINTERLIGHT_REALTIME_URL || '').replace(/\/+$/, '');
const dash = process.argv.includes('--dashboard') ? process.argv[process.argv.indexOf('--dashboard') + 1] : null;

const kindOf = (e) => { const c = e?.cause?.code ?? e?.code; if (e?.name === 'TimeoutError' || c === 'UND_ERR_CONNECT_TIMEOUT' || c === 'ETIMEDOUT') return ['timeout', '제한 시간 초과']; if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') return ['dns', '이 환경에서 도메인을 찾지 못함(DNS)']; if (c === 'ECONNREFUSED') return ['refused', '연결 거부']; if (/^(CERT_|ERR_TLS|DEPTH_ZERO|UNABLE_TO_VERIFY|SELF_SIGNED)/.test(c || '')) return ['tls', '인증서 확인 실패']; return ['network', `네트워크 오류${c ? ` (${c})` : ''}`]; };
const pick = (b) => Object.fromEntries(['ok', 'multiplayer', 'transport', 'service', 'apiOrigin', 'revision'].filter((k) => k in b).map((k) => [k, k === 'apiOrigin' ? new URL(b[k]).hostname : b[k]]));

async function probe(name, base, path, expect) {
  if (!base) return { name, path, verdict: 'config', note: '주소가 설정되지 않음' };
  const url = base + path, t0 = performance.now();
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000), cache: 'no-store' });
    const ms = Math.round(performance.now() - t0), text = await r.text();
    let b = null; try { b = JSON.parse(text.slice(0, 65536)); } catch { /* 형식 오류 */ }
    if (r.status === 401 || r.status === 403) return { name, url, status: r.status, ms, verdict: 'unmeasurable', note: '접근 거부(배포 보호·방화벽 가능)' };
    if (b && b.ok === false) return { name, url, status: r.status, ms, verdict: 'unhealthy', note: '서비스가 스스로 비정상이라고 응답' };
    if (r.status >= 500) return { name, url, status: r.status, ms, verdict: 'unhealthy', note: `서버 오류 HTTP ${r.status}` };
    if (!r.ok) return { name, url, status: r.status, ms, verdict: 'unmeasurable', note: `예상 밖 응답 HTTP ${r.status}` };
    if (!b || typeof b !== 'object') return { name, url, status: r.status, ms, verdict: 'unmeasurable', note: 'JSON이 아닌 응답(다른 서비스·로그인 페이지 가능)' };
    if (expect?.service && b.service !== expect.service) return { name, url, status: r.status, ms, verdict: 'unmeasurable', note: `service 값이 다름: ${String(b.service).slice(0, 40)}` };
    return { name, url, status: r.status, ms, verdict: 'ok', fields: pick(b) };
  } catch (e) { const [k, note] = kindOf(e); return { name, url, verdict: 'unmeasurable', note, kind: k }; }
}

const rows = await Promise.all([probe('백엔드·D1', web, '/api/health'), probe('Vercel 릴리스', web, '/release.json'), probe('실시간 Worker', rt, '/health', { service: 'winterlight-realtime' })]);
const icon = { ok: '✔ 정상', unhealthy: '✖ 서비스 오류', unmeasurable: '? 측정 불가', config: '· 설정 필요' };
console.log(`WINTERLIGHT Live 연결 점검 ${new Date().toISOString()}\n`);
for (const r of rows) console.log(`${icon[r.verdict].padEnd(12)} ${r.name.padEnd(14)} ${r.url ?? r.path}${r.ms != null ? `  ${r.ms}ms` : ''}${r.status ? `  HTTP ${r.status}` : ''}\n${' '.repeat(13)}${r.note ?? JSON.stringify(r.fields)}`);
const revs = [...new Set(rows.filter((r) => r.verdict === 'ok' && r.fields?.revision).map((r) => r.fields.revision))];
if (revs.length > 1) console.log(`\n⚠ 서비스 간 revision 불일치: ${revs.map((x) => x.slice(0, 7)).join(' ≠ ')} (배포 진행 중일 수 있음)`);
else if (revs.length === 1) console.log(`\n버전: ${revs[0].slice(0, 7)} (확인된 서비스 모두 동일)`);

let code = rows.some((r) => r.verdict === 'unhealthy') ? 1 : rows.some((r) => r.verdict !== 'ok') ? 2 : 0;
if (dash) {
  const pw = process.env.DASHBOARD_PASSWORD;
  try {
    const r = await fetch(dash.replace(/\/+$/, '') + '/api/metrics', { headers: pw ? { Authorization: 'Basic ' + Buffer.from('x:' + pw).toString('base64') } : {}, signal: AbortSignal.timeout(15000) });
    if (r.status === 401) { console.log('\n대시보드: 401 — DASHBOARD_PASSWORD 환경변수를 지정하세요.'); code = 3; }
    else { const s = await r.json(); const same = s.probes.items.map((p) => `${p.id}:${p.state}`).join(' '); console.log(`\n대시보드 mode=${s.mode} 상태=${s.overview.status.value ?? s.overview.status.src}\n  probes → ${same}`); }
  } catch (e) { console.log(`\n대시보드에 연결하지 못함: ${kindOf(e)[1]}`); code = 3; }
}
console.log(code === 0 ? '\n결과: 모두 정상' : code === 1 ? '\n결과: 서비스가 비정상이라고 응답한 항목이 있음' : code === 2 ? '\n결과: 측정하지 못한 항목이 있음(서비스 장애로 단정할 수 없음)' : '\n결과: 설정 오류');
process.exit(code);
