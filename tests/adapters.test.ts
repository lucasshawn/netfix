import { describe, it, expect } from 'vitest';
import {
  testHardwareConnection,
  executeAutomatedFix,
} from '@/lib/adapters';
import {
  parseArpOutput,
  parseTracerouteOutput,
  getLocalHostIp,
  discoverAndSampleNetwork,
} from '@/lib/discovery/prober';
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
      { ip: '192.168.1.25', mac: 'dc:a6:32:44-55:66'.replace(/-/g, ':') },
      { ip: '192.168.1.99', mac: '00:11:32:aa:bb:cc' },
    ]);
  });

  it('auto-discovers from traceroute that the gateway is routed through the main Deco unit at 192.168.68.1 without user specifying', () => {
    const containerTraceroute = `
traceroute to 1.1.1.1 (1.1.1.1), 4 hops max, 60 byte packets
 1  10.88.0.1  0.059 ms  0.005 ms  0.002 ms
 2  172.27.240.1  0.415 ms  0.397 ms  0.387 ms
 3  192.168.68.1  3.847 ms  3.839 ms  3.829 ms
 4  50.35.64.1  11.770 ms  11.760 ms  11.751 ms
    `;

    const parsed = parseTracerouteOutput(containerTraceroute);
    expect(parsed.gatewayIp).toBe('192.168.68.1');
    expect(parsed.ispIp).toBe('50.35.64.1');
    expect(parsed.lanHops).toHaveLength(1);
    expect(parsed.doubleNat).toBe(false);
  });

  it('discovers real host, main Deco gateway (192.168.68.1), and ISP hop without false Double-NAT or unconfigured alerts on the main Deco unit', async () => {
    delete process.env.NETFIX_GATEWAY_IP;
    delete process.env.NETFIX_ISP_IP;
    process.env.NETFIX_HOST_IP = '192.168.68.73';
    process.env.NETFIX_HOSTNAME = 'HUB';

    expect(getLocalHostIp()).toBe('192.168.68.73');

    const store = new NetfixStore(':memory:');
    const result = await discoverAndSampleNetwork(store, 1);

    const gateway = result.nodes.find((n) => n.layer === 'gateway');
    const router = result.nodes.find((n) => n.layer === 'router');
    const isp = result.nodes.find((n) => n.layer === 'isp');
    const hubClient = result.nodes.find((n) => n.id === 'node-client-hub');

    expect(gateway?.ip).toBe('192.168.68.1');
    expect(router?.ip).toBe('192.168.68.1');
    expect(gateway?.authStatus).toBe('authenticated');
    expect(router?.authStatus).toBe('authenticated');
    expect(result.doubleNat).toBe(false);
    expect(isp?.ip).toBe('50.35.64.1');
    expect(hubClient?.ip).toBe('192.168.68.73');
    expect(hubClient?.name).toContain('HUB');
    expect(result.nodes.some((n) => n.ip === '192.168.100.1')).toBe(false);
    expect(result.nodes.some((n) => n.ip.startsWith('10.88.'))).toBe(false);
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

