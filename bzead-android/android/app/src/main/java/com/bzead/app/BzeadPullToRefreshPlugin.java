package com.bzead.app;

import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Custom Capacitor plugin that wraps the WebView in a SwipeRefreshLayout.
 * Enables native Android pull-to-refresh gesture. The web app listens for
 * the 'bzead:refresh' event and re-fetches data / reloads the current view.
 */
@CapacitorPlugin(name = "BzeadPullToRefresh")
public class BzeadPullToRefreshPlugin extends Plugin {

    private SwipeRefreshLayout swipeRefreshLayout;

    @Override
    public void load() {
        super.load();
        bridge.getActivity().runOnUiThread(this::attachSwipeRefresh);
    }

    private void attachSwipeRefresh() {
        View webView = bridge.getWebView();
        ViewGroup parent = (ViewGroup) webView.getParent();
        if (parent == null) return;

        int webViewIndex = parent.indexOfChild(webView);
        parent.removeView(webView);

        swipeRefreshLayout = new SwipeRefreshLayout(getContext());
        swipeRefreshLayout.setColorSchemeColors(Color.parseColor("#f59e0b"));
        swipeRefreshLayout.setProgressBackgroundColorSchemeColor(Color.parseColor("#1e293b"));
        swipeRefreshLayout.setEnabled(true);
        swipeRefreshLayout.setOnRefreshListener(() -> {
            // Hard reload the WebView so every pull-to-refresh behaves like a real
            // Android app and picks up the latest deployed web assets.
            bridge.getActivity().runOnUiThread(() -> {
                swipeRefreshLayout.postDelayed(() -> {
                    swipeRefreshLayout.setRefreshing(false);
                    bridge.getWebView().reload();
                }, 600);
            });
        });

        swipeRefreshLayout.addView(webView);
        parent.addView(swipeRefreshLayout, webViewIndex);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        bridge.getActivity().runOnUiThread(() -> {
            if (swipeRefreshLayout != null) {
                swipeRefreshLayout.setEnabled(enabled);
            }
            call.resolve();
        });
    }
}
