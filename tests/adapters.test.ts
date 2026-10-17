import { describe, it, expect } from 'vitest';
import {
  testHardwareConnection,
  executeAutomatedFix,
} from '@/lib/adapters';
import { parseArpOutput } from '@/lib/discovery/prober';
import { NetfixStore } from '@/lib/db/store';
import type { NetworkNode } from '@/lib/types';

describe('Hardware Adapters & LAN Discovery Parser', () => {
  it('parses both Windows and Linux ARP table lines accurately', () => {
    const sample = `
Interface: 192.168.1.50 --- 0x6
  Internet Address      Physical Address      Type
  192.168.1.1           bc-24-11-9a-01-01     dynamic
  192.168.1.25          dc-a6-32-44-55-66     dynamic
? (192.168.1.99) at 00:11:32:aa:bb:cc [ether] on eth0
    `;

    const entries = parseArpOutput(sample);
    expect(entries).toEqual([
      { ip: '192.168.1.1', mac: 'bc:24:11:9a:01:01' },
      { ip: '192.168.1.25', mac: 'dc:a6:32:44:55:66' },
      { ip: '192.168.1.99', mac: '00:11:32:aa:bb:cc' },
    ]);
  });

  it('validates SNMP credentials and returns enriched interface counters', async () => {
    const node: NetworkNode = {
      id: 'node-router',
      name: 'Core Router',
      layer: 'router',
      ip: '192.168.1.1',
      parentId: 'node-gateway',
      health: 'healthy',
      latencyMs: 2,
      packetLossPct: 0,
      rxMbps: 100,
      txMbps: 15,
      linkCapacityMbps: 1000,
      authStatus: 'unconfigured',
    };

    const res = await testHardwareConnection(node, {
      protocol: 'snmp',
      port: 161,
      snmpVersion: '2c',
      community: 'public',
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain('SNMP');
    expect(res.telemetryPatch?.authStatus).toBe('authenticated');
  });

  it('executes automated fix for gateway bufferbloat and marks issue resolved in store', async () => {
    const store = new NetfixStore(':memory:');
    store.upsertNode({
      id: 'node-gateway',
      name: 'ISP Gateway',
      layer: 'gateway',
      ip: '192.168.1.254',
      parentId: 'node-isp',
      health: 'critical',
      latencyMs: 56,
      packetLossPct: 0.4,
      rxMbps: 220,
      txMbps: 28,
      linkCapacityMbps: 250,
      authStatus: 'authenticated',
    });
    store.setIssues([
      {
        id: 'issue-gateway-bufferbloat',
        nodeId: 'node-gateway',
        nodeName: 'ISP Gateway',
        layer: 'gateway',
        severity: 'critical',
        title: 'Bufferbloat',
        description: 'High queue delay',
        suggestion: 'Enable SQM',
        canAutoFix: true,
        autoFixCommandPreview: 'tc qdisc replace dev eth0 root cake',
        resolved: false,
      },
    ]);

    const fixResult = await executeAutomatedFix('issue-gateway-bufferbloat', store);
    expect(fixResult.ok).toBe(true);
    const updatedIssues = store.getIssues();
    expect(updatedIssues[0].resolved).toBe(true);
  });
});
