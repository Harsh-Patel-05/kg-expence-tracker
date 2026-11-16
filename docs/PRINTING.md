# Thermal printing setup — The Kilogram

## What works

| Transport | API | Best for | Hindi |
|-----------|-----|----------|-------|
| **System printer** | Browser print (`@media print` 58/80mm) | Any USB printer installed in Windows/macOS/Linux | Yes (OS fonts) |
| **Web Serial** | `navigator.serial` | Printers that appear as COM / USB-serial | Yes (raster) |
| **WebUSB** | `navigator.usb` | ESC/POS USB printer class (7) | Yes (raster) |
| **Web Bluetooth** | existing `thermalPrinter.js` | Portable BLE 58mm printers | Yes (raster) |

Entry point: `window.KG.print` (`js/printing/printerManager.js`)  
Hindi is drawn with **Noto Sans Devanagari** on a canvas and sent as ESC/POS raster (`GS v 0`).

## Honest platform limits

1. **Web Serial / WebUSB** work only in **Chrome or Edge**, on **HTTPS or localhost**, and need a **user gesture** for the first pairing.
2. **Windows + WebUSB:** many printers need the **WinUSB** driver via [Zadig](https://zadig.akeo.ie/). If WebUSB fails, use **Serial (COM port)** or **system printer**.
3. **macOS / Linux:** WebUSB usually works without Zadig when the device is not exclusively claimed by another driver.
4. Some Chinese ESC/POS printers enumerate as a **virtual COM port** → use **Connect Serial printer** (baud default **9600**, also 19200 / 38400 / 115200).
5. **System printer path** always shows the OS print dialog unless you launch Chrome with kiosk printing:
   ```bash
   # macOS example
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk-printing
   ```
6. Auto-reconnect uses `navigator.usb.getDevices()` / `navigator.serial.getPorts()` — only devices previously permitted in this browser profile.

## In-app setup

1. Open **POS → Printer / Settings**.
2. Choose paper **58 mm** or **80 mm**.
3. Click **Connect USB**, **Connect Serial**, **Bluetooth**, or **Use system printer**.
4. Click **Test print**.
5. Optional: auto-cut, cash-drawer kick, GSTIN / address for bills.

Separate KOT vs Bill transport can be set via prefs (`kotTransport` / `billTransport`: `auto` | `usb` | `serial` | `bluetooth` | `browser`).

## Model notes (screenshots-in-words)

### Epson TM-T82 style (80mm)
- Install Epson driver (system printer) **or** use USB if WinUSB bound.
- Prefer **80 mm**, auto-cut on.
- Test print should show “THE KILOGRAM” + Hindi sample line.

### Generic 58mm / 80mm Chinese ESC/POS (Xprinter, etc.)
- Often COM port → **Connect Serial**, baud **9600**.
- If chunks drop, prefs use 512-byte writes with small delays (already implemented).

### TVS / Rugtek
- Try system printer first (most reliable on Windows).
- Then Serial if a COM port appears in Device Manager.

## Reprint / queue

- POS buttons **Reprint KOT** / **Reprint Bill** use the last job in memory.
- If the printer is busy, jobs queue and retry (up to 3). On failure, automatic **browser print** fallback runs when raw transport throws.
