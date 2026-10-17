export type NetworkLayer = 'isp' | 'gateway' | 'router' | 'switch' | 'mesh' | 'client';

export type NodeHealth = 'healthy' | 'warning' | 'critical';

export type HardwareProtocol = 'none' | 'upnp' | 'snmp' | 'ssh' | 'http';

export interface AdapterCredentials {
  protocol: HardwareProtocol;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  snmpVersion?: '2c' | '3';
  community?: string;
  endpointUrl?: string;
  apiToken?: string;
}

export interface CredentialSummary {
  protocol: HardwareProtocol;
  port?: number;
  username?: string;
  snmpVersion?: '2c' | '3';
  endpointUrl?: string;
  hasSecret: boolean;
  maskedHint: string;
}

export interface NetworkNode {
  id: string;
  name: string;
  layer: NetworkLayer;
  ip: string;
  mac?: string;
  vendor?: string;
  parentId: string | null;
  health: NodeHealth;
  latencyMs: number;
  packetLossPct: number;
  rxMbps: number;
  txMbps: number;
  linkCapacityMbps: number;
  authStatus: 'unconfigured' | 'authenticated' | 'auth_error';
  lastAuthError?: string;
  credentialSummary?: CredentialSummary;
  metadata?: Record<string, string | number | boolean>;
  rxHistory?: number[];
  txHistory?: number[];
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  rxMbps: number;
  txMbps: number;
  capacityMbps: number;
  latencyMs: number;
  health: NodeHealth;
  label: string;
}

export interface TrafficSample {
  timestamp: number;
  downloadMbps: number;
  uploadMbps: number;
  gatewayLatencyMs: number;
  bottleneckScore: number;
}

export interface TrafficDestination {
  id: string;
  service: string;
  category: 'Gaming / CDN' | 'Video Streaming' | 'Cloud & Backup' | 'Conferencing' | 'Web & API';
  asn: string;
  downMbps: number;
  upMbps: number;
  sharePct: number;
  topClientName: string;
  clientNodeId?: string;
  sourceClientIp?: string;
  sourceClientMac?: string;
  destinationIp?: string;
  destinationHost?: string;
  protocolPort?: string;
  sessionTransferredMb?: number;
  activeConnections?: number;
  avgRttMs?: number;
  dscpClass?: string;
}

export interface ClientTalker {
  nodeId: string;
  name: string;
  ip: string;
  downMbps: number;
  upMbps: number;
  sharePct: number;
  primaryService: string;
  mac?: string;
  destinationIp?: string;
  destinationHost?: string;
  protocolPort?: string;
  sessionTransferredMb?: number;
  activeConnections?: number;
  rxHistory?: number[];
  txHistory?: number[];
}

export interface GatewayBottleneckMetrics {
  score: number;
  status: NodeHealth;
  wanDownMbps: number;
  wanUpMbps: number;
  wanCapacityMbps: number;
  bandwidthSaturationPct: number;
  baselineLatencyMs: number;
  currentLatencyMs: number;
  bufferbloatDeltaMs: number;
  packetDropPct: number;
  natTableUsagePct: number;
  summary: string;
}

export interface NetworkIssue {
  id: string;
  nodeId: string;
  nodeName: string;
  layer: NetworkLayer;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  suggestion: string;
  canAutoFix: boolean;
  autoFixActionLabel?: string;
  autoFixCommandPreview?: string;
  resolved: boolean;
}

export type StreamDirection = 'outbound_wan' | 'node_to_node';

export interface NetworkStream {
  id: string;
  direction: StreamDirection;
  protocol: string;
  sourceNodeId?: string;
  sourceName: string;
  sourceIp: string;
  sourcePort?: number;
  sourceMac?: string;
  processName?: string;
  targetNodeId?: string;
  targetName: string;
  targetIp: string;
  targetPort?: number;
  viaGatewayIp?: string;
  category: string;
  downMbps: number;
  upMbps: number;
  sessionMb: number;
  latencyMs: number;
  status: 'active' | 'idle_keepalive';
}

export interface DashboardSnapshot {
  timestamp: number;
  hostName: string;
  lanUrl: string;
  nodes: NetworkNode[];
  edges: TopologyEdge[];
  gateway: GatewayBottleneckMetrics;
  trafficHistory: TrafficSample[];
  destinations: TrafficDestination[];
  talkers: ClientTalker[];
  streams: NetworkStream[];
  issues: NetworkIssue[];
}
