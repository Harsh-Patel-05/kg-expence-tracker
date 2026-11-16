# Phase 0 Audit — The Kilogram Legacy POS (baseline)

**Date:** 2026-11-16  
**Scope:** Legacy production app (`index.html` + `js/`). Ignored: `web/`, `server/`, `mobile/`.  
**Branch:** `feature/pos-upgrade`

---

## A. POS today

### State
| Symbol | Role |
|--------|------|
| `posCart` | In-memory cart lines `{ menuItemId, name, nameHi?, price, qty, note?, prep }` |
| `posTickets` | Held tickets (local only) |
| `posActiveTicketId` | Active held ticket |
| **localStorage** `kg_pos_tickets_v1` | Tickets JSON (max 50) |
| `kg_deleted_orders_v1` / `kg_deleted_order_meta_v1` | Soft-delete helpers |
| `kg_thermal_printer_id` | Saved Bluetooth device |

Hold is **device-local only** (not Firestore). Status `"preparing"` is rendered but never assigned.

### Menu
- Loaded via `api.menuItems.list()` → `state.menuItems`
- Optional seed sync from `constants/kilogramMenuSeed.js` (`KILOGRAM_MENU_SYNC_VERSION`)
- `renderPosMenu()` rebuilds **full** `#posMenuGrid` `innerHTML` on every search keystroke
- Favourites: scans **all** `orders` on POS enter

### Checkout (`posGenerateBill`)
1. Creates Firestore **`orders`** with `{ date, items[], notes, subtotal, tax:0, total, payment:{cash,online} }`
2. Creates Firestore **`sales`** with:
   - `date` (`YYYY-MM-DD` via `todayISO()`)
   - `cashAmount`, `swiggyAmount:0`, `zomatoAmount:0`, `otherOnlineAmount`, `onlineAmount` (duplicate of online), `totalAmount`
   - `method`: cash | online | mixed
   - `source: "pos"`, `orderId`, `notes`
3. Optional `KgPhase2.deductRecipeForCart` (failure-tolerant toast)
4. Calls `loadAll()` (full multi-collection refetch) — **slow**
5. **No** `userId` on documents; shared restaurant DB

### Printing
- **KOT:** Web Bluetooth only (`js/thermalPrinter.js`) → Hindi canvas raster → ESC/POS `GS v 0`; browser print fallback
- **Bill:** browser print only (no thermal path)
- Connect button: `#thermalPrinterConnectBtn`

### DOM
- Section id: `#pos-section` (nav `data-section="pos"`), not `#pos`
- Layout: search topbar + category chips + 2-column (menu | cart/checkout)

### Performance / bugs
- Full menu re-render on search; full cart re-render on qty change
- `loadAll()` after every bill (~20 collections)
- Favourites O(all orders)
- Cart `onclick` index vs `mergePosCartDuplicates()` can go stale
- POS online stored as both `otherOnlineAmount` and `onlineAmount`
- No Swiggy/Zomato split in POS settle today
- No sequential bill numbers
- No GST / discount / order-type / tables UI
- Checkout **blocks** on network (`await api.orders.create` before print)

---

## B. Manual sales

**Function:** `window.addSale`  
**Collection:** `sales`  
**Fields:** `date`, `cashAmount`, `swiggyAmount`, `zomatoAmount`, `otherOnlineAmount`, `onlineAmount` (sum), `totalAmount`, `notes`, `method: "mixed"`  
**Date format:** `YYYY-MM-DD`  
**userId:** not set  
**Delete:** `api.sales.remove(id)`

`saleAmounts()` / `balanceMath.saleAmounts()` read cash vs online (swiggy+zomato+otherOnline; legacy `onlineAmount` alone for old rows).

---

## C. Dashboard

`renderDashboard()` uses `calcTotals()` / `balanceMath.computeBalances` and period filters.

**Charts (Chart.js):** sales/expense trend, payment mix, cash/online monthly, online payout (Swiggy/Zomato), sales overview, expense breakdown.

**KPIs:** cash/bank balances, revenue, net profit, online/retail, pending bills, margin %.

**Data:** pull-based (`loadAll`); **no** live `onSnapshot` on sales today. Firestore `enablePersistence()` already called in `js/firebase.js`.

---

## D. Other finance collections

| Domain | Collection | Key fields | Date |
|--------|------------|------------|------|
| Expenses | `expenses` | date, category, amount, status, paymentMethod, note | YYYY-MM-DD |
| Recurring | `recurring_expenses` | title, category, amount, dayOfMonth, active | — |
| Suppliers | `suppliers` | name, items[{name,rate}] | — |
| Supplier pay | `supplierPayments` | date, seller, amount, method, note | YYYY-MM-DD |
| Purchases | `purchases` | date, seller, item, qty, price, paidStatus, paymentMethod | YYYY-MM-DD |
| Staff | `staff` | name | — |
| Fixed salary | `fixedSalaries` | name, amount, joinDate | — |
| Attendance | `attendance` | date, name, status present\|half-day\|absent | YYYY-MM-DD |
| Salaries | `salaries` | month, name, amount, status, paidAt?, paymentMethod? | month string |
| Advances | `advances` | date, month, name, amount, method | YYYY-MM-DD |
| Transfers | `balance_transfers` | fromAccount, toAccount, amount | — |

**Salary:** monthly ÷ 30; present=1, half-day=0.5, absent=0. Advances reduce payable (app.js has month carryover; balanceMath does not — known inconsistency).

---

## E. Auth / roles

`js/auth.js`: owner | manager | kitchen | accountant | employee. POS section allowed for owner, manager, kitchen, employee.

---

## F. Assumptions for upgrade

1. Reuse existing `sales` field names exactly so dashboard/balanceMath keep working.
2. POS “Online (UPI)” → `otherOnlineAmount` (+ `onlineAmount` sum for compatibility).
3. Swiggy/Zomato amounts map to dedicated fields.
4. New collections: `posBills`, `dailySalesSummary`, `billCounters`, `printJobs`, `businessSettings`, `fixedCosts`.
5. New code in `js/pos/`, `js/printing/`, `js/finance/`, `js/dashboard/` with `window.KG.*` namespaces; minimal `app.js` hooks.
