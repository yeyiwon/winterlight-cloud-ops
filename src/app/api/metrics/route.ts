import { getSnapshot } from '@/lib/service';
export async function GET() {
  try { return Response.json(await getSnapshot(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '지표를 불러오지 못했습니다.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } }); }
}
export const POST = () => Response.json({ error: '읽기 전용 API입니다.' }, { status: 405 });
