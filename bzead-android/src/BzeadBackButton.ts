import { WebPlugin, registerPlugin } from '@capacitor/core';

export interface BzeadBackButtonPlugin {
  shouldExit(): Promise<{ exit: boolean }>;
}

class BzeadBackButtonWeb extends WebPlugin implements BzeadBackButtonPlugin {
  async shouldExit(): Promise<{ exit: boolean }> {
    return { exit: false };
  }
}

export const BzeadBackButton = registerPlugin<BzeadBackButtonPlugin>(
  'BzeadBackButton',
  { web: () => new BzeadBackButtonWeb() }
);
