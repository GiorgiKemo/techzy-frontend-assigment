# Loop — Meeting Room Booking

Internal meeting-room booking for Kartuli Labs employees. The interface is English; Georgian people, rooms, and places use Latin transliteration (for example Nino Chkheidze, Mtkwari, Narikala, and Saburtalo).

## Run locally

```bash
npm install
npm run dev
```

This starts the Vite client and the Express API. Open `http://localhost:5173`.

## Production build (self-hosted)

```bash
npm run build
npm start
```

The production server serves `dist` and the API from one process. Bind address defaults to `0.0.0.0:8787`. Set `NODE_ENV=production` behind HTTPS so session cookies are marked Secure. Optional env: `PORT`, `HOST`, `TRUST_PROXY=1` (when a reverse proxy sets `X-Forwarded-For`).

```bash
docker build -t loop .
docker run -p 8787:8787 -e NODE_ENV=production loop
```

## Vercel

The assignment asks for a Vercel (or similar) deploy. Vercel static hosting cannot persist the JSON file store, so the Vercel build uses `VITE_API_MODE=local`: the same API-shaped data layer writes to `localStorage` in the browser. Persistence survives refresh on that device.

```bash
vercel
```

## Product notes

- Dashboard, rooms directory, daily/weekly schedule, booking list, booking detail, create/edit form, cancellation, filters, URL state (`view`, `date`, `range`), mobile navigation, and responsive layouts are implemented.
- Edit is limited to upcoming bookings. Search and filters cover rooms and bookings. Availability uses the current time when the selected date is today.
- Registration, login, logout, session restoration, validation, booking writes, and persistence go through `src/services`. Locally those services call the Express API. On Vercel they use the browser store.
- Seed data lives in `src/data/`. Runtime API data is under `server/data/` (gitignored) and is initialized from seed data on first start, with dates shifted to the current day.

## Assumptions and trade-offs

- **Backend:** The brief does not require a backend. A small Express API is included for self-hosted production (hashed passwords, HttpOnly cookies, overlap checks). The UI is not coupled to JSON files; swapping the data source means changing the service layer.
- **Auth:** The brief assumes company employees. Accounts are workspace-scoped rather than a shared demo login, so each employee can keep their own session.
- **Vercel persistence:** Static Vercel cannot write `server/data/`. Local mode keeps bookings in `localStorage` so the deployed assignment remains usable after refresh.
- **Horizontal scale:** The JSON runtime store is for a single instance. A managed database and shared session store would replace it for multi-instance production.
