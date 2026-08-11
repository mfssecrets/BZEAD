import { WebPlugin, registerPlugin } from '@capacitor/core';

export interface BzeadPullToRefreshPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

class BzeadPullToRefreshWeb extends WebPlugin implements BzeadPullToRefreshPlugin {
  async setEnabled(): Promise<void> {
    // No-op on web; pull-to-refresh is handled natively on Android.
  }
}

export const BzeadPullToRefresh = registerPlugin<BzeadPullToRefreshPlugin>(
  'BzeadPullToRefresh',
  { web: () => new BzeadPullToRefreshWeb() }
);
