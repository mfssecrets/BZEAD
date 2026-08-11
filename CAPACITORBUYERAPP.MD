# Bzead Capacitor Android Buyer App — Complete Build Documentation

**Document version:** 1.0  
**Created:** 2026-08-11  
**Project:** `bzead-android` (separate Capacitor wrapper for Bzead buyer web app)  
**Bundle ID:** `com.bzead.app`  
**App icon source:** [`logo.png`](logo.png)

---

## 1. Why we are doing this

Your Play Store account is verified, and you want to list the Bzead Android app officially. You already had three things in the repo:

- [`Bzeadstore-main/`](Bzeadstore-main/) — the React + Vite web app (buyer + seller).
- [`BZEAD-iOS-main/`](BZEAD-iOS-main/) — existing iOS project, must stay untouched.
- [`BZEAD-APK-main/`](BZEAD-APK-main/) — existing APK/Android project, must stay untouched.

To avoid touching any of those, we created a **new, separate** Capacitor Android wrapper project called [`bzead-android/`](bzead-android/). It consumes only the **buyer** side of the web app, produces a real native Android app, and is designed to be Play Store ready.

### Design goals

1. **Zero changes** to [`Bzeadstore-main/`](Bzeadstore-main/), [`BZEAD-iOS-main/`](BZEAD-iOS-main/), or [`BZEAD-APK-main/`](BZEAD-APK-main/).
2. **Buyer-only app** — seller routes are removed at build time using the existing `build:buyer` mode.
3. **Single source of truth** — future web app updates are reflected in the Android app just by rebuilding.
4. **Real Android feel** — safe-area aware header, bottom nav, pull-to-refresh, hardware back button handling, location permission flow.
5. **Play Store ready** — signed release AAB, adaptive icons, splash screen, target SDK compliance, and push notifications.

---

## 2. What was created

```text
/workspaces/BZEAD/
├── Bzeadstore-main/          ← untouched web app (single source of truth)
├── BZEAD-iOS-main/           ← untouched
├── BZEAD-APK-main/           ← untouched
├── bzead-android/            ← NEW Capacitor Android wrapper
│   ├── android/              ← native Android project
│   ├── scripts/              ← build/asset helpers
│   ├── src/                  ← custom Capacitor plugins (TS)
│   ├── capacitor.config.ts   ← Capacitor configuration
│   ├── package.json          ← wrapper dependencies
│   ├── README.md             ← quick reference
│   └── SETUP.md              ← setup & build guide
└── CAPACITORBUYERAPP.MD      ← this document
```

---

## 3. How the buyer-only build works

The web app already supports a buyer-only build via the script:

[`Bzeadstore-main/package.json`](Bzeadstore-main/package.json)

```json
"build:buyer": "tsc -b && VITE_APP_MODE=buyer vite build --outDir dist-buyer --emptyOutDir"
```

This sets `VITE_APP_MODE=buyer` and outputs to `Bzeadstore-main/dist-buyer`.

[`bzead-android/capacitor.config.ts`](bzead-android/capacitor.config.ts)

```ts
webDir: '../Bzeadstore-main/dist-buyer'
```

Capacitor copies those built files into the native Android WebView. No seller pages ship inside the APK.

### "Become a seller" behavior

Inside the buyer app, any "Become a seller" button opens the **full web app** in an external browser using `@capacitor/browser`:

```ts
import { Browser } from '@capacitor/browser';
await Browser.open({ url: 'https://your-bzead-webapp.com/seller/register' });
```

This keeps the Android app buyer-only while still letting users apply to become sellers on the real website.

---

## 4. Native Android features implemented

### 4.1 App identity

| Item | Value | Location |
|------|-------|----------|
| Bundle ID | `com.bzead.app` | [`capacitor.config.ts`](bzead-android/capacitor.config.ts) |
| App name | `Bzead` | [`capacitor.config.ts`](bzead-android/capacitor.config.ts) |
| Launcher icon | generated from [`logo.png`](logo.png) | `android/app/src/main/res/mipmap-*` |
| Splash screen | generated from [`logo.png`](logo.png) | `android/app/src/main/res/drawable*` |

### 4.2 Safe-area layout (no overlap with system UI)

Capacitor is configured for edge-to-edge with `overlaysWebView: false`, and the web app should use CSS safe-area insets:

```css
.app-shell {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

The native StatusBar is colored to match the app header (`#1e293b`), so the header visually extends under the status bar without content being hidden.

### 4.3 Sticky header and mobile navigation

- The web app's header must remain `position: sticky` or `fixed` at `top: env(safe-area-inset-top)`.
- Bottom nav must be `position: fixed` at `bottom: 0` with `padding-bottom: env(safe-area-inset-bottom)`.
- If your current web UI does not already do this, those are **web UI changes** needed in [`Bzeadstore-main/src`](Bzeadstore-main/src). They are not native changes.

