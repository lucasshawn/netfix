import { exec } from 'child_process';
import dgram from 'dgram';
import http from 'http';
import net from 'net';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const upstreamPort = Number(process.env.NETFIX_PORT || 3000);
const telemetryPort = Number(process.env.NETFIX_TELEMETRY_PORT || 3001);

process.on('uncaughtException', (err) => {
  console.error('[lan-proxy] Uncaught exception (recovered):', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[lan-proxy] Unhandled rejection (recovered):', reason);
});

function getPrimaryLanIpv4() {
  const interfaces = os.networkInterfaces();
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

function startTcpForwarder(listenPort, bindAddr, retries = 12) {
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

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      setTimeout(() => {
        startTcpForwarder(listenPort, bindAddr, retries - 1);
      }, 500);
      return;
    }
    console.error(
      `TCP forwarder [${bindAddr}:${listenPort}] warning:`,
      err.message
    );
  });

  server.listen(listenPort, bindAddr, () => {
    console.log(
      `LAN proxy forwarding [${bindAddr}]:${listenPort} -> 127.0.0.1:${upstreamPort}`
    );
  });
}

// 1. Forward port 80 and port 3000 on 192.168.68.73 and 0.0.0.0 -> 127.0.0.1:3000
startTcpForwarder(upstreamPort, primaryLanIp);
startTcpForwarder(80, primaryLanIp);
startTcpForwarder(80, '0.0.0.0');
startTcpForwarder(80, '::');

// 2. Live Windows Host Telemetry Collector (port 3001)
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
    const psCmd = `powershell -NoProfile -Command "Get-NetTCPConnection -State Established | Where-Object { $_.RemoteAddress -notlike '127.*' -and $_.RemoteAddress -notlike '::1*' -and $_.RemoteAddress -notlike '10.88.*' -and $_.RemoteAddress -notlike '172.*' } | ForEach-Object { $p = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName; [PSCustomObject]@{ proc = if ($p) { $p } else { 'system' }; pid = $_.OwningProcess; localPort = $_.LocalPort; remoteIp = $_.RemoteAddress; remotePort = $_.RemotePort } } | ConvertTo-Json -Compress"`;
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

// 3. RFC 6762 mDNS + RFC 4795 LLMNR Responder bound directly to Wi-Fi LAN IP (192.168.68.73)
const MDNS_PORT = 5353;
const MDNS_GROUP = '224.0.0.251';
const LLMNR_PORT = 5355;
const LLMNR_GROUP = '224.0.0.252';

const HOSTNAMES = new Set([
  'netfix.local',
  'hub.local',
  `${os.hostname().toLowerCase()}.local`,
  'netfix',
  'hub',
  os.hostname().toLowerCase(),
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

// Build mDNS response with both A record (IPv4) and NSEC record (proving no IPv6 AAAA record so iOS/Android don't stall)
function buildMdnsResponse(txId, hostname, ipv4) {
  const fqdn = hostname.endsWith('.local') ? hostname : `${hostname}.local`;
  const nameBuf = encodeDnsName(fqdn);
  const ipOctets = Buffer.from(ipv4.split('.').map((n) => Number(n)));

  // Answer 1: TYPE A (IPv4)
  const rrA = Buffer.alloc(10);
  rrA.writeUInt16BE(1, 0); // TYPE A
  rrA.writeUInt16BE(0x8001, 2); // CLASS IN + cache-flush
  rrA.writeUInt32BE(120, 4); // TTL 120s
  rrA.writeUInt16BE(4, 8); // RDLENGTH 4

  // Answer 2 (Additional/NSEC): TYPE NSEC (47) indicating only TYPE A exists
  const nsecBitmap = Buffer.from([0x00, 0x04, 0x40, 0x00, 0x00, 0x00]); // Window 0, length 4, bit 1 (A) set
  const nsecRdata = Buffer.concat([nameBuf, nsecBitmap]);
  const rrNsec = Buffer.alloc(10);
  rrNsec.writeUInt16BE(47, 0); // TYPE NSEC
  rrNsec.writeUInt16BE(0x8001, 2); // CLASS IN + cache-flush
  rrNsec.writeUInt32BE(120, 4);
  rrNsec.writeUInt16BE(nsecRdata.length, 8);

  const header = Buffer.alloc(12);
  header.writeUInt16BE(txId, 0);
  header.writeUInt16BE(0x8400, 2); // Authoritative response
  header.writeUInt16BE(0, 4); // QDCOUNT = 0
  header.writeUInt16BE(1, 6); // ANCOUNT = 1 (A record)
  header.writeUInt16BE(0, 8); // NSCOUNT = 0
  header.writeUInt16BE(1, 10); // ARCOUNT = 1 (NSEC record)

  return Buffer.concat([
    header,
    nameBuf,
    rrA,
    ipOctets,
    nameBuf,
    rrNsec,
    nsecRdata,
  ]);
}

// Build LLMNR response (RFC 4795 echoes the question section + A record when qtype=1)
function buildLlmnrResponse(txId, hostname, qtype, ipv4) {
  const nameBuf = encodeDnsName(hostname);
  const questionMeta = Buffer.alloc(4);
  questionMeta.writeUInt16BE(qtype, 0);
  questionMeta.writeUInt16BE(1, 2);

  const header = Buffer.alloc(12);
  header.writeUInt16BE(txId, 0);
  header.writeUInt16BE(0x8000, 2); // Response
  header.writeUInt16BE(1, 4); // QDCOUNT = 1

  if (qtype === 1) {
    header.writeUInt16BE(1, 6); // ANCOUNT = 1
    const rrA = Buffer.alloc(10);
    rrA.writeUInt16BE(1, 0);
    rrA.writeUInt16BE(1, 2);
    rrA.writeUInt32BE(60, 4);
    rrA.writeUInt16BE(4, 8);
    const ipOctets = Buffer.from(ipv4.split('.').map((n) => Number(n)));
    return Buffer.concat([
      header,
      nameBuf,
      questionMeta,
      nameBuf,
      rrA,
      ipOctets,
    ]);
  } else {
    // Empty answer for AAAA so client immediately uses A record
    header.writeUInt16BE(0, 6);
    return Buffer.concat([header, nameBuf, questionMeta]);
  }
}

function handleMdnsMessage(socket, msg, rinfo) {
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

      if (
        HOSTNAMES.has(name) &&
        (qtype === 1 || qtype === 28 || qtype === 255)
      ) {
        const pkt = buildMdnsResponse(txId, name, primaryLanIp);
        // Send both directly to requester (unicast) and to mDNS multicast group on Wi-Fi
        socket.send(pkt, 0, pkt.length, rinfo.port, rinfo.address);
        socket.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_GROUP);
      }
    }
  } catch {
    // Ignore malformed packets
  }
}

