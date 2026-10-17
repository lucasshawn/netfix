import { describe, it, expect } from 'vitest';
import { CollectorService } from '@/lib/collector/service';
import { NetfixStore } from '@/lib/db/store';

describe('CollectorService & Snapshot Pipeline', () => {
  it('builds a complete DashboardSnapshot with ISP -> Gateway -> Router -> Clients hierarchy and traffic trends', async () => {
    const store = new NetfixStore(':memory:');
    const collector = new CollectorService(store);

    const snapshot = await collector.collectTick();

    expect(snapshot.nodes.some((n) => n.layer === 'isp')).toBe(true);
    expect(snapshot.nodes.some((n) => n.layer === 'gateway')).toBe(true);
    expect(snapshot.nodes.some((n) => n.layer === 'router')).toBe(true);
    expect(snapshot.nodes.some((n) => n.layer === 'client')).toBe(true);
    expect(snapshot.edges.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.gateway.score).toBeGreaterThan(0);
    expect(snapshot.destinations.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.trafficHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('authenticates a router node with SNMP credentials and updates the snapshot', async () => {
    const store = new NetfixStore(':memory:');
    const collector = new CollectorService(store);
    await collector.collectTick();

    const result = await collector.configureNodeCredentials('node-router', {
      protocol: 'snmp',
      port: 161,
      snmpVersion: '2c',
      community: 'homelab-ro',
    });

    expect(result.ok).toBe(true);
    expect(result.node?.authStatus).toBe('authenticated');
    expect(result.node?.credentialSummary?.protocol).toBe('snmp');
  });
});
