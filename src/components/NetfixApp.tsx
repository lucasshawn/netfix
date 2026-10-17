'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, Server, RefreshCw, Smartphone } from 'lucide-react';
import type { AdapterCredentials, DashboardSnapshot } from '@/lib/types';
import { TopologyMap } from '@/components/topology/TopologyMap';
import { InspectorSidebar } from '@/components/inspector/InspectorSidebar';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';

interface NetfixAppProps {
  initialSnapshot: DashboardSnapshot;
}

export function NetfixApp({ initialSnapshot }: NetfixAppProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-gateway');

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DashboardSnapshot;
        setSnapshot(data);
      } catch {
        // Ignore malformed frame
      }
    };
    return () => es.close();
  }, []);

  const selectedNode =
    snapshot.nodes.find((n) => n.id === selectedNodeId) ||
    snapshot.nodes.find((n) => n.layer === 'gateway') ||
    snapshot.nodes[0];

  const handleSaveCredentials = async (
    nodeId: string,
    credentials: AdapterCredentials
  ) => {
    const res = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, credentials }),
    });
    const data = await res.json();
    if (data.snapshot) {
      setSnapshot(data.snapshot);
    }
    return { ok: Boolean(data.ok), message: String(data.message || '') };
  };

  const handleRunAutoFix = async (issueId: string) => {
    const res = await fetch('/api/diagnostics/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId }),
    });
    const data = await res.json();
    if (data.snapshot) {
      setSnapshot(data.snapshot);
    }
    return { ok: Boolean(data.ok), message: String(data.message || '') };
  };

  const handleManualRefresh = async () => {
    const res = await fetch('/api/snapshot');
    if (res.ok) {
      setSnapshot(await res.json());
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop View (>= 1024px): Option B Two-Column Map Canvas + Persistent Inspector */}
      <div className="hidden lg:flex flex-col min-h-screen max-w-[1600px] mx-auto px-6 py-4">
        <header className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/20 border border-sky-400/50 flex items-center justify-center text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.18)]">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <a
                  href="https://powerhousepnw.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500/25 to-emerald-500/25 text-sky-300 border border-sky-400/40 hover:border-sky-300 transition"
                >
                  powerhousepnw.com
                </a>
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  <span>NETFIX</span>
                  <span className="text-xs font-normal text-slate-400">
                    // Powerhouse PNW Network Diagnostics &amp; Auto-Remediation
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                <strong className="text-emerald-400">Powerhouse PNW</strong> • Hosted on{' '}
                <strong className="text-slate-200">{snapshot.hostName}</strong> •
                Podman LAN Endpoint:{' '}
                <span className="font-mono text-sky-400">{snapshot.lanUrl}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span>Phone &amp; PC LAN Name:</span>
              <code className="text-sky-300 font-mono">
                http://netfix.local
              </code>
              <span className="text-slate-500">or</span>
              <code className="text-sky-300 font-mono">
                http://{snapshot.hostName.toLowerCase()}.local
              </code>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Auth&apos;d Nodes:{' '}
                {
                  snapshot.nodes.filter((n) => n.authStatus === 'authenticated')
                    .length
                }
                /{snapshot.nodes.length}
              </span>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-200 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rescan LAN
            </button>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-6 flex-1 items-start">
          {/* Left 7 Cols (~60%): Interactive Vertical Topology Tree */}
          <div className="col-span-7">
            <TopologyMap
              nodes={snapshot.nodes}
              selectedNodeId={selectedNode.id}
              onSelectNode={setSelectedNodeId}
            />
          </div>

          {/* Right 5 Cols (~40%): Stacked Live Inspector Sidebar */}
          <div className="col-span-5">
            <InspectorSidebar
              snapshot={snapshot}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNodeId}
              onSaveCredentials={handleSaveCredentials}
              onRunAutoFix={handleRunAutoFix}
            />
          </div>
        </main>

        <footer className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <a
              href="https://powerhousepnw.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sky-400 hover:text-sky-300 transition"
            >
              powerhousepnw.com
            </a>
            <span>•</span>
            <span>Powerhouse PNW Local Network Command Center</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            100% Local Telemetry &amp; AES-256-GCM Vault on {snapshot.hostName}
          </div>
        </footer>
      </div>

      {/* Mobile Phone View (< 1024px) */}
      <MobileDashboard
        snapshot={snapshot}
        selectedNode={selectedNode}
        onSelectNode={setSelectedNodeId}
        onSaveCredentials={handleSaveCredentials}
        onRunAutoFix={handleRunAutoFix}
      />
    </div>
  );
}
