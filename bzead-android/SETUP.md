# Bzead Android — Setup & Build Guide

This folder contains a **separate** Capacitor Android wrapper for the Bzead buyer web app.
It does not modify `Bzeadstore-main/`, `BZEAD-iOS-main/`, or `BZEAD-APK-main/`.

## What is already configured

- Bundle ID: `com.bzead.app`
- App icon + splash: generated from `/workspaces/BZEAD/logo.png`
- Buyer-only web build: uses `Bzeadstore-main/dist-buyer` (no seller routes)
- Push notifications: OneSignal Cordova plugin
- Native Android pull-to-refresh
- Edge-to-edge layout with safe-area insets for status bar + gesture navigation
- Android back button → `history.back()` with double-tap-to-exit at root

## Requirements

1. **Node.js 20+** and npm
2. **Java 21** (Android Gradle Plugin 8.x requires it)
3. **Android SDK** with SDK Platform 36 and Build-Tools
4. **OneSignal App ID** (for push notifications)

## Step-by-step first build

### 1. Configure the web app environment

The web app needs a `.env` file to build. In `Bzeadstore-main/.env`:

```bash
cd /workspaces/BZEAD/Bzeadstore-main
cp .env.example .env
# Edit .env and fill in real values, especially:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_STRIPE_PUBLISHABLE_KEY
#   VITE_ONESIGNAL_APP_ID
```

### 2. Configure Android SDK

```bash
cd /workspaces/BZEAD/bzead-android/android
cp local.properties.example local.properties
# Edit local.properties and set sdk.dir to your Android SDK path.
```

Also set `ANDROID_HOME`:

```bash
export ANDROID_HOME=/path/to/your/android/sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
```

### 3. Set OneSignal App ID

```bash
export ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 4. Build

```bash
cd /workspaces/BZEAD/bzead-android
npm run build:debug     # debug APK
# or
npm run build:release   # Play Store AAB
```

Outputs:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`

## Java version

If you have multiple Java versions, force Java 21 for the Gradle build:

```bash
export JAVA_HOME=/usr/local/sdkman/candidates/java/21.0.10-ms
export PATH=$JAVA_HOME/bin:$PATH
```

## Keystore for Play Store release

Before uploading to Play Store, create a signing keystore and add it to `android/app/build.gradle`:

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
            minifyEnabled false
            ...
        }
    }
}
```

Keep the keystore safe — you cannot update the app on Play Store without it.

## Making future web changes reflect in the Android app

1. Edit the web app in `Bzeadstore-main/` as usual.
2. Run `npm run build:debug` or `npm run build:release` from `bzead-android/`.

The script rebuilds the buyer web app and syncs the new assets into the Android project automatically.
