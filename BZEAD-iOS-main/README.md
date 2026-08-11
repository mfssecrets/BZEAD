# BZEAD — Native iOS Buyer App

SwiftUI buyer app mirroring the native Android app in `BZEAD-APK-main/`. Same Supabase backend, pricing engine, checkout flow, and buyer UI as Android.

**Not Capacitor.** This is a standalone native iOS project.

## Requirements

- macOS with Xcode 15+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Apple Developer account (for device / TestFlight builds)

## Setup

1. Copy config files:
   ```bash
   cp Secrets.xcconfig.example Secrets.xcconfig
   cp Secrets.plist.example Secrets.plist
   ```
2. Fill in the same values as `BZEAD-APK-main/local.properties`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `PUBLIC_APP_URL`
   - `STRIPE_PUBLISHABLE_KEY`
   - `ONESIGNAL_APP_ID`
3. Generate the Xcode project:
   ```bash
   cd BZEAD-iOS-main
   xcodegen generate
   open BZEAD.xcodeproj
   ```
4. In Xcode: select your Team, then **Product → Run** on simulator or device.

## Architecture

| Layer | Path |
|-------|------|
| App entry | `BZEAD/BZEADApp.swift` |
| Root navigation | `BZEAD/UI/BzeadApp.swift` |
| Auth (landing + login/signup/OTP) | `BZEAD/UI/Auth/` |
| Buyer commerce UI | `BZEAD/UI/Buyer/` |
| Data / Supabase | `BZEAD/Data/` |
| Push (OneSignal) | `BZEAD/Push/` |

Bundle ID: `com.bzead.ios`  
Min iOS: **16.0**

## Parity with Android

- Same `AppRoute` auth graph and `BuyerNavRoute` stack navigation
- Same repositories, RPCs, and edge functions
- Stripe PaymentSheet + COD (India)
- OneSignal login/logout and order deep links
- Same `BuyerColors` palette and buyer light theme

See `BUYER_IOS_BUILD.md` for the full screen map.

## Do not commit

- `Secrets.xcconfig`
- `Secrets.plist`
- `BZEAD.xcodeproj/` (regenerate with XcodeGen)
- `DerivedData/`
