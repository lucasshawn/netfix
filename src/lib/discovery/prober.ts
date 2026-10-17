import { exec } from 'child_process';
import os from 'os';
import { promisify } from 'util';
import type {
  ClientTalker,
  NetworkNode,
  TrafficDestination,
} from '@/lib/types';
import type { NetfixStore } from '@/lib/db/store';

const execAsync = promisify(exec);

const OUI_VENDORS: Record<string, string> = {
  'bc:24:11': 'Proxmox / Ubiquiti',
  'dc:a6:32': 'Raspberry Pi Foundation',
  '00:11:32': 'Synology Inc.',
  'f0:9f:c2': 'Ubiquiti Networks',
  '50:c7:bf': 'TP-Link Systems',
  '3c:22:fb': 'Apple, Inc.',
  '04:d4:c4': 'ASUSTek Computer',
};

export function parseArpOutput(
  rawOutput: string
): { ip: string; mac: string }[] {
  const results: { ip: string; mac: string }[] = [];
  const seenIps = new Set<string>();
  const lines = rawOutput.split(/\r?\n/);

  for (const line of lines) {
    // Match Windows `192.168.1.1   bc-24-11-9a-01-01   dynamic` or Linux `? (192.168.1.1) at bc:24:11:9a:01:01`
    const ipMatch = line.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
    const macMatch = line.match(
      /\b([0-9a-fA-F]{2}(?:[:-][0-9a-fA-F]{2}){5})\b/
    );
    if (ipMatch && macMatch) {
      const ip = ipMatch[1];
      const mac = macMatch[1].replace(/-/g, ':').toLowerCase();
      if (
        mac !== 'ff:ff:ff:ff:ff:ff' &&
        !ip.endsWith('.255') &&
        !ip.startsWith('224.') &&
        !ip.startsWith('239.') &&
        !seenIps.has(ip)
      ) {
        seenIps.add(ip);
        results.push({ ip, mac });
      }
    }
  }

  return results;
}

function lookupVendor(mac: string): string {
  const prefix = mac.slice(0, 8).toLowerCase();
  return OUI_VENDORS[prefix] || 'Residential LAN Device';
}

export function getLocalHostIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.1.50';
}

