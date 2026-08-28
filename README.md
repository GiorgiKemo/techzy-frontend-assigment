# Loop — Meeting Room Booking

A production-minded React + TypeScript meeting-room booking app for Kartuli Labs. The product interface remains in English; Georgian people, rooms, neighborhoods, and places are represented using Latin transliteration (for example Nino Chkheidze, Mtkwari, Narikala, and Saburtalo).

## Run locally

```bash
npm install
npm run dev
```

This starts the Vite client and the local Express API. Open `http://localhost:5173`.

## Production build

```bash
npm run build
npm start
```

The production server serves `dist` and the API from the same process. Set `NODE_ENV=production` behind HTTPS so session cookies are marked Secure.

## Product notes

- The dashboard, rooms directory, daily/weekly schedule, booking list, booking detail drawer, create/edit form, cancellation confirmation, filters, URL state, mobile navigation, and responsive layouts are implemented.
- Registration, login, logout, session restoration, server-side validation, booking creation, editing, cancellation, and persistence are real API flows; passwords are hashed with Node's built-in scrypt and sessions use HttpOnly cookies.
- Runtime data is persisted under `server/data/` (ignored from source control) and initialized from the seed data on first start. Seed dates are shifted to the current date so a fresh workspace is immediately useful.
- For a horizontally scaled deployment, replace the local JSON runtime store with a managed database and shared session store. The current backend is fully functional for a single self-hosted instance and intentionally has no fake browser-only auth or booking writes.
