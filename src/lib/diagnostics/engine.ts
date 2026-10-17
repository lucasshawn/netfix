import type {
  GatewayBottleneckMetrics,
  NetworkIssue,
  NetworkLayer,
  NetworkNode,
  NodeHealth,
} from '@/lib/types';

export function isPrivateOrCgnatIp(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)
  );
}

export function calculateGatewayBottleneck(input: {
  wanDownMbps: number;
  wanUpMbps: number;
  wanCapacityMbps: number;
  baselineLatencyMs: number;
  currentLatencyMs: number;
  packetDropPct: number;
  natTableUsagePct: number;
}): GatewayBottleneckMetrics {
  const capacity = Math.max(10, input.wanCapacityMbps);
  const peakDirectionMbps = Math.max(input.wanDownMbps, input.wanUpMbps);
  const bandwidthSaturationPct = Math.min(
    100,
    Math.round((peakDirectionMbps / capacity) * 100)
  );

  const bufferbloatDeltaMs = Math.max(
    0,
    Math.round((input.currentLatencyMs - input.baselineLatencyMs) * 10) / 10
  );
  const latencyScore = Math.min(100, (bufferbloatDeltaMs / 50) * 100);
  const dropScore = Math.min(
    100,
    input.packetDropPct * 25 + Math.max(0, input.natTableUsagePct - 70) * 1.5
  );

  const score = Math.min(
    100,
    Math.round(
      0.45 * bandwidthSaturationPct + 0.4 * latencyScore + 0.15 * dropScore
    )
  );

  let status: NodeHealth = 'healthy';
  if (score >= 75) {
    status = 'critical';
  } else if (score >= 50) {
    status = 'warning';
  }

  let summary = 'Gateway operating smoothly with low queueing delay.';
  if (score >= 75) {
    summary = `Gateway bottlenecked (${score}%): Bufferbloat +${bufferbloatDeltaMs}ms under ${bandwidthSaturationPct}% WAN load.`;
  } else if (score >= 50) {
    summary = `Elevated gateway load (${score}%): Queue delay +${bufferbloatDeltaMs}ms (${bandwidthSaturationPct}% capacity).`;
  }

  return {
    score,
    status,
    wanDownMbps: Math.round(input.wanDownMbps * 10) / 10,
    wanUpMbps: Math.round(input.wanUpMbps * 10) / 10,
    wanCapacityMbps: capacity,
    bandwidthSaturationPct,
    baselineLatencyMs: input.baselineLatencyMs,
    currentLatencyMs: input.currentLatencyMs,
    bufferbloatDeltaMs,
    packetDropPct: input.packetDropPct,
    natTableUsagePct: input.natTableUsagePct,
    summary,
  };
}

export function classifyTracerouteHops(
  hops: { hop: number; ip: string; rttMs: number }[]
): { layer: NetworkLayer; ip: string; rttMs: number; doubleNat: boolean }[] {
  const privateHops = hops.filter((h) => isPrivateOrCgnatIp(h.ip));
  const doubleNat = privateHops.length >= 2;

  return hops.map((h, idx) => {
    if (isPrivateOrCgnatIp(h.ip)) {
      if (idx === 0 && doubleNat) {
        return { layer: 'router', ip: h.ip, rttMs: h.rttMs, doubleNat: false };
      }
      return {
        layer: 'gateway',
        ip: h.ip,
        rttMs: h.rttMs,
        doubleNat: idx >= 1 && doubleNat,
      };
    }
    return { layer: 'isp', ip: h.ip, rttMs: h.rttMs, doubleNat: false };
  });
}

export function evaluateNetworkIssues(
  nodes: NetworkNode[],
  gatewayMetrics: GatewayBottleneckMetrics,
  doubleNatDetected = false
): NetworkIssue[] {
  const issues: NetworkIssue[] = [];
  const gatewayNode = nodes.find((n) => n.layer === 'gateway');
  const routerNode = nodes.find((n) => n.layer === 'router');

  if (gatewayMetrics.bufferbloatDeltaMs >= 25 || gatewayMetrics.score >= 70) {
    issues.push({
      id: 'issue-gateway-bufferbloat',
      nodeId: gatewayNode?.id || 'node-gateway',
      nodeName: gatewayNode?.name || 'ISP Gateway',
      layer: 'gateway',
      severity: gatewayMetrics.score >= 75 ? 'critical' : 'warning',
      title: `Gateway Bufferbloat & Queue Saturation (+${gatewayMetrics.bufferbloatDeltaMs}ms)`,
      description: `Heavy WAN downloads (${gatewayMetrics.wanDownMbps} Mbps, ${gatewayMetrics.bandwidthSaturationPct}% of capacity) are inflating gateway queue latency from ${gatewayMetrics.baselineLatencyMs}ms to ${gatewayMetrics.currentLatencyMs}ms.`,
      suggestion:
        'Enable Smart Queue Management (SQM / CAKE / FQ-CoDel) on the Gateway or Router and cap WAN shaper bandwidth to 92% of line rate.',
      canAutoFix: true,
      autoFixActionLabel: 'Auto-Enable CAKE SQM QoS Shaper',
      autoFixCommandPreview: `tc qdisc replace dev eth0 root cake bandwidth ${Math.round(gatewayMetrics.wanCapacityMbps * 0.92)}mbit diffserv4 nat`,
      resolved: false,
    });
  }

  if (doubleNatDetected) {
    issues.push({
      id: 'issue-double-nat',
      nodeId: routerNode?.id || gatewayNode?.id || 'node-router',
      nodeName: routerNode?.name || 'Core Router',
      layer: 'router',
      severity: 'warning',
      title: 'Double-NAT Detected Across Router & ISP Gateway Layers',
      description:
        'Both the local Router hop and the upstream ISP Gateway hop are performing private network address translation (RFC1918), adding state table overhead and breaking UPnP/port-forwarding.',
      suggestion:
        'Place the upstream ISP Gateway into IP Passthrough / Bridge Mode, or configure the Core Router in Access Point / Bridge mode.',
      canAutoFix: true,
      autoFixActionLabel: 'Configure Gateway DMZ / Passthrough to Router',
      autoFixCommandPreview:
        'nvram set wan_passthrough_enable=1 && service restart_wan',
      resolved: false,
    });
  }

  for (const node of nodes) {
    if (
      (node.layer === 'gateway' ||
        node.layer === 'router' ||
        node.layer === 'switch' ||
        node.layer === 'mesh') &&
      node.authStatus === 'unconfigured'
    ) {
      issues.push({
        id: `issue-unauth-${node.id}`,
        nodeId: node.id,
        nodeName: node.name,
        layer: node.layer,
        severity: 'warning',
        title: `Hardware Telemetry Locked on ${node.name}`,
        description: `${node.name} (${node.ip}) was discovered via L2/L3 network probes, but lacks SNMP/SSH/HTTP credentials to inspect internal interface drops, CPU load, and hardware NAT tables.`,
        suggestion:
          'Select this node on the topology map and add SNMP v2c/v3, SSH, or HTTP credentials in the Node Credentials panel.',
        canAutoFix: false,
        resolved: false,
      });
    }
  }

  return issues;
}
