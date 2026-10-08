package app.usspace.couple.v012;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
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
    private UsExtrasBridge extrasBridge;
    private UserPreferencesBridge preferencesBridge;
    private NotificationBridge notificationBridge;
    private WorkScheduleBridge workScheduleBridge;
    private ValueCallback<Uri[]> photoCallback;
    private static final int PICK_PHOTO = 1203;
    private static final String BUNDLED_PAGE = "file:///android_asset/index.html";

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
        // Packaged android_asset content is still available with ordinary filesystem access off.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (photoCallback != null) photoCallback.onReceiveValue(null);
                photoCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
                picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(picker, PICK_PHOTO); }
                catch (ActivityNotFoundException | SecurityException failure) {
                    photoCallback = null;
                    callback.onReceiveValue(null);
                    showPickerError("No photo picker is available. You can add a photo later.");
                }
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String target = request.getUrl().toString();
                if (isBundledPage(target)) return false;
                if (request.isForMainFrame() && extrasBridge != null) extrasBridge.openLink(target);
                // Remote pages and nested frames must never acquire the native app's bridges.
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String target) {
                if (isBundledPage(target)) return false;
                if (extrasBridge != null) extrasBridge.openLink(target);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Authentication callbacks can arrive before the bundled page is ready.
                if (authBridge != null && isBundledPage(url)) {
                    authBridge.publishState();
                    if (extrasBridge != null) extrasBridge.refresh();
                    if (preferencesBridge != null) preferencesBridge.refresh();
                    if (notificationBridge != null) notificationBridge.onPageReady();
                    if (workScheduleBridge != null) workScheduleBridge.requestRender();
                }
            }
        });

        syncBridge = new CoupleSyncBridge(this, webView);
        authBridge = new AuthBridge(this, webView, syncBridge);
        healthBridge = new HealthBridge(this, webView);
        speechBridge = new SpeechBridge(this, webView);
        extrasBridge = new UsExtrasBridge(this, webView);
        preferencesBridge = new UserPreferencesBridge(this, webView);
        notificationBridge = new NotificationBridge(this, webView);
        workScheduleBridge = new WorkScheduleBridge(this, webView);
        authBridge.setNotificationBridge(notificationBridge);
        webView.addJavascriptInterface(authBridge, "UsAuth");
        webView.addJavascriptInterface(syncBridge, "UsSync");
        webView.addJavascriptInterface(healthBridge, "UsHealth");
        webView.addJavascriptInterface(speechBridge, "UsSpeech");
        webView.addJavascriptInterface(extrasBridge, "UsSpaceExtras");
        webView.addJavascriptInterface(preferencesBridge, "AndroidPreferences");
        webView.addJavascriptInterface(notificationBridge, "UsNotifications");
        webView.addJavascriptInterface(workScheduleBridge, "AndroidWorkSchedule");
        notificationBridge.handleIntent(getIntent());

        if (savedInstanceState == null) {
            webView.loadUrl(BUNDLED_PAGE);
        } else {
            webView.restoreState(savedInstanceState);
            if (!isBundledPage(webView.getUrl())) webView.loadUrl(BUNDLED_PAGE);
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (authBridge != null) authBridge.publishState();
        if (extrasBridge != null) extrasBridge.refresh();
        if (preferencesBridge != null) preferencesBridge.refresh();
        if (notificationBridge != null) notificationBridge.refresh();
        if (workScheduleBridge != null) workScheduleBridge.requestRender();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (notificationBridge != null) notificationBridge.handleIntent(intent);
    }

    @Override
    protected void onDestroy() {
        if (notificationBridge != null) notificationBridge.close();
        if (preferencesBridge != null) preferencesBridge.destroy();
        if (workScheduleBridge != null) workScheduleBridge.close();
        if (syncBridge != null) syncBridge.close();
        if (speechBridge != null) speechBridge.close();
        if (extrasBridge != null) extrasBridge.close();
        if (photoCallback != null) { photoCallback.onReceiveValue(null); photoCallback = null; }
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
        if (notificationBridge != null) notificationBridge.onRequestPermissionsResult(requestCode);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (workScheduleBridge != null && workScheduleBridge.onActivityResult(requestCode, resultCode, data)) return;
        if (requestCode != PICK_PHOTO || photoCallback == null) return;
        ValueCallback<Uri[]> callback = photoCallback;
        photoCallback = null;
        Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (selected != null) {
            // The document picker grants access to one selected file. No gallery permission needed.
            if (!"content".equals(selected.getScheme())) selected = null;
            else {
                try {
                    String mime = getContentResolver().getType(selected);
                    if (!"image/jpeg".equals(mime) && !"image/png".equals(mime) && !"image/webp".equals(mime)) selected = null;
                } catch (SecurityException failure) { selected = null; }
            }
        }
        callback.onReceiveValue(selected == null ? null : new Uri[]{selected});
        if (resultCode == RESULT_OK && selected == null) showPickerError("Choose a JPEG, PNG or WebP photo.");
    }

    private static boolean isBundledPage(String target) {
        return target != null && (BUNDLED_PAGE.equals(target) || target.startsWith(BUNDLED_PAGE + "#"));
    }

    private void showPickerError(String message) {
        if (webView != null) webView.evaluateJavascript("window.toast&&window.toast(" + org.json.JSONObject.quote(message) + ");", null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
