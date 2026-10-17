# Netfix: Local Network Diagnostics, Traffic Trends & Layered Topology Dashboard Design

**Date:** 2026-10-16  
**Host Environment:** `Hub` (Windows host running Podman container runtime, accessible across LAN from PC and mobile phone)  
**Tech Stack:** Node.js 22 + TypeScript, Next.js (App Router) + Custom Collector Runtime, Tailwind CSS, React Flow (Desktop Topology), Recharts (Traffic Trends), SQLite (`better-sqlite3` + AES-256-GCM credential vault), Podman (`Containerfile` + `compose.yaml`).

---

## 1. Overview & Goals

**Netfix** is a self-hosted, in-network residential network diagnostics and remediation web application designed to run inside a Podman container on the `Hub` PC and expose a LAN-accessible web interface (`0.0.0.0:3000`, reachable via `http://hub:3000` or `http://<hub-lan-ip>:3000` from both desktop PCs and mobile phones).

### Initial Milestone Scope
1. **Interactive Layered Network Map (`ISP → Gateway → Router/Mesh/Switch → Clients`):**
   - Visualizes each layer of the residential network, live link utilization, per-hop latency, and health status (Healthy, Warning, Critical/Bottlenecked).
2. **Gateway Bottleneck & Traffic Trends Dashboard:**
   - Measures and visualizes how bottlenecked the Gateway is (combining WAN bandwidth saturation, bufferbloat/latency inflation under load, and packet drop/NAT metrics).
   - Shows **where data is going**: real-time rolling bandwidth trends (Download/Upload Mbps), top local client talkers, and top external destination services/ASNs (e.g., Steam CDN, Netflix, Cloud Backup, Web/Video).
3. **Hardware Configuration & Pluggable Credential Vault:**
   - Allows the user to attach authentication credentials to any discovered or manually added hardware node (routers, ISP gateways, bridges, mesh nodes, switches) using standard protocols (`UPnP IGD`, `SNMP v2c/v3`, `SSH/CLI`, `HTTP/REST`).
4. **Layer Diagnostics, Suggestions & Automated Remediation:**
   - Identifies troublesome layers (e.g., Gateway Bufferbloat, Double-NAT between Router and Gateway, High Packet Loss, Sub-optimal 100Mbps Ethernet link negotiation, Unauthenticated Infrastructure Node) and provides clear remediation steps plus 1-click automated actions where credentials allow.
5. **Responsive Desktop (Option B) & Mobile Companion UI:**
   - **Desktop (`>= 1024px`):** Two-Column Map Canvas (left 60%) + Persistent Live Inspector Sidebar (right 40%).
   - **Mobile (`< 768px`):** Sticky Gateway Bottleneck header + Touch-friendly vertical layer stack + Slide-up bottom sheet inspector + 4-tab bottom navigation bar (`Map`, `Traffic`, `Fixes`, `Devices`).

---

## 2. System Architecture & Podman Container Runtime

### 2.1 Container & LAN Provisioning on `Hub`
- **`Containerfile`:** Multi-stage Node.js 22 container image that installs lightweight network diagnostic utilities (`iputils-ping`, `traceroute`, `iproute2`, `net-tools`, `snmp`) and runs the unified Netfix server on port `3000` bound to `0.0.0.0`.
- **`compose.yaml`:** Defines the `netfix` service for Podman with:
  - Port mapping `0.0.0.0:3000:3000` for LAN access from PC and mobile phone.
  - Persistent volume `./data:/data` for the SQLite database (`/data/netfix.db`) and master encryption key (`/data/secret.key`).
  - Capabilities `CAP_NET_RAW` and `CAP_NET_ADMIN` so ICMP ping and hop-by-hop traceroute probes work inside the container.
- **`scripts/provision-podman.ps1`:** PowerShell provisioning script for `Hub` that:
  1. Builds the container image via `podman build`.
  2. Starts the container via `podman run` / `podman compose`.
  3. Configures Windows Firewall & `netsh interface portproxy` (when Podman runs inside WSL2/VM on Windows) so external LAN devices (such as a phone on Wi-Fi) can reach `http://hub:3000` directly.

### 2.2 Modular Internal Architecture
The codebase is organized into focused, independently testable modules:

