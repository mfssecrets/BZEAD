// Native push notifications via OneSignal (onesignal-cordova-plugin).
// Replaces the previous Firebase / @capacitor/push-notifications integration.
//
// On non-native platforms this module is a no-op — the web build uses
// `../lib/oneSignalWeb.ts` instead.
import logger from '../utils/logger';
import { isNativePlatform } from './nativePlatform';
import { ONESIGNAL_APP_ID, isOneSignalConfigured } from '../lib/oneSignalConfig';

let pushInitialized = false;
let currentExternalId: string | null = null;

interface OneSignalNative {
  initialize: (appId: string) => void;
  Notifications: {
    requestPermission: (fallbackToSettings?: boolean) => Promise<boolean>;
    addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  login: (externalId: string) => void;
  logout: () => void;
}

async function loadOneSignal(): Promise<OneSignalNative | null> {
  try {
    // Dynamic import keeps the web bundle free of Cordova references.
    const mod = await import('onesignal-cordova-plugin');
    const OneSignal = (mod as { default?: OneSignalNative }).default
      || (mod as unknown as OneSignalNative);
    return OneSignal || null;
  } catch (error) {
    logger.warn('OneSignal Cordova plugin not available', { error });
    return null;
  }
}

export async function initializeNativePushNotifications() {
  if (!isNativePlatform || pushInitialized) return;
  if (!isOneSignalConfigured) {
    logger.warn('OneSignal App ID missing — set VITE_ONESIGNAL_APP_ID');
    return;
  }

  const OneSignal = await loadOneSignal();
  if (!OneSignal) return;

  try {
    OneSignal.initialize(ONESIGNAL_APP_ID);

    OneSignal.Notifications.addEventListener('click', (event: unknown) => {
      logger.log('OneSignal notification clicked', { event });
    });

    const granted = await OneSignal.Notifications.requestPermission(true);
    if (!granted) {
      logger.warn('OneSignal push permission not granted');
    }

    if (currentExternalId) {
      OneSignal.login(currentExternalId);
    }

    pushInitialized = true;
  } catch (error) {
    logger.error('OneSignal init failed', { error });
  }
}

/** Sync the logged-in user's Supabase id with OneSignal as external_id. */
export async function setNativePushExternalId(userId: string | null) {
  currentExternalId = userId;
  if (!isNativePlatform || !isOneSignalConfigured) return;

  const OneSignal = await loadOneSignal();
  if (!OneSignal) return;

  try {
    if (userId) {
      OneSignal.login(userId);
    } else {
      OneSignal.logout();
    }
  } catch (error) {
    logger.error('OneSignal login/logout failed', { error });
  }
}
