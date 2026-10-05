package app.usspace.couple.v012;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.firebase.FirebaseApp;

public class MainActivity extends Activity {
    private WebView webView;
    private HealthBridge healthBridge;
    private AuthBridge authBridge;
    private CoupleSyncBridge syncBridge;
    private SpeechBridge speechBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FirebaseApp.initializeApp(this);

        webView = new WebView(this);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Authentication callbacks can arrive before the bundled page is ready.
                if (authBridge != null && "file:///android_asset/index.html".equals(url)) {
                    authBridge.publishState();
                }
            }
        });

        syncBridge = new CoupleSyncBridge(this, webView);
        authBridge = new AuthBridge(this, webView, syncBridge);
        healthBridge = new HealthBridge(this, webView);
        speechBridge = new SpeechBridge(this, webView);
        webView.addJavascriptInterface(authBridge, "UsAuth");
        webView.addJavascriptInterface(syncBridge, "UsSync");
        webView.addJavascriptInterface(healthBridge, "UsHealth");
        webView.addJavascriptInterface(speechBridge, "UsSpeech");

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (authBridge != null) authBridge.publishState();
    }

    @Override
    protected void onDestroy() {
        if (syncBridge != null) syncBridge.close();
        if (speechBridge != null) speechBridge.close();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (healthBridge != null) healthBridge.onRequestPermissionsResult(requestCode);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
