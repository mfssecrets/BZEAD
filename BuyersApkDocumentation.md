# Bzead Buyer Android App — Complete Documentation (Capacitor)

**Document version:** 2.0 (supersedes the "planning" version in [`CAPACITORBUYERAPP.MD`](CAPACITORBUYERAPP.MD))
**Last updated:** 2026-08-20
**Project folder:** [`bzead-android/`](bzead-android/)
**Package / Application ID:** `com.bzead.app`
**App name:** Bzead
**Current version:** `versionCode 3` / `versionName "1.0.2"` ([android/app/build.gradle](bzead-android/android/app/build.gradle))
**Web source it wraps:** [`Bzeadstore-main/`](Bzeadstore-main/) buyer build (`npm run build:buyer` → `dist-buyer/`)

This document describes the **buyer-facing Android app** exactly as it is built today — not as originally planned. Every native behavior, every place the Android app differs visually/functionally from the website, and every bug fix applied specifically for this app is listed here.

---

## 1. What this app actually is

It is **not** a separate codebase. It is a thin native **Capacitor** shell (`bzead-android/android`) that loads the *same* React/Vite web app used at `www.bzead.com` — but built in **buyer-only mode** (`VITE_APP_MODE=buyer`), which strips out all seller/admin routes at build time.

```
┌─────────────────────────────────────────────┐
│  Android app (com.bzead.app)                 │
│  ┌─────────────────────────────────────────┐ │
│  │ Capacitor Bridge (WebView, https://…)    │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  Bzeadstore-main React app           │ │ │
│  │  │  (built with VITE_APP_MODE=buyer)    │ │ │
│  │  │  → dist-buyer/  → bundled as assets  │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────┘ │
│  Native plugins: back button, pull-to-refresh,│
│  geolocation, share, filesystem, browser,      │
│  splash screen, status bar, OneSignal push     │
└─────────────────────────────────────────────┘
```

There is **no duplicated business logic** — pricing, cart, checkout, auth, order flows, etc. all come from the exact same React source as the website. The only differences are:
1. A **buyer-only route/UI subset** (seller & admin code is compiled out).
2. A layer of `isNativePlatform` conditionals inside the shared React code that changes rendering/behavior *only* when running inside this app.
3. A handful of native Android plugins/wiring described in this document.

Related untouched projects (do **not** confuse with this app):
- [`BZEAD-iOS-main/`](BZEAD-iOS-main/) — separate native Swift iOS app (not Capacitor).
- [`BZEAD-APK-main/`](BZEAD-APK-main/) — legacy/older Android project, unrelated to this one.

---

## 2. Buyer pages included in this app

Because the build uses `VITE_APP_MODE=buyer`, only the buyer route tree from [`Bzeadstore-main/src/App.tsx`](Bzeadstore-main/src/App.tsx) is reachable. Seller (`/seller/*`) and Admin (`/admin/*`) routes are **not** included in the buyer app's UI — see §3 for exactly what happens if one is hit.

| Route | Page component | Notes |
|---|---|---|
| `/` | `RootEntry` → `BzeadHomePage` | Storefront home |
| `/products/section/:section` | `SectionProducts` | e.g. featured, hot-deals |
| `/products/:productId` | `ProductDetailsPage` | Product detail + variants |
| `/category/:categoryId` | `CategoryProducts` | Category listing |
| `/share/:slug` | `ShareRedirect` | Deep-link redirect for shared product links |
| `/privacy-policy`, `/terms-of-service`, `/shipping-policy`, `/refund-policy`, `/terms-and-conditions`, `/about`, `/contact` | Static info pages | Same content as web |
| `/login`, `/signup` | `Login`, `Signup` (role="user") | Buyer auth |
| `/otp-verification`, `/new-password`, `/forgot-password` | Auth flow pages | |
| `/orders` | `MyOrders` | Order history |
| `/orders/:orderId` | `OrderDetails` | Order detail |
| `/notifications` | `Notifications` | In-app notifications |
| `/wishlist` | `Wishlist` | |
| `/cart` | `Cart` | |
| `/settings` | `Settings` | |
| `/profile` | `Profile` | |
| `/products/:productId/review` | `WriteReview` | |
| `/user/addresses` | `AddressManagement` | |
| `/checkout/shipping` | `ShippingAddress` | Checkout step 1 |
| `/checkout/review` | `OrderSummary` | Checkout step 2 |
| `/checkout/payment` | `Checkout` | Checkout step 3 — Stripe payment |
| `/checkout/confirmation` | `OrderConfirmation` | Success/failure screen |
| `/seller`, `/seller/*` | `ExternalSellerRedirect` | **Not a real page in the app** — see §3.5 |
| `*` (fallback) | `NotFound` | |

