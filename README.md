# Loop — Meeting Room Booking

Internal meeting-room booking for Kartuli Labs employees. The interface is English; Georgian people, rooms, and places use Latin transliteration (for example Nino Chkheidze, Mtkwari, Narikala, and Saburtalo).

## Assignment links

- Repository: https://github.com/GiorgiKemo/techzy-frontend-assigment
- Deployed application: https://techzy-frontend-assigment.vercel.app/

## Run locally

```bash
cp .env.example .env
# Add your Resend API key to .env
npm install
npm run dev
```

This starts the Vite client and the Express API. Open `http://localhost:5173`.

With `RESEND_API_KEY` set, registration sends a real verification email. Without it, the server logs verification and reset links to the console.

## Production build (self-hosted)

```bash
npm run build
npm start
```

The production server serves `dist` and the API from one process. Bind address defaults to `0.0.0.0:8787`. Set `NODE_ENV=production` behind HTTPS so session cookies are marked Secure.

```bash
docker build -t loop .
docker run -p 8787:8787 \
  -e NODE_ENV=production \
  -e RESEND_API_KEY=re_your_key \
  -e RESEND_FROM="Loop <onboarding@resend.dev>" \
  -e APP_BASE_URL=https://your-domain.example \
  loop
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | For live email | Resend API key ([resend.com](https://resend.com)) |
| `RESEND_FROM` | Recommended | Sender address, e.g. `Loop <onboarding@resend.dev>` for sandbox |
| `APP_BASE_URL` | Recommended | Public app URL used in email links |
| `PORT` | Optional | API port (default `8787`) |
| `HOST` | Optional | Bind address (default `0.0.0.0`) |
| `NODE_ENV` | Production | Set to `production` for Secure cookies |
| `TRUST_PROXY` | Optional | Set to `1` behind a reverse proxy |

Copy `.env.example` to `.env` for local development. **Never commit `.env` or API keys.**

## Email features

| Feature | Self-hosted (`npm start` / Docker) | Vercel static (`VITE_API_MODE=local`) |
|---------|-------------------------------------|----------------------------------------|
| Registration verification | Full (tokens stored server-side) | Full (tokens in browser + Vercel `/api/email/*` sends mail) |
| Password reset | Full | Full (browser tokens + email proxy) |
| Booking notifications | Full (organizer user email) | Full when organizer is the signed-in user |
| Resend verification | Full | Full |

### Vercel setup

1. Deploy the repo to Vercel (static Vite build uses `VITE_API_MODE=local`).
2. In the Vercel project, add environment variables:
   - `RESEND_API_KEY`
   - `RESEND_FROM` (e.g. `Loop <onboarding@resend.dev>`)
   - `APP_BASE_URL` (your Vercel URL, e.g. `https://techzy-frontend-assigment.vercel.app`)
3. Redeploy so serverless functions under `api/email/` can send mail.

Vercel serverless routes (`/api/email/send-verification`, `/api/email/send-password-reset`, `/api/email/send-booking`) only **send** email. Auth state and bookings remain in the browser on Vercel. Self-hosted mode stores everything in `server/data/` and sends email from Express.

## Product notes

- Dashboard, rooms directory, daily/weekly schedule, booking list, booking detail, create/edit form, cancellation, filters, URL state (`view`, `date`, `range`, room filters, booking filters, and sort order), mobile navigation, and responsive layouts are implemented.
- **Email verification** is required before booking. New accounts see a verify-pending screen with resend support. Links use `?verify=token`.
- **Password reset** uses `?reset=token` links from email. Forgot-password responses are generic (no email enumeration).
- **Booking emails** go to the organizer when they are a registered user with a verified email (created, updated, cancelled).
- Registration, login, logout, session restoration, validation, booking writes, and persistence go through `src/services`. Locally those services call the Express API. On Vercel they use the browser store plus email proxy routes.
- Seed data lives in `src/data/`. Runtime API data is under `server/data/` (gitignored) and is initialized from seed data on first start, with dates shifted to the current day.

## Assumptions and trade-offs

- **Backend:** A small Express API is included for self-hosted production (hashed passwords, HttpOnly cookies, overlap checks, Resend email).
- **Auth:** Accounts are workspace-scoped. Verification tokens and reset tokens are stored hashed with expiry; email endpoints are rate-limited.
- **Vercel persistence:** Static Vercel cannot write `server/data/`. Local mode keeps bookings in `localStorage` so the deployed assignment remains usable after refresh. Email delivery still works via Vercel serverless when `RESEND_API_KEY` is configured.
- **Horizontal scale:** The JSON runtime store is for a single instance. A managed database and shared session store would replace it for multi-instance production.
