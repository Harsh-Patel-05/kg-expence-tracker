# Scheduled & bulk food orders

Production feature in the legacy ERP (`index.html` + `js/scheduled/*`).

## Accounting rules

| Event | Cash / Online balance | Completed sales KPI |
|-------|------------------------|---------------------|
| Advance received | Yes (via `sales` doc `countsAsRevenue: false`) | No |
| Balance / extra advance | Yes (same) | No |
| Refund | Cash out (negative advance sale) | No |
| Fulfillment | New cash only if collected then (as advance sale); revenue sale has `cashAmount: 0` | Yes — full `grandTotal` on fulfillment day |

Booking a ₹5,000 order with ₹1,000 advance today → today shows ₹1,000 collection, **not** ₹5,000 sales.

## Data

- Collection: `scheduledOrders` (already allowlisted in `firestore.rules`)
- Payments stored on the order document (`payments[]`)
- Linked advance ledger docs: `sales/SOADV-{paymentId}`
- Fulfillment revenue: `sales/SOFUL-{orderId}`
- Reminders: `reminders/soremin_{orderId}_{prep|dayof}`

## UI

- Nav → **Scheduled Orders**
- POS → **Book future / bulk order** (reuses current cart + menu)
- Booking receipt clearly marked **FUTURE ORDER / BOOKING RECEIPT**

## Reminders

- Auto 24h before fulfillment
- Optional day-of reminder (default 2h; configure in Reminder settings)
- In-app `reminders` docs + browser `Notification` while a tab is open
- Closed-app push requires FCM (not configured) — enable alerts in-browser for best results
