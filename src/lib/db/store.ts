import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type {
  AdapterCredentials,
  NetworkIssue,
  NetworkNode,
  TrafficSample,
} from '@/lib/types';
import {
  decryptCredentials,
  encryptCredentials,
  summarizeCredentials,
} from '@/lib/crypto/vault';

export class NetfixStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      process.env.NETFIX_DB_PATH ||
      path.join(process.cwd(), 'data', 'netfix.db');

    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        encrypted_creds TEXT
      );

      CREATE TABLE IF NOT EXISTS traffic_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        download_mbps REAL NOT NULL,
        upload_mbps REAL NOT NULL,
        gateway_latency_ms REAL NOT NULL,
        bottleneck_score INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
    `);
  }

  upsertNode(node: NetworkNode): void {
    const existing = this.db
      .prepare('SELECT payload, encrypted_creds FROM nodes WHERE id = ?')
      .get(node.id) as { payload: string; encrypted_creds: string | null } | undefined;

    let merged: NetworkNode = { ...node };
    if (existing) {
      const prev = JSON.parse(existing.payload) as NetworkNode;
      if (prev.credentialSummary && !merged.credentialSummary) {
        merged.credentialSummary = prev.credentialSummary;
      }
      if (prev.authStatus !== 'unconfigured' && merged.authStatus === 'unconfigured') {
        merged.authStatus = prev.authStatus;
        merged.lastAuthError = prev.lastAuthError;
      }
    }

    this.db
      .prepare(
        `INSERT INTO nodes (id, payload, encrypted_creds)
         VALUES (?, ?, COALESCE((SELECT encrypted_creds FROM nodes WHERE id = ?), NULL))
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
      )
      .run(merged.id, JSON.stringify(merged), merged.id);
  }

  getNodes(): NetworkNode[] {
    const rows = this.db.prepare('SELECT payload FROM nodes').all() as {
      payload: string;
    }[];
    return rows.map((r) => JSON.parse(r.payload) as NetworkNode);
  }

  getNode(id: string): NetworkNode | undefined {
    const row = this.db
      .prepare('SELECT payload FROM nodes WHERE id = ?')
      .get(id) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as NetworkNode) : undefined;
  }

  saveCredentials(
    nodeId: string,
    creds: AdapterCredentials,
    authStatus: NetworkNode['authStatus'],
    lastAuthError?: string
  ): NetworkNode | undefined {
    const node = this.getNode(nodeId);
    if (!node) return undefined;

    if (creds.protocol === 'none') {
      node.authStatus = 'unconfigured';
      node.credentialSummary = undefined;
      node.lastAuthError = undefined;
      this.db
        .prepare('UPDATE nodes SET payload = ?, encrypted_creds = NULL WHERE id = ?')
        .run(JSON.stringify(node), nodeId);
      return node;
    }

    const encrypted = encryptCredentials(creds);
    node.credentialSummary = summarizeCredentials(creds);
    node.authStatus = authStatus;
    node.lastAuthError = lastAuthError;

    this.db
      .prepare('UPDATE nodes SET payload = ?, encrypted_creds = ? WHERE id = ?')
      .run(JSON.stringify(node), encrypted, nodeId);

    return node;
  }

  getCredentials(nodeId: string): AdapterCredentials | null {
    const row = this.db
      .prepare('SELECT encrypted_creds FROM nodes WHERE id = ?')
      .get(nodeId) as { encrypted_creds: string | null } | undefined;
    if (!row || !row.encrypted_creds) return null;
    return decryptCredentials(row.encrypted_creds);
  }

  insertTrafficSample(sample: TrafficSample): void {
    this.db
      .prepare(
        `INSERT INTO traffic_samples (timestamp, download_mbps, upload_mbps, gateway_latency_ms, bottleneck_score)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        sample.timestamp,
        sample.downloadMbps,
        sample.uploadMbps,
        sample.gatewayLatencyMs,
        sample.bottleneckScore
      );

    // Keep rolling window of latest 360 samples
    this.db
      .prepare(
        `DELETE FROM traffic_samples WHERE id NOT IN (
           SELECT id FROM traffic_samples ORDER BY timestamp DESC LIMIT 360
         )`
      )
      .run();
  }

  getRecentTraffic(limit = 40): TrafficSample[] {
    const rows = this.db
      .prepare(
        `SELECT timestamp, download_mbps, upload_mbps, gateway_latency_ms, bottleneck_score
         FROM traffic_samples
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(limit) as {
      timestamp: number;
      download_mbps: number;
      upload_mbps: number;
      gateway_latency_ms: number;
      bottleneck_score: number;
    }[];

    return rows.reverse().map((r) => ({
      timestamp: r.timestamp,
      downloadMbps: r.download_mbps,
      uploadMbps: r.upload_mbps,
      gatewayLatencyMs: r.gateway_latency_ms,
      bottleneckScore: r.bottleneck_score,
    }));
  }

  setIssues(issues: NetworkIssue[]): void {
    const existingResolved = new Set(
      this.getIssues()
        .filter((i) => i.resolved)
        .map((i) => i.id)
    );

    const tx = this.db.transaction((items: NetworkIssue[]) => {
      this.db.prepare('DELETE FROM issues').run();
      const stmt = this.db.prepare(
        'INSERT INTO issues (id, payload) VALUES (?, ?)'
      );
      for (const item of items) {
        const merged = {
          ...item,
          resolved: item.resolved || existingResolved.has(item.id),
        };
        stmt.run(merged.id, JSON.stringify(merged));
      }
    });
    tx(issues);
  }

  getIssues(): NetworkIssue[] {
    const rows = this.db.prepare('SELECT payload FROM issues').all() as {
      payload: string;
    }[];
    return rows.map((r) => JSON.parse(r.payload) as NetworkIssue);
  }

  markIssueResolved(issueId: string): NetworkIssue | undefined {
    const row = this.db
      .prepare('SELECT payload FROM issues WHERE id = ?')
      .get(issueId) as { payload: string } | undefined;
    if (!row) return undefined;
    const issue = JSON.parse(row.payload) as NetworkIssue;
    issue.resolved = true;
    this.db
      .prepare('UPDATE issues SET payload = ? WHERE id = ?')
      .run(JSON.stringify(issue), issueId);
    return issue;
  }
}
