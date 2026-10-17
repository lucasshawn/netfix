import { exec } from 'child_process';
import dgram from 'dgram';
import http from 'http';
import net from 'net';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const upstreamPort = Number(process.env.NETFIX_PORT || 3000);
const telemetryPort = Number(process.env.NETFIX_TELEMETRY_PORT || 3001);
const interfaces = os.networkInterfaces();

function getPrimaryLanIpv4() {
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        iface.address.startsWith('192.168.')
      ) {
        return iface.address;
      }
    }
  }
  return '192.168.68.73';
}

const primaryLanIp = getPrimaryLanIpv4();

function startTcpForwarder(listenPort, bindAddr) {
  const server = net.createServer((clientSocket) => {
    const upstream = net.connect(
      { host: '127.0.0.1', port: upstreamPort },
      () => {
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      }
    );
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  server.on('error', () => {
    // Ignore if already bound on this interface/port
  });

  server.listen(listenPort, bindAddr, () => {
    console.log(
      `LAN proxy forwarding [${bindAddr}]:${listenPort} -> 127.0.0.1:${upstreamPort}`
    );
  });
}

// 1. Forward port 3000 on all non-loopback interfaces -> 127.0.0.1:3000
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name] || []) {
    if (iface.internal) continue;
    const bindAddr =
      iface.family === 'IPv6' && iface.scopeid
        ? `${iface.address}%${iface.scopeid}`
        : iface.address;
    startTcpForwarder(upstreamPort, bindAddr);
  }
}

// 2. Also forward standard HTTP port 80 -> 127.0.0.1:3000 so http://netfix.local works without :3000
startTcpForwarder(80, '0.0.0.0');
startTcpForwarder(80, '::');

// 3. Live Windows Host Telemetry Collector (port 3001) for real byte counters & real process connections
let prevNetstat = { ts: 0, rxBytes: 0, txBytes: 0 };
let liveTelemetry = {
  timestamp: Date.now(),
  hostIp: primaryLanIp,
  rxMbps: 1.4,
  txMbps: 0.8,
  sessionRxMb: 7110,
  sessionTxMb: 1240,
  connections: [],
  arpRaw: '',
};

async function sampleHostTelemetry() {
  try {
    const { stdout: netstatOut } = await execAsync('netstat -e', {
      timeout: 1500,
    });
    const bytesLine = netstatOut
      .split(/\r?\n/)
      .find((l) => /^\s*Bytes\s+/i.test(l));
    if (bytesLine) {
      const parts = bytesLine.trim().split(/\s+/);
      const rxBytes = Number(parts[1] || 0);
      const txBytes = Number(parts[2] || 0);
      const now = Date.now();
      if (prevNetstat.ts > 0 && rxBytes >= prevNetstat.rxBytes) {
        const dtSec = Math.max(0.5, (now - prevNetstat.ts) / 1000);
        liveTelemetry.rxMbps = Math.max(
          0.1,
          Math.round(((rxBytes - prevNetstat.rxBytes) * 8) / dtSec / 100_000) /
            10
        );
        liveTelemetry.txMbps = Math.max(
          0.1,
          Math.round(((txBytes - prevNetstat.txBytes) * 8) / dtSec / 100_000) /
            10
        );
      }
      prevNetstat = { ts: now, rxBytes, txBytes };
      liveTelemetry.sessionRxMb = Math.round(rxBytes / (1024 * 1024));
      liveTelemetry.sessionTxMb = Math.round(txBytes / (1024 * 1024));
    }
  } catch {
    // Keep previous counters
  }

  try {
    const psCmd = `powershell -NoProfile -Command "Get-NetTCPConnection -State Established | Where-Object { $_.RemoteAddress -notlike '127.*' -and $_.RemoteAddress -notlike '::1*' -and $_.RemoteAddress -notlike '10.88.*' -and $_.RemoteAddress -notlike '172.*' } | ForEach-Object { $p = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName; [PSCustomObject]@{ proc = if ($p) { $p } else { 'system' }; pid = $_.OwningProcess; remoteIp = $_.RemoteAddress; remotePort = $_.RemotePort } } | ConvertTo-Json -Compress"`;
    const { stdout: connJson } = await execAsync(psCmd, { timeout: 3000 });
    if (connJson && connJson.trim()) {
      const parsed = JSON.parse(connJson.trim());
      liveTelemetry.connections = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {
    // Keep previous connections
  }

  try {
    const { stdout: arpOut } = await execAsync('arp -a', { timeout: 1500 });
    liveTelemetry.arpRaw = arpOut;
  } catch {
    // Keep previous arp
  }

  liveTelemetry.timestamp = Date.now();
}

sampleHostTelemetry();
setInterval(sampleHostTelemetry, 4000);

const telemetryServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(liveTelemetry));
});
telemetryServer.on('error', () => {});
telemetryServer.listen(telemetryPort, '0.0.0.0', () => {
  console.log(
    `Live host telemetry server listening on 0.0.0.0:${telemetryPort}`
  );
});

