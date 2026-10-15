package app.usspace.couple.v012;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Source;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Opt-in Android delivery; no token or private push content crosses the JavaScript bridge. */
public final class NotificationBridge {
    public static final int PERMISSION_REQUEST = 1414;
    public static final String OPEN_EXTRA = "usspace.notification.open.v014";
    private static final String LOCAL = "usspace_v014_notifications_private";
    private static final String CHANGED = "app.usspace.couple.v012.PREFERENCES_CHANGED";
    private static final Object DELIVERY_LOCK = new Object();
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth = FirebaseAuth.getInstance();
    private final FirebaseFirestore db = FirebaseFirestore.getInstance();
    private final FirebaseAuth.AuthStateListener authListener;
    private final BroadcastReceiver preferenceReceiver;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ListenerRegistration userListener, memberListener;
    private volatile String uid = "", coupleId = "", boundUid = "", boundToken = "";
    private volatile long generation, bindingOperation, openingOperation;
    private volatile boolean verified, closed, pageReady, binding, sendingPing, permissionRequest;
    private boolean deletingToken;
    private boolean retryScheduled;
    private boolean opening;
    private String error = "", lastAction = "";
    private Map<String, String> pendingOpen;

    public NotificationBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        PushRelay.initialize(activity);
        createChannels(activity);
        preferenceReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                // Relay broadcasts only publish state. Calling refresh here would probe and
                // rebroadcast recursively while service setup is still incomplete.
                if (PushRelay.CHANGED.equals(intent.getAction())) { publishState(); return; }
                if (uid.equals(intent.getStringExtra("uid"))) refresh();
            }
        };
        IntentFilter filter = new IntentFilter(CHANGED);
        filter.addAction(PushRelay.CHANGED);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(preferenceReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(preferenceReceiver, filter);
        authListener = ignored -> activity.runOnUiThread(this::observeAuth);
        auth.addAuthStateListener(authListener);
    }

    @JavascriptInterface public String status() { return state().toString(); }
    @JavascriptInterface public void refresh() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            observeAuth();
            reconcileBinding();
            PushRelay.refresh();
            publishState();
            if (pageReady) openPending();
        });
    }

    /** Called only by an explicit Settings button, after the user opts into private preferences. */
    @JavascriptInterface public void requestPermission() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            if (uid.isEmpty()) { error = "Sign in before enabling notifications."; publishState(); return; }
            if (!master(activity, uid)) { error = "Turn on notifications first, then allow them on this phone."; publishState(); return; }
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                if (!permissionRequest) {
                    permissionRequest = true;
                    activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST);
                }
            } else {
                error = "";
                if (!permission(activity)) error = "Notifications are blocked in Android settings.";
                reconcileBinding(); publishState();
            }
        });
    }

    @JavascriptInterface public void openAndroidSettings() {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName()));
            } catch (RuntimeException ignored) { error = "Open this app’s notification settings in Android Settings."; publishState(); }
        });
    }

    /** Explicitly checks this phone's Android channel; it never sends a partner message. */
    @JavascriptInterface public void testNotification() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            lastAction = "";
            if (!current(uid) || !master(activity, uid)) error = "Sign in and turn on notifications before testing this phone.";
            else if (!permission(activity)) error = "Allow UsSpace notifications in Android Settings, then test again.";
            else if (!mayShow(activity, uid, "pings")) error = "Pings are off or quiet hours are active. Change those settings before testing.";
            else {
                createChannels(activity);
                NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
                NotificationChannel channel = manager == null ? null : manager.getNotificationChannel("usspace_pings");
                if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) error = "The Pings channel is blocked. Open Android notification settings to allow it.";
                else {
                    Intent intent = new Intent(activity, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            .setData(Uri.parse("usspace://notification/phone-test"));
                    PendingIntent pending = PendingIntent.getActivity(activity, 1414, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    Notification notification = new Notification.Builder(activity, "usspace_pings")
                            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("UsSpace phone test")
                            .setContentText("This phone can show UsSpace notifications.")
                            .setContentIntent(pending).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE).build();
                    manager.notify("usspace:phone-test", 1414, notification);
                    error = "";
                    lastAction = "Test notification shown on this phone. No message was sent to your partner.";
                }
            }
            publishState();
        });
    }

    public void onRequestPermissionsResult(int requestCode) {
        if (requestCode != PERMISSION_REQUEST) return;
        permissionRequest = false;
        error = permission(activity) ? "" : "Notifications are not allowed on this phone. You can allow them later in Android Settings.";
        reconcileBinding(); publishState();
    }

    private void observeAuth() {
        if (closed) return;
        FirebaseUser user = auth.getCurrentUser();
        String next = user == null ? "" : user.getUid();
        String persisted = local(activity).getString("boundUid", "");
        if (uid.isEmpty() && !persisted.isEmpty() && !persisted.equals(next)) { cleanup(persisted); cancelAll(activity); }
        if (next.equals(uid) && (next.isEmpty() || userListener != null)) return;
        String previous = uid;
        detach(); generation++; bindingOperation++; verified = false; binding = false; coupleId = "";
        if (!previous.isEmpty() && !previous.equals(next)) { pendingOpen = null; opening = false; openingOperation++; }
        uid = next; error = ""; lastAction = "";
        PushRelay.setScope(uid, "", false);
        if (!previous.isEmpty() && !previous.equals(next)) cleanup(previous);
        if (uid.isEmpty()) { FirebaseMessaging.getInstance().setAutoInitEnabled(false); cancelAll(activity); publishState(); return; }
        local(activity).edit().remove("blocked:" + uid).apply();
        String account = uid;
        userListener = db.collection("users").document(account).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!current(account)) return;
            if (failure != null) { pairingFailure(account, "Notification pairing could not be checked. Try again when connected."); return; }
            if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
            String nextCouple = snapshot.exists() ? snapshot.getString("coupleId") : "";
            if (!NotificationPolicy.id(nextCouple)) nextCouple = "";
            if (!nextCouple.equals(coupleId) || memberListener == null) setCouple(nextCouple);
        });
        publishState();
        if (pageReady) openPending();
    }

    private void setCouple(String space) {
        generation++; bindingOperation++; verified = false; binding = false;
        if (memberListener != null) { memberListener.remove(); memberListener = null; }
        if (!coupleId.isEmpty() && !coupleId.equals(space)) { cleanup(uid); cancelAll(activity); }
        coupleId = space;
        PushRelay.setScope(uid, space, false);
        if (space.isEmpty()) { cleanup(uid); publishState(); return; }
        String account = uid; long epoch = generation;
        memberListener = db.collection("couples").document(space).collection("members").document(account)
                .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
                    if (!scope(account, space, epoch)) return;
                    if (failure != null) { pairingFailure(account, "Notification pairing could not be checked. Try again when connected."); return; }
                    if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
                    verified = snapshot.exists();
                    PushRelay.setScope(account, space, verified);
                    if (!verified) { cleanup(account); cancelAll(activity); error = "Pair your phones to receive partner notifications."; }
                    else { error = ""; reconcileBinding(); }
                    publishState();
                });
    }

    private void reconcileBinding() {
        if (closed) return;
        // The manifest defaults this to false. Enable token maintenance only after actual opt-in.
        FirebaseMessaging.getInstance().setAutoInitEnabled(NotificationPolicy.autoInitAllowed(!uid.isEmpty(), master(activity, uid), permission(activity), local(activity).getBoolean("blocked:" + uid, false)));
        if (uid.isEmpty()) return;
        if (!verified || !master(activity, uid) || !permission(activity)) {
            disableBinding(uid); boundUid = ""; boundToken = ""; publishState(); return;
        }
        if (binding || deletingToken) return;
        binding = true;
        String account = uid, space = coupleId; long epoch = generation, operation = ++bindingOperation;
        // Activity-scoped task callbacks are removed onStop; returning from Settings must not
        // leave registration permanently stuck at binding=true.
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(result -> {
            if (!scope(account, space, epoch) || operation != bindingOperation) return;
            if (!result.isSuccessful() || result.getResult() == null) { binding = false; error = "Could not register this phone for push. Try again when connected."; retry(account); publishState(); return; }
            String token = result.getResult();
            if (!validToken(token) || !master(activity, account) || !permission(activity) || !verified) { binding = false; return; }
            // The server transaction prevents a cached membership or a pairing race from binding a device.
            db.runTransaction(transaction -> {
                FirebaseUser actual = auth.getCurrentUser();
                if (actual == null || !account.equals(actual.getUid()) || !scope(account, space, epoch)
                        || !master(activity, account) || !permission(activity)) throw new IllegalStateException("Scope changed");
                DocumentSnapshot profile = transaction.get(db.collection("users").document(account));
                DocumentSnapshot member = transaction.get(db.collection("couples").document(space).collection("members").document(account));
                if (!space.equals(profile.getString("coupleId")) || !member.exists()) throw new IllegalStateException("Pairing changed");
                Map<String, Object> device = new LinkedHashMap<>();
                String installation = installation(activity);
                device.put("uid", account); device.put("installationId", installation); device.put("token", token);
                device.put("platform", "android"); device.put("enabled", true); device.put("updatedAt", FieldValue.serverTimestamp());
                transaction.set(db.collection("users").document(account).collection("devices").document(installation), device);
                return null;
            }).addOnCompleteListener(saved -> {
                if (!scope(account, space, epoch) || operation != bindingOperation) return;
                binding = false;
                if (saved.isSuccessful() && master(activity, account) && permission(activity) && verified) {
                    boundUid = account; boundToken = token;
                    local(activity).edit().putString("boundUid", account).apply();
                    error = "";
                } else { disableBinding(account); boundUid = ""; boundToken = ""; error = "Push registration is waiting for a connection."; retry(account); }
                publishState();
            });
        });
    }

    /** Firestore listener failures are terminal. Drop them so refresh can attach after new rules. */
    private void pairingFailure(String account, String message) {
        if (!current(account)) return;
        detach(); generation++; bindingOperation++; verified = false; binding = false;
        PushRelay.setScope(account, coupleId, false);
        disableBinding(account); boundUid = ""; boundToken = "";
        cancelAll(activity); error = message; retry(account); publishState();
    }

    private void retry(String account) {
        if (closed || retryScheduled) return;
        retryScheduled = true;
        handler.postDelayed(() -> {
            retryScheduled = false;
            if (current(account)) refresh();
        }, 15000L);
    }

    /** Explicit shared action, independent of the legacy realtime love counter. */
    @JavascriptInterface public void sendPing() {
        activity.runOnUiThread(() -> {
            if (closed || sendingPing) return;
            if (uid.isEmpty() || coupleId.isEmpty() || !verified) { error = "Sign in and pair your phones before sending a ping."; publishState(); return; }
            sendingPing = true; error = ""; lastAction = "";
            String account = uid, space = coupleId, id = UUID.randomUUID().toString(); long epoch = generation;
            PushRelay.Event event = PushRelay.event(account, space, "ping", id, null);
            PushRelay.run(event, includeOutbox -> db.runTransaction(transaction -> {
                if (!scope(account, space, epoch)) throw new IllegalStateException("Scope changed");
                DocumentSnapshot profile = transaction.get(db.collection("users").document(account));
                DocumentSnapshot member = transaction.get(db.collection("couples").document(space).collection("members").document(account));
                if (!space.equals(profile.getString("coupleId")) || !member.exists()) throw new IllegalStateException("Pairing changed");
                Map<String, Object> fields = new HashMap<>(); fields.put("id", id); fields.put("senderUid", account); fields.put("createdAt", FieldValue.serverTimestamp());
                transaction.set(db.collection("couples").document(space).collection("usPings").document(id), fields);
                if (includeOutbox) PushRelay.write(transaction, event, java.util.Collections.singletonList("pings"));
                return null;
            })).addOnCompleteListener(task -> {
                sendingPing = false;
                if (!scope(account, space, epoch)) return;
                if (task.isSuccessful()) lastAction = "Ping saved to your shared space. Your partner’s notification settings apply.";
                else error = "Could not send the ping. Check your connection and try again.";
                publishState();
            });
        });
    }

    /** Root should call before FirebaseAuth.signOut; deletion finishes before the account is cleared. */
    public void beforeSignOut(Runnable continuation) {
        activity.runOnUiThread(() -> {
            String account = uid; generation++; verified = false; pendingOpen = null; opening = false; openingOperation++; cancelAll(activity);
            PushRelay.revoke();
            bindingOperation++; binding = false;
            FirebaseMessaging.getInstance().setAutoInitEnabled(false);
            if (!account.isEmpty()) local(activity).edit().putBoolean("blocked:" + account, true).commit();
            AtomicBoolean finished = new AtomicBoolean(false);
            Runnable finish = () -> { if (finished.compareAndSet(false, true)) continuation.run(); };
            new Handler(Looper.getMainLooper()).postDelayed(finish, 5000);
            if (account.isEmpty()) { finish.run(); return; }
            disableBinding(account);
            deletingToken = true;
            FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(ignored -> {
                deletingToken = false; boundUid = ""; boundToken = "";
                local(activity).edit().remove("boundUid").apply();
                finish.run();
            });
        });
    }

    private void cleanup(String account) {
        disableBinding(account);
        boundUid = ""; boundToken = "";
        local(activity).edit().remove("boundUid").apply();
        if (deletingToken) return;
        deletingToken = true;
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(ignored -> {
            activity.runOnUiThread(() -> { deletingToken = false; if (!closed) reconcileBinding(); });
        });
    }

    private void disableBinding(String account) {
        if (!NotificationPolicy.id(account)) return;
        db.collection("users").document(account).collection("devices").document(installation(activity))
                .update("enabled", false, "updatedAt", FieldValue.serverTimestamp());
    }

    public void handleIntent(Intent intent) {
        if (intent == null || !intent.hasExtra(OPEN_EXTRA)) return;
        String raw = intent.getStringExtra(OPEN_EXTRA); intent.removeExtra(OPEN_EXTRA);
        try {
            JSONObject value = new JSONObject(raw); Map<String, String> data = new LinkedHashMap<>();
            java.util.Iterator<String> keys = value.keys();
            while (keys.hasNext()) { String key = keys.next(); Object field = value.get(key); if (!(field instanceof String)) return; data.put(key, (String) field); }
            if (!NotificationPolicy.valid(data, System.currentTimeMillis())) return;
            pendingOpen = data; opening = false; openingOperation++;
            if (pageReady) openPending();
        } catch (Exception ignored) { }
    }

    public void onPageReady() { pageReady = true; publishState(); openPending(); }

    private void openPending() {
        Map<String, String> data = pendingOpen;
        if (data == null || !pageReady || closed || opening) return;
        if (!NotificationPolicy.valid(data, System.currentTimeMillis())) { pendingOpen = null; return; }
        FirebaseUser user = auth.getCurrentUser();
        if (user != null && uid.isEmpty()) return; // Initial Firebase auth callback has not reached the bridge yet.
        if (user == null || !user.getUid().equals(data.get("recipientUid"))) { pendingOpen = null; return; }
        String account = user.getUid(), space = data.get("coupleId");
        opening = true; long operation = ++openingOperation;
        db.collection("users").document(account).get(Source.SERVER).addOnCompleteListener(profileTask -> {
            if (!openingCurrent(account, data, operation)) return;
            if (!profileTask.isSuccessful()) { retryOpen(account); return; }
            if (!space.equals(profileTask.getResult().getString("coupleId"))) { opening = false; pendingOpen = null; return; }
            db.collection("couples").document(space).collection("members").document(account).get(Source.SERVER).addOnCompleteListener(memberTask -> {
                if (!openingCurrent(account, data, operation)) return;
                if (!memberTask.isSuccessful()) { retryOpen(account); return; }
                if (!memberTask.getResult().exists()) { opening = false; pendingOpen = null; return; }
                // Check the profile once more before navigation if membership verification raced a re-pair.
                db.collection("users").document(account).get(Source.SERVER).addOnCompleteListener(latestTask -> {
                    if (!openingCurrent(account, data, operation)) return;
                    if (!latestTask.isSuccessful()) { retryOpen(account); return; }
                    opening = false; pendingOpen = null;
                    if (!space.equals(latestTask.getResult().getString("coupleId"))) return;
                    JSONObject route = new JSONObject();
                    try { route.put("route", data.get("route")); route.put("category", data.get("category")); route.put("eventId", data.get("eventId")); route.put("recipientUid", account); route.put("coupleId", space); } catch (Exception ignored) { }
                    eval("window.onUsNotificationOpen&&window.onUsNotificationOpen(" + route + ");");
                });
            });
        });
    }

    private boolean openingCurrent(String account, Map<String, String> data, long operation) {
        return current(account) && pendingOpen == data && openingOperation == operation;
    }

    private void retryOpen(String account) {
        opening = false;
        retry(account);
    }

    private JSONObject state() {
        JSONObject result = new JSONObject();
        try {
            result.put("uid", uid); result.put("signedIn", !uid.isEmpty()); result.put("paired", verified); result.put("permissionGranted", permission(activity));
            result.put("relay", PushRelay.status());
            result.put("enabled", !uid.isEmpty() && master(activity, uid)); result.put("registered", uid.equals(boundUid) && !boundToken.isEmpty());
            result.put("registering", binding); result.put("sendingPing", sendingPing); result.put("error", error); result.put("lastAction", lastAction);
            JSONObject preferences = UserPreferencesBridge.readLocal(activity, uid).optJSONObject("notifications");
            JSONObject quiet = preferences == null ? null : preferences.optJSONObject("quietHours");
            result.put("quietNow", quiet != null && NotificationPolicy.quiet(quiet.optBoolean("enabled", false), quiet.optString("start"), quiet.optString("end"), quiet.optString("timeZone"), Instant.now()));
            org.json.JSONArray blockedChannels = new org.json.JSONArray();
            NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) for (String category : NotificationPolicy.CATEGORIES) {
                NotificationChannel channel = manager.getNotificationChannel("usspace_" + category);
                if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) blockedChannels.put(category);
            }
            result.put("blockedChannels", blockedChannels);
        } catch (Exception ignored) { }
        return result;
    }

    private void publishState() { eval("window.onUsNotificationState&&window.onUsNotificationState(" + state() + ");"); }
    private void eval(String script) { activity.runOnUiThread(() -> { if (!closed && webView != null) webView.evaluateJavascript(script, null); }); }
    private boolean current(String account) { FirebaseUser user = auth.getCurrentUser(); return !closed && user != null && account.equals(uid) && account.equals(user.getUid()); }
    private boolean scope(String account, String space, long epoch) { return current(account) && space.equals(coupleId) && epoch == generation; }
    private void detach() { if (userListener != null) userListener.remove(); if (memberListener != null) memberListener.remove(); userListener = memberListener = null; }
    public void close() {
        // The relay owns application-context retries, not this Activity. Home → exit must
        // keep committed sends alive; each worker verifies auth and server membership.
        // Explicit sign-out and observed account/couple revocation clear the global scope.
        closed = true; generation++; bindingOperation++; openingOperation++;
        handler.removeCallbacksAndMessages(null); detach(); auth.removeAuthStateListener(authListener);
        activity.unregisterReceiver(preferenceReceiver); pendingOpen = null;
    }

    private static SharedPreferences local(Context context) { return context.getSharedPreferences(LOCAL, Context.MODE_PRIVATE); }
    private static String installation(Context context) {
        synchronized (DELIVERY_LOCK) {
            SharedPreferences prefs = local(context); String id = prefs.getString("installationId", "");
            if (!id.matches("[A-Za-z0-9_-]{8,100}")) { id = UUID.randomUUID().toString(); prefs.edit().putString("installationId", id).commit(); }
            return id;
        }
    }
    private static boolean validToken(String token) { return token != null && token.length() >= 20 && token.length() <= 4096 && !token.matches("(?s).*\\s.*"); }
    private static boolean master(Context context, String uid) {
        JSONObject notifications = UserPreferencesBridge.readLocal(context, uid).optJSONObject("notifications");
        return notifications != null && notifications.optBoolean("enabled", false);
    }
    private static boolean permission(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled() && (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
    }
    private static boolean mayShow(Context context, String account, String category) {
        if (local(context).getBoolean("blocked:" + account, false)) return false;
        JSONObject all = UserPreferencesBridge.readLocal(context, account).optJSONObject("notifications");
        if (all == null) return false;
        JSONObject categories = all.optJSONObject("categories"), quiet = all.optJSONObject("quietHours");
        boolean isQuiet = quiet == null || NotificationPolicy.quiet(quiet.optBoolean("enabled", false), quiet.optString("start"), quiet.optString("end"), quiet.optString("timeZone"), Instant.now());
        return NotificationPolicy.allowed(all.optBoolean("enabled", false), categories != null && categories.optBoolean(category, false),
                permission(context), isQuiet, true, true);
    }
    private static void cancelAll(Context context) { NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE); if (manager != null) manager.cancelAll(); }
    public static void createChannels(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        String[] names = {"Pings", "New notes", "Status changes", "Shared goals", "Bucket list", "Memories", "Shared calendar"};
        for (int i = 0; i < NotificationPolicy.CATEGORIES.length; i++) {
            NotificationChannel channel = new NotificationChannel("usspace_" + NotificationPolicy.CATEGORIES[i], names[i], NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Private updates from your paired UsSpace."); channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
    }

    /** Rotation also works while the app is closed. The worker re-verifies scope and local opt-in. */
    public static void registerRefreshedToken(Context context, String token) {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null || !validToken(token) || !master(context, user.getUid()) || !permission(context)) return;
        String account = user.getUid();
        if (local(context).getBoolean("blocked:" + account, false)) return;
        Data input = new Data.Builder().putString("uid", account).putString("token", token).build();
        OneTimeWorkRequest job = new OneTimeWorkRequest.Builder(TokenBindingWorker.class).setInputData(input).build();
        WorkManager.getInstance(context).enqueueUniqueWork("usspace_token_" + installation(context), ExistingWorkPolicy.REPLACE, job);
    }

    public static final class TokenBindingWorker extends Worker {
        public TokenBindingWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
        @NonNull @Override public Result doWork() {
            Context context = getApplicationContext();
            String account = getInputData().getString("uid"), token = getInputData().getString("token");
            if (!NotificationPolicy.id(account) || !validToken(token) || !bindingAllowed(context, account)) return Result.success();
            try {
                String latestToken = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
                if (!token.equals(latestToken) || !bindingAllowed(context, account)) return Result.success();
                FirebaseFirestore db = FirebaseFirestore.getInstance();
                Boolean saved = Tasks.await(db.runTransaction(transaction -> {
                    if (!bindingAllowed(context, account) || isStopped()) throw new IllegalStateException("Scope changed");
                    DocumentSnapshot profile = transaction.get(db.collection("users").document(account));
                    String space = profile.getString("coupleId");
                    if (!NotificationPolicy.id(space)) return false;
                    DocumentSnapshot member = transaction.get(db.collection("couples").document(space).collection("members").document(account));
                    if (!member.exists() || !bindingAllowed(context, account) || isStopped()) return false;
                    String id = installation(context);
                    Map<String, Object> fields = new LinkedHashMap<>();
                    fields.put("uid", account); fields.put("installationId", id); fields.put("token", token);
                    fields.put("platform", "android"); fields.put("enabled", true); fields.put("updatedAt", FieldValue.serverTimestamp());
                    transaction.set(db.collection("users").document(account).collection("devices").document(id), fields);
                    return true;
                }), 30, TimeUnit.SECONDS);
                if (Boolean.TRUE.equals(saved) && bindingAllowed(context, account)) local(context).edit().putString("boundUid", account).apply();
                return Result.success();
            } catch (Exception ignored) { return getRunAttemptCount() < 3 && bindingAllowed(context, account) ? Result.retry() : Result.success(); }
        }
    }

    private static boolean bindingAllowed(Context context, String account) {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        return user != null && account.equals(user.getUid()) && !local(context).getBoolean("blocked:" + account, false)
                && master(context, account) && permission(context);
    }

    /** Android keeps this job alive while server membership is checked; never a local push substitute. */
    public static final class DeliveryWorker extends Worker {
        public DeliveryWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
        @NonNull @Override public Result doWork() {
            Map<String, String> data = new LinkedHashMap<>();
            for (Map.Entry<String, Object> field : getInputData().getKeyValueMap().entrySet()) {
                if (!(field.getValue() instanceof String)) return Result.success();
                data.put(field.getKey(), (String) field.getValue());
            }
            try { deliver(getApplicationContext(), data); return Result.success(); }
            catch (Exception ignored) { return getRunAttemptCount() < 3 ? Result.retry() : Result.success(); }
        }
    }

    private static void deliver(Context context, Map<String, String> data) throws Exception {
        if (!NotificationPolicy.valid(data, System.currentTimeMillis())) return;
        FirebaseAuth auth = FirebaseAuth.getInstance(); FirebaseUser user = auth.getCurrentUser();
        String account = data.get("recipientUid"), space = data.get("coupleId"), category = data.get("category"), event = data.get("eventId");
        if (user == null || !account.equals(user.getUid()) || !mayShow(context, account, category)) return;
        FirebaseFirestore db = FirebaseFirestore.getInstance();
        DocumentSnapshot profile = Tasks.await(db.collection("users").document(account).get(Source.SERVER), 15, TimeUnit.SECONDS);
        if (!NotificationPolicy.identityMatches(data, user.getUid(), profile.getString("coupleId"))) return;
        DocumentSnapshot member = Tasks.await(db.collection("couples").document(space).collection("members").document(account).get(Source.SERVER), 15, TimeUnit.SECONDS);
        if (!member.exists()) return;
        DocumentSnapshot latest = Tasks.await(db.collection("users").document(account).get(Source.SERVER), 15, TimeUnit.SECONDS);
        if (!space.equals(latest.getString("coupleId"))) return;
        synchronized (DELIVERY_LOCK) {
            user = auth.getCurrentUser();
            if (user == null || !account.equals(user.getUid()) || !mayShow(context, account, category)) return;
            SharedPreferences prefs = local(context); String key = "delivered:" + account + ":" + event;
            if (prefs.getLong(key, 0) > 0) return;
            createChannels(context);
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel channel = manager.getNotificationChannel("usspace_" + category);
            if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
            JSONObject envelope = new JSONObject(data);
            Intent intent = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .setData(Uri.parse("usspace://notification/" + event))
                    .putExtra(OPEN_EXTRA, envelope.toString());
            int id = NotificationPolicy.notificationId(event);
            PendingIntent pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification publicVersion = new Notification.Builder(context, "usspace_" + category)
                    .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("UsSpace").setContentText("A private update is waiting.").build();
            Notification notification = new Notification.Builder(context, "usspace_" + category)
                    .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("UsSpace").setContentText(NotificationPolicy.body(category))
                    .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
                    .setPublicVersion(publicVersion).setCategory(Notification.CATEGORY_SOCIAL).build();
            manager.notify("usspace:" + account + ":" + event, id, notification);
            long now = System.currentTimeMillis(); SharedPreferences.Editor update = prefs.edit();
            // Keep every event during the envelope's entire 24-hour retry window, even busy days.
            for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
                if (entry.getKey().startsWith("delivered:") && entry.getValue() instanceof Long
                        && now - (Long) entry.getValue() > 86400000L) update.remove(entry.getKey());
            }
            update.putLong(key, now).commit();
        }
    }
}
