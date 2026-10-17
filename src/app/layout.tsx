import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Powerhouse PNW • Netfix // Network Diagnostics & Topology (powerhousepnw.com)',
  description:
    'Powerhouse PNW (powerhousepnw.com) in-network residential diagnostics, gateway bottleneck telemetry, and live network hierarchy tree.',
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
