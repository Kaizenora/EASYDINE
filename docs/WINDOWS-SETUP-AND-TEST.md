# Windows Setup and Test Checklist

> [!NOTE]
> This document describes how to run EasyDine on a Windows PC and how to test printing.
> Steps marked **"needs Siddharth's hardware"** require a physical printer to verify.

---

## 1. Prerequisites

| Software | Version | Why |
|---|---|---|
| Docker Desktop | ≥ 4.26 | Runs the full stack (Postgres + backend + web) |
| Git | any recent | Clones the repo |
| PowerShell | ≥ 5.1 (included in Windows 10/11) | Used by quickstart.ps1 and Windows Spooler printing |

> [!IMPORTANT]
> Docker Desktop on Windows uses WSL2 or Hyper-V. **USB passthrough to containers is NOT supported by Docker Desktop on Windows.** The USB transport for thermal printers (Linux only) will not work. Use NETWORK, WINDOWS_SPOOLER, or COM_PORT instead.

---

## 2. One-line Install (Docker stack)

Open PowerShell **as Administrator** and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://raw.githubusercontent.com/Kaizenora/EASYDINE/master/scripts/quickstart.ps1 | iex
```

This will:
1. Install Docker Desktop (via winget) if not present
2. Install Git if not present
3. Clone the repo to `.\easy-dine-pos`
4. Generate a `.env` with random secrets
5. `docker compose up -d --build`
6. Wait up to 90 s for `http://localhost:1995/api/health` to respond

**Expected:** Browser opens at `http://localhost:1995`. Create your restaurant at `/signup`.

---

## 3. Local Development (no Docker — faster restarts)

Use this for code changes. Requires Node ≥ 22 + pnpm + a local PostgreSQL instance.

```powershell
# 1. Clone
git clone https://github.com/Kaizenora/EASYDINE.git easy-dine-pos
cd easy-dine-pos

# 2. Install dependencies
pnpm install

# 3. Backend env
Copy-Item apps\backend\.env.example apps\backend\.env
# Edit apps\backend\.env:
#   DATABASE_URL = postgresql://postgres:password@localhost:5432/easydine
#   JWT_SECRET   = any-long-random-string
#   PORT         = 4000

# 4. Run migrations (ONCE — against your local dev DB only)
cd apps\backend
npx prisma migrate deploy
cd ..\..

# 5. Start backend (terminal 1)
pnpm --filter backend dev     # listens on port 4000

# 6. Set BACKEND_URL for Next.js (important — default is 4001, NOT 4000)
$env:BACKEND_URL = "http://localhost:4000"

# 7. Start web (terminal 2)
pnpm --filter web dev         # listens on port 3000

# Access at http://localhost:3000
```

> [!WARNING]
> `next.config.ts` defaults `BACKEND_URL` to `http://localhost:4001` (not 4000).
> Always set `$env:BACKEND_URL = "http://localhost:4000"` before `pnpm dev` for the web app,
> or add `BACKEND_URL=http://localhost:4000` to `apps/web/.env.local`.

---

## 4. LAN Access (phones for QR ordering)

For phones on the same Wi-Fi to reach the app:

```powershell
# Allow inbound on port 1995 (Docker stack) or 3000 (dev mode)
netsh advfirewall firewall add rule name="EasyDine" dir=in action=allow protocol=TCP localport=1995

# Find your PC's IP address
ipconfig | Select-String "IPv4"
```

Phones open: `http://<YOUR-PC-IP>:1995`

> [!WARNING]
> Chrome on Android **blocks** the Web Speech API (microphone) on plain `http://` LAN URLs.
> Voice input will silently fail until HTTPS is set up. See PART C when you reach it.

---

## 5. Printer Setup — Windows Spooler (Recommended for Windows)

**needs Siddharth's hardware to verify paper output**

### 5a. Install the printer in Windows

1. Connect the USB thermal printer to the PC.
2. Windows should auto-install a driver. If not: download from the manufacturer's website.
3. Open **Settings › Bluetooth & devices › Printers & scanners**.
4. Note the exact printer name shown (e.g. `"EPSON TM-T82III"` — copy it exactly including spaces and capitalisation).
5. Right-click the printer → **Printer properties → Print a test page** — confirm paper comes out.

### 5b. Configure in EasyDine

1. Settings › Printer (or the branch printer settings page).
2. Set **Connection type** to `Windows Spooler`.
3. Paste the exact Windows printer name into the **Printer name** field.
4. Click **Test print** — the diagnostics endpoint (`GET /api/orders/print/diagnostics`) will list all visible Windows printers and confirm whether the configured name matches.

### 5c. Verify

```
Expected diagnostics response:
  canSend: true
  windowsPrinters: ["EPSON TM-T82III", ...]
  configuredPrinterName: "EPSON TM-T82III"
```

**Then physically look at the printer. Paper must come out. `canSend: true` only means bytes were queued in Windows — it does NOT mean the printer printed.**

---

