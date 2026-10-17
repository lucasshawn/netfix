import { NextResponse } from 'next/server';
import { getCollector } from '@/lib/collector/service';

export async function POST(request: Request) {
  const body = (await request.json()) as { issueId: string };
  if (!body.issueId) {
    return NextResponse.json(
      { ok: false, message: 'issueId is required' },
      { status: 400 }
    );
  }

  const collector = getCollector();
  const result = await collector.runAutomatedFix(body.issueId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
