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
  const [expandedStreamId, setExpandedStreamId] = useState<string | null>(
    'dest-steam'
  );
  const [expandedTalkerId, setExpandedTalkerId] = useState<string | null>(null);
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
                <span>Where Data Is Going (Tap Stream for Details)</span>
                <InfoTooltip
                  title="Where Data Is Going"
                  explanation="Tap any stream to inspect its source device, remote destination IP/hostname, total session size downloaded, and port/protocol."
                  source="Derived from your gateway's live WAN byte counters (192.168.68.1 UPnP) and active external flow mappings."
                />
              </div>
              <div className="space-y-2.5">
                {snapshot.destinations.map((dest) => {
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
                          setExpandedStreamId(isExpanded ? null : dest.id)
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
                            <span className="truncate">{dest.service}</span>
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

                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] space-y-2 text-slate-300">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-900 border border-slate-800 rounded p-2">
                              <div className="text-[10px] uppercase text-slate-400">
                                Source Client
                              </div>
                              <div className="font-semibold text-slate-100 truncate">
                                {dest.topClientName}
                              </div>
                              <div className="font-mono text-[10px] text-sky-300">
                                {dest.sourceClientIp}
                              </div>
                              {dest.sourceClientMac && (
                                <div className="font-mono text-[10px] text-slate-400">
                                  {dest.sourceClientMac}
                                </div>
                              )}
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded p-2">
                              <div className="text-[10px] uppercase text-slate-400">
                                Destination
                              </div>
                              <div className="font-semibold text-slate-100 truncate">
                                {dest.destinationHost || dest.service}
                              </div>
                              <div className="font-mono text-[10px] text-emerald-300">
                                {dest.destinationIp} ({dest.asn})
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {dest.category}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 bg-slate-900/70 border border-slate-800 rounded p-2">
                            <div>
                              <div className="text-[10px] text-slate-400">
                                Session Size
                              </div>
                              <div className="font-mono font-semibold text-slate-100">
                                {formatSessionSize(dest.sessionTransferredMb)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">
                                Rate (↓ / ↑)
                              </div>
                              <div className="font-mono font-semibold text-sky-300">
                                {dest.downMbps}M / {dest.upMbps}M
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">
                                Flows &amp; Ping
                              </div>
                              <div className="font-mono font-semibold text-slate-100">
                                {dest.activeConnections ?? 1} •{' '}
                                {dest.avgRttMs ?? 12}ms
                              </div>
                            </div>
                          </div>

                          <div className="text-[10px] font-mono text-slate-400">
                            {dest.protocolPort} • {dest.dscpClass}
                          </div>

                          {dest.clientNodeId && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectNode(dest.clientNodeId!);
                                setActiveTab('devices');
                              }}
                              className="w-full flex items-center justify-center gap-1.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg py-1.5 font-semibold"
                            >
                              <span>
                                Inspect Client: {dest.topClientName} (
                                {dest.sourceClientIp})
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                        className="w-full flex justify-between items-center text-left"
                      >
                        <div>
                          <div className="font-medium flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{t.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono ml-4">
                            {t.ip} • {t.primaryService}
                          </div>
                        </div>
                        <div className="font-mono text-sky-300">
                          ↓ {t.downMbps} Mbps
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