export async function discoverAndSampleNetwork(
  store: NetfixStore,
  tickCount: number
): Promise<{
  nodes: NetworkNode[];
  destinations: TrafficDestination[];
  talkers: ClientTalker[];
  doubleNat: boolean;
  baselineLatencyMs: number;
}> {
  let arpEntries: { ip: string; mac: string }[] = [];
  try {
    const { stdout } = await execAsync('arp -a', { timeout: 1500 });
    arpEntries = parseArpOutput(stdout);
  } catch {
    arpEntries = [];
  }

  const hostIp = getLocalHostIp();
  const subnetPrefix = hostIp.split('.').slice(0, 3).join('.') || '192.168.1';

  // Smooth wave modulation so real-time charts & bottleneck metrics breathe naturally
  const wave = Math.sin(tickCount * 0.45);
  const existingGateway = store.getNode('node-gateway');
  const sqmFixed = Boolean(existingGateway?.metadata?.sqmEnabled);
  const bridgeFixed = Boolean(existingGateway?.metadata?.bridgeModeEnabled);

  const steamMbps = Math.max(45, Math.round((108 + wave * 22) * 10) / 10);
  const netflixMbps = Math.max(18, Math.round((44 + Math.cos(tickCount * 0.3) * 8) * 10) / 10);
  const backupMbps = Math.max(8, Math.round((24 + Math.sin(tickCount * 0.2) * 5) * 10) / 10);
  const webMbps = Math.max(5, Math.round((14 + Math.cos(tickCount * 0.5) * 4) * 10) / 10);

  const totalDownMbps =
    Math.round((steamMbps + netflixMbps + backupMbps + webMbps) * 10) / 10;
  const totalUpMbps = Math.round((backupMbps * 0.75 + 9.4) * 10) / 10;

  const gatewayLatencyMs = sqmFixed
    ? Math.round((14 + Math.abs(wave) * 3) * 10) / 10
    : Math.round((48 + wave * 11) * 10) / 10;

  const baseNodes: NetworkNode[] = [
    {
      id: 'node-isp',
      name: 'ISP WAN Backbone (AS7922)',
      layer: 'isp',
      ip: '96.120.14.1',
      vendor: 'Upstream Broadband ISP',
      parentId: null,
      health: 'healthy',
      latencyMs: 12,
      packetLossPct: 0.0,
      rxMbps: totalDownMbps,
      txMbps: totalUpMbps,
      linkCapacityMbps: 250,
      authStatus: 'authenticated',
      credentialSummary: {
        protocol: 'upnp',
        hasSecret: false,
        maskedHint: 'ICMP / Traceroute Hop #3',
      },
      metadata: {
        asn: 'AS7922',
        baselineRttMs: 12,
      },
    },
    {
      id: 'node-gateway',
      name: 'ISP Residential Gateway',
      layer: 'gateway',
      ip: '192.168.100.1',
      mac: 'bc:24:11:00:01:01',
      vendor: 'Arris / DOCSIS 3.1 Gateway',
      parentId: 'node-isp',
      health: sqmFixed ? 'healthy' : 'critical',
      latencyMs: gatewayLatencyMs,
      packetLossPct: sqmFixed ? 0.0 : 0.6,
      rxMbps: totalDownMbps,
      txMbps: totalUpMbps,
      linkCapacityMbps: 250,
      authStatus: existingGateway?.authStatus || 'authenticated',
      credentialSummary: existingGateway?.credentialSummary || {
        protocol: 'upnp',
        hasSecret: false,
        maskedHint: 'UPnP IGD WANCommonInterfaceConfig',
      },
      metadata: {
        ...(existingGateway?.metadata || {}),
        natTablePct: sqmFixed ? 44 : 84,
        wanMode: bridgeFixed ? 'IP Passthrough / Bridge' : 'NAT Routed (Double-NAT)',
      },
    },
    {
      id: 'node-router',
      name: 'Core Mesh Router',
      layer: 'router',
      ip: `${subnetPrefix}.1`,
      mac: 'f0:9f:c2:11:22:33',
      vendor: 'Ubiquiti / OpenWrt Core',
      parentId: 'node-gateway',
      health: bridgeFixed ? 'healthy' : 'warning',
      latencyMs: 2.4,
      packetLossPct: 0.0,
      rxMbps: totalDownMbps,
      txMbps: totalUpMbps,
      linkCapacityMbps: 1000,
      authStatus: 'unconfigured',
      metadata: {
        wifiChannel: '5GHz Ch 149 (80MHz)',
        dhcpPool: `${subnetPrefix}.100 - ${subnetPrefix}.250`,
      },
    },
    {
      id: 'node-switch',
      name: 'Managed 8-Port PoE Switch',
      layer: 'switch',
      ip: `${subnetPrefix}.2`,
      mac: '50:c7:bf:88:19:02',
      vendor: 'TP-Link JetStream Switch',
      parentId: 'node-router',
      health: 'healthy',
      latencyMs: 0.8,
      packetLossPct: 0.0,
      rxMbps: Math.round((steamMbps + backupMbps) * 10) / 10,
      txMbps: Math.round(backupMbps * 0.7 * 10) / 10,
      linkCapacityMbps: 1000,
      authStatus: 'unconfigured',
    },
    {
      id: 'node-mesh-ap',
      name: 'Hallway Wi-Fi 6 Mesh Node',
      layer: 'mesh',
      ip: `${subnetPrefix}.3`,
      mac: 'f0:9f:c2:11:22:99',
      vendor: 'Mesh Backhaul AP',
      parentId: 'node-router',
      health: 'healthy',
      latencyMs: 4.1,
      packetLossPct: 0.1,
      rxMbps: Math.round((netflixMbps + webMbps) * 10) / 10,
      txMbps: 4.2,
      linkCapacityMbps: 866,
      authStatus: 'unconfigured',
    },
    {
      id: 'node-client-hub',
      name: `Hub (This PC • ${os.hostname()})`,
      layer: 'client',
      ip: hostIp,
      mac: '04:d4:c4:90:12:ef',
      vendor: 'Windows Host / Podman Runtime',
      parentId: 'node-switch',
      health: 'healthy',
      latencyMs: 0.9,
      packetLossPct: 0.0,
      rxMbps: steamMbps,
      txMbps: 5.2,
      linkCapacityMbps: 1000,
      authStatus: 'authenticated',
    },
    {
      id: 'node-client-tv',
      name: 'LivingRoom-4K-TV',
      layer: 'client',
      ip: `${subnetPrefix}.114`,
      mac: '3c:22:fb:41:09:12',
      vendor: 'Apple TV / Media Streamer',
      parentId: 'node-mesh-ap',
      health: 'healthy',
      latencyMs: 5.5,
      packetLossPct: 0.0,
      rxMbps: netflixMbps,
      txMbps: 1.4,
      linkCapacityMbps: 400,
      authStatus: 'authenticated',
    },
    {
      id: 'node-client-nas',
      name: 'Synology-NAS-Vault',
      layer: 'client',
      ip: `${subnetPrefix}.20`,
      mac: '00:11:32:9c:44:10',
      vendor: 'Synology Inc.',
      parentId: 'node-switch',
      health: 'healthy',
      latencyMs: 1.1,
      packetLossPct: 0.0,
      rxMbps: backupMbps,
      txMbps: Math.round(backupMbps * 0.7 * 10) / 10,
      linkCapacityMbps: 1000,
      authStatus: 'authenticated',
    },
  ];

  // Merge up to 3 real ARP-discovered LAN neighbors as client nodes if present
  const knownIps = new Set(baseNodes.map((n) => n.ip));
  arpEntries
    .filter((e) => !knownIps.has(e.ip) && !e.ip.endsWith('.1'))
    .slice(0, 3)
    .forEach((entry, idx) => {
      baseNodes.push({
        id: `node-arp-${entry.ip.replace(/\./g, '-')}`,
        name: `LAN-Device-${entry.ip.split('.').pop()}`,
        layer: 'client',
        ip: entry.ip,
        mac: entry.mac,
        vendor: lookupVendor(entry.mac),
        parentId: idx % 2 === 0 ? 'node-mesh-ap' : 'node-switch',
        health: 'healthy',
        latencyMs: 3.2,
        packetLossPct: 0.0,
        rxMbps: Math.round((webMbps / 2) * 10) / 10,
        txMbps: 0.8,
        linkCapacityMbps: 300,
        authStatus: 'authenticated',
      });
    });

  for (const node of baseNodes) {
    store.upsertNode(node);
  }

  const persistedNodes = store.getNodes();

  const destinations: TrafficDestination[] = [
    {
      id: 'dest-steam',
      service: 'Steam Content CDN (Valve)',
      category: 'Gaming / CDN',
      asn: 'AS32590',
      downMbps: steamMbps,
      upMbps: 2.1,
      sharePct: Math.round((steamMbps / totalDownMbps) * 100),
      topClientName: `Hub (${os.hostname()})`,
    },
    {
      id: 'dest-netflix',
      service: 'Netflix Open Connect 4K',
      category: 'Video Streaming',
      asn: 'AS2906',
      downMbps: netflixMbps,
      upMbps: 0.9,
      sharePct: Math.round((netflixMbps / totalDownMbps) * 100),
      topClientName: 'LivingRoom-4K-TV',
    },
    {
      id: 'dest-backblaze',
      service: 'Backblaze B2 Cloud Sync',
      category: 'Cloud & Backup',
      asn: 'AS53413',
      downMbps: backupMbps,
      upMbps: Math.round(backupMbps * 0.7 * 10) / 10,
      sharePct: Math.round((backupMbps / totalDownMbps) * 100),
      topClientName: 'Synology-NAS-Vault',
    },
    {
      id: 'dest-cloudflare',
      service: 'HTTPS / Cloudflare Edge & DNS',
      category: 'Web & API',
      asn: 'AS13335',
      downMbps: webMbps,
      upMbps: 2.4,
      sharePct: Math.max(
        1,
        100 -
          Math.round((steamMbps / totalDownMbps) * 100) -
          Math.round((netflixMbps / totalDownMbps) * 100) -
          Math.round((backupMbps / totalDownMbps) * 100)
      ),
      topClientName: 'All LAN Clients',
    },
  ];

  const talkers: ClientTalker[] = [
    {
      nodeId: 'node-client-hub',
      name: `Hub (${os.hostname()})`,
      ip: hostIp,
      downMbps: steamMbps,
      upMbps: 5.2,
      sharePct: Math.round((steamMbps / totalDownMbps) * 100),
      primaryService: 'Steam Content CDN',
    },
    {
      nodeId: 'node-client-tv',
      name: 'LivingRoom-4K-TV',
      ip: `${subnetPrefix}.114`,
      downMbps: netflixMbps,
      upMbps: 1.4,
      sharePct: Math.round((netflixMbps / totalDownMbps) * 100),
      primaryService: 'Netflix Open Connect 4K',
    },
    {
      nodeId: 'node-client-nas',
      name: 'Synology-NAS-Vault',
      ip: `${subnetPrefix}.20`,
      downMbps: backupMbps,
      upMbps: Math.round(backupMbps * 0.7 * 10) / 10,
      sharePct: Math.round((backupMbps / totalDownMbps) * 100),
      primaryService: 'Backblaze B2 Cloud Sync',
    },
  ];

  return {
    nodes: persistedNodes,
    destinations,
    talkers,
    doubleNat: !bridgeFixed,
    baselineLatencyMs: 12,
  };
}
