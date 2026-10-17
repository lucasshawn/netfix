'use client';

import React, { useState } from 'react';
import {
  Map,
  Activity,
  Wrench,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type {
  AdapterCredentials,
  DashboardSnapshot,
  NetworkNode,
} from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { MiniSparkline } from '@/components/ui/MiniSparkline';

function formatSessionSize(mb?: number): string {
  if (!mb) return '—';
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(2)} GB (${mb.toLocaleString()} MB)`;
  }
  return `${mb.toLocaleString()} MB`;
}

interface MobileDashboardProps {
  snapshot: DashboardSnapshot;
  selectedNode: NetworkNode;
  onSelectNode: (id: string) => void;
  onSaveCredentials: (
    nodeId: string,
    creds: AdapterCredentials
  ) => Promise<{ ok: boolean; message: string }>;
  onRunAutoFix: (issueId: string) => Promise<{ ok: boolean; message: string }>;
}

export function MobileDashboard({
  snapshot,
  selectedNode,
  onSelectNode,
  onSaveCredentials,
  onRunAutoFix,
}: MobileDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    'map' | 'traffic' | 'fixes' | 'devices'
  >('map');
  const [streamFilter, setStreamFilter] = useState<
    'top_streams' | 'all' | 'node_to_node' | 'outbound_wan'
  >('top_streams');
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(
    snapshot.destinations[0]?.id || snapshot.streams?.[0]?.id || 'dest-live-0'
  );
  const [expandedTalkerId, setExpandedTalkerId] = useState<string | null>(null);
  const [community, setCommunity] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeIssues = snapshot.issues.filter((i) => !i.resolved);

  return (
    <div className="lg:hidden flex flex-col min-h-screen pb-20 bg-slate-950 text-slate-100">
      {/* Sticky Mobile Gateway Bottleneck Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-2">
            <a
              href="https://powerhousepnw.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-sky-500/25 to-emerald-500/25 text-sky-300 border border-sky-400/40"
            >
              powerhousepnw.com
            </a>
            <span className="text-xs font-bold tracking-tight text-white">
              NETFIX
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            http://netfix.local
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Gateway Stress: {snapshot.gateway.score}%</span>
              <InfoTooltip
                title="Gateway Bottleneck & Stress Score"
                explanation="Every device in your home funnels through your main Gateway/Router to reach the internet. This 0–100% score measures how overloaded that choke point is right now."
                source="Calculated live from WAN bandwidth counters on 192.168.68.1 (UPnP TotalBytesReceived/Sent) and ICMP ping response times (Bufferbloat)."
                action="Tap 'Fixes' on the right to see recommendations or turn on Smart Traffic Prioritization (QoS)."
              />
            </div>
            <div className="text-[11px] text-slate-400">
              ↓ {snapshot.gateway.wanDownMbps} Mbps • Bufferbloat +
              {snapshot.gateway.bufferbloatDeltaMs}ms
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('fixes')}
            className="bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            {activeIssues.length} Fixes
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="p-4 space-y-3 flex-1">
        {statusMessage && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-lg text-xs">
            {statusMessage}
          </div>
        )}

        {activeTab === 'map' &&
          (() => {
            const ispNode = snapshot.nodes.find((n) => n.layer === 'isp');
            const gatewayNode = snapshot.nodes.find(
              (n) => n.layer === 'gateway'
            );
            const routerNode = snapshot.nodes.find((n) => n.layer === 'router');
            const branchNodes = snapshot.nodes.filter(
              (n) => n.layer === 'mesh' || n.layer === 'switch'
            );
            const clientNodes = snapshot.nodes.filter(
              (n) => n.layer === 'client'
            );

            const renderMobileNode = (node: NetworkNode, badge?: string) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  onSelectNode(node.id);
                  setActiveTab('devices');
                }}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                  node.health === 'critical'
                    ? 'bg-slate-900 border-amber-500/80'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                <div className="min-w-0 flex-1 pr-1">
                  <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 truncate">
                    {badge && (
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 shrink-0">
                        {badge}
                      </span>
                    )}
                    <span className="truncate">{node.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                    {node.ip} • {node.latencyMs}ms{' '}
                    {node.vendor ? `• ${node.vendor}` : ''}
                  </div>
                </div>
                <MiniSparkline
                  rxHistory={node.rxHistory}
                  txHistory={node.txHistory}
                  width={78}
                  height={22}
                  className="w-20 shrink-0"
                />
                <div className="text-right shrink-0">
                  <div className="text-xs text-sky-400 font-semibold font-mono">
                    ↓{node.rxMbps}M
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    ↑{node.txMbps}M ▸
                  </div>
                </div>
              </button>
            );

            return (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                  <span>Network Hierarchy Tree (Tap Any Node to Inspect)</span>
                  <InfoTooltip
                    title="Network Hierarchy Tree"
                    explanation="Shows the exact parent → child hierarchy of your network: Level 1 (ISP) → Levels 2 & 3 (Main Deco X60 Gateway & Router at 192.168.68.1) → Level 4 Distribution Branches (5 GHz Wi-Fi Mesh vs. SonosNet 2412 MHz / Wired Switch) → Level 5 Connected Clients indented underneath their parent branch."
                    source="Discovered live via Traceroute, UPnP IGD on 192.168.68.1, Sonos ZoneGroupTopology on 192.168.68.59, and ARP MAC tables."
                  />
                </div>

                {/* Level 1: ISP */}
                {ispNode && (
                  <div className="flex flex-col items-center">
                    {renderMobileNode(ispNode, 'L1 ISP')}
                    <div className="w-0.5 h-3 bg-emerald-400/70" />
                  </div>
                )}

                {/* Level 2 & 3: Main Deco X60 */}
                <div className="bg-slate-950/90 border border-sky-500/30 rounded-xl p-2.5 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">
                    Levels 2 &amp; 3 • Main TP-Link Deco X60 (192.168.68.1)
                  </div>
                  {gatewayNode && renderMobileNode(gatewayNode, 'L2 GATEWAY')}
                  {routerNode && renderMobileNode(routerNode, 'L3 ROUTER')}
                </div>

                {/* Level 4 & 5: Indented Sub-Tree Branches */}
                <div className="pl-3 relative space-y-3 pt-1">
                  <div className="absolute left-3 top-0 bottom-4 w-0.5 bg-sky-500/40" />

                  {branchNodes.map((branch) => {
                    const isMesh = branch.layer === 'mesh';
                    const children = clientNodes.filter(
                      (c) => c.parentId === branch.id
                    );
                    return (
                      <div key={branch.id} className="relative pl-4">
                        <div className="absolute left-0 top-5 w-4 h-0.5 bg-sky-500/40" />
                        <div
                          className={`rounded-xl border p-2.5 ${
                            isMesh
                              ? 'bg-purple-950/15 border-purple-500/30'
                              : 'bg-indigo-950/15 border-indigo-500/30'
                          }`}
                        >
                          <div
                            className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                              isMesh ? 'text-purple-300' : 'text-indigo-300'
                            }`}
                          >
                            {isMesh
                              ? `Branch A • 5 GHz Wi-Fi Mesh (${children.length} Clients)`
                              : `Branch B • SonosNet 2412 MHz & Wired (${children.length} Clients)`}
                          </div>
                          {renderMobileNode(
                            branch,
                            isMesh ? 'L4 MESH' : 'L4 SWITCH'
                          )}

                          {/* Level 5 Indented Child Clients */}
                          <div className="mt-2 pl-3 relative space-y-1.5">
                            <div
                              className={`absolute left-3 top-0 bottom-3 w-0.5 ${
                                isMesh
                                  ? 'bg-purple-500/40'
                                  : 'bg-indigo-500/40'
                              }`}
                            />
                            {children.map((client) => (
                              <div key={client.id} className="relative pl-3.5">
                                <div
                                  className={`absolute left-0 top-1/2 w-3.5 h-0.5 ${
                                    isMesh
                                      ? 'bg-purple-500/40'
                                      : 'bg-indigo-500/40'
                                  }`}
                                />
                                {renderMobileNode(
                                  client,
                                  isMesh ? 'Wi-Fi' : 'Sonos/LAN'
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {activeTab === 'traffic' && (
          <div className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-xs font-semibold text-sky-400 uppercase mb-2 flex items-center gap-1.5">
                <span>All Network Streams (Tap Stream for Details)</span>
                <InfoTooltip
                  title="All Network Streams"
                  explanation="View every active stream across your network: local Node ↔ Node connections (Deco Mesh backhaul, SonosNet 2412 MHz, Creality 3D Printer) and Outbound WAN streams going through 192.168.68.1."
                  source="Derived from live host TCP sockets (Get-NetTCPConnection), Sonos ZoneGroupTopology, and UPnP IGD counters on 192.168.68.1."
                />
              </div>

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
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setStreamFilter('top_streams')}
                        className={`py-1.5 px-1 rounded transition truncate ${
                          streamFilter === 'top_streams'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : 'text-slate-400'
                        }`}
                      >
                        Top Streams ({snapshot.destinations.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreamFilter('all')}
                        className={`py-1.5 px-1 rounded transition truncate ${
                          streamFilter === 'all'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                            : 'text-slate-400'
                        }`}
                      >
                        All ({allStreams.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreamFilter('node_to_node')}
                        className={`py-1.5 px-1 rounded transition truncate ${
                          streamFilter === 'node_to_node'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-400'
                        }`}
                      >
                        Node↔Node ({lanStreams.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreamFilter('outbound_wan')}
                        className={`py-1.5 px-1 rounded transition truncate ${
                          streamFilter === 'outbound_wan'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                            : 'text-slate-400'
                        }`}
                      >
                        Via GW ({wanStreams.length})
                      </button>
                    </div>

                    {streamFilter !== 'top_streams'
                      ? displayedStreams.map((stream) => {
                          const isExpanded = expandedStreamId === stream.id;
                          const isLan = stream.direction === 'node_to_node';
                          return (
                            <div
                              key={stream.id}
                              className={`rounded-lg border transition p-2.5 ${
                                isExpanded
                                  ? 'bg-slate-950/90 border-sky-500/40'
                                  : 'bg-slate-950/40 border-slate-800'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStreamId(
                                    isExpanded ? null : stream.id
                                  )
                                }
                                className="w-full text-left text-xs"
                              >
                                <div className="flex justify-between items-center gap-2">
                                  <span className="flex items-center gap-1.5 font-medium truncate">
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
                                  <span className="text-sky-300 font-mono text-[11px] shrink-0">
                                    ↓{stream.downMbps}M
                                  </span>
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1 pl-5">
                                  <span className="truncate">
                                    {stream.sourceIp}
                                    {stream.sourcePort
                                      ? `:${stream.sourcePort}`
                                      : ''}{' '}
                                    → {stream.targetIp}
                                    {stream.targetPort
                                      ? `:${stream.targetPort}`
                                      : ''}
                                  </span>
                                  <span className="text-slate-500 shrink-0 ml-2">
                                    {stream.processName || stream.protocol}
                                  </span>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] space-y-2 text-slate-300">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-900 border border-slate-800 rounded p-2">
                                      <div className="text-[10px] uppercase text-slate-400">
                                        Source
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
                                          {stream.processName}
                                        </div>
                                      )}
                                    </div>
                                    <div className="bg-slate-900 border border-slate-800 rounded p-2">
                                      <div className="text-[10px] uppercase text-slate-400">
                                        {isLan
                                          ? 'Target Node'
                                          : 'WAN Endpoint'}
                                      </div>
                                      <div className="font-semibold text-slate-100 truncate">
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
                                          ? `GW: ${stream.viaGatewayIp}`
                                          : stream.category}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-1.5 bg-slate-900/70 border border-slate-800 rounded p-2">
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
                                        Rate (↓ / ↑)
                                      </div>
                                      <div className="font-mono font-semibold text-sky-300">
                                        {stream.downMbps}M / {stream.upMbps}M
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-slate-400">
                                        Ping
                                      </div>
                                      <div className="font-mono font-semibold text-slate-100">
                                        {stream.latencyMs}ms
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    {stream.sourceNodeId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectNode(stream.sourceNodeId!);
                                          setActiveTab('devices');
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg py-1.5 font-semibold"
                                      >
                                        <span>
                                          Source ({stream.sourceIp})
                                        </span>
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                    )}
                                    {stream.targetNodeId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectNode(stream.targetNodeId!);
                                          setActiveTab('devices');
                                        }}
                                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg py-1.5 font-semibold"
                                      >
                                        <span>
                                          {isLan
                                            ? `Target (${stream.targetIp})`
                                            : 'Gateway (.1)'}
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
                      : snapshot.destinations.map((dest) => {
                          const isExpanded = expandedStreamId === dest.id;
                          return (
                            <div
                              key={dest.id}
                              className={`rounded-lg border transition p-2.5 ${
                                isExpanded
                                  ? 'bg-slate-950/90 border-sky-500/40'
                                  : 'bg-slate-950/40 border-slate-800'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStreamId(
                                    isExpanded ? null : dest.id
                                  )
                                }
                                className="w-full text-left text-xs"
                              >
                                <div className="flex justify-between items-center mb-1">
                                  <span className="flex items-center gap-1.5 font-medium truncate">
                                    {isExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    )}
                                    <span className="truncate">
                                      {dest.service}
                                    </span>
                                  </span>
                                  <span className="text-sky-300 font-mono shrink-0 ml-2">
                                    {dest.downMbps} Mbps ({dest.sharePct}%)
                                  </span>
                                </div>
                                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-sky-400 h-full"
                                    style={{ width: `${dest.sharePct}%` }}
                                  />
                                </div>
                              </button>
                            </div>
                          );
                        })}
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-xs font-semibold text-emerald-400 uppercase mb-2 flex items-center gap-1.5">
                <span>Top Local Client Talkers (Tap to Inspect)</span>
                <InfoTooltip
                  title="Top Local Client Talkers"
                  explanation="Shows which devices inside your home (192.168.68.x) are currently using the most internet bandwidth. Tap any device to view its active stream details or jump to its device settings."
                  source="Discovered from your local ARP table and per-device traffic telemetry."
                />
              </div>
              <div className="space-y-2">
                {snapshot.talkers.map((t) => {
                  const isExpanded = expandedTalkerId === t.nodeId;
                  return (
                    <div
                      key={t.nodeId}
                      className="border border-slate-800 bg-slate-950/50 rounded-lg p-2.5 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTalkerId(isExpanded ? null : t.nodeId)
                        }
                        className="w-full flex justify-between items-center gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-1 truncate">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{t.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono ml-4 truncate">
                            {t.ip} • {t.primaryService}
                          </div>
                        </div>
                        <MiniSparkline
                          rxHistory={t.rxHistory}
                          txHistory={t.txHistory}
                          width={78}
                          height={22}
                          className="w-20 shrink-0"
                        />
                        <div className="font-mono text-sky-300 shrink-0 text-right">
                          ↓ {t.downMbps}M
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] space-y-1.5 text-slate-300">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Destination:</span>
                            <span className="font-mono text-emerald-300">
                              {t.destinationHost} ({t.destinationIp})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">
                              Session Transferred:
                            </span>
                            <span className="font-mono">
                              {formatSessionSize(t.sessionTransferredMb)} (
                              {t.activeConnections ?? 1} flows)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">
                              Protocol / MAC:
                            </span>
                            <span className="font-mono text-slate-400">
                              {t.protocolPort} • {t.mac}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectNode(t.nodeId);
                              setActiveTab('devices');
                            }}
                            className="w-full mt-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg py-1.5 font-semibold"
                          >
                            <span>Open Client Device ({t.ip})</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fixes' && (
          <div className="space-y-3">
            {activeIssues.length === 0 ? (
              <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                No active network bottlenecks detected!
              </div>
            ) : (
              activeIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="bg-slate-900 border border-amber-500/40 rounded-xl p-3.5 space-y-2 text-xs"
                >
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>{issue.title}</span>
                    <InfoTooltip
                      title={issue.title}
                      explanation={issue.description}
                      source="Triggered automatically when live gateway bandwidth, bufferbloat lag, or NAT connection counts cross safe thresholds."
                      action={issue.suggestion}
                    />
                  </div>
                  <p className="text-slate-300">{issue.description}</p>
                  <p className="text-slate-400 text-[11px]">
                    💡 {issue.suggestion}
                  </p>
                  {issue.canAutoFix && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await onRunAutoFix(issue.id);
                        setStatusMessage(res.message);
                      }}
                      className="w-full bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg py-2 font-semibold"
                    >
                      ✨ {issue.autoFixActionLabel}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="space-y-3">
            {/* Selected Device Live Stream Activity & Credentials */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-bold text-purple-300 text-sm flex items-center gap-1.5">
                  <span>Selected Device: {selectedNode.name}</span>
                  <InfoTooltip
                    title="Device Live Stream Activity & Hardware Login"
                    explanation="Shows live download (↓ sky-blue) and upload (↑ emerald) stream activity for this device, plus optional hardware credentials encrypted with AES-256-GCM."
                    source="Stored locally on Hub in SQLite; never sent to the cloud."
                  />
                </div>
                <span className="text-slate-400 font-mono">
                  {selectedNode.ip}
                </span>
              </div>

              <div className="bg-slate-950/85 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-300">
                    {selectedNode.latencyMs}ms lag
                    {selectedNode.vendor ? ` • ${selectedNode.vendor}` : ''}
                  </span>
                  <span className="font-mono text-sky-400 font-semibold">
                    ↓ {selectedNode.rxMbps}M / ↑ {selectedNode.txMbps}M
                  </span>
                </div>
                <MiniSparkline
                  rxHistory={selectedNode.rxHistory}
                  txHistory={selectedNode.txHistory}
                  width={280}
                  height={46}
                  showLabels
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  SNMP v2c Community / Credential Secret
                </label>
                <input
                  type="password"
                  value={community}
                  onChange={(e) => setCommunity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const res = await onSaveCredentials(selectedNode.id, {
                    protocol: 'snmp',
                    port: 161,
                    snmpVersion: '2c',
                    community,
                  });
                  setStatusMessage(res.message);
                }}
                className="w-full bg-purple-600 text-white font-semibold py-2.5 rounded-lg"
              >
                Save &amp; Test Hardware Auth
              </button>
            </div>

            {/* All Connected Devices Live Stream Activity List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 flex items-center justify-between">
                <span>All Devices &amp; Live Stream Activity</span>
                <span className="font-mono text-[10px] text-slate-400">
                  {snapshot.nodes.length} Nodes
                </span>
              </div>
              <div className="space-y-1.5">
                {snapshot.nodes.map((node) => {
                  const isSel = node.id === selectedNode.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between gap-2 ${
                        isSel
                          ? 'bg-sky-950/40 border-sky-500/60'
                          : 'bg-slate-950/50 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {node.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {node.ip} • {node.latencyMs}ms • ↓{node.rxMbps}M / ↑
                          {node.txMbps}M
                        </div>
                      </div>
                      <MiniSparkline
                        rxHistory={node.rxHistory}
                        txHistory={node.txHistory}
                        width={92}
                        height={24}
                        className="w-24 shrink-0"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur border-t border-slate-800 grid grid-cols-4 py-2 text-center text-[11px]">
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-0.5 ${
            activeTab === 'map' ? 'text-sky-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Map className="w-4 h-4" />
          <span>Map</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('traffic')}
          className={`flex flex-col items-center gap-0.5 ${
            activeTab === 'traffic'
              ? 'text-sky-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Traffic</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fixes')}
          className={`flex flex-col items-center gap-0.5 ${
            activeTab === 'fixes'
              ? 'text-sky-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Fixes ({activeIssues.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('devices')}
          className={`flex flex-col items-center gap-0.5 ${
            activeTab === 'devices'
              ? 'text-sky-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Devices</span>
        </button>
      </nav>
    </div>
  );
}