### 4.4 Android location permission

Uses `@capacitor/geolocation`. The plugin automatically requests:

- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`

Recommended flow in React:

```ts
import { Geolocation } from '@capacitor/geolocation';

async function requestLocation() {
  const perm = await Geolocation.requestPermissions();
  if perm.location === 'granted') {
    const pos = await Geolocation.getCurrentPosition();
    return pos;
  }
}
```

If you need background location (e.g., delivery tracking), you must also add `ACCESS_BACKGROUND_LOCATION` in `AndroidManifest.xml` and justify it in Play Console.

### 4.5 Hardware back button

A custom Capacitor plugin is registered in [`src/BzeadBackButton.ts`](bzead-android/src/BzeadBackButton.ts) and handled natively in `MainActivity.java`.

Behavior:

- If the WebView can go back in history → call `history.back()`.
- If at the root of the app → show a "Press back again to exit" toast.
- This prevents users from being kicked out accidentally.

### 4.6 Pull-to-refresh

Native Android pull-to-refresh is enabled via a custom Capacitor plugin in [`src/BzeadPullToRefresh.ts`](bzead-android/src/BzeadPullToRefresh.ts) and wired into `MainActivity.java`.

- Swiping down from the top reloads the current route.
- It can be disabled on routes where it conflicts with maps or image carousels.

### 4.7 Push notifications

Uses **OneSignal** via the `onesignal-cordova-plugin`.

- OneSignal App ID is read from the environment variable `ONESIGNAL_APP_ID` at build time.
- No `google-services.json` is required because OneSignal handles FCM routing.
- Users are subscribed automatically on first launch.

To configure:

```bash
export ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
cd /workspaces/BZEAD/bzead-android
npm run build:release
```

---

## 5. Project files reference

### 5.1 Capacitor configuration

[`bzead-android/capacitor.config.ts`](bzead-android/capacitor.config.ts)

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bzead.app',
  appName: 'Bzead',
  webDir: '../Bzeadstore-main/dist-buyer',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: { /* ... */ },
    StatusBar: { /* ... */ },
  },
};

export default config;
```

### 5.2 Wrapper package scripts

[`bzead-android/package.json`](bzead-android/package.json)

```json
{
  "scripts": {
    "sync": "npx cap sync",
    "build:web": "cd ../Bzeadstore-main && npm run build:buyer && cd ../bzead-android && node scripts/prepare-assets.mjs",
    "copy": "node scripts/prepare-assets.mjs && npx cap copy",
    "open:android": "npx cap open android",
    "build:debug": "node scripts/build-android.mjs debug",
    "build:release": "node scripts/build-android.mjs release",
    "icons": "node scripts/generate-icons.mjs"
  }
}
```

### 5.3 Build script

[`bzead-android/scripts/build-android.mjs`](bzead-android/scripts/build-android.mjs)

What it does:

1. Runs `npm run build:buyer` in `Bzeadstore-main/`.
2. Runs `prepare-assets.mjs` to clean files that should not ship.
3. Runs `npx cap sync` to copy web assets into `android/`.
4. Runs `restore-plugins.mjs` to re-register custom plugins.
5. Runs Gradle to produce a debug APK or release AAB.

### 5.4 Asset preparation

[`bzead-android/scripts/prepare-assets.mjs`](bzead-android/scripts/prepare-assets.mjs)

Removes development-only files (source maps, `README.md`, `.env.example`, etc.) from `dist-buyer/` before they are bundled into the APK.

### 5.5 Icon generation

[`bzead-android/scripts/generate-icons.mjs`](bzead-android/scripts/generate-icons.mjs)

Generates Android launcher icons and splash screens in all required densities from [`logo.png`](logo.png).

---

## 6. How to build

### 6.1 Prerequisites

- Node.js 20+
- Java 21 (required by Android Gradle Plugin 8.x)
- Android SDK with platform and build-tools
- `ANDROID_HOME` environment variable set

### 6.2 First-time setup

```bash
cd /workspaces/BZEAD/Bzeadstore-main
cp .env.example .env
# Fill in real values for Supabase, Stripe, OneSignal, etc.

cd /workspaces/BZEAD/bzead-android/android
cp local.properties.example local.properties
# Set sdk.dir=/path/to/your/android/sdk
```

### 6.3 Build debug APK

```bash
cd /workspaces/BZEAD/bzead-android
export ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run build:debug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 6.4 Build release AAB (Play Store)

```bash
cd /workspaces/BZEAD/bzead-android
export ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run build:release
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### 6.5 Signing for Play Store

