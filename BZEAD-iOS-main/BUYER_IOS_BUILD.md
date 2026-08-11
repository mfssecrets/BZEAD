# BZEAD iOS Buyer App — Build & Parity

Native buyer app: `com.bzead.ios`  
Android reference: `BZEAD-APK-main/` (Kotlin / Jetpack Compose)  
Web reference: `Bzeadstore-main/` (buyer pages only)

## Rules

- **Android app = primary native reference** for screens, navigation, and backend calls.
- **Web app = layout/copy reference** for buyer commerce pages (same as Android build doc).
- **Do not modify** `BZEAD-APK-main/` or `Bzeadstore-main/` when working on iOS unless explicitly asked.
- Auth / landing screens are **frozen** — port from Android as-is, do not rebuild from web.

## Screen map (Android → iOS)

| Android (Kotlin) | iOS (SwiftUI) |
|------------------|---------------|
| `MainActivity.kt` | `UI/BzeadApp.swift` |
| `LandingScreen.kt` | `UI/LandingScreen.swift` |
| `ui/auth/*` | `UI/Auth/*` |
| `BuyerMainScreen.kt` | `UI/Buyer/BuyerMainScreen.swift` |
| `BuyerHomeScreen.kt` | `UI/Buyer/BuyerHomeScreen.swift` |
| `ProductDetailScreen.kt` | `UI/Buyer/ProductDetailScreen.swift` |
| `BuyerCartScreen.kt` | `UI/Buyer/BuyerCartScreen.swift` |
| `checkout/*` | `UI/Buyer/checkout/*` |
| `OrderDetailScreen.kt` | `UI/Buyer/OrderDetailScreen.swift` |
| `data/*` | `Data/*` |

## Build (macOS)

```bash
cd BZEAD-iOS-main
xcodegen generate
xcodebuild -scheme BZEAD -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Or open `BZEAD.xcodeproj` in Xcode and **Product → Archive** for release.

## Config

Same keys as Android `local.properties`, loaded from `Secrets.plist` and/or `Secrets.xcconfig`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PUBLIC_APP_URL`
- `STRIPE_PUBLISHABLE_KEY`
- `ONESIGNAL_APP_ID`

## Dependencies (SPM via XcodeGen)

- [stripe-ios](https://github.com/stripe/stripe-ios) — `StripePaymentSheet`
- [OneSignal-XCFramework](https://github.com/OneSignal/OneSignal-XCFramework) — push notifications
