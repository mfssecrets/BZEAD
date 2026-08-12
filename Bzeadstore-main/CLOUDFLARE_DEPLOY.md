# Deploy BZEAD on Cloudflare Pages

This guide explains how to deploy the BZEAD web app (in `Bzeadstore-main/`) to Cloudflare Pages.

## What changed from AWS Amplify

- `amplify.yml` is no longer used.
- `Bzeadstore-main/wrangler.toml` tells Cloudflare Pages where the build output is.
- `Bzeadstore-main/public/_redirects` now uses Cloudflare Pages syntax.
- `Bzeadstore-main/public/_headers` applies security headers on Cloudflare Pages.

## Prerequisites

- A Cloudflare account.
- A Cloudflare Pages project named `bzead`.
- A Cloudflare API token with **Cloudflare Pages:Edit** permission for the account.
- Your Cloudflare account ID.

## 1. Configure secrets in GitHub

Go to **Settings > Secrets and variables > Actions** and add these **repository secrets**:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages edit permission |
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

## 2. Cloudflare Pages project settings

When creating the Pages project, use these settings:

- **Root directory:** `Bzeadstore-main`
- **Build command:** `npm ci && npm run build`
- **Build output:** `dist`

Alternatively, the included GitHub Actions workflow at `.github/workflows/deploy-cloudflare-pages.yml` will deploy automatically on every push to `main`.

## 3. Deploy manually from your machine

```bash
cd Bzeadstore-main
npm ci
npm run build
npx wrangler pages deploy dist --project-name=bzead
```

Make sure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set in your environment.

## 4. Preview locally

```bash
cd Bzeadstore-main
npm run build
npm run preview:cf
```

## Routing behavior

The `_redirects` file in `public/` is copied into `dist/` at build time and provides:

1. `/og-image/<slug>` → Supabase edge function (social preview image).
2. `/share/<slug>` → Pre-built static share page with OG meta tags.
3. `/products/<slug>` → Supabase edge function (SSR-injected OG meta).
4. `/.well-known/*` → Served as-is (Android App Links verification).
5. `/*` → SPA fallback to `index.html` for all other routes.

Static files (`/assets/*`, `/images/*`, `favicon.png`, etc.) are served directly and never hit the SPA fallback.
