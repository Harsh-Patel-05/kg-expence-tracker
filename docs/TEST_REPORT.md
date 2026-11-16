# Test report — feature/pos-upgrade

**Date:** 2026-11-16  
**Runner:** `node --test`

## Commands to re-run

```bash
cd "/Users/nivzen-mac/Documents/kg expence tracker"
node --test js/pos/__tests__/*.test.js js/finance/__tests__/*.test.js js/printing/__tests__/*.test.js
# or
npm test
```

## Unit tests (ran)

| Suite | Result | Notes |
|-------|--------|-------|
| `js/pos/__tests__/money.test.js` | **PASS** (6) | GST in/ex, discount %, round-off, split, change |
| `js/pos/__tests__/salesBridge.test.js` | **PASS** (3) | mapping, aggregates/void, business-day cut-off |
| `js/finance/__tests__/netMargin.test.js` | **PASS** (5) | leap Feb, partial month, commission, zero revenue, negative |
| `js/printing/__tests__/escpos.test.js` | **PASS** (4) | init/cut/feed, raster dims 58/80 |
| `js/printing/__tests__/printerManager.test.js` | see below | mock transport |

## Printer manager mock

Ran as part of `npm test` / node --test. Expect **PASS** for Hindi bill bytes starting with ESC `@`. Fallback path when transport throws is asserted not to crash Node (browser fallback unavailable in Node — listed as gap).

## Integration (Firestore emulator)

**Not run in this environment** (emulator not started). Manual steps:

```bash
firebase emulators:start --only firestore
# then point client at emulator and settle 20 parallel bills; verify billCounters uniqueness
```

## Browser E2E / performance

**Manual verification needed** (no Playwright in repo):

1. `npm run dev` → open `http://localhost:3000` → login.
2. Dashboard: LIVE badge, today’s KPIs, hourly chart, net margin box.
3. POS: F2 search, tap item (&lt;50ms feel), F8 settle cash, bill number `KG-YYYYMMDD-####`.
4. Sales list shows new row `source: pos`; live dashboard updates without refresh.
5. Printer settings → Test print (physical or system dialog).
6. Role regression: employee cannot void; open each nav section.

## Performance (dev console)

With `KG.pos.devPerf = true`, POS logs `[POS perf] addLine` / `checkout local`.  
**Target:** add-to-cart &lt; 50ms, local checkout &lt; 300ms.  
**Measured in automated CI:** not measured on device in this run — verify in Chrome DevTools Performance on a 500-item menu.

## Gaps / manual only

- Physical USB/Serial/Bluetooth printer
- Firestore emulator parallel bill-number race
- Full role matrix click-through
- Chrome `--kiosk-printing` silent path
