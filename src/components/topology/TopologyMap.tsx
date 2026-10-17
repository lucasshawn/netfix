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

interface TopologyMapProps {
  nodes: NetworkNode[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

const LAYER_ORDER: { layer: NetworkLayer; label: string }[] = [
  { layer: 'isp', label: 'Layer 1 • ISP WAN Backbone' },
  { layer: 'gateway', label: 'Layer 2 • Upstream Gateway / Modem' },
  { layer: 'router', label: 'Layer 3 • Core Router / Firewall' },
  { layer: 'switch', label: 'Layer 4 • Distribution (Switches & Mesh APs)' },
  { layer: 'client', label: 'Layer 5 • Active Local Clients' },
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Interactive Layered Network Map (ISP → Gateway → Router → Clients)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any hardware layer or client node to inspect bottleneck telemetry, configure credentials, or run automated fixes
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Healthy
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
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 text-center font-medium">
                {tier.label}
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
                        <span>{node.latencyMs} ms</span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-sky-400 font-medium">
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
                              : 'Add Creds'}
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
                  {tiers[idx].items[0]?.rxMbps || 0} Mbps Active Flow
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
