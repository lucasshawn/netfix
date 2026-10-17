import os from 'os';
import type {
  AdapterCredentials,
  DashboardSnapshot,
  NetworkNode,
  TopologyEdge,
} from '@/lib/types';
import { NetfixStore } from '@/lib/db/store';
import {
  discoverAndSampleNetwork,
  getLocalHostIp,
} from '@/lib/discovery/prober';
import {
  calculateGatewayBottleneck,
  evaluateNetworkIssues,
} from '@/lib/diagnostics/engine';
import {
  executeAutomatedFix,
  testHardwareConnection,
} from '@/lib/adapters';

export class CollectorService {
  private store: NetfixStore;
  private tickCount = 0;
  private lastSnapshot: DashboardSnapshot | null = null;

  constructor(store?: NetfixStore) {
    this.store = store || new NetfixStore();
  }

  getStore(): NetfixStore {
    return this.store;
  }

  async collectTick(): Promise<DashboardSnapshot> {
    this.tickCount += 1;

    // Seed initial historical curve on first tick
    if (this.store.getRecentTraffic(5).length === 0) {
      const now = Date.now();
      for (let i = 15; i >= 1; i--) {
        const w = Math.sin(i * 0.5);
        const dl = Math.max(0.5, Math.round((3.2 + w * 1.4) * 10) / 10);
        const ul = Math.max(0.2, Math.round((1.1 + Math.cos(i * 0.4) * 0.5) * 10) / 10);
        const lat = Math.round((4.5 + Math.abs(w) * 1.2) * 10) / 10;
        this.store.insertTrafficSample({
          timestamp: now - i * 3000,
          downloadMbps: dl,
          uploadMbps: ul,
          gatewayLatencyMs: lat,
          bottleneckScore: Math.max(5, Math.min(100, Math.round(dl * 2 + lat))),
        });
      }
    }

    const {
      nodes,
      destinations,
      talkers,
      streams,
      doubleNat,
      baselineLatencyMs,
    } = await discoverAndSampleNetwork(this.store, this.tickCount);

    const gatewayNode = nodes.find((n) => n.layer === 'gateway') || nodes[0];
    const natTableUsagePct = Number(gatewayNode?.metadata?.natTablePct || 76);

    const gatewayMetrics = calculateGatewayBottleneck({
      wanDownMbps: gatewayNode.rxMbps,
      wanUpMbps: gatewayNode.txMbps,
      wanCapacityMbps: gatewayNode.linkCapacityMbps,
      baselineLatencyMs,
      currentLatencyMs: gatewayNode.latencyMs,
      packetDropPct: gatewayNode.packetLossPct,
      natTableUsagePct,
    });

    this.store.insertTrafficSample({
      timestamp: Date.now(),
      downloadMbps: gatewayMetrics.wanDownMbps,
      uploadMbps: gatewayMetrics.wanUpMbps,
      gatewayLatencyMs: gatewayMetrics.currentLatencyMs,
      bottleneckScore: gatewayMetrics.score,
    });

    const evaluatedIssues = evaluateNetworkIssues(
      nodes,
      gatewayMetrics,
      doubleNat
    );
    this.store.setIssues(evaluatedIssues);

    const edges: TopologyEdge[] = nodes
      .filter((n) => n.parentId !== null)
      .map((n) => ({
        id: `edge-${n.parentId}-to-${n.id}`,
        source: n.parentId as string,
        target: n.id,
        rxMbps: n.rxMbps,
        txMbps: n.txMbps,
        capacityMbps: n.linkCapacityMbps,
        latencyMs: n.latencyMs,
        health: n.health,
        label: `${n.rxMbps} Mbps • ${n.latencyMs}ms`,
      }));

    const hostIp = getLocalHostIp();
    const port = process.env.PORT || '3000';

    this.lastSnapshot = {
      timestamp: Date.now(),
      hostName: process.env.NETFIX_HOSTNAME || os.hostname() || 'hub',
      lanUrl: `http://${hostIp}:${port}`,
      nodes,
      edges,
      gateway: gatewayMetrics,
      trafficHistory: this.store.getRecentTraffic(25),
      destinations,
      talkers,
      streams,
      issues: this.store.getIssues(),
    };

    return this.lastSnapshot;
  }

  async getSnapshot(): Promise<DashboardSnapshot> {
    if (!this.lastSnapshot) {
      return this.collectTick();
    }
    return this.lastSnapshot;
  }

  async configureNodeCredentials(
    nodeId: string,
    creds: AdapterCredentials
  ): Promise<{
    ok: boolean;
    message: string;
    node?: NetworkNode;
    snapshot: DashboardSnapshot;
  }> {
    const existing = this.store.getNode(nodeId);
    if (!existing) {
      const snapshot = await this.getSnapshot();
      return {
        ok: false,
        message: `Node ${nodeId} not found`,
        snapshot,
      };
    }

    const testResult = await testHardwareConnection(existing, creds);
    if (testResult.telemetryPatch?.metadata) {
      existing.metadata = testResult.telemetryPatch.metadata;
      this.store.upsertNode(existing);
    }

    const updatedNode = this.store.saveCredentials(
      nodeId,
      creds,
      testResult.telemetryPatch?.authStatus ||
        (testResult.ok ? 'authenticated' : 'auth_error'),
      testResult.telemetryPatch?.lastAuthError
    );

    const snapshot = await this.collectTick();
    return {
      ok: testResult.ok,
      message: testResult.message,
      node: updatedNode,
      snapshot,
    };
  }

  async runAutomatedFix(issueId: string): Promise<{
    ok: boolean;
    message: string;
    commandExecuted: string;
    snapshot: DashboardSnapshot;
  }> {
    const res = await executeAutomatedFix(issueId, this.store);
    const snapshot = await this.collectTick();
    return {
      ...res,
      snapshot,
    };
  }
}

const globalForCollector = globalThis as unknown as {
  netfixCollector?: CollectorService;
};

export function getCollector(): CollectorService {
  if (!globalForCollector.netfixCollector) {
    globalForCollector.netfixCollector = new CollectorService();
  }
  return globalForCollector.netfixCollector;
}
