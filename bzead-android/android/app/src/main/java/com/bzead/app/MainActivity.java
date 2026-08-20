package com.bzead.app;

import android.app.Dialog;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;
import com.onesignal.Continue;
import com.onesignal.OneSignal;
import com.onesignal.debug.LogLevel;

public class MainActivity extends BridgeActivity {

    private static final String ONESIGNAL_APP_ID = BuildConfig.ONESIGNAL_APP_ID;

    // Tracks the currently visible Stripe 3DS/bank-auth challenge dialog, if any.
    private Dialog challengeDialog;

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

        // Stripe's PaymentElement/3DS challenge iframes are cross-origin (js.stripe.com,
        // m.stripe.network) and need third-party cookie access to render and complete —
        // Android WebView blocks these by default.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                // Host Stripe 3DS / bank-auth popups in a visible full-screen dialog.
                // Previously this WebView was created but never attached to any
                // view/window, so the OTP/3DS challenge UI was invisible — the user
                // could not complete authentication, and confirmPayment() eventually
                // failed with "Payment Failed" on every card requiring 3DS (the norm
                // for Indian bank cards).
                dismissChallengeDialog();

                WebView popup = new WebView(view.getContext());
                popup.getSettings().setJavaScriptEnabled(true);
                popup.getSettings().setDomStorageEnabled(true);
                CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);
                popup.setWebViewClient(new WebViewClient());
                popup.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        dismissChallengeDialog();
                    }
                });

                Dialog dialog = new Dialog(view.getContext());
                dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
                dialog.setContentView(popup, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                dialog.setCancelable(true);
                dialog.setOnCancelListener(d -> popup.destroy());
                dialog.setOnDismissListener(d -> {
                    if (challengeDialog == d) {
                        challengeDialog = null;
                    }
                });
                challengeDialog = dialog;
                dialog.show();

                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });

        initOneSignal();
    }

    private void dismissChallengeDialog() {
        if (challengeDialog != null) {
            if (challengeDialog.isShowing()) {
                challengeDialog.dismiss();
            }
            challengeDialog = null;
        }
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