```
src/
├── lib/
│   ├── db/                 # SQLite schema, migrations, queries (nodes, credentials, traffic_samples, issues)
│   ├── crypto/             # AES-256-GCM encryption/decryption for hardware credentials at rest
│   ├── discovery/          # ARP parser, ICMP ping sweep, hop-by-hop traceroute classifier, UPnP/mDNS
│   ├── adapters/           # Pluggable HardwareAdapter implementations:
│   │   ├── types.ts        # Unified HardwareAdapter interface & telemetry contracts
│   │   ├── upnp.ts         # UPnP IGD WAN byte counter & link capacity poller
│   │   ├── snmp.ts         # SNMP v2c/v3 IF-MIB throughput, errors/drops & ARP/bridge table poller
│   │   ├── ssh.ts          # SSH/CLI adapter for conntrack flows, DHCP leases & automated fix commands
│   │   └── http.ts         # Generic HTTP/REST status endpoint adapter
│   ├── diagnostics/        # Bottleneck calculator, traffic destination resolver, layer issue & fix engine
│   └── collector/          # Background polling orchestrator & SSE event broadcaster
├── app/
│   ├── api/
│   │   ├── topology/       # GET topology graph + nodes, POST manual node
│   │   ├── traffic/        # GET rolling traffic time-series, top talkers & destination breakdown
│   │   ├── credentials/    # GET/POST/DELETE encrypted credentials + test-connection endpoint
│   │   ├── diagnostics/    # GET active layer issues, POST execute automated fix
│   │   └── stream/         # GET Server-Sent Events (SSE) live telemetry stream
│   └── (dashboard)/        # Responsive Desktop (Option B) + Mobile Views
└── components/
    ├── topology/           # Desktop React Flow canvas & Mobile vertical touch-card layer stack
    ├── inspector/          # Right-hand sidebar cards (Gateway Bottleneck, Traffic Trends, Node Creds)
    ├── diagnostics/        # Issue cards, root-cause explanations, and 1-click Fix modal/actions
    └── mobile/             # Mobile bottom nav bar & slide-up bottom sheet inspector
```

---

## 3. Data Flow & Diagnostic Algorithms

