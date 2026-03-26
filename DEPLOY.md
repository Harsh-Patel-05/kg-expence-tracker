# Deploy — Restaurant Tracker (SaaS)

## Architecture

- **Auth:** Single-user mode — no login. The API auto-creates one MongoDB user (`local@localhost`) and attaches it to every request. Data persists in MongoDB until you delete it.
- **Frontend:** Static files (`index.html`, `js/`) — `login.html` / `signup.html` redirect to the app. Host on Firebase Hosting, Netlify, or any static host.
- **Backend:** Node.js + Express in `server/` — deploy to [Render](https://render.com) or [Railway](https://railway.app).
- **Database:** [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier works).

## 1. MongoDB Atlas

1. Create a cluster → **Database** → **Connect** → Drivers → copy connection string.
2. Replace `<password>` and set database name in the path if needed (e.g. `restaurant_tracker`).
3. **Network Access:** allow `0.0.0.0/0` for cloud hosts (or Render/Railway egress IPs in production).

## 2. Backend (Render example)

1. New **Web Service** → connect this repo.
2. **Build command:** `npm install`
3. **Start command:** `npm start`
4. **Environment variables** (from `.env.example`):

| Variable        | Description                          |
|----------------|--------------------------------------|
| `MONGODB_URI`  | Atlas connection string              |
| `CLIENT_URL`   | Your **frontend** URL (CORS)         |
| `PORT`         | Usually set automatically by Render  |

5. Deploy and note the public URL, e.g. `https://your-app.onrender.com`.

Health check: `GET https://your-app.onrender.com/health`

## 3. Frontend

1. Open `index.html` and set **Backend API base** to:

   `https://your-app.onrender.com/api`

   (stored in `localStorage` as `apiBaseUrl`).

2. Re-upload static files to Firebase Hosting (or your CDN).

3. Ensure `CLIENT_URL` on the server matches your static site origin (scheme + host, no trailing slash path issues).

## 4. Local development

The API **does not listen** until MongoDB connects. If `MONGODB_URI` points at `127.0.0.1:27017` and nothing is running there, `npm run dev` exits and the browser shows “Cannot reach the API”.

```bash
cp .env.example .env
# Ensure MONGODB_URI matches how you run Mongo (see below)

npm install
```

**MongoDB (pick one):**

- **Docker:** `docker compose up -d` (skip if you do not have Docker).
- **Homebrew (Mac):** `brew tap mongodb/brew && brew install mongodb-community@7.0 && brew services start mongodb-community@7.0` — then keep `MONGODB_URI=mongodb://127.0.0.1:27017/restaurant_tracker` in `.env`.
- **Atlas:** put your Atlas connection string in `MONGODB_URI`.

**One terminal — API + static site:**

```bash
npm run local
```

The terminal prints the static URL (default **http://localhost:8765/**). Open that URL — **not** port 5050. Set **Backend API base** to **http://localhost:5050/api** and save. If port 8765 is busy, the script tries 8766, 8767, … — match `CLIENT_URL` in `.env` to the port you actually use, or set `STATIC_PORT=9999` when running serve.

Alternatively, two terminals: `npm run dev` and `npm run serve`.

## 5. API quick test

```bash
curl -s http://localhost:5050/health
curl -s http://localhost:5050/api/sales
```

(No JWT — single-user mode.)

## Security note

This build has **no API authentication**. Fine on your own PC / LAN; **do not** put the API on the public internet without adding auth. Backup import replaces all business data for the single user. Tighten CORS to your domain when deploying, use HTTPS, and consider rate limiting.
