# Infrastructure Overview

**Status:** Template — replace this with your own infrastructure documentation.

---

## Hardware

<!-- Document your hardware here. Example:

### Server — Dell PowerEdge R730

| Component | Details |
|-----------|---------|
| **CPU** | 2x Intel Xeon E5-2680 v4 (14C/28T each) |
| **RAM** | 128GB DDR4 ECC |
| **Storage** | 2x 1TB NVMe (boot, mirrored) + 4x 8TB HDD (data, RAIDZ2) |
| **Network** | 2x 1GbE + 1x 10GbE |
| **IP** | 192.168.1.10 |
-->

---

## Architecture

<!-- Describe how your systems are organized. Example:

The infrastructure runs on a single physical server with containers providing service isolation. All public traffic routes through a reverse proxy. Internal services are accessible only via VPN.

```
Internet
  │
  ▼
[Reverse Proxy] ──► [Web App 1]
       │          ──► [Web App 2]
       │
[VPN Gateway]
       │
       ▼
[Internal Services]
  ├── Database
  ├── Monitoring
  └── Backups
```
-->

---

## Network

<!-- Document your network topology. Example:

| VLAN | Purpose | Subnet |
|------|---------|--------|
| 10 | Trusted devices | 192.168.10.0/24 |
| 20 | IoT | 192.168.20.0/24 |
| 30 | Guest | 192.168.30.0/24 |
-->

---

## Services

<!-- List your services. Example:

| Service | Host | Port | Purpose |
|---------|------|------|---------|
| Nginx | proxy | 443 | Reverse proxy |
| PostgreSQL | db-01 | 5432 | Primary database |
| Grafana | monitor | 3000 | Dashboards |
| Restic | backup | — | Nightly backups |
-->

---

## Design Decisions

<!-- Document *why* things are set up the way they are. Example:

### Why containers over VMs

Containers were chosen over VMs to reduce memory overhead. Each service runs in its own container with a shared kernel, using approximately 50-100MB RAM per container compared to 512MB+ for a minimal VM.

### Why local storage over cloud

All data is stored locally to maintain full control over availability and avoid recurring cloud storage costs. Offsite backups are handled via encrypted Restic snapshots synced to a remote location.
-->

---

## Related Pages

- [Home](/en/home)
