import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Netfix // Residential Network Diagnostics & Topology',
  description:
    'In-network residential diagnostics, gateway bottleneck telemetry, and ISP -> Gateway -> Router -> Clients map.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-sky-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
