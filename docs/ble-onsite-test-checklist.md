# Bluetooth printer - on-site hardware test checklist

Status: **BLOCKED in CI/sandbox** - needs a real BLE thermal printer, a Chromium browser with Web Bluetooth
(Chrome/Edge on Android, Windows, macOS, ChromeOS; not iOS/Safari) and HTTPS (or localhost).
Use a test restaurant/branch only. **No step below sends a real customer order to print automatically;
every print is a click you make, and nothing is retried automatically.**

Wording rule being verified: a finished write says **"data sent to printer"** - never "printed".

| # | Step | Expected result |
|---|------|-----------------|
| 1 | Power on the printer, load paper, keep it within 1 m. Open Settings > Printer in the app. | Card shows "System print (default)" selected. No Bluetooth prompt appears on page load. |
| 2 | Click **Test Print (System)** (browser print dialog) and cancel it. | Browser print dialog opens; cancelling changes nothing and shows no error. |
| 3 | Select "Direct Bluetooth", click **Choose printer**. | Browser's device chooser opens only now (after the click). |
| 4 | Pick the printer. | App verifies a known printer profile (service + writable characteristic). Success message names the device. **No bytes are sent** at this step. |
| 5 | Pick a device that is NOT a supported printer (e.g. a phone/headset). | Clear "unsupported printer" error; nothing is saved; transport stays on System print. |
| 6 | Click **Test Print (Bluetooth)**. | One small test slip prints, labelled TEST. Toast says "data sent to printer". |
| 7 | Reload the page (F5). | Saved printer is remembered; if the browser supports `getDevices()`, no chooser opens; if not, a "Reconnect" click is required. |
| 8 | With "Direct Bluetooth" saved but printer switched OFF, open the Orders screen. | App does not silently switch transport or crash; printing falls back/reports per the on-screen message. System print remains available. |
| 9 | Switch the printer ON, click Test Print (Bluetooth) again. | One slip prints (reconnect without chooser if `getDevices()` is supported). |
| 10 | Click Test Print (Bluetooth) and switch the printer OFF mid-print. | Message: "print may be incomplete - check the printer, then reprint manually if needed". **No automatic second print.** |
| 11 | Choose **Forget printer**. | Saved device removed; transport returns to System print (default). |
| 12 | Set transport to System print; accept a test order in the test branch. | Auto-print behaves exactly as before (one print via system path); Bluetooth is not used. |
| 13 | Reprint the order from Orders. | Prints once; order status and payment are unchanged. |
| 14 | Unsupported browser (Firefox/Safari): open Settings > Printer. | Bluetooth option explains it is unavailable; System print still works. |

Record per step: PASS / FAIL / not run, printer model, browser + version, OS.
