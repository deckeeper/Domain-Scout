# Domain Scout

A passive external-exposure viewer designed for Cloudflare Pages. It discovers certificate-listed hostnames using crt.sh and Cert Spotter, resolves current DNS, and retrieves previously indexed ports. It does **not** run an active port scan.

The scan interface includes a live elapsed-time counter and an adaptive progress bar. Because the public providers do not expose record-level progress, the bar waits below 100% until the complete response arrives.

## Run locally

Requires Node.js 20 or newer.

```bash
npm test
npm run dev
```

Open `http://127.0.0.1:8788` and enter a domain.

## Deploy to Cloudflare Pages

Push this directory to a GitHub repository, then in **Workers & Pages → Create → Pages → Connect to Git** select the repository.

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `public`
- Root directory: `/` if the repository contains only this project

The `functions/` directory is detected automatically and deploys `/api/scan` as a Pages Function.

For direct upload with Wrangler:

```bash
npx wrangler pages project create domain-scout
npx wrangler pages deploy public --project-name domain-scout
```

Use Git integration for this project because a plain static dashboard upload can omit or misconfigure Pages Functions.

## Before making it widely public

Add Cloudflare Turnstile and rate limiting to `/api/scan`. Public services can throttle or change their interfaces; the UI reports unavailable sources instead of interpreting failures as closed ports.