// 4. Built-in mDNS (Bonjour / RFC 6762) responder for netfix.local and hub.local
const MDNS_PORT = 5353;
const MDNS_GROUP = '224.0.0.251';
const HOSTNAMES = new Set([
  'netfix.local',
  'hub.local',
  `${os.hostname().toLowerCase()}.local`,
]);

function encodeDnsName(name) {
  const parts = name.replace(/\.$/, '').split('.');
  const buffers = [];
  for (const part of parts) {
    const buf = Buffer.from(part, 'utf8');
    buffers.push(Buffer.from([buf.length]), buf);
  }
  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

function decodeDnsName(buf, offset) {
  const labels = [];
  let pos = offset;
  let jumped = false;
  let nextOffset = offset;
  let safety = 0;

  while (pos < buf.length && safety++ < 64) {
    const len = buf[pos];
    if (len === 0) {
      if (!jumped) nextOffset = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) break;
      if (!jumped) nextOffset = pos + 2;
      pos = ((len & 0x3f) << 8) | buf[pos + 1];
      jumped = true;
      continue;
    }
    pos += 1;
    if (pos + len > buf.length) break;
    labels.push(buf.subarray(pos, pos + len).toString('utf8'));
    pos += len;
  }

  return {
    name: labels.join('.').toLowerCase(),
    nextOffset,
  };
}

function buildMdnsAResponse(txId, hostname, ipv4) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(txId, 0);
  header.writeUInt16BE(0x8400, 2); // Standard query response, authoritative
  header.writeUInt16BE(0, 4); // QDCOUNT = 0
  header.writeUInt16BE(1, 6); // ANCOUNT = 1
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const nameBuf = encodeDnsName(hostname);
  const rrMeta = Buffer.alloc(10);
  rrMeta.writeUInt16BE(1, 0); // TYPE A (IPv4)
  rrMeta.writeUInt16BE(0x8001, 2); // CLASS IN + cache flush
  rrMeta.writeUInt32BE(120, 4); // TTL 120s
  rrMeta.writeUInt16BE(4, 8); // RDLENGTH 4

  const ipOctets = Buffer.from(ipv4.split('.').map((n) => Number(n)));
  return Buffer.concat([header, nameBuf, rrMeta, ipOctets]);
}

const mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

mdnsSocket.on('error', (err) => {
  console.error('mDNS responder error:', err.message);
});

mdnsSocket.on('message', (msg, rinfo) => {
  try {
    if (msg.length < 12) return;
    const txId = msg.readUInt16BE(0);
    const flags = msg.readUInt16BE(2);
    if ((flags & 0x8000) !== 0) return; // Ignore responses

    const qdCount = msg.readUInt16BE(4);
    let offset = 12;

    for (let i = 0; i < qdCount; i++) {
      const { name, nextOffset } = decodeDnsName(msg, offset);
      offset = nextOffset;
      if (offset + 4 > msg.length) break;
      const qtype = msg.readUInt16BE(offset);
      offset += 4;

      if (HOSTNAMES.has(name) && (qtype === 1 || qtype === 255)) {
        const pkt = buildMdnsAResponse(txId, name, primaryLanIp);
        mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_GROUP);
        if (rinfo.port !== MDNS_PORT) {
          mdnsSocket.send(pkt, 0, pkt.length, rinfo.port, rinfo.address);
        }
      }
    }
  } catch {
    // Ignore malformed mDNS packets
  }
});

mdnsSocket.bind(MDNS_PORT, '0.0.0.0', () => {
  try {
    mdnsSocket.addMembership(MDNS_GROUP, primaryLanIp);
    mdnsSocket.setMulticastTTL(255);
    mdnsSocket.setMulticastLoopback(true);
    console.log(
      `mDNS responder advertising [netfix.local, hub.local] -> ${primaryLanIp}`
    );

    const announce = () => {
      for (const host of ['netfix.local', 'hub.local']) {
        const pkt = buildMdnsAResponse(0, host, primaryLanIp);
        mdnsSocket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_GROUP);
      }
    };
    announce();
    setInterval(announce, 30_000);
  } catch (err) {
    console.error('mDNS membership warning:', err.message);
  }
});
