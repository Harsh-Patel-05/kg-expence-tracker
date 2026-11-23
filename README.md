# The Kilogram — Expense Tracker

Restaurant / takeaway ops for **The Kilogram** (India, **₹**).

React + Vite + Firebase (Auth, Firestore, Hosting, Storage).

## Project structure

```
├── src/                     # App source
│   ├── app/                 # App shell / layout wiring
│   ├── components/          # Shared UI
│   ├── features/            # Feature modules (POS, HR, inventory, …)
│   ├── lib/                 # Firebase client, helpers, types
│   ├── pages/               # Top-level route pages
│   ├── styles/              # Global CSS
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.js
├── .env.example             # Vite Firebase env template
├── firebase.json            # Hosting + Firestore + Storage
├── .firebaserc
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── package.json
```

## Setup

```bash
npm install
cp .env.example .env
# fill VITE_FIREBASE_* values
npm run dev
```

App runs on Vite (default port **5180**).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local Vite server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run firebase:deploy` | Deploy hosting (`dist/`) |
| `npm run firebase:deploy:all` | Deploy hosting + rules/indexes |

## Deploy

```bash
npm run build
npm run firebase:deploy
```

For rules/indexes as well:

```bash
npm run firebase:deploy:all
```
