# Kitchen Display System (KDS)

Replace printed KOTs with a live kitchen board on an Android tablet. Orders arrive from POS (or a manual form), update in realtime over Firestore, and stay on screen until served.

## Pieces

| Piece | URL / path | Who |
|--------|------------|-----|
| Kitchen tablet PWA | `/kds.html` | Kitchen staff (landscape, fullscreen) |
| Manager remote | Main app → **Kitchen (KDS)** | Manager / Owner (phone OK) |
| REST API | `POST /api/kds/orders` … | External POS (API key) |
| Auto bridge | POS checkout | Writes to KDS when a bill is settled |

## Setup

### 1. Deploy Firestore rules

Collections used: `kds_orders`, `kds_menu`, `kds_settings`.

```bash
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

### 2. Server API (for external POS)

In `server/`, set env:

```bash
KDS_API_KEY=choose-a-long-secret
# Firebase Admin (required for REST writes)
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
# Optional: notify when order is ready
KDS_READY_WEBHOOK_URL=https://hooks.example.com/order-ready
```

Start:

```bash
cd server && npm start
```

In the app **Kitchen (KDS) → POS API settings**, set:

- API URL: `https://YOUR_API_HOST/api/kds`
- API key: same as `KDS_API_KEY`

If URL/key are empty, this SPA pushes KDS orders **directly to Firestore** (works without the Express server).

### 3. Android tablet

1. Open Chrome → `https://YOUR_HOSTING/kds.html`
2. Sign in with a kitchen / manager Firebase user
3. Tap once to enable beep + keep-screen-awake
4. Add to Home screen (PWA) → open fullscreen landscape
5. Chrome → Site settings → allow sound; disable battery optimization for Chrome if the screen sleeps

## Status flow

`waiting` → `preparing` → `ready` → `served` (card leaves live board)

- Hindi labels: नया / इंतज़ार · बन रहा है · तैयार · परोसा गया · रद्द  
- One tap advances; **Undo** reverts the last transition  
- **Drag & drop** a ticket onto another column (Waiting / Preparing / Ready), or onto the **SERVED** strip under the board (works on tablet touch)  
- Timer turns orange after 10 min, red after 20 min  
- New items / notes flash **नया जोड़ा गया** / **नोट आया** and beep  

## Zomato / Swiggy on KDS

**Already supported via POS:** choose channel **Zomato** or **Swiggy**, enter the **platform order #**, settle — ticket appears on KDS with that number (not your takeaway token).

**Live Zomato Partner “push” orders** need Zomato Partner / Hyperpure API access (store credentials + approved webhook). Once you have that, map their webhook into:

`POST /api/kds/partner-orders` + header `x-api-key: YOUR_KEY`

```json
{
  "channel": "zomato",
  "platform_order_no": "Z123456789",
  "items": [
    { "name_en": "Misal Pav", "name_hi": "मिसळ पाव", "qty": 2 }
  ],
  "order_note": "less spicy"
}
```

Kitchen board shows **Zomato** badge + **#Z123456789**. Same shape works for `"channel": "swiggy"`.  
Without Partner API keys, use POS Zomato/Swiggy channel when the tablet/app order arrives.

## Roles

| Role | Tablet | Manager section |
|------|--------|-----------------|
| Kitchen | Status + undo | Status + undo only |
| Manager / Owner | Full | Full (notes, cancel, add items, menu, API settings, reports) |

## REST API

Base: `/api/kds`  
Header: `x-api-key: YOUR_KEY`

### Create order — `POST /orders`

```json
{
  "order_id": "KG-20261117-0042",
  "table_no": "5",
  "order_type": "Dine-in",
  "items": [
    {
      "name_en": "Misal Pav",
      "name_hi": "मिसळ पाव",
      "qty": 2,
      "variant": "",
      "item_note": "कम तीखा"
    }
  ],
  "order_note": "जल्दी चाहिए",
  "waiter_name": "Ramesh",
  "created_time": "2026-11-17T07:30:00.000Z"
}
```

### Add items — `POST /orders/{id}/add-items`

```json
{
  "items": [
    { "name_en": "Extra Pau", "name_hi": "एक्स्ट्रा पाव", "qty": 1, "variant": "", "item_note": "" }
  ]
}
```

### Live note — `POST /orders/{id}/note`

```json
{ "note": "बिना प्याज", "from": "POS" }
```

### Cancel — `POST /orders/{id}/cancel`

```json
{ "reason": "Customer left" }
```

### Status — `PATCH /orders/{id}/status`

```json
{ "status": "ready", "by": "pos" }
```

Allowed: `waiting` | `preparing` | `ready` | `served` | `cancelled`

### List — `GET /orders?active=1`

### Prune history — `POST /prune`

```json
{ "days": 90 }
```

Served/cancelled docs older than 90 days are deleted (also pruned from the clients periodically).

## Ready webhook (optional)

When status becomes `ready`, if `KDS_READY_WEBHOOK_URL` is set, the server POSTs:

```json
{
  "event": "order_ready",
  "order_id": "KG-20261117-0042",
  "table_no": "5",
  "order_type": "Dine-in",
  "status": "ready",
  "ready_at": "2026-11-17T07:42:00.000Z",
  "waiter_name": "Ramesh"
}
```

Point this at your POS callback, Twilio Function, or WhatsApp Business webhook adapter.

## Offline

- Firestore persistence + localStorage snapshot of last orders  
- Service worker caches the KDS shell (`kds-sw.js`)  
- When Wi‑Fi returns, `onSnapshot` reconnects automatically  

## Reports (manager)

- Average prep time (created → ready)  
- Orders per hour  
- Delayed live orders (&gt; 20 min)  
- Recent served / cancelled history  

## Files

- [`kds.html`](../kds.html) — tablet PWA  
- [`js/kds/`](../js/kds/) — store, board, audio, offline, manager, POS client  
- [`server/routes/kdsRoutes.js`](../server/routes/kdsRoutes.js) — REST  
- [`css/kds.css`](../css/kds.css) — kitchen UI  
