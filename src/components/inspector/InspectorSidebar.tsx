'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldCheck,
  Wrench,
  KeyRound,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type {
  AdapterCredentials,
  DashboardSnapshot,
  HardwareProtocol,
  NetworkNode,
} from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

function formatSessionSize(mb?: number): string {
  if (!mb) return '—';
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(2)} GB (${mb.toLocaleString()} MB)`;
  }
  return `${mb.toLocaleString()} MB`;
}

interface InspectorSidebarProps {
  snapshot: DashboardSnapshot;
  selectedNode: NetworkNode;
  onSelectNode?: (nodeId: string) => void;
  onSaveCredentials: (
    nodeId: string,
    creds: AdapterCredentials
  ) => Promise<{ ok: boolean; message: string }>;
  onRunAutoFix: (issueId: string) => Promise<{ ok: boolean; message: string }>;
}

export function InspectorSidebar({
  snapshot,
  selectedNode,
  onSelectNode,
  onSaveCredentials,
  onRunAutoFix,
}: InspectorSidebarProps) {
  const [streamFilter, setStreamFilter] = useState<
    'all' | 'node_to_node' | 'outbound_wan' | 'grouped'
  >('all');
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(
    snapshot.streams?.[0]?.id || snapshot.destinations[0]?.id || 'dest-live-0'
  );
  const [protocol, setProtocol] = useState<HardwareProtocol>(
    selectedNode.credentialSummary?.protocol || 'snmp'
  );
  const [port, setPort] = useState<string>(
    String(selectedNode.credentialSummary?.port || 161)
  );
  const [username, setUsername] = useState<string>(
    selectedNode.credentialSummary?.username || 'admin'
  );
  const [password, setPassword] = useState<string>('');
  const [community, setCommunity] = useState<string>('public');
  const [endpointUrl, setEndpointUrl] = useState<string>(
    selectedNode.credentialSummary?.endpointUrl ||
      `http://${selectedNode.ip}/api/status`
  );
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const nextProto = selectedNode.credentialSummary?.protocol || 'snmp';
    setProtocol(nextProto);
    setPort(
      String(
        selectedNode.credentialSummary?.port ||
          (nextProto === 'ssh' ? 22 : nextProto === 'snmp' ? 161 : 80)
      )
    );
    setEndpointUrl(
      selectedNode.credentialSummary?.endpointUrl ||
        `http://${selectedNode.ip}/api/status`
    );
    setFeedback(null);
  }, [selectedNode.id, selectedNode.ip, selectedNode.credentialSummary]);

  const handleCredSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await onSaveCredentials(selectedNode.id, {
        protocol,
        port: Number(port) || undefined,
        username: protocol === 'ssh' ? username : undefined,
        password: protocol === 'ssh' ? password : undefined,
        snmpVersion: protocol === 'snmp' ? '2c' : undefined,
        community: protocol === 'snmp' ? community : undefined,
        endpointUrl: protocol === 'http' ? endpointUrl : undefined,
      });
      setFeedback(res);
    } finally {
      setBusy(false);
    }
  };

  const activeIssues = snapshot.issues.filter((i) => !i.resolved);
  const maxTraffic = Math.max(
    250,
    ...snapshot.trafficHistory.map((t) => t.downloadMbps)
  );
  const svgPoints = snapshot.trafficHistory
    .map((pt, i, arr) => {
      const x = (i / Math.max(1, arr.length - 1)) * 280;
      const y = 70 - (pt.downloadMbps / maxTraffic) * 60;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col gap-4">
      {/* Card 1: Gateway Bottleneck & Active Layer Diagnostics */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>1. Gateway Bottleneck &amp; Suggested Fixes</span>
            <InfoTooltip
              title="What is a Gateway Bottleneck?"
              explanation="Your Gateway (192.168.68.1) is the single doorway connecting all your home devices to the Internet. When one device downloads a huge file (like a game update) and fills that doorway near 100%, other devices trying to do quick tasks (like Zoom calls, gaming, or loading a web page) get stuck waiting in line. This Stress % (0–100%) tells you how backed-up that doorway is right now."
              source="Calculated every 3 seconds from: 45% Internet Pipe Usage (WAN Load) + 40% Extra Waiting-Line Lag (Bufferbloat) + 15% Dropped Packets & Connection Table Usage."
              action="Under 50% is healthy. If Stress stays above 70%, turn on QoS (Quality of Service / Smart Traffic Prioritization) in your TP-Link Deco app (More → QoS) or click the Fix button below so video calls and browsing automatically skip to the front of the line."
              align="right"
            />
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              snapshot.gateway.score >= 75
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : snapshot.gateway.score >= 50
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {snapshot.gateway.score}% Stress
          </span>
        </div>

        <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800 my-2">
          <div
            className={`h-full transition-all duration-500 ${
              snapshot.gateway.score >= 75
                ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500'
                : 'bg-gradient-to-r from-emerald-500 to-sky-400'
            }`}
            style={{ width: `${snapshot.gateway.score}%` }}
          />
        </div>

        <p className="text-xs text-slate-300 mb-3">{snapshot.gateway.summary}</p>

        <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/70 p-2 rounded-lg border border-slate-800/80 mb-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center">
              <span>Speed Used</span>
              <InfoTooltip
                title="Internet Speed Used (WAN Load %)"
                explanation="Shows what percentage of your total internet plan speed is currently being used. When this hits 90–100%, your internet pipe is completely full."
                source={`Current download (${snapshot.gateway.wanDownMbps} Mbps) divided by estimated link capacity (${snapshot.gateway.wanCapacityMbps} Mbps), polled via UPnP IGD on 192.168.68.1:1900.`}
                action="If this is near 100%, check Card #2 below to see which device or download service is using up your bandwidth."
                align="left"
              />
            </div>
            <div className="font-semibold text-slate-100">
              {snapshot.gateway.bandwidthSaturationPct}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center">
              <span>Bufferbloat Lag</span>
              <InfoTooltip
                title="What is Bufferbloat & Queue Saturation?"
                explanation="Imagine a 1-lane highway tollbooth: when someone downloads a giant file, thousands of huge data packets line up in your router's memory buffer ('Queue Saturation'). Tiny, urgent packets—like your voice on a video call or a mouse click in a game—get trapped waiting behind that long line. That extra waiting time is called 'Bufferbloat'."
                source={`We compare your normal idle ping (${snapshot.gateway.baselineLatencyMs} ms) against your current ping under load (${snapshot.gateway.currentLatencyMs} ms). The difference (+${snapshot.gateway.bufferbloatDeltaMs} ms) is the extra lag caused by the waiting line.`}
                action="To fix Bufferbloat permanently: enable QoS / Smart Queue Management on your router (in the TP-Link Deco app: tap More → QoS → set your total bandwidth slightly below your max ISP speed). This gives urgent packets a fast-pass lane."
                align="center"
              />
            </div>
            <div className="font-semibold text-amber-400">
              +{snapshot.gateway.bufferbloatDeltaMs} ms
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center">
              <span>Active Links</span>
              <InfoTooltip
                title="Router Connection Table (NAT Usage %)"
                explanation="Your home only has 1 public IP address from your ISP (50.35.70.90), shared by all your devices. Your router keeps a giant checklist (called a NAT Table) to remember which phone or PC asked for which website. If thousands of connections open at once (like BitTorrent or a stuck app) and fill this table near 100%, new web pages fail to open."
                source="Estimated from active gateway session load (or read directly from /proc/net/nf_conntrack & SNMP when router SSH/SNMP credentials are saved)."
                action="Below 80% is normal. If it nears 100%, close heavy peer-to-peer apps or reboot the gateway."
                align="right"
              />
            </div>
            <div className="font-semibold text-slate-100">
              {snapshot.gateway.natTableUsagePct}%
            </div>
          </div>
        </div>

        {activeIssues.length > 0 ? (
          <div className="space-y-2">
            {activeIssues.slice(0, 2).map((issue) => (
              <div
                key={issue.id}
                className="bg-slate-950/90 border border-amber-500/30 rounded-lg p-2.5 text-xs"
              >
                <div className="font-semibold text-amber-300 flex items-center justify-between">
                  <span>{issue.title}</span>
                  <InfoTooltip
                    title={issue.title}
                    explanation={issue.description}
                    source={`Detected on layer "${issue.layer.toUpperCase()}" (${issue.nodeName}).`}
                    action={issue.suggestion}
                    align="right"
                  />
                </div>
                <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                  {issue.description}
                </p>
                <p className="text-sky-300/90 text-[11px] mt-1">
                  <strong>How to fix:</strong> {issue.suggestion}
                </p>
                {issue.canAutoFix && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await onRunAutoFix(issue.id);
                          setFeedback(res);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded px-2.5 py-1.5 font-medium transition"
                    >
                      <Wrench className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {issue.autoFixActionLabel || 'Apply Automated Fix'}
                      </span>
                    </button>
                    <InfoTooltip
                      title="What Does This Fix Button Do?"
                      explanation={
                        issue.id === 'issue-gateway-bufferbloat'
                          ? "What is 'Smart Traffic Prioritization (QoS / CAKE SQM)'? Normally, routers process data 'first-come, first-served'—so a 50 GB game download hogs the whole line. Smart Queue Management (SQM / CAKE) automatically creates separate fair lanes for each device and lets small voice/gaming packets go first. If your router has SSH/API credentials configured, clicking this applies the traffic shaper rule; on a TP-Link Deco X60, you can also enable this in the Deco phone app under More → QoS."
                          : 'Configures the upstream gateway to pass your public IP directly to your main router (Bridge / Passthrough Mode) so two routers are not fighting over your network.'
                      }
                      source={`Command preview: ${issue.autoFixCommandPreview || 'Router QoS API call'}`}
                      action="Click the button to apply (or mark resolved once you toggle QoS in your Deco app)."
                      align="right"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            All network layers are running smoothly with low lag and plenty of spare speed.
          </div>
        )}
      </div>

      {/* Card 2: Traffic Trends & Where Data Is Going */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1">
            <Activity className="w-4 h-4 shrink-0" />
            <span>2. Traffic Trends &amp; Where Data Is Going</span>
            <InfoTooltip
              title="Where Is Your Internet Data Going?"
              explanation="This panel shows your home's download (↓) and upload (↑) speed over the last 60 seconds, broken down by which online services (like Steam game downloads, Netflix streaming, or cloud backups) and which home devices are using the most internet."
              source="Total WAN counters are polled from your TP-Link Deco X60 UPnP IGD service (192.168.68.1:1900). Service names and ASNs (the ID numbers of major internet companies like Valve AS32590 or Netflix AS2906) are matched from active traffic flows."
              action="When your internet feels slow, look at the #1 bar below to see which device and service is using the largest share (%) of your speed."
              align="right"
            />
          </span>
          <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
            <span
              className="flex items-center text-sky-400"
              title="Current Download Speed in Megabits per second"
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              {snapshot.gateway.wanDownMbps}M
            </span>
            <span
              className="flex items-center text-emerald-400"
              title="Current Upload Speed in Megabits per second"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              {snapshot.gateway.wanUpMbps}M
            </span>
          </span>
        </div>

        {/* Live SVG Area Trend Chart */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 mb-3">
          <svg viewBox="0 0 280 75" className="w-full h-16 overflow-visible">
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              points={svgPoints}
            />
          </svg>
          <div className="flex justify-between text-[10px] text-slate-500 px-1">
            <span>-60s History</span>
            <span>Plan Capacity: {snapshot.gateway.wanCapacityMbps} Mbps</span>
            <span>Live Now</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span className="flex items-center">
              <span>All Network Streams (Click Any to Expand)</span>
              <InfoTooltip
                title="All Network Streams (Node ↔ Node & Outbound WAN)"
                explanation="Shows every active connection across your home network: internal Node ↔ Node links (Deco Mesh 5 GHz backhaul, SonosNet 2412 MHz audio matrix, and Creality 3D Printer LAN control) as well as every Outbound WAN socket going out through your Main Deco Gateway (192.168.68.1)."
                source="Live TCP socket table (Get-NetTCPConnection + Process ID), Sonos UPnP ZoneGroupTopology, Deco Mesh backhaul probes, and UPnP IGD WAN byte counters."
                action="Use the filter tabs below to switch between All Streams, Node ↔ Node (Local LAN), Outbound via Gateway, or Top Grouped Services."
                align="right"
              />
            </span>
          </div>

          {/* Filter Tabs: All Streams | Node ↔ Node | Outbound WAN | Grouped */}
          {(() => {
            const allStreams = snapshot.streams || [];
            const lanStreams = allStreams.filter(
              (s) => s.direction === 'node_to_node'
            );
            const wanStreams = allStreams.filter(
              (s) => s.direction === 'outbound_wan'
            );
            const displayedStreams =
              streamFilter === 'node_to_node'
                ? lanStreams
                : streamFilter === 'outbound_wan'
                ? wanStreams
                : allStreams;

            return (
              <>
                <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setStreamFilter('all')}
                    className={`py-1 px-1.5 rounded transition truncate ${
                      streamFilter === 'all'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({allStreams.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamFilter('node_to_node')}
                    className={`py-1 px-1.5 rounded transition truncate ${
                      streamFilter === 'node_to_node'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Node↔Node ({lanStreams.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamFilter('outbound_wan')}
                    className={`py-1 px-1.5 rounded transition truncate ${
                      streamFilter === 'outbound_wan'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Via Gateway ({wanStreams.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamFilter('grouped')}
                    className={`py-1 px-1.5 rounded transition truncate ${
                      streamFilter === 'grouped'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Grouped ({snapshot.destinations.length})
                  </button>
                </div>

                {streamFilter !== 'grouped' ? (
                  <div className="max-h-80 overflow-y-auto pr-1 space-y-1.5">
                    {displayedStreams.map((stream) => {
                      const isExpanded = expandedStreamId === stream.id;
                      const isLan = stream.direction === 'node_to_node';
                      return (
                        <div
                          key={stream.id}
                          className={`rounded-lg border transition ${
                            isExpanded
                              ? 'bg-slate-950/95 border-sky-500/40 p-2.5'
                              : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 p-2'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedStreamId(isExpanded ? null : stream.id)
                            }
                            className="w-full text-left text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 text-slate-200">
                              <span className="flex items-center gap-1.5 truncate font-medium">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                    isLan
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  }`}
                                >
                                  {isLan ? 'LAN↔LAN' : 'WAN'}
                                </span>
                                <span className="truncate">
                                  {stream.sourceName.split(' (')[0]} →{' '}
                                  {stream.targetName}
                                </span>
                              </span>
                              <span className="font-mono text-[11px] text-sky-300 shrink-0">
                                ↓{stream.downMbps}M / ↑{stream.upMbps}M
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1 pl-5">
                              <span className="truncate">
                                {stream.sourceIp}
                                {stream.sourcePort ? `:${stream.sourcePort}` : ''}{' '}
                                {stream.viaGatewayIp
                                  ? `→ [GW ${stream.viaGatewayIp.split(' ')[0]}] → `
                                  : '↔ '}
                                {stream.targetIp}
                                {stream.targetPort ? `:${stream.targetPort}` : ''}
                              </span>
                              <span className="text-slate-500 shrink-0 ml-2">
                                {stream.processName || stream.protocol}
                              </span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="mt-2.5 pt-2.5 border-t border-slate-800/90 text-[11px] space-y-2 text-slate-300">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                    Source Node
                                  </div>
                                  <div className="font-semibold text-slate-100 truncate">
                                    {stream.sourceName}
                                  </div>
                                  <div className="font-mono text-[10px] text-sky-300">
                                    {stream.sourceIp}
                                    {stream.sourcePort
                                      ? `:${stream.sourcePort}`
                                      : ''}
                                  </div>
                                  {stream.processName && (
                                    <div className="font-mono text-[10px] text-amber-300 truncate">
                                      App: {stream.processName}
                                    </div>
                                  )}
                                </div>

                                <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                    {isLan
                                      ? 'Target Local Node'
                                      : 'Remote WAN Endpoint'}
                                  </div>
                                  <div
                                    className="font-semibold text-slate-100 truncate"
                                    title={stream.targetName}
                                  >
                                    {stream.targetName}
                                  </div>
                                  <div className="font-mono text-[10px] text-emerald-300">
                                    {stream.targetIp}
                                    {stream.targetPort
                                      ? `:${stream.targetPort}`
                                      : ''}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {stream.viaGatewayIp
                                      ? `Via Gateway: ${stream.viaGatewayIp}`
                                      : `Direct LAN (${stream.category})`}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 bg-slate-900/60 border border-slate-800/80 rounded p-2">
                                <div>
                                  <div className="text-[10px] text-slate-400">
                                    Session Size
                                  </div>
                                  <div className="font-mono font-semibold text-slate-100">
                                    {formatSessionSize(stream.sessionMb)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400">
                                    Live Rate (↓ / ↑)
                                  </div>
                                  <div className="font-mono font-semibold text-sky-300">
                                    {stream.downMbps}M / {stream.upMbps}M
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-400">
                                    Latency &amp; State
                                  </div>
                                  <div className="font-mono font-semibold text-slate-100">
                                    {stream.latencyMs}ms •{' '}
                                    {stream.status === 'active'
                                      ? 'Active'
                                      : 'Keepalive'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                  {stream.protocol} • {stream.category}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {stream.sourceNodeId && onSelectNode && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onSelectNode(stream.sourceNodeId!)
                                      }
                                      className="flex items-center gap-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded px-2 py-1 text-[10px] font-semibold transition"
                                    >
                                      <span>
                                        Source ({stream.sourceIp})
                                      </span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                  {stream.targetNodeId && onSelectNode && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onSelectNode(stream.targetNodeId!)
                                      }
                                      className="flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 text-[10px] font-semibold transition"
                                    >
                                      <span>
                                        {isLan
                                          ? `Target (${stream.targetIp})`
                                          : 'Gateway (.1)'}
                                      </span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  snapshot.destinations.map((dest) => {
                    const isExpanded = expandedStreamId === dest.id;
                    return (
                      <div
                        key={dest.id}
                        className={`rounded-lg border transition ${
                          isExpanded
                            ? 'bg-slate-950/90 border-sky-500/40 p-2.5'
                            : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 p-2'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStreamId(isExpanded ? null : dest.id)
                          }
                          className="w-full text-left text-xs"
                        >
                          <div className="flex items-center justify-between text-slate-200 mb-1">
                            <span className="flex items-center gap-1.5 truncate font-medium">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span className="truncate">{dest.service}</span>
                              <span className="text-slate-400 font-mono text-[10px] font-normal">
                                ({dest.topClientName})
                              </span>
                            </span>
                            <span className="font-mono text-sky-300 shrink-0 ml-2">
                              ↓ {dest.downMbps} Mbps ({dest.sharePct}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-sky-400 h-full rounded-full transition-all"
                              style={{ width: `${dest.sharePct}%` }}
                            />
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-800/90 text-[11px] space-y-2 text-slate-300">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                  Source (Local Client)
                                </div>
                                <div className="font-semibold text-slate-100 truncate">
                                  {dest.topClientName}
                                </div>
                                <div className="font-mono text-[10px] text-sky-300">
                                  IP: {dest.sourceClientIp || '192.168.68.x'}
                                </div>
                              </div>

                              <div className="bg-slate-900/90 border border-slate-800 rounded p-2">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                                  Destination (Remote Host)
                                </div>
                                <div
                                  className="font-semibold text-slate-100 truncate"
                                  title={dest.destinationHost}
                                >
                                  {dest.destinationHost || dest.service}
                                </div>
                                <div className="font-mono text-[10px] text-emerald-300">
                                  IP: {dest.destinationIp || '—'} ({dest.asn})
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                {dest.protocolPort || 'HTTPS / TCP :443'} •{' '}
                                {formatSessionSize(dest.sessionTransferredMb)}
                              </div>
                              {dest.clientNodeId && onSelectNode && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSelectNode(dest.clientNodeId!)
                                  }
                                  className="shrink-0 flex items-center gap-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded px-2.5 py-1 text-[11px] font-semibold transition"
                                >
                                  <span>
                                    Inspect Client ({dest.sourceClientIp})
                                  </span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Card 3: Selected Node Credentials & Hardware Adapter */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>3. Device Login / Credentials: {selectedNode.name}</span>
            <InfoTooltip
              title="Why Add Hardware Login Credentials?"
              explanation="Out of the box, Netfix automatically discovers devices on your Wi-Fi and checks ping times and UPnP speeds without needing any passwords. However, routers and managed switches keep deeper health data locked behind a login. Providing credentials here lets Netfix look 'under the hood' of that specific device—and lets Netfix run 1-click automated fixes for you."
              source="All passwords/keys are encrypted using military-grade AES-256-GCM inside your local SQLite database on Hub (/data/netfix.db) and never leave your home network."
              action="Your TP-Link Deco X60 (192.168.68.1) already works automatically with 'UPnP IGD (Zero-Cred)'! If you have a managed switch or custom router that supports SNMP or SSH, select it on the map and enter its login here."
              align="right"
            />
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {selectedNode.ip}
          </span>
        </div>

        <form onSubmit={handleCredSubmit} className="space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 mb-1 flex items-center">
                <span>Connection Method</span>
                <InfoTooltip
                  title="Which Connection Method Should I Pick?"
                  explanation="• UPnP IGD (No Password Needed): Built into most home routers (including your TP-Link Deco X60) to report internet status automatically.
• SNMP (Simple Network Management Protocol): A read-only 'health speedometer' built into business/prosumer routers, switches, and NAS boxes. Usually uses a 'community' password like 'public'.
• SSH (Secure Shell): Direct command-line login used by OpenWrt, AsusWRT-Merlin, Ubiquiti, and Linux routers to read live connection tables and apply QoS fixes.
• HTTP / Web API: Connects to a router's local web status page (like http://192.168.68.1)."
                  align="left"
                />
              </label>
              <select
                value={protocol}
                onChange={(e) =>
                  setProtocol(e.target.value as HardwareProtocol)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="upnp">UPnP Automatic (No Login Required)</option>
                <option value="snmp">SNMP Health Sensors (v2c/v3)</option>
                <option value="ssh">SSH Command Line Login</option>
                <option value="http">HTTP / Web Admin Page</option>
                <option value="none">None (Basic Ping &amp; ARP Only)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Port Number
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>
          </div>

          {protocol === 'snmp' && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                SNMP Read Community Password (Encrypted Locally)
              </label>
              <input
                type="password"
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
                placeholder="public"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>
          )}

          {protocol === 'ssh' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Router Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Router Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>
          )}

          {protocol === 'http' && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Device Web Status Address (URL)
              </label>
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-medium py-1.5 px-3 rounded transition"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {busy ? 'Testing & Saving...' : 'Test Connection & Save to Vault'}
          </button>

          {feedback && (
            <div
              className={`p-2 rounded text-[11px] border ${
                feedback.ok
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
