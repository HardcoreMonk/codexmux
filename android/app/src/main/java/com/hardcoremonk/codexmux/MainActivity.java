package com.hardcoremonk.codexmux;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void dispatchAppState(boolean active) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        String js = "window.dispatchEvent(new CustomEvent('codexmux:native-app-state',{detail:{active:" + active + "}}));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            getBridge().setWebViewClient(new CodexmuxWebViewClient(getBridge()));
            getBridge().getWebView().addJavascriptInterface(new CodexmuxAppInfo(this), "CodexmuxAndroid");
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        dispatchAppState(true);
    }

    @Override
    public void onPause() {
        dispatchAppState(false);
        super.onPause();
    }
}
