import net from 'net';

const port = Number(process.env.NETFIX_PORT || 3000);
const hostIps = (process.env.NETFIX_BIND_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

for (const bindIp of hostIps) {
  const server = net.createServer((clientSocket) => {
    const upstream = net.connect({ host: '127.0.0.1', port }, () => {
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  server.on('error', () => {
    // Ignore if already bound
  });

  server.listen(port, bindIp, () => {
    console.log(`LAN proxy forwarding ${bindIp}:${port} -> 127.0.0.1:${port}`);
  });
}