### 3.1 Layer Discovery (`ISP → Gateway → Router → Clients`)
1. **Path Traceroute Classification:**
   - Traces hops toward `1.1.1.1` and `8.8.8.8`.
   - Classifies hop 1 as the local `Router` (or combined `Gateway` if single-hop before public WAN).
   - If hop 1 and hop 2 are both RFC1918 (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`) or CGNAT (`100.64.x.x`), classifies hop 1 as `Router`, hop 2 as `Gateway`, and automatically flags a **Double-NAT Warning** with instructions/automation to enable Bridge Mode or DMZ.
   - Classifies the first public routable hop as `ISP (WAN)`.
2. **LAN Neighbor Discovery:**
   - Parses OS/container ARP cache and runs a lightweight non-blocking subnet ping probe + mDNS/SSDP discovery to populate `Clients` and intermediate infrastructure (`Switch`, `Mesh Node`, `Bridge`).
   - Gracefully blends live local probes with realistic baseline telemetry when running inside an isolated container bridge, while immediately switching to live hardware counters as soon as a node is reachable via UPnP, SNMP, SSH, or HTTP.

### 3.2 Gateway Bottleneck Score (0–100%)
Computed on every collector tick (every 3 seconds):
- **Bandwidth Saturation ($S_{bw}$):** $\min(100, \frac{\text{Current WAN Mbps}}{\text{Configured/Detected Link Capacity Mbps}} \times 100)$.
- **Bufferbloat / Queue Inflation ($S_{lat}$):** Compares current Gateway/ISP hop RTT against the rolling 5th-percentile unloaded baseline RTT. A delta of $+0\text{ ms} \to 0\%$, $+25\text{ ms} \to 50\%$, $\ge +60\text{ ms} \to 100\%$.
- **Packet Loss / Drops ($S_{drop}$):** Derived from ping loss % and SNMP `ifInDiscards`/`ifOutDiscards`.
- **Composite Bottleneck Score:**
  $$\text{Bottleneck} = \text{round}\left(0.45 \cdot S_{bw} + 0.40 \cdot S_{lat} + 0.15 \cdot S_{drop}\right)$$
  - `0–49%`: **Healthy (Green)** — Gateway has ample headroom and low queueing delay.
  - `50–74%`: **Moderate Load / Elevated Queue (Amber)** — Noticeable utilization or mild latency inflation.
  - `75–100%`: **Bottlenecked (Red)** — High saturation or severe bufferbloat; surfaces immediate QoS/SQM and traffic-shaping fixes.

### 3.3 Traffic Trends ("Where is the data going?")
- **Rolling Time-Series:** Stores 1-second/3-second samples in SQLite (retained for 24 hours with automatic pruning) tracking total WAN Download Mbps, Upload Mbps, and Gateway Latency (ms).
- **Destination & Talker Breakdown:**
  - Collects active flows from credentialed routers (SSH `/proc/net/nf_conntrack` or SNMP per-port counters) and local host socket tables (`netstat`/`ss`).
  - Maps remote IPs via reverse DNS / ASN prefix table into clear destination groups (`Steam / Gaming CDN`, `Netflix / Video Streaming`, `Cloud Storage & Backup`, `Video Conferencing`, `General Web / HTTPS`) and ranks top local client devices by bandwidth share.

### 3.4 Credential Vault & Hardware Adapters
- Credentials are never returned in plaintext to the browser after saving; they are encrypted with AES-256-GCM using a randomly generated 256-bit key stored in `/data/secret.key`.
- Supported adapter types per hardware node:
  - `upnp`: Zero-credential WAN status and byte counter polling via UPnP IGD SOAP requests.
  - `snmp`: Community string (v2c) or user/authKey/privKey (v3) polling standard `IF-MIB` and `IP-MIB` OIDs.
  - `ssh`: Host, port, username, password/private key for CLI diagnostics (`conntrack`, `ip neigh`, `tc qdisc`) and automated remediation commands.
  - `http`: Base URL, auth header / basic auth / token for router REST status endpoints.
- Includes a **"Test Connection"** button in the Node Credentials form that validates authentication immediately and reports discovered capabilities.

---

## 4. UI Design & Responsive Modes

### 4.1 Desktop Layout (`>= 1024px` — Option B)
- **Top Header Bar:** Shows overall network health badge, Podman/LAN host access URL (`http://hub:3000`) with a QR code / copy link button for opening on a phone, and a "Scan Now" trigger.
- **Left Column (60% width): Interactive Vertical Topology Canvas:**
  - Renders `ISP (WAN) → Gateway → Router / Switch / Mesh → Clients` using React Flow.
  - Animated edges speed up and thicken proportionally to live Mbps throughput; edge/node colors reflect layer health.
  - Clicking any node selects it in the right-hand Inspector Sidebar.
- **Right Column (40% width): Persistent Stacked Inspector Sidebar:**
  1. **Gateway Bottleneck & Diagnostics Card:** Circular/linear saturation gauge, live bufferbloat latency delta (`+ms`), active layer warnings, and 1-click Fix / Suggestion buttons.
  2. **Traffic Trends & Destinations Card:** Live area chart (Download/Upload Mbps + Latency overlay) plus segmented bars for Top Destinations (Where data is going) and Top Client Talkers.
  3. **Selected Node Inspector & Credentials Card:** Displays live metrics for the selected node (IP, MAC, vendor, uptime, link speed, auth status) and an inline form to configure/test `SNMP`, `SSH`, `UPnP`, or `HTTP` credentials.

### 4.2 Mobile Phone Layout (`< 768px`)
- **Sticky Top Status Bar:** Compact summary of Gateway Bottleneck %, current WAN Down/Up Mbps, and active issue count.
- **Bottom Tab Navigation (`Map` | `Traffic` | `Fixes` | `Devices`):**
  - **Map Tab:** Touch-friendly vertical card stack (`ISP → Gateway → Router → Expandable Clients List`) with clear link indicators. Tapping any node opens the slide-up bottom sheet for node details and credentials.
  - **Traffic Tab:** Full-width mobile chart of bandwidth trends, top destination services, and top client devices.
  - **Fixes Tab:** Prioritized list of detected network problems by layer with plain-English explanations and 1-tap automated fix execution.
  - **Devices Tab:** Quick directory of all routers, gateways, switches, mesh nodes, and clients to manage credentials on the go.

---

## 5. Error Handling & Testing Strategy

- **Graceful Degradation:** If a hardware node's credentials fail, time out, or SNMP/SSH is unreachable, the node remains on the topology map using ICMP/ARP baseline telemetry and displays an `Auth Error / Unreachable` badge with the specific connection error message.
- **Automated Tests (Vitest + Playwright):**
  - **Unit Tests:** AES-256-GCM credential encryption/decryption, Gateway Bottleneck score calculation across healthy/bufferbloat/saturated scenarios, traceroute layer classification (including Double-NAT detection), and destination service/ASN classification.
  - **Integration Tests:** API routes (`/api/topology`, `/api/traffic`, `/api/credentials`, `/api/diagnostics`) backed by an in-memory SQLite instance, plus HardwareAdapter connection test flows.
  - **Container & End-to-End Verification:** Build and run the Podman container on `Hub`, verify HTTP 200 and live telemetry on both desktop viewport (`1440x900`) and mobile phone viewport (`390x844`).
