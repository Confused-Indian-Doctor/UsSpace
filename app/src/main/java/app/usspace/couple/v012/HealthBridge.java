package app.usspace.couple.v012;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.DataOrigin;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
import android.health.connect.datatypes.WeightRecord;
import android.net.Uri;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

/** Read-only Samsung-origin imports. No Health/Cycle field is written to Firebase. */
public class HealthBridge {
    public static final int REQUEST_CODE = 4311;
    private static final String PREFIX = "android.permission.health.READ_";
    private static final String[] PERMISSIONS = {PREFIX + "STEPS", PREFIX + "SLEEP",
            PREFIX + "RESTING_HEART_RATE", PREFIX + "HEART_RATE",
            PREFIX + "ACTIVE_CALORIES_BURNED", PREFIX + "TOTAL_CALORIES_BURNED",
            PREFIX + "OXYGEN_SATURATION", PREFIX + "WEIGHT", PREFIX + "EXERCISE"};
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth;
    private final FirebaseAuth.AuthStateListener authListener;
    private final HealthSyncPolicy.Gate gate = new HealthSyncPolicy.Gate();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String account;
    private volatile boolean closed;
    private boolean pageReady, requesting, externalReturn;
    private Run current;
    private String state = "checking", message = "", lastSync = "";
    private boolean samsungRecordsFound;
    private long lastAttempt;
    private int previousGrants = -1;

    private static final class Run {
        final long token;
        final String uid, date;
        final Instant now, dayStart;
        final JSONObject values = new JSONObject(), fieldTimes = new JSONObject();
        final Map<String, String> fields = new LinkedHashMap<>();
        final Set<String> completed = new HashSet<>();
        Runnable timeout;
        int pending = HealthSyncPolicy.FIELDS.length, errors;
        Run(long token, String uid) {
            this.token = token; this.uid = uid; this.now = Instant.now();
            this.date = HealthSyncPolicy.localDate(now, ZoneId.systemDefault());
            this.dayStart = HealthSyncPolicy.dayStart(now, ZoneId.systemDefault());
            for (String field : HealthSyncPolicy.FIELDS) fields.put(field, "permission_denied");
        }
    }

    public HealthBridge(Activity activity, WebView webView) {
        this.activity = activity; this.webView = webView;
        auth = FirebaseAuth.getInstance(); account = uid();
        authListener = ignored -> activity.runOnUiThread(() -> {
            String next = uid();
            if (closed || next.equals(account)) return;
            account = next; cancelRead(next);
            lastSync = ""; lastAttempt = 0; samsungRecordsFound = false;
            updateState("checking", "");
            if (pageReady) syncInternal();
        });
        auth.addAuthStateListener(authListener);
    }

