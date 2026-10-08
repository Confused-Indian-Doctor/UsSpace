package app.usspace.couple.v012;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/** Private per-user settings with an account-scoped cache and a durable leaf-patch queue. */
public final class UserPreferencesBridge {
    public static final String STORAGE = "usspace_v014_preferences_private";
    public static final String ACTION_CHANGED = "app.usspace.couple.v012.PREFERENCES_CHANGED";
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth = FirebaseAuth.getInstance();
    private final FirebaseFirestore db = FirebaseFirestore.getInstance();
    private final FirebaseAuth.AuthStateListener authListener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ListenerRegistration listener;
    private volatile String uid = "", syncState = "local", error = "";
    private volatile long generation = 0;
    private volatile boolean closed = false;
    private boolean writing = false;
    private int retrySeconds = 5;

    public UserPreferencesBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        authListener = firebaseAuth -> activity.runOnUiThread(() -> observe(firebaseAuth.getCurrentUser()));
        auth.addAuthStateListener(authListener);
    }

    /** The supplied UID is a native caller's UID; this never accepts account identifiers from JavaScript. */
    public static JSONObject readLocal(Context context, String account) {
        try {
            String key = account == null || account.isEmpty() ? "guest" : "account:" + account;
            String text = context.getSharedPreferences(STORAGE, Context.MODE_PRIVATE).getString(key, "");
            Map<String, Object> raw = text.isEmpty() ? null : map(new JSONObject(text));
            Map<String, Object> preferences = PreferencePolicy.normalize(raw);
            // An unauthenticated phone cannot opt in to paired notifications.
            if (account == null || account.isEmpty()) preferences = PreferencePolicy.apply(preferences, singleton("notifications.enabled", false));
            return new JSONObject(preferences);
        } catch (Exception ignored) {
            return new JSONObject(PreferencePolicy.defaults());
        }
    }

    @JavascriptInterface
    public String status() {
        FirebaseUser user = auth.getCurrentUser();
        String account = user == null ? "" : user.getUid();
        try {
            JSONObject result = new JSONObject();
            result.put("uid", account);
            result.put("signedIn", user != null);
            // WebView prefers-color-scheme can follow this app's fixed Light theme.
            // Android configuration still carries the actual phone appearance.
            result.put("systemDark", (activity.getResources().getConfiguration().uiMode
                    & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
            result.put("preferences", readLocal(activity, account));
            result.put("syncState", account.equals(uid) ? syncState : "local");
            result.put("pending", !account.isEmpty() && !readPending(account).isEmpty());
            result.put("error", account.equals(uid) ? error : "");
            return result.toString();
        } catch (Exception ignored) { return "{}"; }
    }

    @JavascriptInterface
    public void refresh() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            observe(auth.getCurrentUser());
            flush();
            publish();
        });
    }

    @JavascriptInterface
    public void update(String patchJson) {
        final Map<String, Object> patch;
        try {
            if (patchJson == null || patchJson.length() > 2200) throw new IllegalArgumentException();
            patch = PreferencePolicy.validatePatch(map(new JSONObject(patchJson)));
        } catch (Exception ignored) {
            activity.runOnUiThread(() -> { error = "That setting could not be saved."; publish(); });
            return;
        }
        // Capture the actual signed-in account at invocation, then verify it again on the main thread.
        FirebaseUser user = auth.getCurrentUser();
        String requestedAccount = user == null ? "" : user.getUid();
        activity.runOnUiThread(() -> {
            if (closed || !actualUid().equals(requestedAccount)) return;
            observe(auth.getCurrentUser());
            if (uid.isEmpty() && Boolean.TRUE.equals(patch.get("notifications.enabled"))) {
                error = "Sign in to turn on notifications for your account.";
                publish();
                return;
            }
            Map<String, Object> current = map(readLocal(activity, uid));
            saveLocal(uid, PreferencePolicy.apply(current, patch));
            error = "";
            if (!uid.isEmpty()) {
                Map<String, Object> pending = readPending(uid);
                pending.putAll(patch);
                savePending(uid, pending);
                syncState = "pending";
            } else syncState = "local";
            publish();
            flush();
        });
    }

    private void observe(FirebaseUser user) {
        if (closed) return;
        String account = user == null ? "" : user.getUid();
        if (account.equals(uid) && (account.isEmpty() || listener != null)) return;
        String previous = uid;
        if (listener != null) listener.remove();
        listener = null;
        handler.removeCallbacksAndMessages(null);
        generation++;
        writing = false;
        retrySeconds = 5;
        uid = account;
        error = "";
        syncState = account.isEmpty() ? "local" : readPending(account).isEmpty() ? "connecting" : "pending";
        // Never carry the signed-in account's theme or opt-in back into the guest session.
        if (account.isEmpty() && !previous.isEmpty()) saveLocal("", PreferencePolicy.defaults());
        publish();
        if (account.isEmpty()) return;
        long epoch = generation;
        listener = db.collection("users").document(account).collection("preferences").document("v014")
                .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
                    if (!live(account, epoch)) return;
                    if (failure != null) {
                        // A failed Firestore listener is terminal. Reattach on refresh/retry,
                        // including after newly published rules permit this private document.
                        if (listener != null) listener.remove();
                        listener = null;
                        syncState = "local";
                        error = "Saved on this phone. Account settings could not sync yet.";
                        publish();
                        handler.postDelayed(() -> {
                            if (live(account, epoch) && listener == null) observe(auth.getCurrentUser());
                        }, 10000L);
                        return;
                    }
                    Map<String, Object> remote = PreferencePolicy.normalize(snapshot != null && snapshot.exists() ? snapshot.getData() : null);
                    Map<String, Object> pending = readPending(account);
                    if (!pending.isEmpty()) remote = PreferencePolicy.apply(remote, pending);
                    if (snapshot != null && (snapshot.exists() || !snapshot.getMetadata().isFromCache())) saveLocal(account, remote);
                    syncState = !pending.isEmpty() ? "pending" : snapshot != null && snapshot.getMetadata().isFromCache() ? "local" : "synced";
                    error = "";
                    publish();
                    flush();
                });
        flush();
    }

    private void flush() {
        if (closed || writing || uid.isEmpty()) return;
        String account = uid;
        long epoch = generation;
        if (!live(account, epoch)) return;
        Map<String, Object> queued = readPending(account);
        if (queued.isEmpty()) return;
        writing = true;
        syncState = "pending";
        db.runTransaction(transaction -> {
            com.google.firebase.firestore.DocumentReference ref = db.collection("users").document(account).collection("preferences").document("v014");
            com.google.firebase.firestore.DocumentSnapshot snapshot = transaction.get(ref);
            Map<String, Object> updated = PreferencePolicy.apply(snapshot.exists() ? snapshot.getData() : null, queued);
            updated.put("updatedAt", FieldValue.serverTimestamp());
            transaction.set(ref, updated);
            return null;
        }).addOnCompleteListener(activity, task -> {
            if (!live(account, epoch)) return;
            writing = false;
            if (!task.isSuccessful()) {
                syncState = "local";
                error = "Saved on this phone. Account settings will retry when a connection is available.";
                publish();
                int wait = retrySeconds;
                retrySeconds = Math.min(60, retrySeconds * 2);
                handler.postDelayed(() -> { if (live(account, epoch)) flush(); }, wait * 1000L);
                return;
            }
            retrySeconds = 5;
            Map<String, Object> pending = readPending(account);
            for (Map.Entry<String, Object> entry : queued.entrySet()) if (entry.getValue().equals(pending.get(entry.getKey()))) pending.remove(entry.getKey());
            savePending(account, pending);
            syncState = pending.isEmpty() ? "synced" : "pending";
            error = "";
            publish();
            flush();
        });
    }

    private boolean live(String account, long epoch) {
        return !closed && generation == epoch && uid.equals(account) && actualUid().equals(account);
    }

    private String actualUid() {
        FirebaseUser user = auth.getCurrentUser();
        return user == null ? "" : user.getUid();
    }

    private SharedPreferences storage() { return activity.getSharedPreferences(STORAGE, Context.MODE_PRIVATE); }

    private void saveLocal(String account, Map<String, Object> preferences) {
        String key = account.isEmpty() ? "guest" : "account:" + account;
        String text = new JSONObject(PreferencePolicy.normalize(preferences)).toString();
        if (text.equals(storage().getString(key, ""))) return;
        storage().edit().putString(key, text).apply();
        activity.sendBroadcast(new Intent(ACTION_CHANGED).setPackage(activity.getPackageName()).putExtra("uid", account));
    }

    private Map<String, Object> readPending(String account) {
        if (account.isEmpty()) return new LinkedHashMap<>();
        try {
            String text = storage().getString("pending:" + account, "");
            return text.isEmpty() ? new LinkedHashMap<>() : PreferencePolicy.validatePatch(map(new JSONObject(text)));
        } catch (Exception ignored) { return new LinkedHashMap<>(); }
    }

    private void savePending(String account, Map<String, Object> pending) {
        SharedPreferences.Editor edit = storage().edit();
        if (pending.isEmpty()) edit.remove("pending:" + account);
        else edit.putString("pending:" + account, new JSONObject(pending).toString());
        edit.apply();
    }

    private void publish() {
        String account = actualUid();
        long epoch = generation;
        String payload = status();
        activity.runOnUiThread(() -> {
            if (closed || epoch != generation || !actualUid().equals(account)) return;
            webView.evaluateJavascript("window.onUsPreferencesState&&window.onUsPreferencesState(" + payload + ");", null);
        });
    }

    public void destroy() {
        closed = true;
        generation++;
        handler.removeCallbacksAndMessages(null);
        if (listener != null) listener.remove();
        listener = null;
        auth.removeAuthStateListener(authListener);
    }

    private static Map<String, Object> singleton(String key, Object value) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put(key, value); return result;
    }

    private static Map<String, Object> map(JSONObject value) {
        Map<String, Object> result = new LinkedHashMap<>();
        Iterator<String> keys = value.keys();
        while (keys.hasNext()) {
            String key = keys.next(); Object item = value.opt(key);
            result.put(key, item instanceof JSONObject ? map((JSONObject) item) : item == JSONObject.NULL ? null : item);
        }
        return result;
    }
}
