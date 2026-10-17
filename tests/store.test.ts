import { describe, it, expect, beforeEach } from 'vitest';
import { NetfixStore } from '@/lib/db/store';
import type { NetworkNode } from '@/lib/types';

describe('NetfixStore (SQLite persistence)', () => {
  let store: NetfixStore;

  beforeEach(() => {
    store = new NetfixStore(':memory:');
  });

  it('persists topology nodes and attaches encrypted credentials without exposing plaintext in getNodes()', () => {
    const gatewayNode: NetworkNode = {
      id: 'node-gateway',
      name: 'ISP Gateway (192.168.1.1)',
      layer: 'gateway',
      ip: '192.168.1.1',
      parentId: 'node-isp',
      health: 'warning',
      latencyMs: 42,
      packetLossPct: 0.2,
      rxMbps: 185,
      txMbps: 24,
      linkCapacityMbps: 250,
      authStatus: 'unconfigured',
    };

    store.upsertNode(gatewayNode);
    const updated = store.saveCredentials(
      'node-gateway',
      {
        protocol: 'snmp',
        port: 161,
        snmpVersion: '2c',
        community: 'secret-community',
      },
      'authenticated'
    );

    expect(updated?.authStatus).toBe('authenticated');
    expect(updated?.credentialSummary?.protocol).toBe('snmp');
    expect(updated?.credentialSummary?.hasSecret).toBe(true);
    expect(JSON.stringify(updated)).not.toContain('secret-community');

    const rawCreds = store.getCredentials('node-gateway');
    expect(rawCreds?.community).toBe('secret-community');
  });

  it('stores and retrieves rolling traffic samples in chronological order', () => {
    store.insertTrafficSample({
      timestamp: 1000,
      downloadMbps: 120,
      uploadMbps: 15,
      gatewayLatencyMs: 18,
      bottleneckScore: 42,
    });
    store.insertTrafficSample({
      timestamp: 2000,
      downloadMbps: 195,
      uploadMbps: 28,
      gatewayLatencyMs: 48,
      bottleneckScore: 78,
    });

    const samples = store.getRecentTraffic(10);
    expect(samples).toHaveLength(2);
    expect(samples[0].timestamp).toBe(1000);
    expect(samples[1].bottleneckScore).toBe(78);
  });
});