---

## 3. Every place the Android app behaves/looks different than the website

All of this is controlled by a single flag: [`isNativePlatform`](Bzeadstore-main/src/mobile/nativePlatform.ts) (`Capacitor.isNativePlatform()`), imported wherever the behavior needs to branch. **Nothing here is a separate codebase fork — it's the same files, conditionally rendered.**

### 3.1 Header & bottom navigation
- [`Header.tsx`](Bzeadstore-main/src/components/layout/Header.tsx): on native, in-app links are intercepted (`if (!isNativePlatform) return;` lets web `<Link>` navigate normally) so navigation always stays inside the single WebView/history stack instead of doing a full page reload.
- [`MobileNav.tsx`](Bzeadstore-main/src/components/layout/MobileNav.tsx): this bottom tab bar (Home / Orders / Notifications / Profile) **only renders inside the native buyer app** (`if (!isNativePlatform || isSellerApp) return null;`). It never shows on the website, regardless of screen size.
- [`Footer.tsx`](Bzeadstore-main/src/components/layout/Footer.tsx): the website footer is **hidden entirely** on native (`if (isNativePlatform) return null;`) — there's no room/need for it above the native bottom nav.
- [`WelcomeBackBar.tsx`](Bzeadstore-main/src/components/layout/WelcomeBackBar.tsx): the "welcome back" banner shown on web is **hidden** on native.
- [`Login.tsx`](Bzeadstore-main/src/components/auth/Login.tsx) / [`Signup.tsx`](Bzeadstore-main/src/components/auth/Signup.tsx): the shared `Header`/`MobileNav` chrome is only added around the auth forms **on native** (`{isNativePlatform && <Header />}` / `{isNativePlatform && <MobileNav />}`) — the web auth pages use their own dedicated layout.
- [`BuyerAuthLayout.tsx`](Bzeadstore-main/src/components/auth/BuyerAuthLayout.tsx): applies different inline spacing/safe-area styles on native.

### 3.2 Cart page layout
[`Cart.tsx`](Bzeadstore-main/src/pages/user/Cart.tsx) has several native-only layout overrides so it behaves like a fixed native screen instead of a scrolling web page:
- Root container: `height: 100dvh; overflow: hidden` on native (web scrolls normally).
- Content area: `flex:1; minHeight:0; overflowY:auto` on native (turns it into an internal scroll pane so the header/footer stay pinned).
- Product thumbnails are smaller on native (`62×62px` vs `78–100px` responsive on web) to fit more on a small phone screen.