// Bind dedicated mDNS socket on 192.168.68.73:5353 so Windows routes multicast on Wi-Fi (not WSL)
function startMdnsSocket(bindAddress) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => handleMdnsMessage(sock, msg, rinfo));
  sock.bind(MDNS_PORT, bindAddress, () => {
    try {
      sock.addMembership(MDNS_GROUP, primaryLanIp);
      sock.setMulticastInterface(primaryLanIp);
      sock.setMulticastTTL(255);
      sock.setMulticastLoopback(true);
      console.log(
        `mDNS responder [${bindAddress}:${MDNS_PORT}] advertising [netfix.local, hub.local] -> ${primaryLanIp}`
      );
      if (bindAddress === primaryLanIp) {
        const announce = () => {
          for (const host of ['netfix.local', 'hub.local']) {
            const pkt = buildMdnsResponse(0, host, primaryLanIp);
            sock.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_GROUP);
          }
        };
        announce();
        setInterval(announce, 15_000);
      }
    } catch (err) {
      console.error(`mDNS setup warning (${bindAddress}):`, err.message);
    }
  });
}

startMdnsSocket(primaryLanIp);
startMdnsSocket('0.0.0.0');

// Bind LLMNR socket on 5355 for Android / Windows single-label and local resolution
function startLlmnrSocket(bindAddress) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => {
    try {
      if (msg.length < 12) return;
      const txId = msg.readUInt16BE(0);
      const flags = msg.readUInt16BE(2);
      if ((flags & 0x8000) !== 0) return;
      const qdCount = msg.readUInt16BE(4);
      let offset = 12;
      for (let i = 0; i < qdCount; i++) {
        const { name, nextOffset } = decodeDnsName(msg, offset);
        offset = nextOffset;
        if (offset + 4 > msg.length) break;
        const qtype = msg.readUInt16BE(offset);
        offset += 4;
        if (HOSTNAMES.has(name)) {
          const pkt = buildLlmnrResponse(txId, name, qtype, primaryLanIp);
          sock.send(pkt, 0, pkt.length, rinfo.port, rinfo.address);
        }
      }
    } catch {
      // Ignore
    }
  });
  sock.bind(LLMNR_PORT, bindAddress, () => {
    try {
      sock.addMembership(LLMNR_GROUP, primaryLanIp);
      sock.setMulticastInterface(primaryLanIp);
    } catch {
      // Ignore
    }
  });
}

startLlmnrSocket(primaryLanIp);
startLlmnrSocket('0.0.0.0');
