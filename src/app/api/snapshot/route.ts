import { NextResponse } from 'next/server';
import { getCollector } from '@/lib/collector/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const collector = getCollector();
  const snapshot = await collector.collectTick();
  return NextResponse.json(snapshot);
}
