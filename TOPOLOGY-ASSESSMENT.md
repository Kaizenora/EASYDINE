# Supabase & Multi-Hotel Deployment Topology Assessment
**Date of Assessment:** 8 November 2026  
**System Evaluated:** EasyDine (`Kaizenora/EASYDINE`)  
**Context:** Evaluating cloud database topology, multi-hotel architecture, offline POS reliability, and backup strategy.

---

## 1. Executive Summary

EasyDine is an on-premise / self-hosted multi-tenant POS consisting of:
- **NestJS** Backend (`apps/backend`)
- **Next.js** Web App (`apps/web`)
- **PostgreSQL** relational database accessed via Prisma ORM
- **Thermal Printer Transport** via raw TCP/ESC-POS and USB (`escpos-network`, `escpos-usb`)
- **Local WebSocket Gateway** (Socket.io) for real-time KDS, waiter calls, and order status

While evaluating managed cloud providers like **Supabase** or centralized cloud PostgreSQL for multi-hotel chains, a restaurant POS imposes distinct physical and operational constraints that differ from typical SaaS web apps.

---

## 2. Multi-Hotel & Cloud Topology Comparison

### Option A: Centralized Cloud PostgreSQL / Supabase
- **Architecture:** One shared Supabase PostgreSQL instance across multiple restaurant locations. Each branch connects over the public Internet.
- **Advantages:**
  - Single dashboard for cross-branch analytics, unified reporting, and multi-location menu syncing.
  - Zero server hardware maintenance at each restaurant site.
  - Automated WAL backups, point-in-time recovery (PITR), and instant connection pooling (PgBouncer/Supavisor).
- **Critical Failure Modes for Restaurants:**
  - **The Internet Outage Trap:** If broadband drops at the hotel, the POS halts: staff cannot punch orders, the KDS cannot receive orders, and cashiers cannot print bills or free tables.
  - **Latency on Kitchen Printers:** Physical thermal printers require low-latency TCP (port 9100) or direct USB. A cloud backend cannot directly reach a local printer without an outbound reverse tunnel (e.g. Cloudflare Tunnels, WireGuard) or local agent.
  - **Tenant Blast Radius:** A maintenance window, database overload, or connection exhaustion on the centralized database affects every restaurant in the chain simultaneously.

### Option B: Local Primary POS with Cloud Read Replica / Periodic Sync (Recommended)
- **Architecture:** Each hotel runs a local mini-server (e.g. Intel NUC, Raspberry Pi 5, or dedicated POS terminal) running the NestJS backend and local PostgreSQL container.
- **Advantages:**
  - **Zero Downtime on ISP Drops:** LAN-based order taking, KDS updates, and receipt printing continue with 100% functionality during internet cuts.
  - **Ultra-low Latency:** Table status changes and KOT tickets fire in < 5ms over local Wi-Fi/Ethernet.
  - **Local Printer Direct Connect:** USB and LAN thermal printers communicate directly without cloud relays.
- **Sync Topology:**
  - Local database runs SQLite or local PostgreSQL with change-data-capture (CDC) or transaction sync pushing up to centralized cloud (Supabase or AWS RDS) for offsite reporting and owner analytics.

---

## 3. Database Restore Drill (Synthetic Test Specification)

To guarantee disaster recoverability without risking live data:
1. **Never restore against production databases.**
2. Use a dedicated synthetic test container:
```bash
# 1. Spawn isolated sandbox DB
docker run --name easydine-restore-drill -e POSTGRES_PASSWORD=drillpass -e POSTGRES_DB=easydine_drill -p 5439:5432 -d postgres:16-alpine

# 2. Apply Prisma schema to synthetic DB
DATABASE_URL="postgresql://postgres:drillpass@localhost:5439/easydine_drill?schema=public" pnpm prisma migrate deploy

# 3. Stream synthetic backup file into test database
psql "postgresql://postgres:drillpass@localhost:5439/easydine_drill" < synthetic-backup-20261108.sql

# 4. Assert integrity
psql "postgresql://postgres:drillpass@localhost:5439/easydine_drill" -c "SELECT COUNT(*) FROM orders; SELECT COUNT(*) FROM tables;"

# 5. Clean up sandbox
docker stop easydine-restore-drill && docker rm easydine-restore-drill
```

---

## 4. Key Recommendations

1. **Keep Local Fallback:** For high-volume dining operations, never deploy cloud-only unless local gateway caching is active.
2. **Printer Transport:** For cloud setups, utilize the browser-assisted Bluetooth/WebUSB driver or local updater agent (`updater/server.js`) to bridge local ESC/POS printers.
3. **Daily Backup Verification:** Use Settings -> Backup to verify local S3-compatible snapshot uploads daily.
