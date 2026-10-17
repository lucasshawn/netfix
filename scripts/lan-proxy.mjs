import net from 'net';
import os from 'os';

const port = Number(process.env.NETFIX_PORT || 3000);
const interfaces = os.networkInterfaces();

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name] || []) {
    if (iface.internal) continue;
    const bindAddr =
      iface.family === 'IPv6' && iface.scopeid
        ? `${iface.address}%${iface.scopeid}`
        : iface.address;

    const server = net.createServer((clientSocket) => {
      const upstream = net.connect({ host: '127.0.0.1', port }, () => {
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => upstream.destroy());
    });

    server.on('error', () => {
      // Ignore if already bound on this interface
    });

    server.listen(port, bindAddr, () => {
      console.log(`LAN proxy forwarding [${bindAddr}]:${port} -> 127.0.0.1:${port}`);
    });
  }
}
