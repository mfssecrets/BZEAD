# Deploy BZEAD on Cloudflare Worker

This guide explains how to deploy the BZEAD web app (in `Bzeadstore-main/`) as a **Cloudflare Worker** with static assets.

## What changed from AWS Amplify

- `amplify.yml` is no longer used.
- `Bzeadstore-main/wrangler.toml` configures a Cloudflare Worker with a static assets binding.
- `Bzeadstore-main/worker.js` handles OG-image proxying, product SSR proxying, security headers, static asset caching, and SPA fallback.
- `Bzeadstore-main/public/_redirects` and `public/_headers` are no longer used by Cloudflare Workers. Their behavior is implemented inside `worker.js`.

## Project structure

```
Bzeadstore-main/
├── dist/              # Vite build output (static assets)
├── worker.js          # Cloudflare Worker entry point
├── wrangler.toml      # Wrangler / Worker configuration
└── ...
```

## Prerequisites

- A Cloudflare account.
- A Cloudflare **Worker** project named `bzead`.
- A Cloudflare API token with **Cloudflare Workers:Edit** and **Zone:Read** permissions for the account.
- Your Cloudflare account ID.

## 1. Configure secrets in GitHub

Go to **Settings > Secrets and variables > Actions** and add these **repository secrets**:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `VITE_ONESIGNAL_APP_ID` | OneSignal app ID |
| `VITE_DOMAIN` | Primary domain, e.g. `https://www.bzead.com` |
| `VITE_PUBLIC_APP_URL` | Public app URL, e.g. `https://www.bzead.com` |
| `VITE_ENVIRONMENT` | `production` |
| `VITE_ADSENSE_CLIENT` | *(Optional)* Google AdSense publisher ID |
| `VITE_ADSENSE_SLOT_HOME_FOOTER` | *(Optional)* Google AdSense slot ID |
| `DOWNLOAD_BASE_URL` | *(Optional)* External base URL for `/download/*` files (AAB/APK). Workers static assets are limited to 25 MiB, so large downloads must be hosted externally. |

## 2. Cloudflare Worker project settings (Git integration)

When creating the Worker project from the Cloudflare dashboard, use these settings:

| Setting | Value |
|---|---|
| **Project name** | `bzead` |
| **Root directory** | `Bzeadstore-main` |
| **Build command** | `npm ci && npm run build` |
| **Deploy command** | `npx wrangler deploy` |
| **Version command** | *(leave empty)* |
| **Path** | `/` |

Then add the `VITE_*` environment variables in the Worker dashboard under **Variables and secrets**.

Alternatively, the included GitHub Actions workflow at `.github/workflows/deploy-cloudflare-worker.yml` will deploy automatically on every push to `main`.

## 3. Deploy manually from your machine

```bash
cd Bzeadstore-main
npm ci
npm run build
npx wrangler deploy
```

Make sure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in your environment.

## Routing behavior handled by `worker.js`

1. `/og-image/<slug>` → Supabase edge function (social preview image).
2. `/products/<slug>` → Supabase edge function (SSR-injected OG meta).
3. `/share/<slug>` → Static pre-built share page from `dist/share/`.
4. `/.well-known/*` → Served as-is from `dist/` (Android App Links verification).
5. Static assets (`/assets/*`, `/images/*`, fonts) → Long-term cached.
6. All other routes → SPA fallback to `dist/index.html`.

## Security headers

The worker adds the following headers to every response:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(self), microphone=(), camera=(self), payment=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: ...`

Edit `worker.js` if you need to change these headers.
