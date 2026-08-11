# Bzead — Developer Working Guide

> Audience: Any developer joining the Bzead codebase.
> Goal: After reading this document, you should understand the complete working structure of the app — the homepage, location & exchange-rate plumbing, order/checkout flow, user & seller auth, and the seller console — and be able to trace any feature from UI → service → Supabase table/RPC/Edge Function.

All paths in this document are **relative to the repo root** (`/workspaces/bzead`). The main web/PWA frontend lives under [Bzeadstore-main](Bzeadstore-main). The native buyer Android app lives under [BZEAD-APK-main](BZEAD-APK-main). The native buyer iOS app lives under [BZEAD-iOS-main](BZEAD-iOS-main). The backend is **Supabase** (Postgres + Auth + Storage + Edge Functions + pg_cron). Payments are **Stripe**. Shipping is **Shiprocket** (domestic IN) and **Shippo** (international).

---

## 0. Tech Stack & Top-Level Layout

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite, TailwindCSS, React Router v6 |
| State | React Context (`AuthContext`, `CartContext`, `WishlistContext`, `CurrencyContext`) |
| Auth | Supabase Auth (email/password + email OTP) |
| Database | Supabase Postgres (RLS-enforced) |
| Storage | Supabase Storage (`kyc-documents`, `shipping-labels`, `video-ads`, `app-downloads`, `bimi`) |
| Functions | Supabase Edge Functions (Deno) |
| Payments | Stripe (PaymentIntents + webhook) |
| Shipping | Shiprocket (India domestic), Shippo (international) |
| Push | OneSignal (web + native Android) |
| Mobile | Native Kotlin buyer app (`BZEAD-APK-main/`) + native SwiftUI buyer app (`BZEAD-iOS-main/`) |
| Hosting | AWS Amplify (see [amplify.yml](amplify.yml), [customHttp.yml](customHttp.yml)) |

### Repo structure (top-level)

```
Bzeadstore-main/        # Main web app (React + Vite)
  src/
    App.tsx             # Router + RouteGuard + providers
    pages/              # Route components (public, user/, seller/, admin/)
    components/         # Reusable UI (auth/, layout/, products/, common/)
    contexts/           # AuthContext, CartContext, CurrencyContext, WishlistContext
    hooks/              # useDestinationCountry, useSellerDisplayCurrency, …
    lib/                # Service layer (Supabase RPC wrappers, business logic)
    utils/              # currency, validation, logger, idFormatter, …
    mobile/             # Optional web helpers (legacy Capacitor imports; web-only)
  supabase/
    migrations/         # Versioned SQL (single source of DB truth)
    functions/          # Edge functions (Deno)
BZEAD-APK-main/         # Native Kotlin buyer Android app
BZEAD-iOS-main/         # Native SwiftUI buyer iOS app
scripts/                # Python/SQL utilities (bulk uploads, audits)
```

### Build modes (important!)

The same React source produces **two builds** controlled by `VITE_APP_MODE`:

