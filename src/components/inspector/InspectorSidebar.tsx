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
} from 'lucide-react';
import type {
  AdapterCredentials,
  DashboardSnapshot,
  HardwareProtocol,
  NetworkNode,
} from '@/lib/types';

interface InspectorSidebarProps {
  snapshot: DashboardSnapshot;
  selectedNode: NetworkNode;
  onSaveCredentials: (
    nodeId: string,
    creds: AdapterCredentials
  ) => Promise<{ ok: boolean; message: string }>;
  onRunAutoFix: (issueId: string) => Promise<{ ok: boolean; message: string }>;
}

export function InspectorSidebar({
  snapshot,
  selectedNode,
  onSaveCredentials,
  onRunAutoFix,
}: InspectorSidebarProps) {
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
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4" />
            1. Gateway Bottleneck &amp; Layer Fixes
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
            <div className="text-[10px] text-slate-400">WAN Load</div>
            <div className="font-semibold text-slate-100">
              {snapshot.gateway.bandwidthSaturationPct}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Bufferbloat</div>
            <div className="font-semibold text-amber-400">
              +{snapshot.gateway.bufferbloatDeltaMs} ms
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">NAT Table</div>
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
                <div className="font-semibold text-amber-300">{issue.title}</div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {issue.suggestion}
                </p>
                {issue.canAutoFix && (
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
                    className="mt-2 w-full flex items-center justify-center gap-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded px-2.5 py-1.5 font-medium transition"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {issue.autoFixActionLabel || 'Apply Automated Fix'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            All network layers operating within healthy latency &amp; queue thresholds.
          </div>
        )}
      </div>

      {/* Card 2: Traffic Trends & Where Data Is Going */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            2. Traffic Trends &amp; Where Data Is Going
          </span>
          <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
            <span className="flex items-center text-sky-400">
              <ArrowDownRight className="w-3.5 h-3.5" />
              {snapshot.gateway.wanDownMbps}M
            </span>
            <span className="flex items-center text-emerald-400">
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
            <span>-60s Rolling Window</span>
            <span>Peak Capacity: {snapshot.gateway.wanCapacityMbps} Mbps</span>
            <span>Live Now</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Top External Destinations &amp; Active Flows
          </div>
          {snapshot.destinations.map((dest) => (
            <div key={dest.id} className="text-xs">
              <div className="flex justify-between text-slate-200 mb-0.5">
                <span className="truncate">
                  {dest.service}{' '}
                  <span className="text-slate-500 font-mono text-[10px]">
                    ({dest.asn} • {dest.topClientName})
                  </span>
                </span>
                <span className="font-mono text-sky-300 shrink-0 ml-2">
                  {dest.downMbps} Mbps ({dest.sharePct}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-sky-400 h-full rounded-full"
                  style={{ width: `${dest.sharePct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card 3: Selected Node Credentials & Hardware Adapter */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" />
            3. Hardware Credentials: {selectedNode.name}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {selectedNode.ip}
          </span>
        </div>

        <form onSubmit={handleCredSubmit} className="space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Adapter Protocol
              </label>
              <select
                value={protocol}
                onChange={(e) =>
                  setProtocol(e.target.value as HardwareProtocol)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="snmp">SNMP v2c/v3 (IF-MIB)</option>
                <option value="ssh">SSH / CLI (conntrack/tc)</option>
                <option value="http">HTTP / REST Status API</option>
                <option value="upnp">UPnP IGD (Zero-Cred)</option>
                <option value="none">None (Ping/ARP Only)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Port
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
                SNMP Read Community String (Encrypted AES-256-GCM)
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
                  SSH Username
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
                  SSH Password / Key
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
                Hardware Status Endpoint URL
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
