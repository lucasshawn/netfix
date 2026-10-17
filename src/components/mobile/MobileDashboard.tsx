'use client';

import React, { useState } from 'react';
import {
  Map,
  Activity,
  Wrench,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type {
  AdapterCredentials,
  DashboardSnapshot,
  NetworkNode,
} from '@/lib/types';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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
  const [community, setCommunity] = useState('public');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeIssues = snapshot.issues.filter((i) => !i.resolved);

  return (
    <div className="lg:hidden flex flex-col min-h-screen pb-20 bg-slate-950 text-slate-100">
      {/* Sticky Mobile Gateway Bottleneck Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
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

      {/* Tab Body */}
      <div className="p-4 space-y-3 flex-1">
        {statusMessage && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-lg text-xs">
            {statusMessage}
          </div>
        )}

        {activeTab === 'map' && (
          <div className="space-y-2.5">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <span>Tap Any Network Layer to Inspect or Authenticate</span>
              <InfoTooltip
                title="Layered Home Network Map"
                explanation="Shows the path your internet takes from your ISP outside, through your Gateway/Mesh Router (192.168.68.1), down to the computers, phones, and speakers in your house."
                source="Discovered live via UPnP IGD queries on 192.168.68.1, ICMP latency probes, and your local ARP neighbor table."
              />
            </div>
            {snapshot.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  onSelectNode(node.id);
                  setActiveTab('devices');
                }}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                  node.health === 'critical'
                    ? 'bg-slate-900 border-amber-500/80'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    [{node.layer.toUpperCase()}] {node.name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {node.ip} • {node.latencyMs}ms
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-sky-400 font-semibold">
                    {node.rxMbps} Mbps
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {node.authStatus === 'authenticated'
                      ? '🔑 Authenticated'
                      : 'Tap to Auth ▸'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'traffic' && (
          <div className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-xs font-semibold text-sky-400 uppercase mb-2 flex items-center gap-1.5">
                <span>Where Data Is Going (Top Destinations)</span>
                <InfoTooltip
                  title="Where Data Is Going"
                  explanation="Breaks down how much of your current internet download speed is going to video streaming, cloud downloads, or regular web browsing."
                  source="Derived from your gateway's live WAN byte counters (192.168.68.1 UPnP) and active external flow mappings."
                />
              </div>
              <div className="space-y-2.5">
                {snapshot.destinations.map((dest) => (
                  <div key={dest.id} className="text-xs">
                    <div className="flex justify-between mb-1">
                      <span>{dest.service}</span>
                      <span className="text-sky-300 font-mono">
                        {dest.downMbps} Mbps ({dest.sharePct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-sky-400 h-full"
                        style={{ width: `${dest.sharePct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <div className="text-xs font-semibold text-emerald-400 uppercase mb-2 flex items-center gap-1.5">
                <span>Top Local Client Talkers</span>
                <InfoTooltip
                  title="Top Local Client Talkers"
                  explanation="Shows which devices inside your home (192.168.68.x) are currently using the most internet bandwidth."
                  source="Discovered from your local ARP table and per-device traffic telemetry."
                />
              </div>
              {snapshot.talkers.map((t) => (
                <div
                  key={t.nodeId}
                  className="flex justify-between py-1.5 border-b border-slate-800 last:border-0 text-xs"
                >
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {t.primaryService}
                    </div>
                  </div>
                  <div className="font-mono text-sky-300">
                    ↓ {t.downMbps} Mbps
                  </div>
                </div>
              ))}
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="font-bold text-purple-300 text-sm flex items-center gap-1.5">
              <span>Configure Node Credentials: {selectedNode.name}</span>
              <InfoTooltip
                title="Hardware Login & Telemetry"
                explanation="Optional login credentials that let Netfix read deeper per-port traffic counters from your router or switch. Encrypted with AES-256-GCM before saving."
                source="Stored locally on Hub in SQLite; never sent to the cloud."
              />
            </div>
            <div className="text-slate-400 font-mono">{selectedNode.ip}</div>
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