* **Default web build** — full app (buyer + seller + admin).
* **`VITE_APP_MODE=buyer`** — buyer-only. Seller/admin chunks are dead-code-eliminated by Rollup. Any visit to `/seller/*` inside the Android app triggers `ExternalSellerRedirect` ([Bzeadstore-main/src/App.tsx](Bzeadstore-main/src/App.tsx#L161-L172)) which opens `https://www.bzead.com/seller` in a Chrome Custom Tab.

### Global provider tree

Defined in [Bzeadstore-main/src/App.tsx](Bzeadstore-main/src/App.tsx#L466-L490):

```
ErrorBoundary
 └ AuthProvider
   └ CurrencyProvider
     └ CartProvider
       └ WishlistProvider
         └ Router
           └ NavigationProvider (useTransition for lazy-route progress bar)
             └ NativeRuntimeGuard (Capacitor back-button + pull-to-refresh)
               └ RouteGuard (role-based redirects)
                 └ Suspense → <Routes>
```

### RouteGuard — role-based access (strict)

Implemented in [Bzeadstore-main/src/App.tsx](Bzeadstore-main/src/App.tsx#L222-L334). The rules are:

| Role | Allowed |
|---|---|
| `guest` (no session) | Public pages + `/login`, `/signup`, `/seller/login`, `/seller/signup`. Hitting protected pages redirects to the right login. |
| `user` | Public + user pages (`/orders`, `/cart`, `/checkout/*`, …). Blocked from `/seller/*` and `/admin/*`. |
| `seller` | **Only** `/seller/dashboard`, `/seller/products`, `/seller/orders`, `/seller/wallet`, `/seller/verify`, `/seller/notifications`, `/seller/warehouse`, `/seller/tutorial`, `/seller/help`. Everything else → `/seller/dashboard`. |
| `admin` | **Only** `/admin/*`. Everything else → `/admin`. |

Auth-flow paths (`/otp-verification`, `/new-password`, `/forgot-password`, and their `/seller/...` siblings) are always allowed regardless of role because the recovery flow briefly creates a session.

`SellerAuthRouteGuard` ([Bzeadstore-main/src/App.tsx](Bzeadstore-main/src/App.tsx#L407-L463)) additionally prevents a logged-in `user` from opening seller auth pages — it shows an "Account Switch Required" modal.

---

## 1. Homepage — UI & DB Connections

### 1.1 The page

Entry: [Bzeadstore-main/src/pages/BzeadHomePage.tsx](Bzeadstore-main/src/pages/BzeadHomePage.tsx) (rendered by `RootEntry` at `/`, see [App.tsx](Bzeadstore-main/src/App.tsx#L174-L184); `RootEntry` also handles deep links `?product=<slug>` for share links).

Sections rendered top→bottom:

1. **`<Header />`** — [Bzeadstore-main/src/components/layout/Header.tsx](Bzeadstore-main/src/components/layout/Header.tsx) — logo, search, cart/wishlist/profile icons, currency switcher.
2. **`<MegaMenu />`** — [Bzeadstore-main/src/components/layout/MegaMenu.tsx](Bzeadstore-main/src/components/layout/MegaMenu.tsx) — categories dropdown.
3. **`<HeroCarousel />`** — [Bzeadstore-main/src/components/layout/HeroCarousel.tsx](Bzeadstore-main/src/components/layout/HeroCarousel.tsx) — full-width hero banners.
4. **`<Categories />`** — [Bzeadstore-main/src/components/layout/Categories.tsx](Bzeadstore-main/src/components/layout/Categories.tsx) — category tile grid.
5. **Featured products row** — sponsored-first, then organic.
6. **Ad banner carousel** (slot 1) — rotates every 7s.
7. **Hot Deals row** — sponsored-first, then organic.
8. **Ad banner carousel** (slot 2).
9. **Trending row** — sponsored-first, then organic.
10. **`<VideoAdsBanner />`** — [Bzeadstore-main/src/components/layout/VideoAdsBanner.tsx](Bzeadstore-main/src/components/layout/VideoAdsBanner.tsx) — video ads from `video-ads` bucket.
11. **`<Footer />`** — [Bzeadstore-main/src/components/layout/Footer.tsx](Bzeadstore-main/src/components/layout/Footer.tsx).
12. **`<MobileNav />`** — bottom tab bar on mobile.

### 1.2 Data fetching

| What | Service / file | Backend |
|---|---|---|
| Section products (featured/hot-deals/trending) | `fetchProductsBySection(section, limit)` in [Bzeadstore-main/src/lib/productService.ts](Bzeadstore-main/src/lib/productService.ts) | Table `products` (filtered `is_active=true`, `approval_status='approved'`) |
| Sponsored slots per section | `getActiveSponsoredProductsBySection(section)` in [Bzeadstore-main/src/lib/sponsoredProductsService.ts](Bzeadstore-main/src/lib/sponsoredProductsService.ts) | Table `sponsored_products` join `products`, `profiles`; window check `start_at ≤ now ≤ end_at AND is_active` |
| Section layout (rows × columns) | `fetchSectionDisplayRules()` (`section_display_rules` table) | Migration [20260403000000_section_display_rules.sql](Bzeadstore-main/supabase/migrations/20260403000000_section_display_rules.sql) |
| Categories | `fetchAllCategories()` / `fetchCategoriesByLevel()` in [Bzeadstore-main/src/lib/categoryService.ts](Bzeadstore-main/src/lib/categoryService.ts) | Table `categories` (3-level hierarchy) |
| Banners | Direct `supabase.from('banners')` | Table `banners` filtered by `is_active=true`, `banner_type IN ('hero','ad','video')`, `ad_slot IN (1,2,3)`. RLS in [20260408220000_fix_banner_rls_and_slot_limit.sql](Bzeadstore-main/supabase/migrations/20260408220000_fix_banner_rls_and_slot_limit.sql) |
| Public product prices (per destination country) | `fetchPublicProductPrices(productIds, country)` in [Bzeadstore-main/src/lib/pricingService.ts](Bzeadstore-main/src/lib/pricingService.ts) | RPC `get_public_product_prices_with_overrides` |
| Video ads | `supabase.storage.from('video-ads')` + `banners` rows where `banner_type='video'` | Bucket created in [20260408210000_ad_slot_and_storage_buckets.sql](Bzeadstore-main/supabase/migrations/20260408210000_ad_slot_and_storage_buckets.sql); MIME allow in [20260410180000_allow_video_mime_types_in_video_ads_bucket.sql](Bzeadstore-main/supabase/migrations/20260410180000_allow_video_mime_types_in_video_ads_bucket.sql) |

### 1.3 Price display pipeline

Display prices on the homepage are **never** the raw `products.price`. They flow through:

```
products.price (origin currency, set by seller)
  → country_prices (per-destination overrides, markup_percent, markup_mrp)
  → countries.exchange_rate (USD-pivot FX)
  → get_public_product_prices_with_overrides(productIds, country)  -- RPC
  → fetchPublicProductPrices() returns { publicUnitPrice, markupMrp }
  → CurrencyContext.formatPrice() displays in user's currency (₹/$/£/…)
```

Relevant migrations: [20260426160000_create_product_markup_rates.sql](Bzeadstore-main/supabase/migrations/20260426160000_create_product_markup_rates.sql), [20260426172000_add_default_and_country_selling_prices.sql](Bzeadstore-main/supabase/migrations/20260426172000_add_default_and_country_selling_prices.sql), [20260505200000_add_markup_fields_to_country_prices.sql](Bzeadstore-main/supabase/migrations/20260505200000_add_markup_fields_to_country_prices.sql), [20260505220000_rpc_return_markup_mrp.sql](Bzeadstore-main/supabase/migrations/20260505220000_rpc_return_markup_mrp.sql).

### 1.4 Tables used by the homepage (summary)

| Table | Purpose |
|---|---|
| `products` | Catalog (with `origin_country_id`, `approval_status`, `is_active`, FTS column) |
| `country_prices` | Per-country price override + markup |
| `countries` | Currency + `exchange_rate` (USD pivot) |
| `categories` | 3-level taxonomy |
| `section_display_rules` | Rows per section card |
| `sponsored_products` | Paid placements per section |
| `banners` | Hero + ad slots + video ads |
| `user_search_history` | Header search suggestions ([20260504230000_create_user_search_history.sql](Bzeadstore-main/supabase/migrations/20260504230000_create_user_search_history.sql)) |

---

## 2. Location, Orders, Exchange Rate

### 2.1 Location detection

Module: [Bzeadstore-main/src/lib/locationService.ts](Bzeadstore-main/src/lib/locationService.ts).

Detection order, executed once per day per browser:

1. **Native GPS** (Capacitor `@capacitor/geolocation`) if permission granted on Android.
2. **IP geolocation** via Edge Function [Bzeadstore-main/supabase/functions/reverse-geocode](Bzeadstore-main/supabase/functions/reverse-geocode) (server-side IP2Location-style lookup), called with the device coords if GPS succeeded, or IP-only otherwise.
3. Result is cached:
   * `localStorage` keys: `beauzead_detected_location` (JSON), `beauzead_detected_country` (string).
   * `sessionStorage` flag: `beauzead_location_detected_date` (rate-limits re-detection).
   * `user_location_cache` table (only if user is logged in) — migration [20260302093000_create_user_location_cache.sql](Bzeadstore-main/supabase/migrations/20260302093000_create_user_location_cache.sql). TTL ~ 24h.

Hook for components: [Bzeadstore-main/src/hooks/useDestinationCountry.ts](Bzeadstore-main/src/hooks/useDestinationCountry.ts). Priority:

```
geo-detected country  →  profile.country  →  default shipping address country  →  'IN'
```

A custom event `beauzead:location-updated` is dispatched whenever the destination changes so that `CurrencyContext`, `CartContext`, and pricing components can re-render.

### 2.2 Exchange rates

Three layers:

1. **DB column** `countries.exchange_rate` — added in [20260505130000_add_exchange_rate_to_countries.sql](Bzeadstore-main/supabase/migrations/20260505130000_add_exchange_rate_to_countries.sql), populated by [20260505140000_populate_exchange_rates.sql](Bzeadstore-main/supabase/migrations/20260505140000_populate_exchange_rates.sql).
2. **pg_cron job** — [20260505150000_setup_exchange_rate_cron.sql](Bzeadstore-main/supabase/migrations/20260505150000_setup_exchange_rate_cron.sql) (schema fix [20260505230000_fix_exchange_rate_cron_schema.sql](Bzeadstore-main/supabase/migrations/20260505230000_fix_exchange_rate_cron_schema.sql)) calls Edge Function `sync-exchange-rates` hourly to refresh `countries.exchange_rate`.
3. **Edge Functions**:
   * [Bzeadstore-main/supabase/functions/exchange-rates](Bzeadstore-main/supabase/functions/exchange-rates) — read-only HTTPS endpoint returning `{ rates: { USD: 1, INR: 83.5, … } }`. Used by the browser as a fallback when DB values are stale.
   * [Bzeadstore-main/supabase/functions/sync-exchange-rates](Bzeadstore-main/supabase/functions/sync-exchange-rates) — pg_cron caller; fetches a paid provider (ExchangeRate-API) and falls back to `open.er-api.com`, then `UPDATE countries SET exchange_rate = …`.

Frontend conversion lives in [Bzeadstore-main/src/utils/currency.ts](Bzeadstore-main/src/utils/currency.ts):

```ts
convertAmount(amount, fromCurrency, toCurrency, rates) // USD pivot
formatPrice(amount, currency)                          // adds symbol + locale formatting
```

Consumed via [Bzeadstore-main/src/contexts/CurrencyContext.tsx](Bzeadstore-main/src/contexts/CurrencyContext.tsx).

### 2.3 Currency context — resolution order

`CurrencyContext` chooses the displayed currency in this priority:

1. Manual user pick (localStorage `beauzead_currency`).
2. Geo-detected country → `resolveCurrencyFromCountry()`.
3. `profiles.country_id` → `countries.currency_code`.
4. Seller KYC `business_country` (for seller views).
5. Default shipping address country.
6. Auth `user_metadata.currency`.
7. `USD` → `INR` fallback.

Supported currencies (in [Bzeadstore-main/src/utils/currency.ts](Bzeadstore-main/src/utils/currency.ts)): INR, USD, EUR, GBP, JPY, AUD, CAD, AED, SGD, SAR.

### 2.4 Orders & checkout

#### Route flow

```
/cart → /checkout/shipping → /checkout/review → /checkout/payment → /checkout/confirmation
```

| Step | Page | Responsibility |
|---|---|---|
| Cart | [Bzeadstore-main/src/pages/user/Cart.tsx](Bzeadstore-main/src/pages/user/Cart.tsx) | Show items, edit qty/variant, sync with backend |
| Shipping | [Bzeadstore-main/src/pages/user/ShippingAddress.tsx](Bzeadstore-main/src/pages/user/ShippingAddress.tsx) | Pick / add shipping address |
| Review | [Bzeadstore-main/src/pages/user/OrderSummary.tsx](Bzeadstore-main/src/pages/user/OrderSummary.tsx) | Call `calculate_checkout_pricing`, show breakdown |
| Payment | [Bzeadstore-main/src/pages/user/Checkout.tsx](Bzeadstore-main/src/pages/user/Checkout.tsx) | Stripe Elements (`PaymentElement`) |
| Confirmation | [Bzeadstore-main/src/pages/user/OrderConfirmation.tsx](Bzeadstore-main/src/pages/user/OrderConfirmation.tsx) | Show order ID, redirect |

#### Pricing calculation

Service: [Bzeadstore-main/src/lib/checkoutPricingService.ts](Bzeadstore-main/src/lib/checkoutPricingService.ts).
RPC: `calculate_checkout_pricing(p_items jsonb, p_country text)`.

Returns `DestinationCheckoutPricing`:

```ts
{
  currency, subtotal, offerDiscount, platformHandlingCharge,
  shipping, total, items,
  ineligibleItems[], codEligible, hasInternationalItems,
  intlShippingOptions: { standard, premium, express }
}
```

Pricing inputs per item: product origin country, destination shipping rules, Shiprocket/Shippo live rate, `offer_rules`, `platform_commission_rules`, country markup. Minimum-order rules (e.g. ₹2150 for India → UK/Ireland/Malta routes) live in [20260514180000_set_all_india_routes_min_order_2150.sql](Bzeadstore-main/supabase/migrations/20260514180000_set_all_india_routes_min_order_2150.sql) and related migrations.

#### Order creation

Service: `callCreateOrderSecure(params)` in [Bzeadstore-main/src/lib/orderService.ts](Bzeadstore-main/src/lib/orderService.ts).
RPC: `create_order_secure(p_user_id, p_cart_item_ids, p_shipping_address, p_country, p_payment_method, p_payment_intent_id)`.

What the RPC does atomically:

1. Re-runs `calculate_checkout_pricing` server-side (zero trust in client totals).
2. Inserts `orders` row (`status='pending'`, currency = buyer destination currency).
3. Inserts one `order_items` row per cart item with both **buyer** and **seller** unit prices (dual-snapshot, see [20260511130000_add_dual_order_item_price_snapshots.sql](Bzeadstore-main/supabase/migrations/20260511130000_add_dual_order_item_price_snapshots.sql)).
4. Inserts `order_cost_breakdown` (platform fee, shipping, discount).
5. Decrements `products.stock_quantity` (trigger from [20260410120000_decrement_stock_on_order.sql](Bzeadstore-main/supabase/migrations/20260410120000_decrement_stock_on_order.sql)).
6. Locks the FX rate into the order ([20260520120000_lock_order_fx_snapshot.sql](Bzeadstore-main/supabase/migrations/20260520120000_lock_order_fx_snapshot.sql)).
7. Removes the cart items.

#### Payment (Stripe)

[Bzeadstore-main/src/lib/stripeService.ts](Bzeadstore-main/src/lib/stripeService.ts) → Edge Function [Bzeadstore-main/supabase/functions/create-payment-intent](Bzeadstore-main/supabase/functions/create-payment-intent) creates the `PaymentIntent`. The frontend mounts `<PaymentElement />`. On success, the **server-side** [stripe-webhook](Bzeadstore-main/supabase/functions/stripe-webhook) flips `orders.status` to `paid` and triggers downstream notifications + shipping rate booking. Recovery snapshot exists for retries: [20260511110000_paid_order_recovery_snapshot.sql](Bzeadstore-main/supabase/migrations/20260511110000_paid_order_recovery_snapshot.sql).

#### Shipping

* **Shiprocket** (India domestic & some intl): [Bzeadstore-main/src/lib/shiprocketOpsService.ts](Bzeadstore-main/src/lib/shiprocketOpsService.ts), Edge Functions [shiprocket-ops](Bzeadstore-main/supabase/functions/shiprocket-ops), [shiprocket-rate](Bzeadstore-main/supabase/functions/shiprocket-rate). Tables `shiprocket_shipments`, `shiprocket_tokens`.
* **Shippo** (international): [Bzeadstore-main/src/lib/shippoOpsService.ts](Bzeadstore-main/src/lib/shippoOpsService.ts), Edge Functions [shippo-ops](Bzeadstore-main/supabase/functions/shippo-ops), [shippo-rate](Bzeadstore-main/supabase/functions/shippo-rate), [shippo-webhook](Bzeadstore-main/supabase/functions/shippo-webhook).
* Label storage: `shipping-labels` bucket ([20260328200000_shipping_labels_bucket.sql](Bzeadstore-main/supabase/migrations/20260328200000_shipping_labels_bucket.sql)).

#### Key order tables

| Table | Notes |
|---|---|
| `orders` | Header. `user_id, seller_id, status, total_amount, currency, shipping_address jsonb, payment_method, payment_intent_id`. Status check in [20260328180000_add_pending_to_order_status_check.sql](Bzeadstore-main/supabase/migrations/20260328180000_add_pending_to_order_status_check.sql). |
| `order_items` | Lines with **dual** buyer/seller unit prices, variant snapshot. |
| `order_cost_breakdown` | Platform fee, shipping, discounts. |
| `order_cancellations`, `order_returns` | [20260322100000_order_cancellations_returns.sql](Bzeadstore-main/supabase/migrations/20260322100000_order_cancellations_returns.sql). |
| `cart_items` | Source for `create_order_secure`. |
| `seller_wallets`, `seller_settlements` | Money to sellers, see [20260325150000_seller_settlement_system.sql](Bzeadstore-main/supabase/migrations/20260325150000_seller_settlement_system.sql) + [20260325160000_secure_wallet_settlement.sql](Bzeadstore-main/supabase/migrations/20260325160000_secure_wallet_settlement.sql). |

---

## 3. Auth — User & Seller Login, Signup, Password

### 3.1 The single source of truth: `AuthContext`

[Bzeadstore-main/src/contexts/AuthContext.tsx](Bzeadstore-main/src/contexts/AuthContext.tsx) wraps the Supabase Auth SDK and exposes:

| API | What it does |
|---|---|
| `user`, `currentAuthUser` | Current Supabase user + parsed claims |
| `authRole` | `'user' \| 'seller' \| 'admin' \| null` — **read from `profiles.role`**, not from `user_metadata` |
| `loading` | True until the initial session + profile fetch resolves |
| `signUp(email, password, role, fullName, currency?, phone?, countryId?, businessTypeId?)` | Calls `supabase.auth.signUp({…, options:{data:{role,…}}})` |
| `signIn(email, password)` | `supabase.auth.signInWithPassword(...)` + fetches profile + resolves `authRole` |
| `signOut()` | `supabase.auth.signOut()` + clears local caches |
| `resetPassword(email, redirectPath?)` | `supabase.auth.resetPasswordForEmail(...)` |
| `confirmPasswordReset(email, code, newPassword)` | `verifyOtp({type:'recovery'})` + `updateUser({password})` |

`authRole` is recomputed every time a session changes; it deliberately takes precedence over JWT `user_metadata.role` because admins can promote/demote users via the admin panel and we want that to take effect on next page load.

### 3.2 User signup / login

| Page | File | Notes |
|---|---|---|
| Buyer login | [Bzeadstore-main/src/components/auth/Login.tsx](Bzeadstore-main/src/components/auth/Login.tsx) | Used as `<Login role="user" />` at `/login`. Wrong-role popup if `authRole === 'seller' \| 'admin'`. Redirects to `?from` if set, else `/`. |
| Buyer signup | [Bzeadstore-main/src/components/auth/Signup.tsx](Bzeadstore-main/src/components/auth/Signup.tsx) | Email + password + full name + country. Validates via [Bzeadstore-main/src/utils/validation.ts](Bzeadstore-main/src/utils/validation.ts) (password ≥ 8 chars, upper/lower/digit/special). Stashes `signupEmail`, `signupCountryId` in `sessionStorage`, navigates to `/otp-verification`. |
| OTP entry | [Bzeadstore-main/src/pages/OTPVerification.tsx](Bzeadstore-main/src/pages/OTPVerification.tsx) | 6-digit OTP → `supabase.auth.verifyOtp({type:'signup' \| 'recovery'})`. On recovery, hands off to `NewPassword`. |
| Forgot password | [Bzeadstore-main/src/pages/user/ForgotPassword.tsx](Bzeadstore-main/src/pages/user/ForgotPassword.tsx) | `auth.resetPasswordForEmail` → email link → `/otp-verification?purpose=recovery` |
| New password | [Bzeadstore-main/src/pages/NewPassword.tsx](Bzeadstore-main/src/pages/NewPassword.tsx) | Calls `confirmPasswordReset` then redirects to `/login` |

### 3.3 Profiles table & onboarding trigger

Defined in [20260222000000_bootstrap_core_schema.sql](Bzeadstore-main/supabase/migrations/20260222000000_bootstrap_core_schema.sql):

```sql
profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text, avatar_url text,
  role text not null default 'user',          -- user | seller | admin
  is_verified boolean default false,
  approved boolean default false,
  country_id uuid references countries(id),
  business_type_id uuid references business_types(id),
  currency text default 'INR',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

A trigger on `auth.users` insert ([20260224031000_normalize_email_trigger.sql](Bzeadstore-main/supabase/migrations/20260224031000_normalize_email_trigger.sql)) creates the matching `profiles` row, lowercases email, and copies metadata (`role`, `full_name`, `phone`, `country`, `currency`, `business_type_id`).

Sensitive columns (`role`, `approved`, `is_verified`, `is_banned`) are write-protected to non-admins by [20260224030000_protect_profile_columns.sql](Bzeadstore-main/supabase/migrations/20260224030000_protect_profile_columns.sql) and [20260407120000_fix_is_banned_protection.sql](Bzeadstore-main/supabase/migrations/20260407120000_fix_is_banned_protection.sql). RLS recursion was fixed in [20260314200000_fix_profiles_rls_recursion.sql](Bzeadstore-main/supabase/migrations/20260314200000_fix_profiles_rls_recursion.sql).

### 3.4 Seller auth (mirrors buyer with separate UI)

| Page | File | Path |
|---|---|---|
| Seller landing | [Bzeadstore-main/src/pages/seller/SellerLanding.tsx](Bzeadstore-main/src/pages/seller/SellerLanding.tsx) | `/seller` |
| Seller login | [Bzeadstore-main/src/pages/seller/SellerLogin.tsx](Bzeadstore-main/src/pages/seller/SellerLogin.tsx) | `/seller/login` — also the **only** entry for admins (`/admin/login` redirects here). |
| Seller signup | [Bzeadstore-main/src/pages/seller/SellerSignup.tsx](Bzeadstore-main/src/pages/seller/SellerSignup.tsx) | `/seller/signup` — calls `signUp(..., 'seller', ...)` with `businessTypeId` |
| Forgot password | [Bzeadstore-main/src/pages/seller/SellerForgotPassword.tsx](Bzeadstore-main/src/pages/seller/SellerForgotPassword.tsx) | `/seller/forgot-password` |
| OTP | Shared [OTPVerification.tsx](Bzeadstore-main/src/pages/OTPVerification.tsx) | `/seller/otp-verification` |
| New password | Shared [NewPassword.tsx](Bzeadstore-main/src/pages/NewPassword.tsx) | `/seller/new-password` |

All seller auth pages are wrapped in `SellerAuthRouteGuard` (see §0) so a logged-in buyer cannot impersonate a seller signup.

### 3.5 Email & push

* Generic email sender: [Bzeadstore-main/supabase/functions/send-email](Bzeadstore-main/supabase/functions/send-email) (used for KYC status, order events, etc.). Logs in `email_logs` ([20260405200000_create_email_logs.sql](Bzeadstore-main/supabase/migrations/20260405200000_create_email_logs.sql)).
* Contact form: [Bzeadstore-main/supabase/functions/send-contact-email](Bzeadstore-main/supabase/functions/send-contact-email).
* Push notifications: OneSignal in [Bzeadstore-main/src/lib/oneSignalWeb.ts](Bzeadstore-main/src/lib/oneSignalWeb.ts) + Capacitor device tokens via [register-push-token](Bzeadstore-main/supabase/functions/register-push-token) → `device_push_tokens` ([20260414100000_create_device_push_tokens.sql](Bzeadstore-main/supabase/migrations/20260414100000_create_device_push_tokens.sql)).

---

## 4. Seller Console — From Account Creation to All Pages

### 4.1 The seller journey

```
/seller (SellerLanding)
  → /seller/signup → /seller/otp-verification → /seller/login
  → /seller/dashboard
       │
       ├─ KYC submission (/seller/verify) ───────────► seller_kyc.kyc_status='pending'
       │     └─ Admin approves in /admin/seller-kyc ─► profiles.approved=true, role='seller'
       │
       ├─ /seller/warehouse (create pickup location)
       │     └─ OTP-verified pickup_ready=true        (Shiprocket/Shippo can dispatch)
       │
       ├─ /seller/products (add/edit listings)
       ├─ /seller/orders (manage fulfilment)
       ├─ /seller/wallet (settlements & payouts)
       ├─ /seller/notifications
       ├─ /seller/tutorial, /seller/help
       └─ /seller/promotions → sponsored product slots
```

### 4.2 Layout & shared chrome

[Bzeadstore-main/src/pages/seller/SellerLayout.tsx](Bzeadstore-main/src/pages/seller/SellerLayout.tsx) is the persistent sidebar + topbar wrapper used by every authenticated seller page. The `*Wrapper` files (e.g. `SellerDashboardWrapper`) exist so the lazy-loaded page can be mounted inside the layout while still being code-split.

### 4.3 Page-by-page

| URL | File | What it does | Data |
|---|---|---|---|
| `/seller/dashboard` | [SellerDashboard.tsx](Bzeadstore-main/src/pages/seller/SellerDashboard.tsx) | KPI cards (orders today, revenue, pending KYC, wallet balance), recent orders, quick links | RPCs `get_seller_dashboard_stats`, `get_seller_wallet_summary`; tables `orders`, `seller_kyc` |
| `/seller/products` | [SellerProductListing.tsx](Bzeadstore-main/src/pages/seller/SellerProductListing.tsx) (+ steps in [steps/](Bzeadstore-main/src/pages/seller/steps)) | Multi-step product create/edit (basics → media → variants → measurements → pricing → HSN → shipping). | `products`, `product_variants`, `product_item_measurements`, `category_hsn_codes`, `country_prices`, `product_origin_destination_shipping_rates`. New listings start `approval_status='pending'`; admin approval auto-activates ([20260325120000_auto_activate_on_approval.sql](Bzeadstore-main/supabase/migrations/20260325120000_auto_activate_on_approval.sql)). |
| `/seller/orders` | [SellerOrderManagement.tsx](Bzeadstore-main/src/pages/seller/SellerOrderManagement.tsx) | List/filter orders, mark dispatched, print labels, process returns/cancellations | `orders`, `order_items`, `shiprocket_shipments`, `shippo_shipments`; RLS [20260324100000_fix_seller_order_rls.sql](Bzeadstore-main/supabase/migrations/20260324100000_fix_seller_order_rls.sql), [20260519120000_fix_seller_order_visibility.sql](Bzeadstore-main/supabase/migrations/20260519120000_fix_seller_order_visibility.sql) |
| `/seller/wallet` | [SellerWallet.tsx](Bzeadstore-main/src/pages/seller/SellerWallet.tsx) | Wallet balance, settlement ledger, payout requests | `seller_wallets`, `seller_settlements`, `manual_payouts` ([20260409120000_manual_payouts.sql](Bzeadstore-main/supabase/migrations/20260409120000_manual_payouts.sql)) |
| `/seller/verify` | [SellerVerificationPage.tsx](Bzeadstore-main/src/pages/seller/SellerVerificationPage.tsx) + [kyc/](Bzeadstore-main/src/pages/seller/kyc) | KYC wizard: personal → tax (PAN/GSTIN) → identity (Aadhaar/Passport + upload) → business address → bank → compliance checks | `seller_kyc` (table in [20260223010000_create_seller_kyc_table.sql](Bzeadstore-main/supabase/migrations/20260223010000_create_seller_kyc_table.sql)); files in `kyc-documents` bucket via [kycService.ts](Bzeadstore-main/src/lib/kycService.ts) → `uploadKYCDocument()` → `submitCompleteKYC()` |
| `/seller/notifications` | [SellerNotifications.tsx](Bzeadstore-main/src/pages/seller/SellerNotifications.tsx) | Order alerts, KYC updates, payout events | `notifications` ([20260224010000_create_notifications.sql](Bzeadstore-main/supabase/migrations/20260224010000_create_notifications.sql)); push via OneSignal |
| `/seller/promotions` (UI hidden behind dashboard) | [SellerPromotions.tsx](Bzeadstore-main/src/pages/seller/SellerPromotions.tsx) + [sellerPromotionsService.ts](Bzeadstore-main/src/lib/sellerPromotionsService.ts) | Sponsor own products into homepage sections | `sponsored_products` (RLS [20260225100000_add_seller_promotions_rls.sql](Bzeadstore-main/supabase/migrations/20260225100000_add_seller_promotions_rls.sql)) |
| `/seller/warehouse` | [WarehouseCreation.tsx](Bzeadstore-main/src/pages/seller/WarehouseCreation.tsx) + [warehouse/](Bzeadstore-main/src/pages/seller/warehouse) | Create pickup address; receive OTP via [pickup-otp](Bzeadstore-main/supabase/functions/pickup-otp) Edge Function; verify; mark `pickup_ready` | `seller_pickup_locations` ([20260312120000_seller_pickup_locations.sql](Bzeadstore-main/supabase/migrations/20260312120000_seller_pickup_locations.sql), OTP lockout [20260316183000_pickup_otp_lockout_and_sms_ready.sql](Bzeadstore-main/supabase/migrations/20260316183000_pickup_otp_lockout_and_sms_ready.sql)) |
| `/seller/tutorial`, `/seller/help` | [SellerTutorial.tsx](Bzeadstore-main/src/pages/seller/SellerTutorial.tsx), [SellerHelp.tsx](Bzeadstore-main/src/pages/seller/SellerHelp.tsx) | Static onboarding/help content | — |

### 4.4 KYC service (file flow)

[Bzeadstore-main/src/lib/kycService.ts](Bzeadstore-main/src/lib/kycService.ts):

* `uploadKYCDocument(sellerId, file, docType)` — uploads to `kyc-documents/<sellerId>/<docType>_<timestamp>.<ext>` (max 10 MB; JPEG/PNG/PDF/DOC/DOCX); returns signed URL.
* `submitCompleteKYC(data, sellerId)` — upserts `seller_kyc`, sets `kyc_status='pending'`, `submitted_at=now()`.
* Admin reviews at `/admin/seller-kyc` ([SellerKYCSubmissionManagement.tsx](Bzeadstore-main/src/pages/admin/modules/SellerKYCSubmissionManagement.tsx)). Admin RLS hardened in [20260222113000_fix_seller_kyc_admin_rls.sql](Bzeadstore-main/supabase/migrations/20260222113000_fix_seller_kyc_admin_rls.sql) and [20260226120000_align_seller_kyc_profile_fields.sql](Bzeadstore-main/supabase/migrations/20260226120000_align_seller_kyc_profile_fields.sql).
* On approval, admin RPC flips `profiles.approved=true` and triggers welcome email + push.

### 4.5 Selling restrictions until approval

* `RouteGuard` lets unapproved sellers reach `/seller/*` pages, but the **product create RPC** rejects insertions when `profiles.approved=false` (see [20260222124000_enforce_admin_product_approval.sql](Bzeadstore-main/supabase/migrations/20260222124000_enforce_admin_product_approval.sql)).
* Sellers cannot fulfil orders without a verified pickup location (Shiprocket/Shippo refuse otherwise).

### 4.6 Admin (for context)

Mounted under `<AdminLayout />`. Key modules: `AdminOverview`, `SellerManagement`, `ProductManagement`, `SellerKYCSubmissionManagement`, `OrderManagement`, `AccountsManagement`, `ShippingManagementPage`, `BannerManagement`, `CategoryManagement`, `SystemHealth`, `AuditLogs`. Admin-only RPCs are secured in [20260407110000_admin_secure_rpcs.sql](Bzeadstore-main/supabase/migrations/20260407110000_admin_secure_rpcs.sql).

---

## 5. Cross-Cutting Reference

### 5.1 Supabase client

[Bzeadstore-main/src/lib/supabase.ts](Bzeadstore-main/src/lib/supabase.ts) — single `createClient` initialised with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Persists session in `localStorage`.

### 5.2 Edge Functions index

| Function | Purpose |
|---|---|
| `create-payment-intent` | Stripe `PaymentIntent` creation |
| `stripe-webhook` | Marks orders paid, books shipping, sends emails |
| `exchange-rates` | Returns latest FX rates to browser |
| `sync-exchange-rates` | Hourly pg_cron job to refresh `countries.exchange_rate` |
| `reverse-geocode` | IP/lat-lng → country/city |
| `send-email`, `send-contact-email` | Transactional email |
| `send-push-notification`, `register-push-token` | OneSignal + native push |
| `shiprocket-ops`, `shiprocket-rate` | Shiprocket order ops & live rates |
| `shippo-ops`, `shippo-rate`, `shippo-webhook` | Shippo intl shipping |
| `pickup-otp` | Pickup-location OTP send/verify |
| `intl-tracking-webhook` | Carrier status updates |
| `product-og` | OG-tag SSR for share links |

All live under [Bzeadstore-main/supabase/functions](Bzeadstore-main/supabase/functions).

### 5.3 Key constants & utilities

* [Bzeadstore-main/src/constants.ts](Bzeadstore-main/src/constants.ts) — global constants.
* [Bzeadstore-main/src/config/baseUrl.ts](Bzeadstore-main/src/config/baseUrl.ts) — env-aware base URL.
* [Bzeadstore-main/src/utils/validation.ts](Bzeadstore-main/src/utils/validation.ts) — email/password/phone/postal validators.
* [Bzeadstore-main/src/utils/logger.ts](Bzeadstore-main/src/utils/logger.ts) — gated console wrapper.
* [Bzeadstore-main/src/utils/idFormatter.ts](Bzeadstore-main/src/utils/idFormatter.ts) — readable IDs (e.g. `BZ-ORD-…`).
* [Bzeadstore-main/src/utils/invoicePdf.ts](Bzeadstore-main/src/utils/invoicePdf.ts) — invoice PDF generation.

### 5.4 Tests

Vitest suites under [Bzeadstore-main/src/__tests__](Bzeadstore-main/src/__tests__) cover:
* `checkoutPricingService.simulation.test.ts` — full pricing math
* `currency.test.ts` — FX conversion edge cases
* `deliveryRouting.test.ts` — country routing & rate selection
* `stripeService.test.ts` — payment-intent calls
* `validation.test.ts` — form validators

Run: `cd Bzeadstore-main && npm test` (Vitest config: [vitest.config.ts](Bzeadstore-main/vitest.config.ts)).

### 5.5 Build / deploy

* Dev: `npm run dev` (Vite).
* Web build: `npm run build`.
* Buyer Android: Gradle build in [BZEAD-APK-main](BZEAD-APK-main) (`./gradlew assembleDebug` or `assembleRelease`); upload APK to Supabase `app-downloads`.
* Buyer iOS: XcodeGen + Xcode in [BZEAD-iOS-main](BZEAD-iOS-main) (see `README.md`); same Supabase/Stripe/OneSignal keys as Android.
* Web hosting via AWS Amplify ([amplify.yml](amplify.yml)).
* Security headers in [Bzeadstore-main/public/_headers](Bzeadstore-main/public/_headers) and [customHttp.yml](customHttp.yml).

---

## 6. Shipping Channel Configuration (Domestic + International)

Bzead routes every shipment through one of two providers, chosen by the **origin → destination** pair and the per-country rule in `shipping_provider_config`:

| Route | Provider | Notes |
|---|---|---|
| India → India | **Shiprocket** (domestic) | Enforced by [20260422193000_enforce_india_shiprocket_domestic.sql](Bzeadstore-main/supabase/migrations/20260422193000_enforce_india_shiprocket_domestic.sql) |
| India → International | **Shippo** (and historically Shiprocket-intl, now removed) | Shiprocket intl tables dropped in [20260414120000_drop_shiprocket_intl_pickup.sql](Bzeadstore-main/supabase/migrations/20260414120000_drop_shiprocket_intl_pickup.sql) |
| UK / DE / FR / ES / US / CA → anywhere | **Shippo** | Seeded in [20260405300000_shipping_provider_config.sql](Bzeadstore-main/supabase/migrations/20260405300000_shipping_provider_config.sql) |

### 6.1 Provider config table

`shipping_provider_config(country_code, provider, domestic, international, markup_domestic, markup_intl, markup_currency)` — see [20260405300000_shipping_provider_config.sql](Bzeadstore-main/supabase/migrations/20260405300000_shipping_provider_config.sql). This is read by `calculate_checkout_pricing` and `create_order_secure` to pick the carrier and apply the per-origin shipping markup.

### 6.2 Domestic — Shiprocket

* **Service wrapper:** [Bzeadstore-main/src/lib/shiprocketOpsService.ts](Bzeadstore-main/src/lib/shiprocketOpsService.ts) — type `ShiprocketOperation` enumerates every supported op.
* **Edge functions:**
  * [shiprocket-rate](Bzeadstore-main/supabase/functions/shiprocket-rate) — live courier serviceability + rates.
  * [shiprocket-ops](Bzeadstore-main/supabase/functions/shiprocket-ops) — order creation, AWB assignment, label/manifest, schedule pickup, tracking, cancel, returns, NDR re-attempt / RTO, sync, pickup-location registration, pickup OTP request/verify.
* **Operations callable:** `check_domestic_serviceability`, `create_domestic_order`, `create_international_order` (legacy), `assign_awb`, `generate_label`, `generate_manifest`, `schedule_pickup`, `track_shipment`, `track_by_awb`, `cancel_order`, `cancel_shipment`, `create_return`, `ndr_reattempt`, `ndr_return_to_origin`, `sync_all_active_shipments`, `add_pickup_location`, `request_pickup_otp`, `verify_pickup_otp`.
* **Tables:**
  * `shiprocket_shipments` — AWB, status, tracking events (created [20260326120000_create_shiprocket_tables.sql](Bzeadstore-main/supabase/migrations/20260326120000_create_shiprocket_tables.sql); NDR fields [20260402130000_shiprocket_ndr_fields.sql](Bzeadstore-main/supabase/migrations/20260402130000_shiprocket_ndr_fields.sql); reconciled [20260402220000_shiprocket_schema_reconciliation.sql](Bzeadstore-main/supabase/migrations/20260402220000_shiprocket_schema_reconciliation.sql))
  * `shiprocket_tokens` — per-seller API credentials with RLS [20260407130000_shiprocket_tokens_rls.sql](Bzeadstore-main/supabase/migrations/20260407130000_shiprocket_tokens_rls.sql)
  * `seller_pickup_locations` — pickup warehouses; `warehouse_type='domestic' \| 'international'`, plus `shiprocket_synced`, `phone_verified`, `pickup_location_code` ([20260308100000_add_delhivery_pickup_location_code.sql](Bzeadstore-main/supabase/migrations/20260308100000_add_delhivery_pickup_location_code.sql), [20260414140000_add_shiprocket_pickup_columns.sql](Bzeadstore-main/supabase/migrations/20260414140000_add_shiprocket_pickup_columns.sql))
* **Pickup OTP flow:** seller hits "Verify" → Edge Function [pickup-otp](Bzeadstore-main/supabase/functions/pickup-otp) issues 6-digit code (lockout after N attempts — [20260316183000_pickup_otp_lockout_and_sms_ready.sql](Bzeadstore-main/supabase/migrations/20260316183000_pickup_otp_lockout_and_sms_ready.sql)). Once verified, `phone_verified=true` + `shiprocket_synced=true` and the warehouse becomes selectable for shipments.
* **Labels** are saved to the `shipping-labels` bucket ([20260328200000_shipping_labels_bucket.sql](Bzeadstore-main/supabase/migrations/20260328200000_shipping_labels_bucket.sql), RLS [20260328210000_fix_shipping_labels_rls.sql](Bzeadstore-main/supabase/migrations/20260328210000_fix_shipping_labels_rls.sql)).

### 6.3 International — Shippo

* **Service wrapper:** [Bzeadstore-main/src/lib/shippoOpsService.ts](Bzeadstore-main/src/lib/shippoOpsService.ts).
* **Edge functions:**
  * [shippo-rate](Bzeadstore-main/supabase/functions/shippo-rate) — quotes from multiple carriers via Shippo.
  * [shippo-ops](Bzeadstore-main/supabase/functions/shippo-ops) — create shipment, buy label, refund, create return label, track.
  * [shippo-webhook](Bzeadstore-main/supabase/functions/shippo-webhook) — carrier status callbacks → updates `shippo_shipments.status` and writes `notifications`.
  * [intl-tracking-webhook](Bzeadstore-main/supabase/functions/intl-tracking-webhook) — generic intl tracking sink.
* **Tables:** `shippo_shipments`, `shippo_tokens`, `shippo_transactions` (created [20260403100000_create_shippo_tables.sql](Bzeadstore-main/supabase/migrations/20260403100000_create_shippo_tables.sql); fixes [20260404100000_shippo_fixes.sql](Bzeadstore-main/supabase/migrations/20260404100000_shippo_fixes.sql)).

### 6.4 International rate-card fallback

Used when a live Shippo quote fails or for display/estimate pre-checkout:

| Table | Purpose |
|---|---|
| `international_shipping_rate_card` | Country × service-type × weight band → INR rate. Created [20260310102729_create_international_shipping_rate_card.sql](Bzeadstore-main/supabase/migrations/20260310102729_create_international_shipping_rate_card.sql), expanded with delivery days [20260316140000_intl_rate_card_delivery_days.sql](Bzeadstore-main/supabase/migrations/20260316140000_intl_rate_card_delivery_days.sql), upgraded to bzead-specific rates [20260420100000_upgrade_intl_rate_card_for_bzead_rates.sql](Bzeadstore-main/supabase/migrations/20260420100000_upgrade_intl_rate_card_for_bzead_rates.sql). |
| `product_origin_destination_shipping_rates` | Per-product override (weight band, standard + express amounts/ETA). [20260426150000_recreate_product_origin_destination_shipping_rates_v2.sql](Bzeadstore-main/supabase/migrations/20260426150000_recreate_product_origin_destination_shipping_rates_v2.sql) |
| `shipping_origin_zones` | Groups origin countries into zones (`UK`, `EUROPE`, …). [20260310120000_create_shipping_origin_zones.sql](Bzeadstore-main/supabase/migrations/20260310120000_create_shipping_origin_zones.sql) |
| `uk_geo_markup_rules` | UK zone tiered markup. [20260422100000_uk_geo_markup_rules_table.sql](Bzeadstore-main/supabase/migrations/20260422100000_uk_geo_markup_rules_table.sql) |

**Lookup RPC:** `lookup_international_shipping_rate(country_code, weight_kg, service_type)` (and variants). Weight-boundary fix: [20260315140000_fix_lookup_intl_rate_weight_boundary.sql](Bzeadstore-main/supabase/migrations/20260315140000_fix_lookup_intl_rate_weight_boundary.sql).

### 6.5 Admin UI for shipping config

* **[ShippingManagementPage](Bzeadstore-main/src/pages/admin/modules/ShippingManagementPage.tsx)** (`/admin/shipping-management`) — CRUD on `product_origin_destination_shipping_rates`; filter by origin / destination / weight band; edit standard & express amounts and ETAs.
* **[IntlRateCardPage](Bzeadstore-main/src/pages/admin/modules/IntlRateCardPage.tsx)** (`/admin/intl-rates`) — CRUD on `international_shipping_rate_card`; filter by country code / service type; edit INR rate + delivery days.
* **[AdminAddressManagement](Bzeadstore-main/src/pages/admin/components/AdminAddressManagement.tsx)** (`/admin/addresses`) — manage `countries`, `shipping_origin_zones`, `geo_pricing_zones`.

### 6.6 Seller UI for shipping config

* **[DomesticShippingStep](Bzeadstore-main/src/pages/seller/steps/DomesticShippingStep.tsx)** — part of the product wizard; toggles `products.ships_internationally` ([20260410100000_add_ships_internationally_to_products.sql](Bzeadstore-main/supabase/migrations/20260410100000_add_ships_internationally_to_products.sql)) and selects the pickup warehouse.
* **[WarehouseCreation](Bzeadstore-main/src/pages/seller/WarehouseCreation.tsx)** + [WarehousePickupForm](Bzeadstore-main/src/pages/seller/warehouse/WarehousePickupForm.tsx) — registers a row in `seller_pickup_locations` (prefilled from `seller_kyc` business address), triggers the Shiprocket sync, and runs pickup-OTP verification.

### 6.7 Shipping markup applied on orders

On every order, three numbers are written to `orders` (see [20260315130000_add_shipping_discount_to_orders.sql](Bzeadstore-main/supabase/migrations/20260315130000_add_shipping_discount_to_orders.sql), [20260407100000_add_shipping_markup_to_rpcs.sql](Bzeadstore-main/supabase/migrations/20260407100000_add_shipping_markup_to_rpcs.sql)):

| Column | Meaning |
|---|---|
| `actual_shipping_cost` | Carrier cost (Shiprocket / Shippo quote) |
| `shipping_charge` | Amount actually charged to buyer (includes markup) |
| `platform_shipping_margin` | `shipping_charge − actual_shipping_cost` |

The per-origin markup comes from `shipping_provider_config.markup_domestic` and `markup_intl`. UK free-shipping threshold lives in [20260422120000_update_uk_free_shipping_threshold.sql](Bzeadstore-main/supabase/migrations/20260422120000_update_uk_free_shipping_threshold.sql).

---

## 7. Order Creation & Markup Pricing — Deep Dive

### 7.1 The two RPCs that own the money

#### `calculate_checkout_pricing(p_items jsonb, p_country text)` — preview, no writes

Defined in [20260225113000_backend_checkout_pricing_rpc.sql](Bzeadstore-main/supabase/migrations/20260225113000_backend_checkout_pricing_rpc.sql); evolved through [20260305133000_align_checkout_pricing_with_listing_shipping.sql](Bzeadstore-main/supabase/migrations/20260305133000_align_checkout_pricing_with_listing_shipping.sql), [20260422150000_apply_uk_markup_to_calculate_checkout_pricing.sql](Bzeadstore-main/supabase/migrations/20260422150000_apply_uk_markup_to_calculate_checkout_pricing.sql), [20260514120000_fix_platform_commission_domestic_vs_intl.sql](Bzeadstore-main/supabase/migrations/20260514120000_fix_platform_commission_domestic_vs_intl.sql).

For each item it:

1. Resolves the **base price** — variant price if `sku` provided, else `products.default_selling_price` or `products.price`.
2. Looks up the buyer's **zone** via `geo_pricing_zones(country_variant → zone_code)`.
3. Applies the **markup**:
   * Zone-specific rule from `uk_geo_markup_rules` / `lightweight_markup_rules` (chosen by price band + weight tier), **or**
   * Stored `product_country_selling_prices.selling_price` for the destination.
4. Filters out items where `ships_internationally=false` and the buyer is outside the origin country (`ineligibleItems`).
5. Computes **platform commission** from `platform_commission_rules` (zone-specific overrides; UK = 0 % per [20260422170000_lightweight_markup_rules_and_uk_zero_commission.sql](Bzeadstore-main/supabase/migrations/20260422170000_lightweight_markup_rules_and_uk_zero_commission.sql); domestic vs intl split per [20260514120000](Bzeadstore-main/supabase/migrations/20260514120000_fix_platform_commission_domestic_vs_intl.sql)).
6. Looks up **shipping** (live Shiprocket/Shippo if possible, falls back to `international_shipping_rate_card` / `product_origin_destination_shipping_rates`).
7. Returns `{ base_subtotal, platform_commission_charge, shipping, total, items[], ineligible_items[] }`.

The frontend mirror is [Bzeadstore-main/src/lib/checkoutPricingService.ts](Bzeadstore-main/src/lib/checkoutPricingService.ts) → `calculateDestinationCheckoutPricing()`, used by Cart and `/checkout/review`.

#### `create_order_secure(...)` — atomic, idempotent, source of truth

Latest signature consolidates ~20 migrations. Inputs include `p_user_id`, `p_items`, `p_shipping_address`, `p_billing_address`, `p_phone`, `p_notes`, `p_payment_intent_id`, `p_payment_method`, `p_payment_status`, `p_order_status`, `p_currency`, `p_shipping_charge`, `p_actual_shipping_cost`, `p_platform_shipping_margin`, `p_fx_rate`, `p_idempotency_key`, `p_shipping_carrier`, `p_shipping_service_level`, `p_shipping_provider`, `p_shipping_rate_id`, `p_expected_delivery_date`, `p_expected_delivery_days`, `p_country`.

What it does, in order:

1. **Idempotency** — if `idempotency_key` already exists in `orders`, return the existing order.
2. **Item resolution** — for each `{product_id, quantity, sku?}` re-fetch the variant price, NEVER trusting client totals.
3. **Re-apply markup** — same logic as `calculate_checkout_pricing`, so the server never charges what the client said.
4. **Platform commission** — `platform_fee = subtotal × commission%` (+ extra). UK zone = 0 %.
5. **Seller earning** — `seller_earning = subtotal × (1 − commission%)`.
6. **Min-order enforcement** — trigger `enforce_checkout_min_order_value()` ([20260421200000_enforce_india_uk_min_order_value.sql](Bzeadstore-main/supabase/migrations/20260421200000_enforce_india_uk_min_order_value.sql), [20260511201000_add_india_route_min_order_rules.sql](Bzeadstore-main/supabase/migrations/20260511201000_add_india_route_min_order_rules.sql), [20260513120000_fix_min_order_trigger_markup_prices.sql](Bzeadstore-main/supabase/migrations/20260513120000_fix_min_order_trigger_markup_prices.sql), [20260514130000_fix_min_order_trigger_table_reference.sql](Bzeadstore-main/supabase/migrations/20260514130000_fix_min_order_trigger_table_reference.sql)) reads `checkout_min_order_rules(origin_iso2, destination_iso2, min_order_inr)`; raises if subtotal below threshold. India → all routes currently 2150 INR ([20260514180000](Bzeadstore-main/supabase/migrations/20260514180000_set_all_india_routes_min_order_2150.sql)).
7. **FX lock** — writes `orders.seller_currency`, `buyer_to_seller_fx_rate`, `seller_payout_total`, `platform_markup_total_inr`, `fx_locked_at` ([20260520120000_lock_order_fx_snapshot.sql](Bzeadstore-main/supabase/migrations/20260520120000_lock_order_fx_snapshot.sql)). After this point the seller payout is immune to FX drift.
8. **Inserts** `orders`, `order_items` (with `markup_percent` per line, dual buyer/seller unit prices per [20260511130000_add_dual_order_item_price_snapshots.sql](Bzeadstore-main/supabase/migrations/20260511130000_add_dual_order_item_price_snapshots.sql)), `order_cost_breakdown`.
9. **Decrement stock** — trigger from [20260410120000_decrement_stock_on_order.sql](Bzeadstore-main/supabase/migrations/20260410120000_decrement_stock_on_order.sql).
10. **Cleanup** — removes the source `cart_items`.
11. Returns `{ order_id, order_number, totals }`.

Key fix migrations to know about:
* [20260326100000_fix_order_total_and_seller_id.sql](Bzeadstore-main/supabase/migrations/20260326100000_fix_order_total_and_seller_id.sql)
* [20260329120000_fix_order_currency_to_inr.sql](Bzeadstore-main/supabase/migrations/20260329120000_fix_order_currency_to_inr.sql)
* [20260401100000_fix_order_currency_buyer_locale.sql](Bzeadstore-main/supabase/migrations/20260401100000_fix_order_currency_buyer_locale.sql)
* [20260401120000_fix_order_variant_pricing.sql](Bzeadstore-main/supabase/migrations/20260401120000_fix_order_variant_pricing.sql)
* [20260422160000_apply_uk_markup_to_create_order_secure.sql](Bzeadstore-main/supabase/migrations/20260422160000_apply_uk_markup_to_create_order_secure.sql)
* [20260512100000_fix_variant_aware_markup_pricing.sql](Bzeadstore-main/supabase/migrations/20260512100000_fix_variant_aware_markup_pricing.sql)

### 7.2 The markup price system end-to-end

#### Tables involved

| Table | Role |
|---|---|
| `products` | Holds `price`, `default_selling_price`, `mrp` ([20260426172000_add_default_and_country_selling_prices.sql](Bzeadstore-main/supabase/migrations/20260426172000_add_default_and_country_selling_prices.sql)), `origin_country_id`, `ships_internationally`. |
| `product_variants` | SKU-level price/weight/image; used to fetch per-variant markup. |
| `country_prices` (aka `product_country_selling_prices` in newer migrations) | Per-destination override: `selling_price`, `markup_percent`, `markup_mrp`. Trigger keeps `markup_percent = (selling_price/default_selling_price − 1) × 100`. |
| `uk_geo_markup_rules` | UK price-band + weight-tier matrix (e.g. ₹0–510 ≤250 g → 23 %). |
| `lightweight_markup_rules` | Generalised zone markup tiers ([20260422170000](Bzeadstore-main/supabase/migrations/20260422170000_lightweight_markup_rules_and_uk_zero_commission.sql)). |
| `geo_pricing_zones` | Maps buyer country → zone code; dependency removed from RPC code in [20260426203000](Bzeadstore-main/supabase/migrations/20260426203000_remove_geo_pricing_zones_dependency_from_rpcs.sql) but table kept. |
| `platform_commission_rules` | Price-band commission % + extra charge (with zone overrides). |
| `countries` | `exchange_rate` (USD pivot) used to convert any of the above to the buyer's display currency. |

#### Computation RPCs

* `get_public_product_prices(product_ids uuid[], country text)` — basic display pricing.
* `get_public_product_prices_with_overrides(product_ids uuid[], country text, price_overrides jsonb)` — variant-aware. Final consolidated logic in [20260426170000_enforce_product_markup_rates_public_prices.sql](Bzeadstore-main/supabase/migrations/20260426170000_enforce_product_markup_rates_public_prices.sql), [20260426171000_fix_public_price_override_parsing.sql](Bzeadstore-main/supabase/migrations/20260426171000_fix_public_price_override_parsing.sql), [20260502200000_sync_default_selling_price_and_fix_public_price_fallback.sql](Bzeadstore-main/supabase/migrations/20260502200000_sync_default_selling_price_and_fix_public_price_fallback.sql), [20260505220000_rpc_return_markup_mrp.sql](Bzeadstore-main/supabase/migrations/20260505220000_rpc_return_markup_mrp.sql), [20260512100000_fix_variant_aware_markup_pricing.sql](Bzeadstore-main/supabase/migrations/20260512100000_fix_variant_aware_markup_pricing.sql).

Both return `{ product_id, selling_price, public_unit_price, markup_mrp }`. The frontend treats `public_unit_price` as the headline price and `markup_mrp` as the strikethrough MRP.

#### Backfills & invariants

* [20260505200000_add_markup_fields_to_country_prices.sql](Bzeadstore-main/supabase/migrations/20260505200000_add_markup_fields_to_country_prices.sql) — adds `markup_percent`, `markup_mrp` columns.
* [20260505210000_backfill_markup_percent_and_mrp.sql](Bzeadstore-main/supabase/migrations/20260505210000_backfill_markup_percent_and_mrp.sql) — populates historical rows.
* [20260514174000_seed_india_origin_65_markup_for_target_countries.sql](Bzeadstore-main/supabase/migrations/20260514174000_seed_india_origin_65_markup_for_target_countries.sql) — default 65 % markup seed for India-origin products to target destinations.
* [20260430195000_enforce_product_currency_from_origin_country.sql](Bzeadstore-main/supabase/migrations/20260430195000_enforce_product_currency_from_origin_country.sql) — guarantees products are always priced in their origin country's currency.

#### UI surfaces

* **Seller-side input** — [BasicInfoPriceStep](Bzeadstore-main/src/pages/seller/steps/BasicInfoPriceStep.tsx) collects `mrp`, `price`, `stock`, `isCodAvailable`, origin currency (locked to seller's country), HSN (resolved from category tree per [20260316150000_expand_categories_and_hsn.sql](Bzeadstore-main/supabase/migrations/20260316150000_expand_categories_and_hsn.sql) + [20260316170000_complete_level3_and_8digit_hsn.sql](Bzeadstore-main/supabase/migrations/20260316170000_complete_level3_and_8digit_hsn.sql)).
* **Admin per-country pricing** — [ProductManagement](Bzeadstore-main/src/pages/admin/modules/ProductManagement.tsx) opens a modal listing all `countries`; for each row admin can set `selling_price` and the trigger auto-derives `markup_percent` + `markup_mrp`.
* **Buyer display** — [ProductCard](Bzeadstore-main/src/components/products/ProductCard.tsx), [ProductDetailsPage](Bzeadstore-main/src/pages/ProductDetailsPage.tsx), and the cart all call `fetchPublicProductPrices()` then run amounts through `CurrencyContext.formatPrice()`.

---

## 8. Product Details Page & Reviews

### 8.1 `ProductDetailsPage`

File: [Bzeadstore-main/src/pages/ProductDetailsPage.tsx](Bzeadstore-main/src/pages/ProductDetailsPage.tsx). Reached at `/products/:productId`. What it renders, in order:

1. **Breadcrumb** + back nav.
2. **Image gallery** — `product.images[]` driven by an `activeImage` index; click-to-zoom on desktop, swipe on mobile. Color-swatch chips infer hex from variant names.
3. **Title, brand, condition badge** — `products.product_condition` ([20260417100000_add_product_condition_support.sql](Bzeadstore-main/supabase/migrations/20260417100000_add_product_condition_support.sql)).
4. **Sponsored badge** if the product is in any active `sponsored_products` row.
5. **Pricing block** — calls `fetchPublicProductPrices([productId], country)` from [pricingService.ts](Bzeadstore-main/src/lib/pricingService.ts) on mount; shows `publicUnitPrice` as headline, `markupMrp` as strikethrough, plus a "% off" pill. Currency is applied by `CurrencyContext.formatPrice()`.
6. **Variant selector** — reads `product_variants` (created [20260304124500_add_product_variant_sku_uniqueness.sql](Bzeadstore-main/supabase/migrations/20260304124500_add_product_variant_sku_uniqueness.sql), images + weight [20260320120000_variant_images_and_weight.sql](Bzeadstore-main/supabase/migrations/20260320120000_variant_images_and_weight.sql)). Selecting a color/size:
   * Swaps to that variant's `image_url`.
   * Re-calls `get_public_product_prices_with_overrides` with the variant price as the override so the markup is recomputed (per [20260512100000](Bzeadstore-main/supabase/migrations/20260512100000_fix_variant_aware_markup_pricing.sql)).
7. **Stock & quantity** — `products.stock_quantity` capped quantity picker.
8. **Delivery estimate** — `<DeliveryEstimate />` (see 8.2).
9. **Add to Cart / Buy Now / Wishlist** — `useCart().addToCart()` and `useWishlist().toggle()`. A `flyToCart` animation ([Bzeadstore-main/src/utils/flyToCart.ts](Bzeadstore-main/src/utils/flyToCart.ts)) flies the image to the cart icon.
10. **Return policy** — fetched per product (from the seller's return-policy step); displays return window & conditions.
11. **Specifications & description** — from `product_item_measurements` ([20260308112000_add_product_item_measurements.sql](Bzeadstore-main/supabase/migrations/20260308112000_add_product_item_measurements.sql)) and listing content columns ([20260502181000_add_product_listing_content_columns.sql](Bzeadstore-main/supabase/migrations/20260502181000_add_product_listing_content_columns.sql)).
12. **Share buttons** — copy link, native share sheet (mobile), social buttons. Public OG cards are generated server-side by the [product-og](Bzeadstore-main/supabase/functions/product-og) Edge Function and the build-time generator [scripts/generate-share-pages.mjs](Bzeadstore-main/scripts/generate-share-pages.mjs). The `/share/:slug` route falls back to a client-side `<Navigate>` to `/products/:slug`.
13. **Reviews** (see 8.3).
14. **Similar / related products** — call into `productService` (uses the FTS column from [20260513100000_full_text_search_products.sql](Bzeadstore-main/supabase/migrations/20260513100000_full_text_search_products.sql) + category match).

### 8.2 Delivery estimate

* **Hook:** [useDeliveryEstimate](Bzeadstore-main/src/hooks/useDeliveryEstimate.ts) — inputs `productId, userId, originCountry, shipsInternationally, sellerId, weightKg`. Exposes saved-address picker, manual-pincode entry, `selectAddress`, `setPincode`, `setCountry`, `checkDelivery`, plus state for `tat`, `serviceability`, `loading`, `error`.
* **Component:** [DeliveryEstimate](Bzeadstore-main/src/components/products/DeliveryEstimate.tsx) — UI for the picker + "Use current location" button (calls `reverseGeolocate()` from [locationService](Bzeadstore-main/src/lib/locationService.ts)).
* **Service:** [tatService](Bzeadstore-main/src/lib/tatService.ts) → `fetchProductTat(productId, sellerId, weightKg, buyerAddress, destinationCountry)`. Logic: India→India hits Shiprocket TAT endpoint; cross-border calls Shippo rates; final fallback queries `product_origin_destination_shipping_rates` or `international_shipping_rate_card`.

### 8.3 Reviews

* **Table:** `reviews` — see [20260412100000_add_benefits_to_reviews.sql](Bzeadstore-main/supabase/migrations/20260412100000_add_benefits_to_reviews.sql). Columns include `product_id`, `user_id`, `rating` (1–5), `heading`, `text`, `images[]`, `benefits[]`, `created_at`.
* **Write flow:** [/products/:productId/review](Bzeadstore-main/src/pages/user/WriteReview.tsx). Form requires star rating, heading, body; optional images (uploaded via [imageUpload](Bzeadstore-main/src/utils/imageUpload.ts)); selectable benefit tags; terms acceptance.
* **Read flow:** the product page fetches reviews + aggregate rating and renders a list (reviewer name, stars, heading, body, images, benefits). RLS: anyone can read; only the author or admin can write/update.

---

## 9. Admin Console — Every Module

### 9.1 Layout & navigation

* [AdminLayout](Bzeadstore-main/src/pages/admin/AdminLayout.tsx) — wraps every `/admin/*` route. Renders [AdminSidebar](Bzeadstore-main/src/pages/admin/components/AdminSidebar.tsx) + [AdminHeader](Bzeadstore-main/src/pages/admin/components/AdminHeader.tsx) + `<Outlet />`.
* Status pills live in [StatusIndicators](Bzeadstore-main/src/pages/admin/components/StatusIndicators.tsx).
* All admin routes are excluded from the buyer Android build via the `isBuyerApp` guard in [App.tsx](Bzeadstore-main/src/App.tsx).
* Admin entry is **only** through `/seller/login` (admin & seller share the login form). `/admin/login` redirects there.

### 9.2 Modules

| URL | File | What it does | Backend touched |
|---|---|---|---|
| `/admin` | [AdminOverview](Bzeadstore-main/src/pages/admin/modules/AdminOverview.tsx) | KPI dashboard (users, sellers, products, orders, revenue, pending KYC). | `profiles`, `products`, `orders`, RPC `get_account_summary` ([20260406100000_platform_transactions_and_views.sql](Bzeadstore-main/supabase/migrations/20260406100000_platform_transactions_and_views.sql)) |
| `/admin/sellers` | [SellerManagement](Bzeadstore-main/src/pages/admin/modules/SellerManagement.tsx) | Seller list with search, KYC filter, badges. Approve / reject / ban. | `profiles(role='seller')`, `seller_kyc`, RPCs `admin_update_seller_kyc`, `admin_update_seller_badge` ([20260407110000](Bzeadstore-main/supabase/migrations/20260407110000_admin_secure_rpcs.sql)) |
| `/admin/seller-kyc` | [SellerKYCSubmissionManagement](Bzeadstore-main/src/pages/admin/modules/SellerKYCSubmissionManagement.tsx) | View KYC submissions: docs, tax, bank, address. Approve/reject with reason. | `seller_kyc`, `kyc-documents` storage bucket; admin RLS [20260222113000](Bzeadstore-main/supabase/migrations/20260222113000_fix_seller_kyc_admin_rls.sql) |
| `/admin/products` | [ProductManagement](Bzeadstore-main/src/pages/admin/modules/ProductManagement.tsx) | List with approval filter, category filter, search; per-country pricing modal. | `products`, `categories`, `country_prices`, `countries`; approval enforced by [20260222124000_enforce_admin_product_approval.sql](Bzeadstore-main/supabase/migrations/20260222124000_enforce_admin_product_approval.sql); auto-activate on approve [20260325120000](Bzeadstore-main/supabase/migrations/20260325120000_auto_activate_on_approval.sql) |
| `/admin/variants` | [ProductVariantManagement](Bzeadstore-main/src/pages/admin/modules/ProductVariantManagement.tsx) | CRUD variants (color/size/SKU/weight/images), bulk upload. | `product_variants`, product images bucket |
| `/admin/orders` | [OrderManagement](Bzeadstore-main/src/pages/admin/modules/OrderManagement.tsx) | Order list/filters + detail panel. Create Shiprocket/Shippo shipments, generate labels/manifests, cancel, refund label, track, NDR re-attempt, returns. | `orders`, `order_items`, `order_returns`, `order_cancellations`, `shiprocket_shipments`, `shippo_shipments`, edge fns [shiprocket-ops](Bzeadstore-main/supabase/functions/shiprocket-ops), [shippo-ops](Bzeadstore-main/supabase/functions/shippo-ops); buckets `shipping-labels` |
| `/admin/complaints` | [ComplaintManagement](Bzeadstore-main/src/pages/admin/modules/ComplaintManagement.tsx) | Triage complaints (status, category, resolution notes). | `complaints` table |
| `/admin/accounts` | [AccountsManagement](Bzeadstore-main/src/pages/admin/modules/AccountsManagement.tsx) | Financial dashboard: transactions, seller payouts, manual payouts, platform profit, commission rule editor. | `platform_transactions` + views ([20260406100000](Bzeadstore-main/supabase/migrations/20260406100000_platform_transactions_and_views.sql), currency fix [20260406120000](Bzeadstore-main/supabase/migrations/20260406120000_fix_account_rpcs_currency_and_daterange.sql)); `seller_wallets`, `seller_settlements`, `manual_payouts` ([20260409120000](Bzeadstore-main/supabase/migrations/20260409120000_manual_payouts.sql), [20260409130000](Bzeadstore-main/supabase/migrations/20260409130000_fix_manual_payouts_zero_hardcoding.sql)); `platform_commission_rules` |
| `/admin/reports` | [ReportsManagement](Bzeadstore-main/src/pages/admin/modules/ReportsManagement.tsx) | Sales / inventory / customer reports with CSV export. | Aggregates over `orders`, `products`, `profiles` |
| `/admin/admins` | [AdminManagement](Bzeadstore-main/src/pages/admin/modules/AdminManagement.tsx) | Promote / demote admins. | `profiles(role='admin')`, RPCs `admin_promote_user`, `admin_demote_user` ([20260407110000](Bzeadstore-main/supabase/migrations/20260407110000_admin_secure_rpcs.sql)) |
| `/admin/profile` | [ProfilePage](Bzeadstore-main/src/pages/admin/modules/ProfilePage.tsx) | Edit own admin profile / password. | `profiles` (own row) |
| `/admin/settings` | [SettingsPage](Bzeadstore-main/src/pages/admin/modules/SettingsPage.tsx) | Platform-wide settings (site name, logo, socials, min-order toggles per [20260421213000_min_order_rule_backend_config.sql](Bzeadstore-main/supabase/migrations/20260421213000_min_order_rule_backend_config.sql)). | `platform_settings`, `checkout_min_order_rules` |
| `/admin/notifications` | [NotificationsPage](Bzeadstore-main/src/pages/admin/modules/NotificationsPage.tsx) | Notification preferences + sent log. | `notifications`, `notification_preferences` ([20260411100000_add_notification_preferences_to_profiles.sql](Bzeadstore-main/supabase/migrations/20260411100000_add_notification_preferences_to_profiles.sql)), `device_push_tokens` |
| `/admin/sponsored-products` | [SponsoredProductsManagement](Bzeadstore-main/src/pages/admin/modules/SponsoredProductsManagement.tsx) | Add/remove products in sponsored sections (featured/trending/hot-deals). | `sponsored_products`, RPCs `admin_replace_sponsored_section_rpc` ([20260222041000](Bzeadstore-main/supabase/migrations/20260222041000_admin_replace_sponsored_section_rpc.sql)), `admin_delete_sponsored_section_rpc` ([20260328170000](Bzeadstore-main/supabase/migrations/20260328170000_admin_delete_sponsored_section_rpc.sql)), `admin_add/remove_sponsored` ([20260328190000](Bzeadstore-main/supabase/migrations/20260328190000_sponsored_add_remove_rpcs.sql)) |
| `/admin/banners` | [BannerManagement](Bzeadstore-main/src/pages/admin/modules/BannerManagement.tsx) | Create/edit/delete hero, ad-slot (1-3), and video banners; upload media. | `banners`, buckets `hero-banners`, `ad-banners`, `video-ads`; ad-slot limits [20260408220000](Bzeadstore-main/supabase/migrations/20260408220000_fix_banner_rls_and_slot_limit.sql); video URL check [20260409100000](Bzeadstore-main/supabase/migrations/20260409100000_video_url_check_and_rls_merge.sql) |
| `/admin/categories` | [CategoryManagement](Bzeadstore-main/src/pages/admin/modules/CategoryManagement.tsx) | 3-level category tree + HSN mapping. | `categories`, `category_hsn_codes` (admin RLS [20260502210000_add_admin_rls_to_category_hsn_codes.sql](Bzeadstore-main/supabase/migrations/20260502210000_add_admin_rls_to_category_hsn_codes.sql)) |
| `/admin/search` | [SearchManagement](Bzeadstore-main/src/pages/admin/modules/SearchManagement.tsx) | Configure search keywords / FTS settings. | `user_search_history`, FTS index from [20260513100000](Bzeadstore-main/supabase/migrations/20260513100000_full_text_search_products.sql) |
| `/admin/audit-logs` | [AuditLogs](Bzeadstore-main/src/pages/admin/modules/AuditLogs.tsx) | Admin action audit trail with filters. | `audit_logs` |
| `/admin/health` | [SystemHealth](Bzeadstore-main/src/pages/admin/modules/SystemHealth.tsx) | DB / edge / cache status. | Supabase health endpoints |
| `/admin/addresses` | [AdminAddressManagement](Bzeadstore-main/src/pages/admin/components/AdminAddressManagement.tsx) | Manage countries / zones (delivery + pricing). | `countries`, `shipping_origin_zones`, `geo_pricing_zones`, address types lookup [20260420120000](Bzeadstore-main/supabase/migrations/20260420120000_address_types_lookup.sql) |
| `/admin/shipping-management` | [ShippingManagementPage](Bzeadstore-main/src/pages/admin/modules/ShippingManagementPage.tsx) | CRUD `product_origin_destination_shipping_rates`. | Above table + `countries` |
| `/admin/intl-rates` | [IntlRateCardPage](Bzeadstore-main/src/pages/admin/modules/IntlRateCardPage.tsx) | CRUD `international_shipping_rate_card`. | Above table + `countries` |

### 9.3 `adminService.ts` — function index

[Bzeadstore-main/src/lib/adminService.ts](Bzeadstore-main/src/lib/adminService.ts) is the single client wrapper around admin-only operations. Notable functions:

* Sellers: `getAllSellers`, `updateSellerKYC`, `updateSellerBadge`
* Users: `getAllUsers`, `banUser`, `unbanUser`, `deleteUser`
* Products: `getAllProducts`, `approveProduct`, `rejectProduct`, `toggleProductStatus`, `setCountryPrice`
* Orders: `getAllOrders`, `updateOrderStatus`
* Banners: `getAllBanners`, `createBanner`, `updateBanner`, `deleteBanner`
* Sponsored: `getSponsoredProductsBySection`, `addSponsoredProducts`, `removeSponsoredProduct`
* Audit / accounts: `getAuditLogs`, `getAccountSummary`, `getSellerWalletBalance`

### 9.4 Admin-only RPCs (security)

All listed below run as `SECURITY DEFINER` and gate execution behind an `is_admin()` helper. Source: [20260407110000_admin_secure_rpcs.sql](Bzeadstore-main/supabase/migrations/20260407110000_admin_secure_rpcs.sql) + sponsored-section RPCs.

* `admin_promote_user(p_user_id uuid)`
* `admin_demote_user(p_user_id uuid)`
* `admin_update_seller_kyc(p_seller_id uuid, p_status text, p_reason text)`
* `admin_update_seller_badge(p_seller_id uuid, p_badge text)`
* `admin_replace_sponsored_section_rpc(...)`
* `admin_delete_sponsored_section_rpc(...)`
* `admin_add_sponsored_product`, `admin_remove_sponsored_product`

Additional security hardening: [20260402200000_financial_security_hardening.sql](Bzeadstore-main/supabase/migrations/20260402200000_financial_security_hardening.sql), [20260402210000_production_hardening.sql](Bzeadstore-main/supabase/migrations/20260402210000_production_hardening.sql), [20260420130000_fix_security_advisor_warnings.sql](Bzeadstore-main/supabase/migrations/20260420130000_fix_security_advisor_warnings.sql).

---

## 10. How to Trace Any Feature (cheat sheet)

1. **Find the URL** in [Bzeadstore-main/src/App.tsx](Bzeadstore-main/src/App.tsx) `<Routes>` block → page file.
2. **Find the data calls** in the page → service module under `src/lib/`.
3. **Find the backend**:
   * If the service calls `supabase.from('xyz')` → check the SQL definition in [Bzeadstore-main/supabase/migrations](Bzeadstore-main/supabase/migrations) (filenames are date-sorted).
   * If it calls `supabase.rpc('name', …)` → search migrations for `CREATE OR REPLACE FUNCTION name`.
   * If it calls `supabase.functions.invoke('name', …)` → open [Bzeadstore-main/supabase/functions/<name>](Bzeadstore-main/supabase/functions).
4. **Check RLS** — every table has a corresponding `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policies in the same or a later migration. Hardening migrations are dated 2026-04-02 and 2026-04-07.
5. **Check tests** under `src/__tests__/` for the expected behaviour.

---

## 11. Variant-Driven Pricing (2026-05-20 refactor)

> Commit: `e962957` — "feat(seller): move MRP/Sell/Stock entry to variant rows; derive product cols from cheapest variant"

### Rule

**`product_variants` is the single source of truth for MRP, Selling Price and Stock.**
The legacy columns `products.{price, mrp, stock}` are still written (RPCs and reports depend on them) but they are **derived** automatically from the variant rows on every create / draft-save / edit. Sellers never type them directly anymore.

### What was removed from the UI

* [Bzeadstore-main/src/pages/seller/steps/BasicInfoPriceStep.tsx](Bzeadstore-main/src/pages/seller/steps/BasicInfoPriceStep.tsx)
  * Removed the 3-column **MRP / Selling Price / Stock** input block from Step 1 of the create-product wizard.
  * Replaced with an info `<p>` directing the seller to enter pricing under **Variant Rows** on Step 2.
  * `BasicInfoPriceData` interface keeps `mrp/price/stock: string` fields for backwards compatibility with parent state (now unused).

* [Bzeadstore-main/src/pages/seller/SellerProductListing.tsx](Bzeadstore-main/src/pages/seller/SellerProductListing.tsx) — edit-product dialog "Pricing & Stock" section: removed MRP/Sell/Stock inputs; kept readonly Origin Country + hint paragraph.

### Where pricing is entered now

[Bzeadstore-main/src/pages/seller/steps/ProductDetailsStep.tsx](Bzeadstore-main/src/pages/seller/steps/ProductDetailsStep.tsx) — **Variant Rows** grid (4 columns):

| SKU | Selling Price | MRP | Stock |
|---|---|---|---|

* `VariantCombination` interface includes `mrp: string`.
* `syncCombinations()` is the Cartesian product of `sizeVariants[] × colorVariants[]`.
* **Default fallback** — if the seller adds no sizes and no colors, `syncCombinations()` produces a single row of `DEFAULT × DEFAULT`. That row's price/MRP/stock become the product's base values. **No schema change** was needed; the existing fallback is leveraged.

### Derivation rules applied on every save

In all three save paths in [SellerProductListing.tsx](Bzeadstore-main/src/pages/seller/SellerProductListing.tsx) (`handleCreateProduct`, `handleUpdateProduct`, draft auto-save via `handleSaveDetailsAndNext`) **and** in [Bzeadstore-main/src/lib/productService.ts](Bzeadstore-main/src/lib/productService.ts) `saveProductDraftDetails`:

```
derivedPrice = MIN(variantRows.price)               // cheapest variant
derivedMrp   = MIN(variantRows.mrp) || derivedPrice // cheapest variant's MRP
derivedStock = SUM(variantRows.stock)
```

These overwrite `products.{price, mrp, default_selling_price, stock}` on every write.

### Validation

* **Step 1 → Next:** only `name` + `categoryId` are required. The legacy `mrp/price/stock` requirement and the `price > mrp` check were removed (now per-row).
* **Step 2 → Next** ([SellerProductListing.tsx](Bzeadstore-main/src/pages/seller/SellerProductListing.tsx) `handleSaveDetailsAndNext`):
  * If `productDetails.variantCombinations` is empty, shows:
    > _Click the 'Generate Variant Combinations' button below, then fill SKU, Selling Price, MRP and Stock for each row before continuing._
  * Per-row validator `hasInvalidRows`: each row must have positive `sku`, `price > 0`, `mrp > 0`, `stock >= 0`, and `price <= mrp`.

### Backend untouched

Per directive **"DONT TOUCH THE WIRED BACKEND DB TABLE COLOUMNS"**:

* `products` table columns unchanged.
* `product_variants` table unchanged. `variant_type` CHECK constraint still `'size' | 'color' | 'combination'`.
* RPC `get_public_product_prices_with_overrides` in [20260520130000_cleanup_legacy_markup_tables.sql](Bzeadstore-main/supabase/migrations/20260520130000_cleanup_legacy_markup_tables.sql) unchanged. Its `min_variant` CTE = `MIN(pv.price) per product` continues to work because variant rows are now always populated.

### Pre-refactor data audit (Stage A, prior session)

Verified against pooler `aws-1-ap-southeast-1.pooler.supabase.com:6543`:

* 1,004 / 1,004 products have `price > 0` and `mrp > 0`.
* 3,144 / 3,144 variants have `price > 0`, `mrp > 0`, `id` and `sku`.
* 0 duplicate SKUs.

### Deferred work (NOT done — tracked for follow-up)

1. **PDP** — gate `addToCart` on `validateVariantSelection()` with a toast when the buyer hasn't picked a size/colour.
2. **CartContext** — add `selectedVariantId?: string | null` to `CartItem`, include it in `buildCartItemId`, write it to `cart_items.selected_variant_id`, and pass it through to order/checkout payloads.
3. **RPC** — derive `markup_mrp` from `product_variants.mrp` directly instead of scaling `products.mrp` proportionally.
4. **PDP override** — pass `variant.mrp` alongside `variant.price` to the RPC overrides.

### Files changed in commit `e962957`

| File | Change |
|---|---|
| [Bzeadstore-main/src/pages/seller/steps/BasicInfoPriceStep.tsx](Bzeadstore-main/src/pages/seller/steps/BasicInfoPriceStep.tsx) | Removed Section-1 MRP/Sell/Stock inputs; added info hint |
| [Bzeadstore-main/src/pages/seller/steps/ProductDetailsStep.tsx](Bzeadstore-main/src/pages/seller/steps/ProductDetailsStep.tsx) | (prior Stage B1) MRP column in variant grid |
| [Bzeadstore-main/src/pages/seller/SellerProductListing.tsx](Bzeadstore-main/src/pages/seller/SellerProductListing.tsx) | Create + Update + Draft paths derive price/mrp/stock from cheapest variant; new validation message; edit dialog pricing UI cleaned |
| [Bzeadstore-main/src/lib/productService.ts](Bzeadstore-main/src/lib/productService.ts) | `saveProductDraftDetails` derives `products.{price, mrp, default_selling_price, stock}` from `variantRows` |

---

_Last updated: 2026-05-20. When you change a table, RPC or core flow, update the corresponding section above so this stays the single onboarding entry point._