### 3.3 Checkout / payment page (biggest set of native-only differences)
[`Checkout.tsx`](Bzeadstore-main/src/pages/user/Checkout.tsx) — same Stripe Elements/PaymentElement checkout as web, but:
- **Wallets hidden:** `wallets: { applePay: 'never', googlePay: 'never' }` is passed to `PaymentElement` only on native — the web's Payment Request API isn't wired to native Apple/Google Pay inside a WebView, so those buttons would be inert if shown.
- **Redirect-based payment methods disabled:** the client tags every `create-payment-intent` request with `client: 'native'` ([`stripeService.ts`](Bzeadstore-main/src/lib/stripeService.ts)). The [Supabase edge function](Bzeadstore-main/supabase/functions/create-payment-intent/index.ts) responds by setting `automatic_payment_methods.allow_redirects = 'never'` for native requests — a full-page off-site redirect (e.g. some UPI flows) could never return to `https://localhost` inside the WebView, so those methods are excluded up front. Card payments (with 3-D Secure) remain fully available.
- **`return_url` differs:** native uses `https://localhost/checkout/confirmation` (the Capacitor WebView's own origin) instead of the public `https://www.bzead.com/checkout/confirmation` used on web.

### 3.4 Everything else
| File | Native-only behavior |
|---|---|
| [`NewPassword.tsx`](Bzeadstore-main/src/pages/NewPassword.tsx), [`NotFound.tsx`](Bzeadstore-main/src/pages/NotFound.tsx), [`ForgotPassword.tsx`](Bzeadstore-main/src/pages/user/ForgotPassword.tsx), [`OTPVerification.tsx`](Bzeadstore-main/src/pages/OTPVerification.tsx) | Add the shared `Header` on native only (web pages have their own layout) |
| [`MyOrders.tsx`](Bzeadstore-main/src/pages/user/MyOrders.tsx) | Some web-only UI (e.g. a promo/marketing block) is hidden on native (`{!isNativePlatform && (...)}`) |
| [`PushNotificationSettings.tsx`](Bzeadstore-main/src/components/settings/PushNotificationSettings.tsx) | Hidden on native — push opt-in/out is handled by the OS notification permission + OneSignal, not the web-push UI used on desktop browsers |
| [`locationService.ts`](Bzeadstore-main/src/lib/locationService.ts) | Uses `@capacitor/geolocation` native permission/API on native instead of the browser Geolocation API |
| [`oneSignalWeb.ts`](Bzeadstore-main/src/lib/oneSignalWeb.ts) / [`webPush.ts`](Bzeadstore-main/src/lib/webPush.ts) | Both **disable themselves** on native (`if (isNativePlatform) return`) — push is instead handled by [`nativePushNotifications.ts`](Bzeadstore-main/src/mobile/nativePushNotifications.ts) via the OneSignal native SDK |
| [`nativeFileInputBridge.ts`](Bzeadstore-main/src/mobile/nativeFileInputBridge.ts) | Intercepts `<input type="file">` on native so image pickers use the native camera/gallery chooser instead of the WebView's default (often broken/limited) file picker |
| [`nativeBootstrap.ts`](Bzeadstore-main/src/mobile/nativeBootstrap.ts) | Tags `<html>`/`<body>` with `native-app` / `native-android` CSS classes (native only) so stylesheets can target the native shell without touching the web build |
| [`externalLinks.ts`](Bzeadstore-main/src/mobile/externalLinks.ts) | `window.open(_blank)` is silently swallowed by the Capacitor WebView, so all "open in new tab" links are routed through `Browser.open()` (in-app Chrome Custom Tab) on native, `window.open` on web |
| [`invoicePdf.ts`](Bzeadstore-main/src/utils/invoicePdf.ts) | Generated invoice PDFs are saved to device storage + a native Share sheet is opened on native, vs. a normal browser download on web |
| [`authEnv.ts`](Bzeadstore-main/src/utils/authEnv.ts) | Auth redirect URLs point at the app's own local origin on native instead of the public web domain |
| [`AdminOverview.tsx`](Bzeadstore-main/src/pages/admin/modules/AdminOverview.tsx) | Defensive `isNativePlatform` guard — admin isn't part of the buyer app anyway, this exists in case the shared bundle is ever loaded natively |

### 3.5 "Become a Seller" flow
The buyer app has **no seller UI**. Any seller entry point (`/seller`, `/seller/*`) is rendered as `ExternalSellerRedirect`, which — on native — calls `Browser.open()` to send the user to the **public website's** seller registration/dashboard in an in-app browser tab, instead of trying to render seller pages inside the buyer app's WebView. This keeps the Play Store listing strictly "buyer app" while still letting a buyer become a seller without leaving the app entirely.

---

## 4. Native Android features (plugins & wiring)

| Feature | Implementation | Files |
|---|---|---|
| Hardware back button | Custom Capacitor plugin `BzeadBackButton` — if WebView history can go back, does so; otherwise shows an exit confirmation instead of silently killing the app | [`src/BzeadBackButton.ts`](bzead-android/src/BzeadBackButton.ts), `BzeadBackButtonPlugin.java` |
| Pull-to-refresh | Custom Capacitor plugin `BzeadPullToRefresh` — native Android `SwipeRefreshLayout`-style pull gesture reloads the current route; can be toggled off per-screen via `BzeadPullToRefresh.setEnabled({ enabled })` | [`src/BzeadPullToRefresh.ts`](bzead-android/src/BzeadPullToRefresh.ts), `BzeadPullToRefreshPlugin.java` |
| Geolocation | `@capacitor/geolocation` — requests `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | `AndroidManifest.xml`, [`locationService.ts`](Bzeadstore-main/src/lib/locationService.ts) |
| Camera / image picker | `@capacitor/filesystem` + native file chooser via `nativeFileInputBridge.ts`; `CAMERA`, `READ_MEDIA_IMAGES` permissions | `AndroidManifest.xml` |
| Share | `@capacitor/share` — native share sheet, used for invoices and product sharing | [`externalLinks.ts`](Bzeadstore-main/src/mobile/externalLinks.ts) |
| In-app browser | `@capacitor/browser` — Chrome Custom Tab for all external links + the seller redirect | §3.5 |
| Splash screen | `@capacitor/splash-screen` + Android 12+ native `SplashScreen` theme API | §5 |
| Status bar | `@capacitor/status-bar` — dark style, non-overlay | `capacitor.config.ts` |
| Push notifications | OneSignal (`onesignal-cordova-plugin`), **not** Firebase/FCM directly | §6 |
| App links | `https://bzead.com` / `https://www.bzead.com` verified deep links reopen the app instead of the browser | `AndroidManifest.xml` |
| 3-D Secure / bank OTP challenge | Hosted in a real Android `Dialog` (see §7.1) | `MainActivity.java` |

All custom plugin Java classes live in [`android/app/src/main/java/com/bzead/app/`](bzead-android/android/app/src/main/java/com/bzead/app/): `MainActivity.java`, `BzeadBackButtonPlugin.java`, `BzeadPullToRefreshPlugin.java`.

Because `npx cap sync` regenerates `capacitor.plugins.json` and drops these two hand-written local plugins, [`scripts/restore-plugins.mjs`](bzead-android/scripts/restore-plugins.mjs) re-adds them after every sync — this is a required step and is already wired into the build script (§8).

---

## 5. App icon & splash screen (exact assets/colors used)

### 5.1 Launcher icon
- Source: [`logo.png`](logo.png) (512×512, transparent corners), regenerated for every density by [`scripts/generate-icons.mjs`](bzead-android/scripts/generate-icons.mjs).
- Adaptive icon background color: `#1e293b` (`ic_launcher_background.xml`).
- Foreground: logo trimmed of whitespace, full-bleed at each density's 108dp adaptive-icon canvas.
- Play Store listing icon: 512×512, same source, generated to [`play-store-icon.png`](bzead-android/android/app/src/main/play-store-icon.png).

### 5.2 Splash screen (redesigned 2026-08-20)
- Source logo: **`/workspaces/BZEAD/splashscreenlogo.png`** — a distinct asset from the launcher `logo.png` (a yellow rounded-square "BZEAD" wordmark chip, opaque background), used **only** for the splash screen.
- Background: a **radial gradient**, centered at 50%/50%, from `#5de0e6` (center) to `#0078a6` (edge) — rasterized via an SVG → `sharp` pipeline (`radialGradientBuffer()` in `generate-icons.mjs`), not a solid color.
- Generated for **every** density bucket actually used by the app: `drawable-{m,h,xh,xxh,xxxh}dpi`, `drawable-port-{m,h,xh,xxh,xxxh}dpi` (the ones Android actually picks, since the app is orientation-locked to portrait), and `drawable-land-{m,h,xh,xxh,xxxh}dpi`.
- Logo is centered at ~34% of the shorter screen dimension.
- **Android 12+ native system splash icon** (`windowSplashScreenAnimatedIcon` in `styles.xml`) is a **separate, transparent-background** 960×960 asset (`drawable/splash.png`) with the logo confined to the inner 640×640px "safe zone" (66%) so it's never clipped. Its background is intentionally transparent — no color plate, no circle — matching the "no purple circle" requirement.
- Because that native attribute only accepts a flat color (not a gradient), `windowSplashScreenBackground` is set to a **solid approximation** `#1996b8` for the brief moment before Capacitor's own JS-driven splash (with the real gradient image) takes over. `windowSplashScreenIconBackgroundColor` is explicitly `@android:color/transparent`.
- `capacitor.config.ts`'s `SplashScreen.backgroundColor` is kept in sync (`#1996b8`), `androidScaleType: 'CENTER_CROP'`, `launchShowDuration: 2500`ms.

> ⚠️ `generate-icons.mjs` is **not** part of the automated build pipeline (`build-android.mjs` never calls it). Whoever changes the logo/splash artwork must manually run `npm run icons` (→ `node scripts/generate-icons.mjs`) before the next release build, or the change won't appear.

---

## 6. Push notifications

- Provider: **OneSignal** (`onesignal-cordova-plugin`), **not** raw Firebase/FCM — no `google-services.json` handling of push routing is required (OneSignal manages FCM under the hood).
- App ID: injected at build time from the `ONESIGNAL_APP_ID` environment variable into `BuildConfig.ONESIGNAL_APP_ID` (`MainActivity.java` reads it and calls `OneSignal.initWithContext(...)`). **If this env var isn't set at build time, push notifications are silently compiled out** (`BuildConfig.ONESIGNAL_APP_ID` becomes `"null"` and `initOneSignal()` no-ops).
- Current production App ID (also used by the website, same OneSignal app): `02f9a15b-ca1c-4ab2-8404-8a8cdb9afef9` (matches `VITE_ONESIGNAL_APP_ID` in [`Bzeadstore-main/.env`](Bzeadstore-main/.env)).
- Client-side init: [`nativePushNotifications.ts`](Bzeadstore-main/src/mobile/nativePushNotifications.ts), only runs when `isNativePlatform` is true; the web-push equivalents (`oneSignalWeb.ts`, `webPush.ts`) explicitly disable themselves on native to avoid double subscription.
- Permission: `POST_NOTIFICATIONS` (Android 13+), requested via `OneSignal.getNotifications().requestPermission(false, ...)`.

---

## 7. Bug fixes applied specifically to this Android app (changelog)

These are **native-app-only** fixes — the website was never affected by any of these bugs.

### 7.1 Checkout "Payment Failed" for every card requiring 3-D Secure (2026-08-20)
**Symptom:** Tapping "Pay Now" showed "Processing…" then immediately "Payment Failed", on every real card — while the website worked fine.

**Root cause:** `MainActivity.java`'s `WebChromeClient.onCreateWindow()` created a popup `WebView` intended to host Stripe's 3-D Secure / bank OTP challenge (triggered via `window.open()`), but that popup was **never attached to any visible window** — it existed only in memory. Since nearly all Indian bank cards require 3DS/OTP authentication, the challenge UI was invisible on every real payment; the user could never complete it, and `stripe.confirmPayment()` eventually failed.

**Fix:** the popup WebView is now hosted inside a real, visible Android `Dialog` (`dialog.show()`), dismissed automatically via `onCloseWindow()` when Stripe closes the challenge, or on cancel.

### 7.2 Checkout showed no card-entry fields at all (2026-08-20)
**Symptom:** After the 3DS fix above, testing revealed the "Payment Method" section showed **only** the Pay Now button — no card number/expiry/CVC fields ever rendered (the website showed them fine).

**Root cause:** the local repo's [`Bzeadstore-main/.env`](Bzeadstore-main/.env) (gitignored, local-only) contained an invalid `VITE_STRIPE_PUBLISHABLE_KEY` (`sb_publishable_...` — not a real Stripe key format; real ones start with `pk_live_`/`pk_test_`). The live website is built by **AWS Amplify**, which injects the real key from Amplify's own environment variable settings — never from this repo's `.env`. Building the Android app locally with this repo's `.env` baked the bogus key into the WebView bundle, so Stripe.js's `PaymentElement` silently failed to render.

**Fix:** replaced the key in `.env` with the real `pk_live_...` key (provided by the app owner) before rebuilding. **Anyone rebuilding this app must verify this key is a genuine `pk_live_`/`pk_test_` value — never trust the checked-out `.env` blindly.**

**Defense-in-depth also added:** enabled third-party cookies in `MainActivity.java` (`CookieManager.setAcceptThirdPartyCookies`) for both the main WebView and the 3DS popup WebView — required for Stripe's cross-origin iframes (`js.stripe.com`, `m.stripe.network`) to work reliably; Android WebView disables third-party cookies by default.

### 7.3 Splash screen had a white background and looked "compressed"/blurry (2026-08-20)
**Root cause:** the actual per-density splash images the app displays (`drawable-port-*dpi/splash.png` — these win over the generic `drawable-*dpi` ones because the app is orientation-locked to portrait) were **stale default white-background Cordova/Capacitor scaffold placeholders**. `generate-icons.mjs`'s splash generator existed in the repo but had never been wired into the actual build pipeline, so these files had never been regenerated with real branding.

**Fix:** see §5.2 — full regeneration with the radial gradient + `splashscreenlogo.png`, correct Android 12+ native icon handling, applied to every density bucket actually used.

---

## 8. How to build this app end-to-end

### 8.1 Prerequisites
- Node.js (repo tested with Node 20+)
- **Java 21** for Gradle (Java 25/newer can cause `Unsupported class file major version` errors compiling the Groovy build scripts — pin `JAVA_HOME` to a Java 21 install if this happens)
- Android SDK (`platforms`, `build-tools`) with `ANDROID_HOME`/`ANDROID_SDK_ROOT` set, or `android/local.properties` with `sdk.dir=...`
- A real Stripe **publishable** key (`pk_live_...` for production) in `Bzeadstore-main/.env` as `VITE_STRIPE_PUBLISHABLE_KEY` — **do not assume the checked-in `.env` is correct**, see §7.2
- `ONESIGNAL_APP_ID` environment variable set before building, or push notifications are silently disabled (see §6)
- The release signing keystore already exists at `bzead-android/android/app/bzead-release.jks` (signing config is in `android/app/build.gradle`) — do not need to create a new one for routine rebuilds

### 8.2 One-command release build
```bash
cd /workspaces/BZEAD/bzead-android
export ONESIGNAL_APP_ID=02f9a15b-ca1c-4ab2-8404-8a8cdb9afef9
# If icons/splash assets changed:
npm run icons

node scripts/build-android.mjs release
```

This single script ([`scripts/build-android.mjs`](bzead-android/scripts/build-android.mjs)) does, in order:
1. `npm run build:buyer` in `Bzeadstore-main/` (`VITE_APP_MODE=buyer vite build --outDir dist-buyer`)
2. `node scripts/prepare-assets.mjs` — strips files that shouldn't ship inside the APK (e.g. a previous release AAB accidentally left in `dist-buyer/download/`)
3. `npx cap sync` — copies the web build into the native Android project and syncs Capacitor plugins
4. `node scripts/restore-plugins.mjs` — re-registers the two custom local plugins that `cap sync` always drops
5. `./gradlew bundleRelease` then `./gradlew assembleRelease` — produces both the AAB (Play Store) and a sideloadable APK

**Output:**
- `android/app/build/outputs/bundle/release/app-release.aab` — upload this to Play Store
- `android/app/build/outputs/apk/release/app-release.apk` — for local sideload testing (same signing key as the Play Store listing, so it upgrades an existing install)

### 8.3 Debug build (for local testing without a release keystore concern)
```bash
node scripts/build-android.mjs debug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 8.4 Versioning
Bump `versionCode` (integer, must increase every Play Store upload) and `versionName` (user-facing string) in `android/app/build.gradle` `defaultConfig` before every new upload.

---

## 9. Key environment variables / secrets involved

| Variable | Where | Purpose |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `Bzeadstore-main/.env` (gitignored) | Stripe.js publishable key baked into the buyer web bundle at build time — **must be the real `pk_live_...`/`pk_test_...` key**, see §7.2 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `Bzeadstore-main/.env` | Supabase client config |
| `VITE_ONESIGNAL_APP_ID` | `Bzeadstore-main/.env` | Used by the web/JS OneSignal init path |
| `ONESIGNAL_APP_ID` (note: no `VITE_` prefix) | shell env at Android build time | Injected into `BuildConfig.ONESIGNAL_APP_ID` for the native OneSignal SDK — separate from the `VITE_` one above, must be exported before running the Gradle build |
| `STRIPE_SECRET_KEY` | Supabase Edge Function secret (server-side, not in this repo) | Used by `create-payment-intent` to create the PaymentIntent; must be the **live** secret key matching the live publishable key above |
| `sdk.dir` | `android/local.properties` (gitignored) | Local Android SDK path |
| Keystore passwords | `android/app/build.gradle` `signingConfigs.release` | Release signing — keep this file/keystore safe, required for every future Play Store update |

---

## 10. Quick file index

| Concern | File |
|---|---|
| Capacitor config | [`bzead-android/capacitor.config.ts`](bzead-android/capacitor.config.ts) |
| Native entry point / WebView setup / Stripe 3DS dialog / cookies | [`android/app/src/main/java/com/bzead/app/MainActivity.java`](bzead-android/android/app/src/main/java/com/bzead/app/MainActivity.java) |
| Custom back-button plugin | [`src/BzeadBackButton.ts`](bzead-android/src/BzeadBackButton.ts) |
| Custom pull-to-refresh plugin | [`src/BzeadPullToRefresh.ts`](bzead-android/src/BzeadPullToRefresh.ts) |
| Build orchestration | [`scripts/build-android.mjs`](bzead-android/scripts/build-android.mjs) |
| Icon/splash generation | [`scripts/generate-icons.mjs`](bzead-android/scripts/generate-icons.mjs) |
| Plugin restore-after-sync | [`scripts/restore-plugins.mjs`](bzead-android/scripts/restore-plugins.mjs) |
| Asset cleanup before packaging | [`scripts/prepare-assets.mjs`](bzead-android/scripts/prepare-assets.mjs) |
| Native/web platform flag | [`Bzeadstore-main/src/mobile/nativePlatform.ts`](Bzeadstore-main/src/mobile/nativePlatform.ts) |
| Native bootstrap (runs on every native app start) | [`Bzeadstore-main/src/mobile/nativeBootstrap.ts`](Bzeadstore-main/src/mobile/nativeBootstrap.ts) |
| Stripe client service (native vs web branching) | [`Bzeadstore-main/src/lib/stripeService.ts`](Bzeadstore-main/src/lib/stripeService.ts) |
| Server-side PaymentIntent creation | [`Bzeadstore-main/supabase/functions/create-payment-intent/index.ts`](Bzeadstore-main/supabase/functions/create-payment-intent/index.ts) |
| Buyer route tree | [`Bzeadstore-main/src/App.tsx`](Bzeadstore-main/src/App.tsx) |
