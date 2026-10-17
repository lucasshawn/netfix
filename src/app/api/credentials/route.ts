import { NextResponse } from 'next/server';
import { getCollector } from '@/lib/collector/service';
import type { AdapterCredentials } from '@/lib/types';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    nodeId: string;
    credentials: AdapterCredentials;
  };

  if (!body.nodeId || !body.credentials) {
    return NextResponse.json(
      { ok: false, message: 'nodeId and credentials are required' },
      { status: 400 }
    );
  }

  const collector = getCollector();
  const result = await collector.configureNodeCredentials(
    body.nodeId,
    body.credentials
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