## 6. Printer Setup — Bluetooth / COM Port

**needs Siddharth's hardware to verify paper output**

### 6a. Pair the Bluetooth printer

1. On the PC: **Settings › Bluetooth & devices** → pair the printer.
2. After pairing, Windows creates a virtual COM port. Find it:
   - Device Manager → Ports (COM & LPT) → note the COM number (e.g. `COM3`).
   - Or: `Get-WmiObject Win32_SerialPort | Select-Object Name, DeviceID` in PowerShell.

### 6b. Install serialport

The COM port transport requires an optional native addon:

```powershell
cd C:\path\to\easy-dine-pos\apps\backend
pnpm add serialport
```

Restart the backend after installation.

### 6c. Configure in EasyDine

1. Settings › Printer → Connection type: `COM Port`.
2. Enter the COM port path (e.g. `COM3`).
3. Set baud rate (usually `9600` for thermal printers — check the printer manual).
4. Click **Test print**. Diagnostics will list all visible COM ports.

### 6d. Verify

**Physically look at the printer. Paper must come out.**

---

## 7. Printer Setup — Network (TCP/IP)

**needs Siddharth's hardware to verify paper output**

1. Find the printer's IP address (print a self-test page, or check the router's DHCP leases).
2. Settings › Printer → Connection type: `Network`.
3. Enter the IP address and port (usually `9100`).
4. Verify: `Test-NetConnection -ComputerName <printer-ip> -Port 9100` should show `TcpTestSucceeded: True`.
5. Click **Test print**.

**Physically look at the printer. Paper must come out.**

---

## 8. Printer Setup — A4 / browser print

No configuration needed. Works via the browser print dialog on any OS.
The cashier clicks **Print bill** in the web app → the browser's print dialog opens.

---

## 9. CI Port-1995 Smoke Failure — Root Cause

The CI smoke test (`install-smoke.yml`) runs the quickstart on a fresh Ubuntu CI runner:

```
curl -fsSL https://raw.githubusercontent.com/.../master/scripts/quickstart.sh | bash
curl -sf http://localhost:1995/api/health
```

**Root cause identified from code reading:**
- The smoke test runs against the **published `master` branch** on GitHub.
- `fdf4d16` already fixed the wrong `REPO_URL` (changed from `Raktim94/...` to `Kaizenora/...`).
- The remaining risk: the CI runner must be able to build Docker images (needs Docker installed on the runner — `ubuntu-latest` has it, so this should work).
- The 40-minute timeout accounts for image build time.
- **What could still fail:** a Docker build error (TypeScript compile error, missing dependency), or the backend taking > 90 s to pass `prisma migrate deploy` on a cold runner.

**To reproduce locally (requires Docker and Linux/WSL):**
```bash
# In WSL2 or a Linux VM:
bash <(curl -fsSL https://raw.githubusercontent.com/Kaizenora/EASYDINE/master/scripts/quickstart.sh)
curl -sf http://localhost:1995/api/health
```

> [!NOTE]
> This cannot be verified without network access to GitHub and a Linux environment. The CI job log at https://github.com/Kaizenora/EASYDINE/actions/runs/42582671364 is the authoritative failure reason. Read "Logs on failure" in that job — it shows the last 80 lines of `docker compose logs`.

---

## 10. QR Code Setup

QR codes on each table must encode a URL that **phones on the restaurant's network can reach**.

1. Settings › General → set **Public base URL** to `http://<YOUR-PC-IP>:1995` (or your domain).
2. If unset, the app shows a warning: *"Public base URL is not set — QR codes may not work for customers."*
3. After setting, go to Tables → each table shows its QR code for printing.

> [!IMPORTANT]
> The QR image on the EasyDine menu poster (the brown "Scan and Order Smartly" design) is a placeholder.
> Generate real per-table QR codes from the app after setting the Public base URL.

---

## 11. Physical Print Test Checklist

Run this sequence before first service. Tick each line manually.

| Step | Action | Expected | Verified |
|---|---|---|---|
| 1 | Power on printer, connect cable/Bluetooth | Power LED on | ☐ needs hardware |
| 2 | Windows Devices & Printers shows the printer | Name visible | ☐ needs hardware |
| 3 | Windows test page prints | Paper comes out | ☐ needs hardware |
| 4 | Configure printer in EasyDine Settings | canSend: true in diagnostics | ☐ needs hardware |
| 5 | Click Test Print (KOT) in EasyDine | Test slip comes out of kitchen printer | ☐ needs hardware |
| 6 | Click Test Print (Bill) in EasyDine | Test slip comes out of bill printer | ☐ needs hardware |
| 7 | Accept a test order | KOT prints automatically | ☐ needs hardware |
| 8 | Settle a test table | Bill prints | ☐ needs hardware |
| 9 | Unplug and replug printer | Next print still works | ☐ needs hardware |
| 10 | Turn printer off mid-job | Cashier sees "Printer status unknown — check printer" | ☐ needs hardware |