    private String uid() { FirebaseUser user = auth.getCurrentUser(); return user == null ? "" : user.getUid(); }
    @JavascriptInterface public boolean isSupported() { return Build.VERSION.SDK_INT >= 34; }
    private boolean granted(String permission) {
        return isSupported() && activity.checkSelfPermission(PREFIX + permission) == PackageManager.PERMISSION_GRANTED;
    }
    private int grantedCount() {
        if (!isSupported()) return 0;
        int count = 0;
        for (String permission : PERMISSIONS)
            if (activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) count++;
        return count;
    }
    private boolean samsungInstalled() {
        try { activity.getPackageManager().getPackageInfo(HealthSyncPolicy.SAMSUNG_PACKAGE, 0); return true; }
        catch (PackageManager.NameNotFoundException | SecurityException unavailable) { return false; }
    }
    private JSONObject statusObject() {
        JSONObject result = new JSONObject();
        try {
            int count = grantedCount();
            String visibleState = !isSupported() ? "unsupported" : current != null ? "syncing" : state;
            if ("checking".equals(visibleState)) visibleState = count > 0 ? "connected" : "disconnected";
            if (isSupported() && count == 0 && !requesting && !"permissions".equals(visibleState)
                    && !"permission_denied".equals(visibleState)) visibleState = "disconnected";
            result.put("uid", uid()); result.put("supported", isSupported());
            result.put("connected", count > 0); result.put("allPermissions", count == PERMISSIONS.length);
            result.put("grantedCount", count); result.put("totalPermissions", PERMISSIONS.length);
            result.put("android14plus", isSupported()); result.put("state", visibleState);
            result.put("samsungInstalled", samsungInstalled()); result.put("samsungRecordsFound", samsungRecordsFound);
            result.put("source", "Samsung Health via Health Connect"); result.put("readOnly", true);
            result.put("private", true); result.put("message", message); result.put("lastSync", lastSync);
        } catch (Exception ignored) { }
        return result;
    }
    @JavascriptInterface public String status() { return statusObject().toString(); }
    @JavascriptInterface public void refresh() {
        activity.runOnUiThread(() -> { if (!closed) publishStatus(); });
    }
    public void onPageReady() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            pageReady = true; publishStatus();
            if (grantedCount() > 0 && current == null) syncInternal();
        });
    }
    public void onResume() {
        activity.runOnUiThread(() -> {
            if (closed || !pageReady || requesting) return;
            if (!isSupported()) {
                updateState("unsupported", "Samsung Health sync requires Android 14 or newer."); return;
            }
            int count = grantedCount();
            boolean permissionChange = count != previousGrants;
            boolean returnedFromSettings = externalReturn;
            boolean refreshData = returnedFromSettings || permissionChange || System.currentTimeMillis() - lastAttempt > 60_000;
            externalReturn = false; previousGrants = count;
            // A pre-settings request may omit newly granted types or retain revoked access.
            // Restart with a fresh grant set instead of allowing its late results to win.
            if (current != null && (returnedFromSettings || permissionChange)) cancelRead(uid());
            if (refreshData && count > 0 && current == null) syncInternal();
            else if (count == 0) updateState("permissions", "Choose the data UsSpace may read.");
            else publishStatus();
        });
    }
    @JavascriptInterface public void requestPermissions() {
        activity.runOnUiThread(() -> {
            if (closed || requesting) return;
            if (!isSupported()) { updateState("unsupported", "Samsung Health sync requires Android 14 or newer."); return; }
            requesting = true; updateState("requesting", "Choose any health types you want to import. All access is read-only.");
            try { activity.requestPermissions(PERMISSIONS, REQUEST_CODE); }
            catch (RuntimeException unavailable) { requesting = false; updateState("error", "Open Health Connect settings to grant read access."); }
        });
    }
    public void onRequestPermissionsResult(int requestCode) {
        if (requestCode != REQUEST_CODE) return;
        requesting = false; previousGrants = grantedCount();
        cancelRead(uid());
        if (previousGrants > 0) syncInternal();
        else updateState("permission_denied", "No read access was granted. Manual logging still works.");
    }
    @JavascriptInterface public void openHealthConnectSettings() {
        openSettings(new Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
                .putExtra(Intent.EXTRA_PACKAGE_NAME, activity.getPackageName()),
                new Intent("android.health.connect.action.HEALTH_HOME_SETTINGS"));
    }
    @JavascriptInterface public void openAppSettings() {
        openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + activity.getPackageName())), new Intent(Settings.ACTION_SETTINGS));
    }
    @JavascriptInterface public void openSamsungHealth() {
        Intent launch = null;
        try { launch = activity.getPackageManager().getLaunchIntentForPackage(HealthSyncPolicy.SAMSUNG_PACKAGE); }
        catch (RuntimeException restricted) { /* Offer the official Samsung Health app page below. */ }
        if (launch == null) launch = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/apps/details?id=" + HealthSyncPolicy.SAMSUNG_PACKAGE));
        openSettings(launch, new Intent(Settings.ACTION_SETTINGS));
    }
    private void openSettings(Intent primary, Intent fallback) {
        activity.runOnUiThread(() -> {
            if (closed) return;
            externalReturn = true;
            try { activity.startActivity(primary); }
            catch (RuntimeException unavailable) {
                try { activity.startActivity(fallback); }
                catch (RuntimeException missing) { externalReturn = false; updateState("error", "Open Samsung Health or Health Connect from Android Settings."); }
            }
        });
    }
    @JavascriptInterface public void sync() { activity.runOnUiThread(this::syncInternal); }
    private void syncInternal() {
        if (closed) return;
        if (!isSupported()) { updateState("unsupported", "Samsung Health sync requires Android 14 or newer."); return; }
        if (current != null) { publishStatus(); return; }
        if (grantedCount() == 0) { updateState("permissions", "Choose the data UsSpace may read."); return; }
        if (activity.getSystemService(HealthConnectManager.class) == null) {
            updateState("error", "Health Connect is not available. Check its Android Settings page."); return;
        }
        Run run = new Run(gate.begin(uid()), uid()); current = run;
        lastAttempt = System.currentTimeMillis(); updateState("syncing", "Reading only Samsung Health records.");
        run.timeout = () -> {
            if (!active(run)) return;
            for (String field : HealthSyncPolicy.FIELDS) {
                if (!run.completed.contains(field)) { run.errors++; complete(run, field, "error"); }
            }
        };
        handler.postDelayed(run.timeout, 45_000);
        if (granted("STEPS")) aggregate(run, "steps", StepsRecord.STEPS_COUNT_TOTAL,
                value -> value.longValue(), ""); else complete(run, "steps", "permission_denied");
        if (granted("SLEEP")) read(run, "sleep", SleepSessionRecord.class, run.now.minusSeconds(2 * 86400L), run.now,
                (records) -> receiveSleep(run, records)); else complete(run, "sleep", "permission_denied");
        readHeart(run);
        readCalories(run);
        if (granted("OXYGEN_SATURATION")) read(run, "spo2", OxygenSaturationRecord.class, run.now.minusSeconds(30 * 86400L), run.now,
                records -> {
                    OxygenSaturationRecord latest = null;
                    for (OxygenSaturationRecord record : records)
                        if (latest == null || record.getTime().isAfter(latest.getTime())) latest = record;
                    if (latest == null) complete(run, "spo2", "no_data");
                    else value(run, "spo2", Math.round(latest.getPercentage().getValue()), latest.getTime());
                }); else complete(run, "spo2", "permission_denied");
        if (granted("WEIGHT")) read(run, "weight", WeightRecord.class, run.now.minusSeconds(30 * 86400L), run.now,
                records -> {
                    WeightRecord latest = null;
                    for (WeightRecord record : records)
                        if (latest == null || record.getTime().isAfter(latest.getTime())) latest = record;
                    if (latest == null) complete(run, "weight", "no_data");
                    else value(run, "weight", Math.round(latest.getWeight().getInGrams() / 100.0) / 10.0, latest.getTime());
                }); else complete(run, "weight", "permission_denied");
        if (granted("EXERCISE")) read(run, "workout", ExerciseSessionRecord.class, run.dayStart, run.now,
                records -> {
                    if (records.isEmpty()) { complete(run, "workout", "no_data"); return; }
                    List<long[]> intervals = new ArrayList<>();
                    for (ExerciseSessionRecord record : records)
                        intervals.add(new long[]{record.getStartTime().toEpochMilli(), record.getEndTime().toEpochMilli()});
                    long mins = HealthSyncPolicy.coveredMillis(intervals, run.dayStart.toEpochMilli(), run.now.toEpochMilli()) / 60_000;
                    value(run, "workout", records.size() + " workout" + (records.size() == 1 ? "" : "s") + " · " + mins + " min", run.now);
                }); else complete(run, "workout", "permission_denied");
    }
    private void receiveSleep(Run run, List<SleepSessionRecord> records) {
        SleepSessionRecord latest = null;
        for (SleepSessionRecord record : records)
            if (latest == null || record.getEndTime().isAfter(latest.getEndTime())) latest = record;
        if (latest == null) { complete(run, "sleep", "no_data"); return; }
        long minutes = Math.max(0, Duration.between(latest.getStartTime(), latest.getEndTime()).toMinutes());
        value(run, "sleep", Math.round(minutes / 6.0) / 10.0, latest.getEndTime());
    }
    private void readHeart(Run run) {
        if (granted("RESTING_HEART_RATE"))
            read(run, "hr", RestingHeartRateRecord.class, run.now.minusSeconds(7 * 86400L), run.now,
                    records -> {
                        RestingHeartRateRecord latest = null;
                        for (RestingHeartRateRecord record : records)
                            if (latest == null || record.getTime().isAfter(latest.getTime())) latest = record;
                        if (latest == null) readRecentHeart(run, "no_data");
                        else { put(run.values, "hrType", "resting"); value(run, "hr", latest.getBeatsPerMinute(), latest.getTime()); }
                    }, () -> readRecentHeart(run, "error"));
        else readRecentHeart(run, "permission_denied");
    }
    private void readRecentHeart(Run run, String unavailableState) {
        if (!active(run)) return;
        if (!granted("HEART_RATE")) { complete(run, "hr", unavailableState); return; }
        read(run, "hr", HeartRateRecord.class, run.now.minusSeconds(7 * 86400L), run.now,
                records -> {
                    HeartRateRecord.HeartRateSample latest = null;
                    for (HeartRateRecord record : records)
                        for (HeartRateRecord.HeartRateSample sample : record.getSamples())
                            if (latest == null || sample.getTime().isAfter(latest.getTime())) latest = sample;
                    if (latest == null) complete(run, "hr", "no_data");
                    else { put(run.values, "hrType", "recent"); value(run, "hr", latest.getBeatsPerMinute(), latest.getTime()); }
                });
    }
    private void readCalories(Run run) {
        if (granted("ACTIVE_CALORIES_BURNED"))
            aggregate(run, "kcal", ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    value -> Math.round(value.getInCalories() / 1000.0), "active",
                    () -> readTotalCalories(run, "no_data"), () -> readTotalCalories(run, "error"));
        else readTotalCalories(run, "permission_denied");
    }
    private void readTotalCalories(Run run, String unavailableState) {
        if (!active(run)) return;
        if (!granted("TOTAL_CALORIES_BURNED")) { complete(run, "kcal", unavailableState); return; }
        aggregate(run, "kcal", TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                value -> Math.round(value.getInCalories() / 1000.0), "total");
    }
    private interface Conversion<T> { Object convert(T value); }
    private <T> void aggregate(Run run, String field, AggregationType<T> type, Conversion<T> conversion, String variant) {
        aggregate(run, field, type, conversion, variant, () -> complete(run, field, "no_data"), () -> complete(run, field, "error"));
    }
    private <T> void aggregate(Run run, String field, AggregationType<T> type, Conversion<T> conversion,
                               String variant, Runnable empty, Runnable failed) {
        if (!active(run)) return;
        try {
            AggregateRecordsRequest<T> request = new AggregateRecordsRequest.Builder<T>(range(run.dayStart, run.now))
                    .addAggregationType(type).addDataOriginsFilter(samsung()).build();
            activity.getSystemService(HealthConnectManager.class).aggregate(request, activity::runOnUiThread,
                    new OutcomeReceiver<AggregateRecordsResponse<T>, HealthConnectException>() {
                        @Override public void onResult(AggregateRecordsResponse<T> response) {
                            if (!active(run)) return;
                            T result = response.get(type);
                            if (result == null) { empty.run(); return; }
                            // The request itself is Samsung-only. An empty origin set is allowed by
                            // AggregateRecordsResponse for combined records; reject an explicit mismatch.
                            for (DataOrigin origin : response.getDataOrigins(type)) {
                                if (!HealthSyncPolicy.SAMSUNG_PACKAGE.equals(origin.getPackageName())) {
                                    run.errors++; failed.run(); return;
                                }
                            }
                            try {
                                if (!variant.isEmpty()) put(run.values, "kcalType", variant);
                                value(run, field, conversion.convert(result), run.now);
                            } catch (RuntimeException malformed) { run.errors++; failed.run(); }
                        }
                        @Override public void onError(HealthConnectException error) {
                            if (!active(run)) return;
                            run.errors++; failed.run();
                        }
                    });
        } catch (RuntimeException unavailable) { if (active(run)) { run.errors++; failed.run(); } }
    }
    private <T extends Record> void read(Run run, String field, Class<T> type, Instant start, Instant end, Consumer<List<T>> callback) {
        read(run, field, type, start, end, callback, () -> complete(run, field, "error"));
    }
    private <T extends Record> void read(Run run, String field, Class<T> type, Instant start, Instant end,
                                         Consumer<List<T>> callback, Runnable failed) {
        readPage(run, field, type, start, end, -1, 0, new ArrayList<>(), callback, failed);
    }
    private <T extends Record> void readPage(Run run, String field, Class<T> type, Instant start, Instant end,
                                             long token, int pages, List<T> records, Consumer<List<T>> callback, Runnable failed) {
        if (!active(run)) return;
        if (pages >= 100) { run.errors++; failed.run(); return; }
        try {
            ReadRecordsRequestUsingFilters.Builder<T> builder = new ReadRecordsRequestUsingFilters.Builder<>(type)
                    .setTimeRangeFilter(range(start, end)).addDataOrigins(samsung()).setPageSize(1000);
            // Page tokens encode ordering; the API rejects setAscending with a subsequent page token.
            if (token == -1) builder.setAscending(false); else builder.setPageToken(token);
            activity.getSystemService(HealthConnectManager.class).readRecords(builder.build(), activity::runOnUiThread,
                    new OutcomeReceiver<ReadRecordsResponse<T>, HealthConnectException>() {
                        @Override public void onResult(ReadRecordsResponse<T> response) {
                            if (!active(run)) return;
                            for (T record : response.getRecords())
                                if (HealthSyncPolicy.SAMSUNG_PACKAGE.equals(record.getMetadata().getDataOrigin().getPackageName())) records.add(record);
                            if (response.getNextPageToken() != -1)
                                readPage(run, field, type, start, end, response.getNextPageToken(), pages + 1, records, callback, failed);
                            else try { callback.accept(records); }
                            catch (RuntimeException malformed) { run.errors++; failed.run(); }
                        }
                        @Override public void onError(HealthConnectException error) {
                            if (active(run)) { run.errors++; failed.run(); }
                        }
                    });
        } catch (RuntimeException unavailable) { if (active(run)) { run.errors++; failed.run(); } }
    }
    private static DataOrigin samsung() {
        return new DataOrigin.Builder().setPackageName(HealthSyncPolicy.SAMSUNG_PACKAGE).build();
    }
    private static TimeInstantRangeFilter range(Instant start, Instant end) {
        return new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(end).build();
    }
    private void cancelRead(String nextAccount) {
        gate.invalidate(nextAccount);
        if (current != null && current.timeout != null) handler.removeCallbacks(current.timeout);
        current = null;
    }
    private boolean active(Run run) {
        return !closed && current == run && gate.accepts(run.token, uid()) && run.uid.equals(uid());
    }
    private void value(Run run, String field, Object value, Instant time) {
        if (!active(run)) return;
        put(run.values, field, value); put(run.fieldTimes, field, time.toString());
        complete(run, field, "ready");
    }
    private void complete(Run run, String field, String result) {
        if (!active(run) || !run.completed.add(field)) return;
        run.fields.put(field, result);
        if (--run.pending != 0) return;
        handler.removeCallbacks(run.timeout);
        current = null;
        state = HealthSyncPolicy.state(run.fields, run.errors);
        samsungRecordsFound = run.fields.containsValue("ready");
        lastSync = samsungRecordsFound ? Instant.now().toString() : lastSync;
        message = samsungRecordsFound ? ("partial".equals(state) ? "Some Samsung Health fields are unavailable. Saved readings are preserved." : "Samsung Health readings imported privately.")
                : "error".equals(state) ? "Health Connect could not read Samsung Health. Check read access and try again."
                : "No Samsung Health records were found for the selected data. Open Samsung Health → Settings → Health Connect and allow it to write your chosen data.";
        JSONArray available = new JSONArray();
        for (String key : HealthSyncPolicy.FIELDS) if ("ready".equals(run.fields.get(key))) available.put(key);
        JSONObject snapshot = run.values;
        put(snapshot, "uid", run.uid); put(snapshot, "date", run.date);
        put(snapshot, "availableFields", available); put(snapshot, "fieldStates", new JSONObject(run.fields));
        put(snapshot, "fieldTimes", run.fieldTimes); put(snapshot, "state", state);
        put(snapshot, "syncedAt", Instant.now().toString()); put(snapshot, "source", "Samsung Health via Health Connect");
        put(snapshot, "errors", run.errors);
        // Recheck at delivery as sign-out may occur between an asynchronous result and WebView dispatch.
        eval("window.onHealthConnectSnapshot&&window.onHealthConnectSnapshot(" + snapshot + ");", run.uid);
        publishStatus();
    }
    private static void put(JSONObject target, String key, Object value) {
        try { target.put(key, value); } catch (Exception ignored) { }
    }
    private void updateState(String next, String detail) { state = next; message = detail; publishStatus(); }
    private void publishStatus() {
        if (closed) return;
        JSONObject status = statusObject();
        String visible = status.optString("state");
        eval("window.onHealthConnectState&&window.onHealthConnectState(" + JSONObject.quote(visible) + ");"
                + "window.onHealthConnectStatus&&window.onHealthConnectStatus(" + status + ");", uid());
    }
    private void eval(String script, String expectedAccount) {
        activity.runOnUiThread(() -> {
            if (!closed && !activity.isFinishing() && !activity.isDestroyed() && expectedAccount.equals(uid()))
                webView.evaluateJavascript(script, null);
        });
    }
    public void close() {
        closed = true; gate.close();
        if (current != null && current.timeout != null) handler.removeCallbacks(current.timeout);
        current = null; auth.removeAuthStateListener(authListener);
    }
}
