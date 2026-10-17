import dgram from 'dgram';
import net from 'net';
import os from 'os';

const upstreamPort = Number(process.env.NETFIX_PORT || 3000);
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

// 3. Built-in mDNS (Bonjour / RFC 6762) responder for netfix.local and hub.local
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

      // Respond to A (1) or ANY (255) queries for netfix.local / hub.local
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
