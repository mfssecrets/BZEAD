// Ambient module shims for OneSignal SDKs that ship without TypeScript
// declaration files. These are imported dynamically inside try/catch in:
//   - src/lib/oneSignalWeb.ts        (browser, via react-onesignal)
//   - src/mobile/nativePushNotifications.ts (Capacitor, via Cordova plugin)
// The runtime shapes are narrowed locally where the modules are consumed,
// so a permissive `any` here is acceptable.
declare module 'react-onesignal';
declare module 'onesignal-cordova-plugin';
