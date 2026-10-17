'use client';

import React from 'react';
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
} from 'lucide-react';
import type { NetworkLayer, NetworkNode } from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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
    label: 'Layer 1 • ISP (Internet Service Provider)',
    explanation:
      'This is the outside internet line coming into your house from your provider. Every website, video stream, and online game enters and leaves through this connection.',
    source:
      'Discovered automatically via Traceroute Hop #2 (50.35.64.1) and UPnP External WAN IP query on your gateway.',
    action:
      'If this layer shows high lag (ms) or packet loss even when nobody in your house is downloading anything, the problem is outside your home on your ISP’s lines—restart your fiber ONT/modem or contact your ISP.',
  },
  {
    layer: 'gateway',
    label: 'Layer 2 • Main Gateway / Modem',
    explanation:
      'Your Gateway (192.168.68.1) is the "front door" between your outside ISP line and your home network. Because all internet traffic squeezes through this single box, it is the #1 place where internet bottlenecks and "bufferbloat" traffic jams happen.',
    source:
      'Discovered via your system Default Gateway route and live UPnP IGD queries to http://192.168.68.1:1900/rootDesc.xml.',
    action:
      'If this box glows amber/red, a big download is clogging the doorway. Turn on QoS (Smart Traffic Prioritization) so video calls and browsing don’t get stuck waiting behind large downloads.',
  },
  {
    layer: 'router',
    label: 'Layer 3 • Core Router / Mesh Brain',
    explanation:
      'The traffic director inside your home. It assigns local 192.168.68.x IP addresses to your devices and routes data between your Gateway, wired switches, and Wi-Fi mesh nodes.',
    source:
      'Detected from your local subnet gateway and ARP/UPnP device descriptors.',
    action:
      'If you have both an ISP modem-router and a separate Wi-Fi mesh router, make sure only ONE of them is acting as a router (use Bridge or Access Point mode) to avoid Double-NAT.',
  },
  {
    layer: 'switch',
    label: 'Layer 4 • Wired Switches & Wi-Fi Mesh Nodes',
    explanation:
      'These devices spread your network across rooms—either through physical Ethernet cables (Switches) or wireless mesh satellite points (Mesh APs).',
    source:
      'Discovered via local LAN ARP cache inspection, MAC vendor lookup, and active neighbor probes.',
    action:
      'For the fastest, most reliable speeds, plug heavy-use devices (PCs, Apple TV, game consoles) into wired Ethernet or keep Mesh APs within strong signal range of the main router.',
  },
  {
    layer: 'client',
    label: 'Layer 5 • Connected Home Devices (Clients)',
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
      return <Globe className="w-4 h-4 text-emerald-400" />;
    case 'gateway':
      return <Flame className="w-4 h-4 text-amber-400" />;
    case 'router':
      return <Router className="w-4 h-4 text-sky-400" />;
    case 'switch':
      return <Network className="w-4 h-4 text-indigo-400" />;
    case 'mesh':
      return <Wifi className="w-4 h-4 text-purple-400" />;
    default:
      return <Monitor className="w-4 h-4 text-slate-300" />;
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

export function TopologyMap({
  nodes,
  selectedNodeId,
  onSelectNode,
}: TopologyMapProps) {
  const tiers = LAYER_ORDER.map((tier) => {
    if (tier.layer === 'switch') {
      return {
        ...tier,
        items: nodes.filter((n) => n.layer === 'switch' || n.layer === 'mesh'),
      };
    }
    return {
      ...tier,
      items: nodes.filter((n) => n.layer === tier.layer),
    };
  }).filter((t) => t.items.length > 0);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 flex flex-col justify-between min-h-[680px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
            <span>
              Interactive Layered Network Map (ISP → Gateway → Router → Devices)
            </span>
            <InfoTooltip
              title="How to Read This Network Map"
              explanation="Your home internet flows from top to bottom through 5 layers: from your Internet Provider (Layer 1) → through your Main Gateway (Layer 2) → your Router & Wi-Fi Mesh (Layers 3 & 4) → down to your phones, PCs, and TVs (Layer 5). By testing each layer separately, Netfix pinpoints WHERE a slowdown is happening instead of leaving you guessing."
              source="Built automatically from your Hub PC's routing table, traceroute hops, UPnP gateway info (192.168.68.1), and live ARP neighbor table."
              action="Click any box on the map to inspect that device on the right-hand sidebar, see its plain-English health status, or add login credentials."
            />
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any box below to inspect its health, see where its numbers come from, or hover over any{' '}
            <span className="text-sky-400 font-semibold">(i)</span> icon for a plain-English explanation
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Smooth
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Bottlenecked
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2 space-y-2">
        {tiers.map((tier, idx) => (
          <React.Fragment key={tier.layer}>
            <div className="w-full">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 text-center font-medium flex items-center justify-center">
                <span>{tier.label}</span>
                <InfoTooltip
                  title={tier.label}
                  explanation={tier.explanation}
                  source={tier.source}
                  action={tier.action}
                  align="center"
                />
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {tier.items.map((node) => {
                  const isSelected = node.id === selectedNodeId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectNode(node.id)}
                      className={`text-left transition-all rounded-lg border px-3.5 py-2.5 min-w-[210px] max-w-[260px] hover:scale-[1.01] ${getHealthBorder(
                        node.health,
                        isSelected
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-xs text-slate-100 truncate">
                          {getNodeIcon(node.layer)}
                          <span className="truncate">{node.name}</span>
                        </div>
                        {node.health === 'critical' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono">{node.ip}</span>
                        <span title="Ping response delay in milliseconds (lower is snappier)">
                          {node.latencyMs} ms lag
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span
                          className="text-sky-400 font-medium"
                          title="Current Download (↓) and Upload (↑) speed in Megabits per second"
                        >
                          ↓ {node.rxMbps}M / ↑ {node.txMbps}M
                        </span>
                        {node.layer !== 'client' && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
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
                })}
              </div>
            </div>

            {idx < tiers.length - 1 && (
              <div className="flex flex-col items-center my-1">
                <div className="w-0.5 h-4 bg-gradient-to-b from-sky-400/80 to-emerald-400/80" />
                <div className="text-[10px] font-mono text-sky-300 bg-slate-950/90 border border-slate-800 px-2 py-0.5 rounded-full">
                  {tiers[idx].items[0]?.rxMbps || 0} Mbps Flowing
                </div>
                <div className="w-0.5 h-4 bg-gradient-to-b from-emerald-400/80 to-sky-400/80" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
