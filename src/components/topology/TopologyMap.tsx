'use client';

import React, { useState } from 'react';
import {
  Globe,
  Flame,
  Router,
  Network,
  Wifi,
  Monitor,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { NetworkLayer, NetworkNode } from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { MiniSparkline } from '@/components/ui/MiniSparkline';

interface TopologyMapProps {
  nodes: NetworkNode[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

const LAYER_ORDER: {
  layer: NetworkLayer;
  label: string;
  explanation: string;
  source: string;
  action: string;
}[] = [
  {
    layer: 'isp',
    label: 'Level 1 • ISP (Internet Service Provider)',
    explanation:
      'This is the outside internet line coming into your house from your provider. Every website, video stream, and online game enters and leaves through this connection.',
    source:
      'Discovered automatically via Traceroute Hop #2 (50.35.64.1) and UPnP External WAN IP query on your gateway.',
    action:
      'If this layer shows high lag (ms) or packet loss even when nobody in your house is downloading anything, the problem is outside your home on your ISP’s lines—restart your fiber ONT/modem or contact your ISP.',
  },
  {
    layer: 'gateway',
    label: 'Level 2 • Main WAN Gateway',
    explanation:
      'Your Gateway (192.168.68.1) is the "front door" between your outside ISP line and your home network. Because all internet traffic squeezes through this single box, it is the #1 place where internet bottlenecks and "bufferbloat" traffic jams happen.',
    source:
      'Discovered via your system Default Gateway route and live UPnP IGD queries to http://192.168.68.1:1900/rootDesc.xml.',
    action:
      'If this box glows amber/red, a big download is clogging the doorway. Turn on QoS (Smart Traffic Prioritization) so video calls and browsing don’t get stuck waiting behind large downloads.',
  },
  {
    layer: 'router',
    label: 'Level 3 • Core Mesh Router (Root of Home LAN)',
    explanation:
      'The traffic director inside your home. It assigns local 192.168.68.x IP addresses to your devices and branches out to your Wi-Fi Mesh satellites (.68 & .70) and Sonos Boost / Wired Switch (.59).',
    source:
      'Detected from your local subnet gateway and ARP/UPnP device descriptors.',
    action:
      'All branches below split off from this core router.',
  },
  {
    layer: 'switch',
    label: 'Level 4 • Distribution Branches (Wi-Fi Mesh vs. SonosNet & Wired)',
    explanation:
      'These devices spread your network across rooms—either through 5 GHz Wi-Fi Mesh satellites (.68, .70) or the dedicated SonosNet 2412 MHz / Wired switch branch (.59).',
    source:
      'Discovered via local LAN ARP cache inspection, MAC vendor lookup, and UPnP ZoneGroupTopology.',
    action:
      'Each branch below groups the exact client devices connected through that distribution node.',
  },
  {
    layer: 'client',
    label: 'Level 5 • Connected Home Devices (Clients)',
    explanation:
      'The computers, phones, smart TVs, speakers (Sonos), and printers currently active on your 192.168.68.x home network.',
    source:
      'Discovered live from the Windows host ARP neighbor table (arp -a) and matched against IEEE MAC hardware manufacturer prefixes.',
    action:
      'Click any device to inspect its IP address, response time (ms), and current download/upload activity.',
  },
];

function getNodeIcon(layer: NetworkLayer) {
  switch (layer) {
    case 'isp':
      return <Globe className="w-4 h-4 text-emerald-400 shrink-0" />;
    case 'gateway':
      return <Flame className="w-4 h-4 text-amber-400 shrink-0" />;
    case 'router':
      return <Router className="w-4 h-4 text-sky-400 shrink-0" />;
    case 'switch':
      return <Network className="w-4 h-4 text-indigo-400 shrink-0" />;
    case 'mesh':
      return <Wifi className="w-4 h-4 text-purple-400 shrink-0" />;
    default:
      return <Monitor className="w-4 h-4 text-slate-300 shrink-0" />;
  }
}

function getHealthBorder(health: NetworkNode['health'], isSelected: boolean) {
  if (isSelected) {
    return 'border-sky-400 ring-2 ring-sky-400/40 bg-slate-900/95';
  }
  if (health === 'critical') {
    return 'border-amber-500/90 shadow-[0_0_15px_rgba(245,158,11,0.22)] bg-slate-900/90';
  }
  if (health === 'warning') {
    return 'border-yellow-500/70 bg-slate-900/85';
  }
  return 'border-emerald-500/50 bg-slate-900/80';
}

function NodeCard({
  node,
  isSelected,
  onSelect,
  badgeText,
  compact = false,
}: {
  node: NetworkNode;
  isSelected: boolean;
  onSelect: () => void;
  badgeText?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left transition-all rounded-lg border hover:scale-[1.01] ${
        compact
          ? 'w-full px-3 py-2'
          : 'px-4 py-2.5 min-w-[250px] max-w-[340px] w-full'
      } ${getHealthBorder(node.health, isSelected)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-xs text-slate-100 truncate">
          {getNodeIcon(node.layer)}
          <span className="truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badgeText && (
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {badgeText}
            </span>
          )}
          {node.health === 'critical' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span className="font-mono text-slate-300">{node.ip}</span>
        <span title="Ping response delay in milliseconds (lower is snappier)">
          {node.latencyMs} ms lag
        </span>
      </div>

      {node.vendor && (
        <div className="mt-0.5 text-[10px] text-slate-400 truncate">
          {node.vendor}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span
          className="text-sky-400 font-medium font-mono shrink-0"
          title="Current Download (↓) and Upload (↑) speed in Megabits per second"
        >
          ↓ {node.rxMbps}M / ↑ {node.txMbps}M
        </span>
        <MiniSparkline
          rxHistory={node.rxHistory}
          txHistory={node.txHistory}
          width={compact ? 96 : 118}
          height={compact ? 20 : 24}
          className="w-24 sm:w-28 shrink-0"
        />
        {node.layer !== 'client' && (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
              node.authStatus === 'authenticated'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : node.authStatus === 'auth_error'
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <KeyRound className="w-2.5 h-2.5" />
            {node.authStatus === 'authenticated'
              ? node.credentialSummary?.protocol.toUpperCase() || 'AUTH'
              : 'Add Login'}
          </span>
        )}
      </div>
    </button>
  );
}

export function TopologyMap({
  nodes,
  selectedNodeId,
  onSelectNode,
}: TopologyMapProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'layers'>('tree');
  const [collapsedBranches, setCollapsedBranches] = useState<
    Record<string, boolean>
  >({});

  const ispNode = nodes.find((n) => n.layer === 'isp');
  const gatewayNode = nodes.find((n) => n.layer === 'gateway');
  const routerNode = nodes.find((n) => n.layer === 'router');
  const distributionNodes = nodes.filter(
    (n) => n.layer === 'mesh' || n.layer === 'switch'
  );
  const clientNodes = nodes.filter((n) => n.layer === 'client');

  const toggleBranch = (branchId: string) => {
    setCollapsedBranches((prev) => ({
      ...prev,
      [branchId]: !prev[branchId],
    }));
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between min-h-[680px]">
      {/* Map Header & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
            <span>
              Network Hierarchy Tree (ISP → Gateway → Branches → Clients)
            </span>
            <InfoTooltip
              title="How to Read This Network Hierarchy Tree"
              explanation="Your internet enters at the top from your ISP (Level 1), passes through your Main TP-Link Deco X60 Gateway & Core Router (Levels 2 & 3 at 192.168.68.1), and then splits into two physical distribution branches (Level 4): the 5 GHz Wi-Fi Mesh branch (.68 & .70) on the left, and the SonosNet 2412 MHz / Wired Switch branch (.59) on the right. Every connected device (Level 5) hangs directly underneath the branch it talks through."
              source="Built automatically from Traceroute hops, UPnP IGD (192.168.68.1:1900), Sonos ZoneGroupTopology (192.168.68.59:1400), and ARP MAC tables."
              action="Click any node in the tree to inspect it in the right sidebar, or click a branch header to collapse/expand its connected devices."
            />
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Parent → Child tree showing exactly which router, mesh AP, or Sonos Boost each device connects through
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                viewMode === 'tree'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Hierarchy Tree</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('layers')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition ${
                viewMode === 'layers'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flat Layers</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'tree' ? (
        <div className="flex-1 flex flex-col items-center py-1">
          {/* LEVEL 1: ISP */}
          {ispNode && (
            <div className="flex flex-col items-center w-full">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/90 font-semibold mb-1 flex items-center gap-1">
                <span>Level 1 • Upstream ISP Trunk</span>
                <InfoTooltip
                  title={LAYER_ORDER[0].label}
                  explanation={LAYER_ORDER[0].explanation}
                  source={LAYER_ORDER[0].source}
                  action={LAYER_ORDER[0].action}
                  align="center"
                />
              </div>
              <NodeCard
                node={ispNode}
                isSelected={selectedNodeId === ispNode.id}
                onSelect={() => onSelectNode(ispNode.id)}
                badgeText="WAN UPLINK"
              />
              {/* Trunk connector L1 -> L2 */}
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-3.5 bg-emerald-400/70" />
                <div className="text-[10px] font-mono text-emerald-300 bg-slate-950 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  ↓ {ispNode.rxMbps} Mbps WAN Coax/Fiber
                </div>
                <div className="w-0.5 h-3.5 bg-sky-400/70" />
              </div>
            </div>
          )}

          {/* LEVEL 2 & 3: MAIN DECO X60 (GATEWAY + CORE ROUTER) */}
          <div className="flex flex-col items-center w-full">
            <div className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold mb-1 flex items-center gap-1">
              <span>
                Levels 2 &amp; 3 • Main TP-Link Deco X60 (Gateway + Core Mesh Router)
              </span>
              <InfoTooltip
                title="Main Deco X60 (192.168.68.1)"
                explanation="Your main TP-Link Deco X60 unit at 192.168.68.1 acts as both your WAN Gateway (holding your public IP 50.35.70.90) and your Core Mesh Router."
                source="Auto-discovered via Traceroute Hop #1 (192.168.68.1) and UPnP IGD rootDesc.xml."
                action="Click either role card below to inspect WAN bottleneck metrics or router settings."
                align="center"
              />
            </div>

            <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-3 flex flex-col items-center gap-2 max-w-[380px] w-full">
              {gatewayNode && (
                <NodeCard
                  node={gatewayNode}
                  isSelected={selectedNodeId === gatewayNode.id}
                  onSelect={() => onSelectNode(gatewayNode.id)}
                  badgeText="L2 GATEWAY"
                  compact
                />
              )}
              {gatewayNode && routerNode && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                  <span className="w-0.5 h-2.5 bg-sky-400/60 inline-block" />
                  <span>Internal SoC Routing Fabric (192.168.68.1)</span>
                  <span className="w-0.5 h-2.5 bg-sky-400/60 inline-block" />
                </div>
              )}
              {routerNode && (
                <NodeCard
                  node={routerNode}
                  isSelected={selectedNodeId === routerNode.id}
                  onSelect={() => onSelectNode(routerNode.id)}
                  badgeText="L3 ROUTER"
                  compact
                />
              )}
            </div>
          </div>

          {/* TREE FORK CONNECTOR FROM L3 ROUTER TO L4 DISTRIBUTION BRANCHES */}
          <div className="w-full flex flex-col items-center">
            <div className="w-0.5 h-4 bg-sky-400/80" />
            <div className="w-1/2 border-t-2 border-x-2 border-sky-500/50 h-4 rounded-t-lg" />
          </div>

          {/* LEVEL 4 & LEVEL 5: TWO PARALLEL SUB-TREE BRANCHES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full items-start">
            {distributionNodes.map((branchNode) => {
              const isMeshBranch = branchNode.layer === 'mesh';
              const children = clientNodes.filter(
                (c) => c.parentId === branchNode.id
              );
              const isCollapsed = Boolean(collapsedBranches[branchNode.id]);

              return (
                <div
                  key={branchNode.id}
                  className={`rounded-xl border p-3 ${
                    isMeshBranch
                      ? 'bg-purple-950/10 border-purple-500/30'
                      : 'bg-indigo-950/10 border-indigo-500/30'
                  }`}
                >
                  {/* Branch Header Label */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isMeshBranch ? 'text-purple-300' : 'text-indigo-300'
                      }`}
                    >
                      {isMeshBranch ? (
                        <Wifi className="w-3.5 h-3.5" />
                      ) : (
                        <Network className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isMeshBranch
                          ? 'Branch A • 5 GHz Wi-Fi Mesh'
                          : 'Branch B • SonosNet (2412 MHz)'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleBranch(branchNode.id)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-0.5 font-mono"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      <span>{children.length} Clients</span>
                    </button>
                  </div>

                  {/* Level 4 Distribution Parent Node */}
                  <NodeCard
                    node={branchNode}
                    isSelected={selectedNodeId === branchNode.id}
                    onSelect={() => onSelectNode(branchNode.id)}
                    badgeText={isMeshBranch ? 'L4 MESH AP' : 'L4 SONOS BOOST'}
                    compact
                  />

                  {/* Indented Child Clients Tree (Level 5) */}
                  {!isCollapsed && children.length > 0 && (
                    <div className="mt-2 pl-3 relative">
                      {/* Vertical Tree Spine */}
                      <div
                        className={`absolute left-3 top-0 bottom-4 w-0.5 ${
                          isMeshBranch
                            ? 'bg-purple-500/40'
                            : 'bg-indigo-500/40'
                        }`}
                      />

                      <div className="space-y-2 pt-1">
                        {children.map((client, cIdx) => {
                          const isLast = cIdx === children.length - 1;
                          return (
                            <div
                              key={client.id}
                              className="relative pl-4 flex items-center"
                            >
                              {/* Horizontal Tree Branch Connector (├─ or └─) */}
                              <div
                                className={`absolute left-0 top-1/2 w-3.5 h-0.5 ${
                                  isMeshBranch
                                    ? 'bg-purple-500/50'
                                    : 'bg-indigo-500/50'
                                }`}
                              />
                              {isLast && (
                                <div className="absolute left-[-1px] top-1/2 bottom-0 w-1 bg-slate-900" />
                              )}
                              <NodeCard
                                node={client}
                                isSelected={selectedNodeId === client.id}
                                onSelect={() => onSelectNode(client.id)}
                                badgeText={
                                  isMeshBranch ? 'Wi-Fi Client' : 'SonosNet'
                                }
                                compact
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Flat Layer View fallback if user toggles "Flat Layers" */
        <div className="flex-1 flex flex-col items-center justify-center py-2 space-y-2">
          {LAYER_ORDER.map((tier, idx) => {
            const items =
              tier.layer === 'switch'
                ? nodes.filter(
                    (n) => n.layer === 'switch' || n.layer === 'mesh'
                  )
                : nodes.filter((n) => n.layer === tier.layer);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={tier.layer}>
                <div className="w-full">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 text-center font-medium flex items-center justify-center">
                    <span>{tier.label}</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {items.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        isSelected={node.id === selectedNodeId}
                        onSelect={() => onSelectNode(node.id)}
                      />
                    ))}
                  </div>
                </div>
                {idx < LAYER_ORDER.length - 1 && (
                  <div className="w-0.5 h-4 bg-sky-400/60 my-1" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
