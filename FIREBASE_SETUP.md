# Using Firebase (Firestore) with this project

## Important: Firebase is not MongoDB

- Your API today uses **MongoDB** (Mongoose).  
- **Firebase** gives you **Cloud Firestore** (or Realtime Database). They are different products.  
- You do **not** “connect MongoDB to Firebase.” You either:
  1. **Keep MongoDB** and optionally use Firestore for something extra (sync, logs), or  
  2. **Move data** from MongoDB to Firestore and change the server code to read/write Firestore instead of Mongoose.

This repo already supports **optional Firebase Admin** on the server so Firestore is available from Node when you add credentials.

---

## What was added in code

- Package: `firebase-admin`  
- `server/config/firebaseAdmin.js` — loads credentials and exposes `getFirestore()`  
- `server/index.js` — calls `initFirebaseAdmin()` on startup  
- `GET /health` — includes `firebaseAdmin: true/false`  
- `GET /health?firestore=1` — tries to read Firestore (checks connectivity)

---

## Step 1: Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com/) → your project (or create one).  
2. **Build → Firestore Database** → **Create database** (start in **test mode** only for local experiments; lock down rules before production).  
3. **Project settings** (gear) → **Service accounts** → **Generate new private key** → download the JSON file.

Keep this JSON **secret** — it is full admin access to your Firebase project.

---

## Step 2: Credentials on your machine (local)

**Option A — file path (simplest for local dev)**

1. Save the JSON as e.g. `secrets/firebase-service-account.json` (add `secrets/` to `.gitignore` if needed).  
2. In `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json
```

Paths are resolved relative to the project root where you run `npm run dev`.

**Option B — inline JSON (common on Render/Railway)**

1. Minify the JSON to **one line** (or use a base64 variant if your host prefers).  
2. In `.env` or the host’s env UI:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}
```

Quotes inside JSON must be escaped if your shell/parser is picky — on Render, paste the raw JSON in the secret field as multiline if supported.

---

## Step 3: Verify

```bash
npm run dev
curl -s "http://localhost:5050/health"
# expect "firebaseAdmin": true

curl -s "http://localhost:5050/health?firestore=1"
# expect "firestoreReachable": true (after rules allow server access — Admin SDK bypasses client rules)
```

> **Note:** The Admin SDK uses **service account** credentials and **bypasses** Firestore security rules. Rules only apply to **client** SDK (web/mobile).

---

## Step 4: Actually storing your restaurant data in Firestore

Right now **all business data still lives in MongoDB**. Initializing Firebase Admin only makes `getFirestore()` available.

To “use Firebase as the database” you must **rewrite** controllers (or add a new layer) to use Firestore instead of Mongoose, for example:

Suggested layout (matches your `userId` isolation):

```
users/{mongoOrJwtUserId}/sales/{docId}
users/{userId}/purchases/{docId}
...
```

Or flat collections with a `userId` field on each document (easier to query across users for admin tools).

That migration is a **separate, larger change** (each `Sale.create` → `db.collection('sales').add(...)`, etc.). If you want that done in this repo, say so and we can plan collection-by-collection.

---

## Alternative: Firebase only in the browser (no Express)

- Use **Firebase Auth** + **Firestore** from `index.html` with the **client** SDK.  
- You would **not** use this Express + JWT + Mongo stack as the source of truth (or you’d sync both — usually avoid double writes).  
- This is a different architecture than what you have now.

---

## Firestore security rules (client apps)

If later you add a **web** client talking to Firestore directly, lock rules to the signed-in user, for example:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

(Adjust to match how you map Firebase Auth UID to your data.)

---

## Summary

| Goal | What to do |
|------|------------|
| **Test Firestore from this server** | Add service account env vars → `GET /health?firestore=1` |
| **Replace MongoDB with Firestore** | Migrate each model/controller to Firestore (or ask for a phased PR) |
| **Use Firebase Hosting only** | Keep MongoDB/Express; deploy static UI to Firebase Hosting (already compatible) |

Your existing Firebase **Web app config** (`apiKey`, `appId`, …) is for the **client** SDK and Analytics — it is **not** the same as the **service account** JSON used by the Admin SDK on the server.
