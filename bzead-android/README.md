# Bzead Android (Capacitor Buyer App)

This is the **separate** Capacitor Android wrapper for the Bzead buyer web app.
It does **not** modify `Bzeadstore-main/`, `BZEAD-iOS-main/`, or `BZEAD-APK-main/`.

## What this project does

- Wraps the buyer-only build of [Bzeadstore-main](../Bzeadstore-main).
- Bundle ID: `com.bzead.app`
- App icon generated from `/workspaces/BZEAD/logo.png`
- Includes OneSignal push notification support (configure `ONESIGNAL_APP_ID`).
- Native Android pull-to-refresh.
- Edge-to-edge layout with safe-area insets so the sticky header and bottom nav never overlap system UI.
- Android back button maps to `history.back()` and shows a double-tap-to-exit prompt at root.

## Build workflow

```bash
cd /workspaces/BZEAD/bzead-android

# 1. Build the buyer web app (output goes to ../Bzeadstore-main/dist-buyer)
npm run build:web

# 2. Sync web assets into the Android project
npm run sync

# 3. Build debug APK
npm run build:debug

# 4. Build release App Bundle (Play Store ready)
export ONESIGNAL_APP_ID=your_onesignal_app_id
npm run build:release
```

The release AAB is written to:
- `android/app/build/outputs/bundle/release/app-release.aab`

## Icons / splash

Run `node scripts/generate-icons.mjs` to regenerate launcher icons and splash screens from `logo.png`.

## Push notifications

Set the OneSignal App ID before building:

```bash
export ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Then rebuild. OneSignal is initialized in `MainActivity.java`; no `google-services.json` is required.

## Keystore for Play Store

Create a release keystore and reference it in `android/app/build.gradle` under `signingConfigs`.
Keep the keystore file and passwords safe — you cannot update the app on Play Store without them.
