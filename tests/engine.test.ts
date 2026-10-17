import { describe, it, expect } from 'vitest';
import {
  calculateGatewayBottleneck,
  classifyTracerouteHops,
  evaluateNetworkIssues,
} from '@/lib/diagnostics/engine';
import type { NetworkNode } from '@/lib/types';

describe('Diagnostics & Gateway Bottleneck Engine', () => {
  it('computes high bottleneck score when bandwidth saturation and bufferbloat spike', () => {
    const metrics = calculateGatewayBottleneck({
      wanDownMbps: 220,
      wanUpMbps: 28,
      wanCapacityMbps: 250,
      baselineLatencyMs: 12,
      currentLatencyMs: 64,
      packetDropPct: 0.8,
      natTableUsagePct: 84,
    });

    expect(metrics.score).toBeGreaterThanOrEqual(75);
    expect(metrics.status).toBe('critical');
    expect(metrics.bufferbloatDeltaMs).toBe(52);
    expect(metrics.summary).toContain('Bufferbloat');
  });

  it('classifies traceroute hops into router, gateway, and isp and detects Double-NAT when two private hops exist', () => {
    const classified = classifyTracerouteHops([
      { hop: 1, ip: '192.168.68.1', rttMs: 2 },
      { hop: 2, ip: '192.168.1.254', rttMs: 6 },
      { hop: 3, ip: '96.120.14.1', rttMs: 14 },
    ]);

    expect(classified[0].layer).toBe('router');
    expect(classified[1].layer).toBe('gateway');
    expect(classified[1].doubleNat).toBe(true);
    expect(classified[2].layer).toBe('isp');
  });

  it('generates actionable layer issues with automated fix support', () => {
    const nodes: NetworkNode[] = [
      {
        id: 'node-gateway',
        name: 'ISP Gateway',
        layer: 'gateway',
        ip: '192.168.1.254',
        parentId: 'node-isp',
        health: 'critical',
        latencyMs: 58,
        packetLossPct: 0.5,
        rxMbps: 215,
        txMbps: 25,
        linkCapacityMbps: 250,
        authStatus: 'authenticated',
      },
    ];

    const gatewayMetrics = calculateGatewayBottleneck({
      wanDownMbps: 215,
      wanUpMbps: 25,
      wanCapacityMbps: 250,
      baselineLatencyMs: 12,
      currentLatencyMs: 58,
      packetDropPct: 0.5,
      natTableUsagePct: 82,
    });

    const issues = evaluateNetworkIssues(nodes, gatewayMetrics, true);
    expect(issues.some((i) => i.id === 'issue-gateway-bufferbloat')).toBe(true);
    expect(issues.some((i) => i.id === 'issue-double-nat')).toBe(true);
  });
});
