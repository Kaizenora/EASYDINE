# Printer Compatibility

> [!IMPORTANT]
> **TESTED** means a specific person connected a specific printer and confirmed paper came out.
> Everything else is **NOT TESTED** — it may work, it may not.
> Never trust this list alone. Always do a physical test-print before a service.

---

## Status Key

| Mark | Meaning |
|------|---------|
| ✅ TESTED | Print confirmed with this exact model and transport on this date |
| ⚠️ LIKELY | Transport is correct class; never physically tested |
| ❌ NOT TESTED | No hardware test has been done |

---

## Kitchen Ticket (KOT) Printers — 80 mm

| Printer Model | Transport | Date Tested | Tester | Notes |
|---|---|---|---|---|
| *(none yet)* | — | — | — | Physical test needed — see docs/WINDOWS-SETUP-AND-TEST.md |

## Bill / Receipt Printers — 80 mm

| Printer Model | Transport | Date Tested | Tester | Notes |
|---|---|---|---|---|
| *(none yet)* | — | — | — | Physical test needed |

## Bill / Receipt Printers — 58 mm

| Printer Model | Transport | Date Tested | Tester | Notes |
|---|---|---|---|---|
| *(none yet)* | — | — | — | Physical test needed |

---

## Transport Notes

### NETWORK (raw TCP, JetDirect / port 9100)
- Works when the printer's IP is reachable from the machine running the backend.
- Confirm with: `telnet <printer-ip> 9100` — if it connects, the port is open.
- Enable "Raw" / "LPR" / "Port 9100" mode in the printer's web interface.
- ❌ NOT TESTED on any specific model yet — needs hardware test.

### WINDOWS_SPOOLER (raw bytes via Windows print queue)
- The printer must be installed in Windows Devices & Printers.
- Driver must pass raw bytes through (most thermal printer Windows drivers do).
- Printer name in Settings must exactly match the name shown in Windows.
- ❌ NOT TESTED on any specific model yet — needs hardware test.

### COM_PORT (RS-232 / Bluetooth SPP)
- Pair the Bluetooth printer in Windows first; note the COM port it assigns (e.g. COM3).
- Requires `serialport` npm package installed in apps/backend.
- Baud rate is usually 9600 for thermal printers; check the printer's manual.
- ❌ NOT TESTED on any specific model yet — needs hardware test.

### USB (Linux/Docker only — kernel usblp + libusb)
- Only works when the backend runs in the Docker container on a **Linux** host.
- The Docker Compose file already includes the USB device passthrough.
- Does **not** work on Windows Docker Desktop (USB passthrough not supported).
- ❌ NOT TESTED on any specific model yet — needs hardware test.

### A4 / browser print (window.print)
- Works via any browser on any OS — no driver needed.
- Quality depends on the browser's print dialog and the installed paper/printer.
- ❌ NOT TESTED yet.

---

## How to Add a Tested Entry

After you physically print a test ticket on a specific printer:

1. Note the exact model name from the printer's label or manual.
2. Note the transport used, the date, and your name.
3. Add a row to the matching table above.
4. Commit the change.

**Example row:**

```
| Epson TM-T82III | NETWORK | 2026-11-15 | Siddharth | 80mm, CP858, port 9100, telnet confirmed |
```

---

> [!CAUTION]
> This file lists what has been tested. The software reports **SENT** (bytes accepted by the transport).
> **PRINTED** (paper came out) is confirmed only by physically looking at the printer — never by code.
