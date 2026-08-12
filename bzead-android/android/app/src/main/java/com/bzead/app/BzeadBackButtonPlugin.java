package com.bzead.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Stub plugin kept for forward-compatibility. Back-button logic is handled
 * entirely by the Capacitor App plugin + JavaScript (nativeRuntime.tsx).
 * The broken OnBackPressedCallback that fired on the wrong event channel
 * has been removed; Capacitor's App plugin now fires backButton events
 * through the correct notifyListeners channel.
 */
@CapacitorPlugin(name = "BzeadBackButton")
public class BzeadBackButtonPlugin extends Plugin {
}
