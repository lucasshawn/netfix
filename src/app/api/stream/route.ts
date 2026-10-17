import { getCollector } from '@/lib/collector/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const collector = getCollector();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSnapshot = async () => {
        try {
          const snapshot = await collector.collectTick();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`)
          );
        } catch {
          // Ignore stream write after close
        }
      };

      await sendSnapshot();
      const interval = setInterval(sendSnapshot, 3000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