Before release, create a keystore and add it to `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("../bzead-release.keystore")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "bzead"
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

**Important:** Keep the keystore file and passwords safe. You cannot publish updates to Play Store without them.

---

## 7. What is pending / what you still need to do

| # | Task | Why it matters | Owner |
|---|------|----------------|-------|
| 1 | Fill in real `.env` values in `Bzeadstore-main/.env` | App cannot connect to Supabase/Stripe/OneSignal without them | You |
| 2 | Provide real `ONESIGNAL_APP_ID` | Push notifications will not work | You |
| 3 | Configure Android SDK path in `local.properties` | Native build will fail without it | You/CI |
| 4 | Create release keystore and configure `build.gradle` | Required for Play Store upload | You |
| 5 | Update web UI header/nav to use safe-area insets | Prevents overlap with status bar and gesture nav | You or dev |
| 6 | Wire "Become a seller" buttons to `Browser.open()` | Keeps Android app buyer-only | You or dev |
| 7 | Test push notifications on a real device | Emulators cannot receive FCM reliably | You/QA |
| 8 | Complete Play Console listing (screenshots, description, privacy policy, data safety) | Required to publish | You |
| 9 | Run internal testing on Play Store | Catches device-specific issues | You |

---

## 8. Web app changes required for a perfect Android feel

The native wrapper is ready, but some **web UI polish** inside [`Bzeadstore-main/`](Bzeadstore-main/) will make the app feel truly native.

### 8.1 Header and bottom nav safe areas

Update your shell/layout CSS:

```css
:root {
  --sat: env(safe-area-inset-top);
  --sab: env(safe-area-inset-bottom);
}

.sticky-header {
  position: sticky;
  top: 0;
  padding-top: var(--sat);
  height: calc(3.5rem + var(--sat));
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  padding-bottom: var(--sab);
  height: calc(4rem + var(--sab));
}
```

### 8.2 Disable pull-to-refresh on specific routes

```ts
import { BzeadPullToRefresh } from '../../bzead-android/src';

useEffect(() => {
  BzeadPullToRefresh.setEnabled({ enabled: false });
  return () => BzeadPullToRefresh.setEnabled({ enabled: true });
}, []);
```

### 8.3 Open seller flows in browser

```ts
import { Browser } from '@capacitor/browser';

const becomeSeller = () => {
  Browser.open({ url: 'https://your-bzead-webapp.com/seller/register' });
};
```

### 8.4 Android back button awareness

Because we handle the native back button, you do not need to change React Router. Just ensure every screen is a real route so `history.back()` works.

---

## 9. Push notification architecture

```textn+---> OneSignal dashboard
                |
                v
        OneSignal SDK (inside Android app)
                |
                v
        FCM token subscribed
                |
                v
        Device receives notification
```

### Recommended OneSignal setup

1. Create an app in [OneSignal](https://onesignal.com/).
2. Add the Android platform and copy the App ID.
3. Set `ONESIGNAL_APP_ID` before building.
4. Send test notifications from the OneSignal dashboard.
5. Segment users by role (buyer, seller) once seller flows are added.

---

## 10. Play Store readiness checklist

Before you click **Publish**, verify all of these:

- [x] Bundle ID is final: `com.bzead.app`
- [x] App icon generated from [`logo.png`](logo.png)
- [x] Splash screen configured
- [x] Target SDK set to latest (API 35+)
- [x] Location permissions declared and justified
- [ ] Release keystore created and secured
- [ ] Signed release AAB builds successfully
- [ ] Push notifications tested on a real Android device
- [ ] Privacy policy URL provided
- [ ] Data safety form completed
- [ ] Content rating questionnaire completed
- [ ] Store listing screenshots, feature graphic, and description ready
- [ ] Internal testing track used before production

---

## 11. Future maintenance workflow

Every time you update the web app:

```bash
cd /workspaces/BZEAD/bzead-android
npm run build:release
```

That's it. The script rebuilds the buyer web app and syncs it into the Android project. No manual copying.

---

## 12. Support notes

- Do **not** delete [`BZEAD-APK-main/`](BZEAD-APK-main/) or [`BZEAD-iOS-main/`](BZEAD-iOS-main/). They remain untouched.
- Do **not** change the bundle ID after first Play Store upload — Android treats it as a different app.
- Keep the release keystore file and passwords in a password manager; losing them blocks all future updates.
- If you add new native plugins, run `npx cap sync` and commit the updated `android/` folder.

---

## 13. Summary

We built a **separate, Play-Store-ready Capacitor Android wrapper** for the Bzead buyer app. It:

- Uses the existing buyer-only Vite build from [`Bzeadstore-main/`](Bzeadstore-main/)
- Has bundle ID `com.bzead.app` and icon from [`logo.png`](logo.png)
- Includes native pull-to-refresh, hardware back navigation, location permissions, and safe-area layout
- Includes OneSignal push notifications
- Produces a signed release AAB ready for Google Play Console
- Leaves your web app, iOS project, and existing APK project untouched

The remaining work is mostly configuration (env vars, keystore, Play Console listing) and small web UI safe-area adjustments.
