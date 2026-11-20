# EasyDine Print Helper (optional)

A small Windows program for the **cashier PC**. While it runs, EasyDine in
Chrome or Edge prints **Accept & KOT** tickets and **bills** straight to the
printers you saved in **Settings › Printers**, with no print dialog.

Without the helper nothing breaks. Accept & KOT and bills open the normal
print dialog, and you choose the printer there.

## Set up (once per cashier PC)

1. Copy this folder (`EasyDinePrintHelper.cs`, `build.cmd`,
   `start-print-helper.cmd`) to the cashier PC, for example `C:\EasyDine\print-helper`.
2. Double-click **`start-print-helper.cmd`**.
   - The first start builds `EasyDinePrintHelper.exe`. It uses the C# compiler
     that ships with Windows, so nothing is downloaded or installed.
   - To let only your EasyDine site pair, run it from a terminal with the web
     address: `start-print-helper.cmd https://your-easydine-site`
3. The window shows a **pairing code** (6 digits, valid 10 minutes, one use).
4. In EasyDine, open **Settings › Printers** and type the code under
   *Optional: print without the dialog*, then click **Pair**.
   - If the browser asks to let the site **access apps on this device**,
     click **Allow**. Without that permission the browser blocks the helper,
     and EasyDine keeps using the dialog.
5. Choose the **Bill printer** and the **Kitchen printer** from this PC's
   installed printers. Click **Test** for each, then **Save**.

## Every day

Start `start-print-helper.cmd` (or `EasyDinePrintHelper.exe`) before billing
and **keep its window open**. If it is closed, EasyDine falls back to the print
dialog by itself.

Keys in the helper window:

| Key | What it does |
|-----|--------------|
| **P** | New pairing code |
| **U** | Remove all pairings |
| **Q** | Quit |

## What it can and cannot tell you

- **"Sent to the Windows print queue" does not mean paper came out.** A
  switched-off or disconnected printer can accept a job and fail later, or
  hold it in the queue. If Windows already reports the printer as offline,
  paused or out of paper, EasyDine shows that note. Windows often does not
  know, though, so always check the printer.
- If the connection to the helper breaks while printing, the status is
  **unknown**. It is never resent automatically, because a duplicate KOT is
  worse than a missing one. Check the kitchen printer and use **Reprint KOT**
  only if nothing came out.
- It prints thermal (ESC/POS) tickets on 58 mm and 80 mm printers. For A4 or
  other non-thermal printers, keep using the print dialog.

## Security

- It listens on **127.0.0.1 only**, so other PCs on the network and the
  internet cannot connect.
- It answers a website only after the **one-time pairing** above. The pairing
  token is tied to that site's address and stored hashed in
  `%LOCALAPPDATA%\EasyDinePrintHelper\pairings.json`. Other websites get no
  answer they can read.
- It refuses requests whose Host header is not `127.0.0.1` or `localhost`,
  which guards against DNS rebinding.
- Every request is validated (size, format, printer name).
- It prints only to the **exact** saved printer name, and only if that printer
  is installed. It never substitutes another printer or the Windows default.
- It does not change drivers, ports, IP addresses or the default printer.

## Options

```
EasyDinePrintHelper.exe [--port 17821] [--allow-origin https://your-site] [--dry-run]
```

- `--port`: use another port if 17821 is taken. Enter the same port in
  Settings when pairing.
- `--allow-origin`: only these sites may pair. You can repeat it.
- `--dry-run`: test mode. It checks everything and prints nothing, and says
  so in every answer.
