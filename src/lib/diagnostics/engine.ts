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

  let summary =
    'Your main gateway has plenty of breathing room — downloads and video calls are flowing smoothly without waiting in line.';
  if (score >= 75) {
    summary = `Gateway bottlenecked (${score}%): Heavy downloads (${bandwidthSaturationPct}% of speed) are causing Bufferbloat (+${bufferbloatDeltaMs}ms extra lag for other devices).`;
  } else if (score >= 50) {
    summary = `Moderate gateway load (${score}%): Traffic is adding +${bufferbloatDeltaMs}ms of waiting-line delay (${bandwidthSaturationPct}% of internet speed used).`;
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
      title: `Internet Traffic Jam (Gateway Bufferbloat: +${gatewayMetrics.bufferbloatDeltaMs}ms Lag)`,
      description: `A large download (${gatewayMetrics.wanDownMbps} Mbps, using ${gatewayMetrics.bandwidthSaturationPct}% of your internet pipe) is backing up your gateway's waiting line, slowing response times from ${gatewayMetrics.baselineLatencyMs}ms to ${gatewayMetrics.currentLatencyMs}ms for everyone else.`,
      suggestion:
        'Turn on Smart Traffic Prioritization (QoS / Smart Queue Management) so small, time-sensitive traffic (video calls, gaming, web pages) gets to skip ahead of giant file downloads.',
      canAutoFix: true,
      autoFixActionLabel: 'Turn On Smart Traffic Prioritization (QoS)',
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
      title: 'Two Routers Managing the Same Network (Double-NAT)',
      description:
        'Two devices in a row are acting as routers and translating addresses separately. This adds extra work and can cause issues with online games, video calls, and smart-home devices.',
      suggestion:
        'Put your ISP modem/gateway into "Bridge / Passthrough Mode", or set your Wi-Fi mesh router to "Access Point (AP) Mode" so only one device manages the network.',
      canAutoFix: true,
      autoFixActionLabel: 'Switch Gateway to Bridge / Passthrough Mode',
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
        title: `Internal Health Sensors Locked on ${node.name}`,
        description: `${node.name} (${node.ip}) was found automatically on your network, but Netfix doesn't have login credentials to read its internal port counters or Wi-Fi health.`,
        suggestion:
          'Click this device on the map and add SNMP, SSH, or Web credentials in Panel #3 to unlock deeper diagnostics.',
        canAutoFix: false,
        resolved: false,
      });
    }
  }

  return issues;
}
