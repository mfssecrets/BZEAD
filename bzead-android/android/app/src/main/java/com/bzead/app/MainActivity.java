package com.bzead.app;

import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.onesignal.Continue;
import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class MainActivity extends BridgeActivity {

    private static final String ONESIGNAL_APP_ID = BuildConfig.ONESIGNAL_APP_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // No EdgeToEdge: system allocates its own space for status/nav bars so the
        // WebView is sandwiched between them and never overlaps the system chrome.
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Lock text zoom to 100% so Android font-size accessibility setting doesn't
        // inflate WebView text and break layouts.
        settings.setTextZoom(100);
        // Required for Stripe 3DS challenges which open in a new WebView window.
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                // Host Stripe 3DS / bank auth popups inside a new WebView so
                // the challenge can complete and return control to the app.
                WebView popup = new WebView(view.getContext());
                popup.getSettings().setJavaScriptEnabled(true);
                popup.getSettings().setDomStorageEnabled(true);
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        initOneSignal();
    }

    private void initOneSignal() {
        if (ONESIGNAL_APP_ID == null || ONESIGNAL_APP_ID.isEmpty() || "null".equals(ONESIGNAL_APP_ID)) {
            return;
        }
        OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID);
        OneSignal.getNotifications().requestPermission(false, Continue.none());
    }
}
