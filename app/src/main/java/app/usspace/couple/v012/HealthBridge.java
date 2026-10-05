package app.usspace.couple.v012;

import android.app.Activity;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.DataOrigin;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.WeightRecord;
import android.os.Build;
import android.os.OutcomeReceiver;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

public class HealthBridge {
    public static final int REQUEST_CODE = 4311;
    private final Activity activity;
    private final WebView webView;

    private int pending;
    private int errors;
    private long steps;
    private double sleep;
    private long hr;
    private double kcal;
    private double spo2;
    private double weight;
    private long exerciseMinutes;
    private int exerciseCount;

    private static final String[] PERMISSIONS = new String[]{
            "android.permission.health.READ_STEPS",
            "android.permission.health.READ_SLEEP",
            "android.permission.health.READ_RESTING_HEART_RATE",
            "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
            "android.permission.health.READ_OXYGEN_SATURATION",
            "android.permission.health.READ_WEIGHT",
            "android.permission.health.READ_EXERCISE"
    };

    public HealthBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean isSupported() { return Build.VERSION.SDK_INT >= 34; }

    private boolean hasAllPermissions() {
        if (!isSupported()) return false;
        for (String p : PERMISSIONS) if (activity.checkSelfPermission(p) != 0) return false;
        return true;
    }

    @JavascriptInterface
    public String status() {
        JSONObject j = new JSONObject();
        try {
            j.put("supported", isSupported());
            j.put("connected", hasAllPermissions());
            j.put("android14plus", Build.VERSION.SDK_INT >= 34);
        } catch (Exception ignored) { }
        return j.toString();
    }

    @JavascriptInterface
    public void requestPermissions() {
        if (!isSupported()) { postState("unsupported"); return; }
        postState("requesting");
        activity.runOnUiThread(() -> activity.requestPermissions(PERMISSIONS, REQUEST_CODE));
    }

    public void onRequestPermissionsResult(int requestCode) {
        if (requestCode != REQUEST_CODE) return;
        if (hasAllPermissions()) { postState("connected"); sync(); }
        else postState("permission_denied");
    }

    @JavascriptInterface
    public void sync() {
        if (!isSupported()) { postState("unsupported"); return; }
        if (!hasAllPermissions()) { postState("permissions"); return; }
        pending = 7; errors = 0; steps = 0; sleep = 0; hr = 0; kcal = 0; spo2 = 0; weight = 0; exerciseMinutes = 0; exerciseCount = 0;
        postState("syncing");

        Instant now = Instant.now();
        Instant dayStart = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant twoDays = now.minusSeconds(2L * 86400L);
        Instant sevenDays = now.minusSeconds(7L * 86400L);
        Instant thirtyDays = now.minusSeconds(30L * 86400L);
        read(1, StepsRecord.class, dayStart, now);
        read(2, SleepSessionRecord.class, twoDays, now);
        read(3, RestingHeartRateRecord.class, sevenDays, now);
        read(4, ActiveCaloriesBurnedRecord.class, dayStart, now);
        read(5, OxygenSaturationRecord.class, thirtyDays, now);
        read(6, WeightRecord.class, thirtyDays, now);
        read(7, ExerciseSessionRecord.class, dayStart, now);
    }

    private <T extends Record> void read(int kind, Class<T> recordClass, Instant start, Instant end) {
        HealthConnectManager manager = activity.getSystemService(HealthConnectManager.class);
        if (manager == null) { finishOne(true); return; }
        try {
            TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                    .setStartTime(start).setEndTime(end).build();
            DataOrigin samsung = new DataOrigin.Builder().setPackageName("com.sec.android.app.shealth").build();
            ReadRecordsRequestUsingFilters<T> request = new ReadRecordsRequestUsingFilters.Builder<>(recordClass)
                    .setTimeRangeFilter(range)
                    .addDataOrigins(samsung)
                    .setAscending(false)
                    .setPageSize(5000)
                    .build();
            manager.readRecords(request, activity::runOnUiThread,
                    new OutcomeReceiver<ReadRecordsResponse<T>, HealthConnectException>() {
                        @Override public void onResult(ReadRecordsResponse<T> result) {
                            handle(kind, result.getRecords());
                            finishOne(false);
                        }
                        @Override public void onError(HealthConnectException error) { finishOne(true); }
                    });
        } catch (Exception e) { finishOne(true); }
    }

    @SuppressWarnings("unchecked")
    private void handle(int kind, List records) {
        try {
            if (kind == 1) {
                long total = 0; for (Object o : records) total += ((StepsRecord)o).getCount(); steps = total;
            } else if (kind == 2 && !records.isEmpty()) {
                SleepSessionRecord r = (SleepSessionRecord) records.get(0);
                sleep = Duration.between(r.getStartTime(), r.getEndTime()).toMinutes() / 60.0;
            } else if (kind == 3 && !records.isEmpty()) {
                hr = ((RestingHeartRateRecord) records.get(0)).getBeatsPerMinute();
            } else if (kind == 4) {
                double total = 0; for (Object o : records) total += ((ActiveCaloriesBurnedRecord)o).getEnergy().getInCalories() / 1000.0; kcal = total;
            } else if (kind == 5 && !records.isEmpty()) {
                spo2 = ((OxygenSaturationRecord)records.get(0)).getPercentage().getValue();
            } else if (kind == 6 && !records.isEmpty()) {
                weight = ((WeightRecord)records.get(0)).getWeight().getInGrams() / 1000.0;
            } else if (kind == 7) {
                long mins = 0; for (Object o : records) { ExerciseSessionRecord r=(ExerciseSessionRecord)o; mins += Duration.between(r.getStartTime(),r.getEndTime()).toMinutes(); }
                exerciseCount = records.size(); exerciseMinutes = mins;
            }
        } catch (Exception e) { errors++; }
    }

    private synchronized void finishOne(boolean error) {
        if (error) errors++;
        pending--;
        if (pending <= 0) postSnapshot();
    }

    private void postSnapshot() {
        JSONObject j = new JSONObject();
        try {
            j.put("date", LocalDate.now().toString());
            j.put("steps", steps);
            j.put("sleep", Math.round(sleep * 10.0) / 10.0);
            j.put("hr", hr);
            j.put("kcal", Math.round(kcal));
            j.put("spo2", Math.round(spo2));
            j.put("weight", Math.round(weight * 10.0) / 10.0);
            j.put("workout", exerciseCount > 0 ? (exerciseCount + " workout" + (exerciseCount == 1 ? "" : "s") + " · " + exerciseMinutes + " min") : "");
            j.put("source", "Samsung Health via Health Connect");
            j.put("errors", errors);
        } catch (Exception ignored) { }
        eval("window.onHealthConnectSnapshot&&window.onHealthConnectSnapshot(" + j + ");");
    }

    private void postState(String state) {
        eval("window.onHealthConnectState&&window.onHealthConnectState(" + JSONObject.quote(state) + ");");
    }

    private void eval(String js) { activity.runOnUiThread(() -> webView.evaluateJavascript(js, null)); }
}
