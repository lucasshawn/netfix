import { getCollector } from '@/lib/collector/service';
import { NetfixApp } from '@/components/NetfixApp';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const collector = getCollector();
  const initialSnapshot = await collector.collectTick();

  return <NetfixApp initialSnapshot={initialSnapshot} />;
}
