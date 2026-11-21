import { NextResponse, type NextRequest } from 'next/server';

/** Live 모드는 비밀번호 없이 시작하지 않는다(fail-closed). Mock 모드는 공개 가능. */
export function proxy(req: NextRequest) {
  const live = process.env.DATA_MODE === 'live', pass = process.env.DASHBOARD_PASSWORD;
  if (!live && !pass) return NextResponse.next();
  if (!pass) return new NextResponse('DASHBOARD_PASSWORD가 설정되지 않아 Live 모드를 열 수 없습니다.', { status: 503 });
  const [scheme, token] = (req.headers.get('authorization') ?? '').split(' ');
  if (scheme === 'Basic' && token) {
    const given = atob(token).split(':').slice(1).join(':');
    if (given.length === pass.length && [...given].reduce((a, c, i) => a | (c.charCodeAt(0) ^ pass.charCodeAt(i)), 0) === 0) return NextResponse.next();
  }
  return new NextResponse('인증이 필요합니다.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="WINTERLIGHT CLOUD OPS"', 'Cache-Control': 'no-store' } });
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
