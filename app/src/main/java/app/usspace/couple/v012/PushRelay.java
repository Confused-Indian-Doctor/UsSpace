package app.usspace.couple.v012;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskCompletionSource;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.Source;
import com.google.firebase.firestore.Transaction;
import com.google.firebase.firestore.WriteBatch;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Trusted, data-free relay hint. The server rereads every persisted source and recipient policy. */
public final class PushRelay {
    public static final String CHANGED = "app.usspace.couple.v012.PUSH_RELAY_CHANGED";
    // Set to the deployed HTTPS service at release time. Empty configuration safely keeps existing sync working.
    public static final String BASE_URL = "https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-push";
    private static Context context;
    private static String uid = "", coupleId = "", error = "", outcome = "";
    private static boolean ready, probing, verified;
    private static long checkedAt = -1L, readyAt = -1L, generation, capabilityRevision;
    private static ListenerRegistration listener;
    private static final java.util.concurrent.ExecutorService network = Executors.newSingleThreadExecutor();
    private PushRelay() { }
    public static synchronized void initialize(Context value) { if (context == null) context = value.getApplicationContext(); }
    public static synchronized void setScope(String account, String space, boolean serverVerified) {
        account = account == null ? "" : account; space = space == null ? "" : space;
        if (!account.equals(uid) || !space.equals(coupleId) || verified != serverVerified) {
            if (listener != null) listener.remove(); listener = null;
            // UI recreation and a temporary listener failure also suspend verification. Keep
            // committed work: its Worker independently rereads current auth and live membership.
            generation++; capabilityRevision++; uid = account; coupleId = space; verified = serverVerified; ready = false; probing = false; checkedAt = readyAt = -1L; error = ""; outcome = "";
        }
        refresh();
    }
    /** Explicit user sign-out may cancel retries; suspending a UI listener must not. */
    public static synchronized void revoke() {
        if (context != null && !uid.isEmpty()) try {
            WorkManager.getInstance(context).cancelAllWorkByTag(tag(uid, coupleId));
        } catch (RuntimeException ignored) { }
        setScope("", "", false);
    }
    public static synchronized void refresh() {
        if (context == null || !verified || !PushEventPolicy.id(uid) || !PushEventPolicy.id(coupleId)) return;
        if (BASE_URL.isEmpty()) { ready = false; readyAt = -1L; error = "Background delivery service has not been configured."; changed(); return; }
        if (probing || !PushEventPolicy.capabilityRefreshDue(checkedAt, SystemClock.elapsedRealtime())) return;
        final String account = uid, space = coupleId; final long epoch = generation, revision = capabilityRevision; probing = true;
        network.execute(() -> {
            boolean available = false, definitive = false;
            try {
                HttpResponse response = request("GET", "/capabilities", null, null);
                JSONObject body = response.body;
                available = response.status == 200 && body.optBoolean("ready") && body.optInt("protocol") == 1
                    && body.optBoolean("firestoreRulesReady") && "usspace-c859e".equals(body.optString("projectId"));
                // Explicit unavailable/incompatible setup revokes trust immediately. A temporary
                // connection failure retains a recent successful check while durable work retries.
                definitive = response.status == 200 || !PushEventPolicy.retryable(response.status);
            } catch (Exception ignored) { }
            synchronized (PushRelay.class) {
                if (!scope(account, space, epoch) || capabilityRevision != revision) return;
                probing = false; checkedAt = SystemClock.elapsedRealtime();
                if (available) { ready = true; readyAt = checkedAt; }
                else if (definitive) { ready = false; readyAt = -1L; if (listener != null) listener.remove(); listener = null; }
                boolean usable = PushEventPolicy.capabilityUsable(ready, readyAt, checkedAt);
                error = available ? "" : usable
                    ? "The server check is waiting for a connection. Notifications remain queued for delivery."
                    : "Background delivery is waiting for the server setup. Shared edits still sync normally.";
                if (available) attach(account, space, epoch); changed();
            }
        });
    }
    public static synchronized JSONObject status() {
        JSONObject result = new JSONObject();
        try { result.put("configured", !BASE_URL.isEmpty()); result.put("ready", verified && PushEventPolicy.capabilityUsable(ready, readyAt, SystemClock.elapsedRealtime()));
            result.put("checking", probing); result.put("error", error); result.put("lastOutcome", outcome); }
        catch (Exception ignored) { }
        return result;
    }
    public static final class Event {
        final String uid, coupleId, id, kind, sourceId, receiptId; final long epoch;
        volatile boolean written;
        private Event(String account, String space, String kind, String source, String receipt, long epoch) {
            this.uid = account; coupleId = space; id = UUID.randomUUID().toString(); this.kind = kind; sourceId = source; receiptId = receipt; this.epoch = epoch;
        }
    }
    public static synchronized Event event(String account, String space, String kind, String sourceId, String receiptId) {
        refresh();
        if (!PushEventPolicy.capabilityUsable(ready, readyAt, SystemClock.elapsedRealtime()) || !scope(account, space, generation)
                || !PushEventPolicy.source(kind, sourceId, account, receiptId)) return null;
        return new Event(account, space, kind, sourceId, receiptId, generation);
    }
    public static void write(Transaction transaction, Event event, List<String> categories) {
        Map<String,Object> data = eventData(event, categories);
        if (data == null) return;
        transaction.set(FirebaseFirestore.getInstance().collection("couples").document(event.coupleId).collection("pushOutbox").document(event.id), data);
        event.written = true;
    }
    public static void write(WriteBatch batch, Event event, List<String> categories) {
        Map<String,Object> data = eventData(event, categories);
        if (data == null) return;
        batch.set(FirebaseFirestore.getInstance().collection("couples").document(event.coupleId).collection("pushOutbox").document(event.id), data);
        event.written = true;
    }
    private static Map<String,Object> eventData(Event event, List<String> categories) {
        if (event == null || categories == null || categories.isEmpty()) return null;
        synchronized (PushRelay.class) {
            if (!scope(event.uid, event.coupleId, event.epoch)) throw new IllegalStateException("Pairing changed");
            if (!PushEventPolicy.capabilityUsable(ready, readyAt, SystemClock.elapsedRealtime())) return null;
        }
        Map<String,Object> data = new HashMap<>(); data.put("id", event.id); data.put("actorUid", event.uid);
        data.put("sourceKind", event.kind); data.put("sourceId", event.sourceId); data.put("categories", categories); data.put("createdAt", FieldValue.serverTimestamp());
        if (event.receiptId != null) data.put("receiptId", event.receiptId);
        return data;
    }
    @FunctionalInterface public interface Mutation<T> { Task<T> run(boolean includeOutbox); }
    /** A missing new outbox rule never prevents the original source/receipt mutation from succeeding. */
    public static <T> Task<T> run(Event event, Mutation<T> mutation) {
        TaskCompletionSource<T> result = new TaskCompletionSource<>(); attempt(event, mutation, event != null, result); return result.getTask();
    }
    private static <T> void attempt(Event event, Mutation<T> mutation, boolean include, TaskCompletionSource<T> result) {
        try {
            if (event != null) event.written = false;
            mutation.run(include).addOnCompleteListener(task -> {
                if (task.isSuccessful()) {
                    if (include && event != null && event.written) enqueue(event.uid, event.coupleId, event.id);
                    result.trySetResult(task.getResult()); return;
                }
                Exception failure = task.getException() == null ? new IllegalStateException("Update failed") : task.getException();
                if (include && permissionDenied(failure)) {
                    synchronized (PushRelay.class) {
                        if (scope(event.uid, event.coupleId, event.epoch)) { ready = false; readyAt = -1L; probing = false; capabilityRevision++; checkedAt = SystemClock.elapsedRealtime(); if (listener != null) listener.remove(); listener = null; error = "Background notifications need the latest notification rules. Retrying this shared edit normally."; changed(); }
                    }
                    attempt(event, mutation, false, result);
                } else result.trySetException(failure);
            });
        } catch (Exception failure) { result.trySetException(failure); }
    }
    public static boolean permissionDenied(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) if (cause instanceof FirebaseFirestoreException
                && ((FirebaseFirestoreException)cause).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED) return true;
        return false;
    }
    private static synchronized boolean scope(String account, String space, long epoch) {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        return verified && generation == epoch && account.equals(uid) && space.equals(coupleId) && user != null && account.equals(user.getUid());
    }
    private static synchronized void attach(String account, String space, long epoch) {
        if (listener != null) listener.remove();
        listener = FirebaseFirestore.getInstance().collection("couples").document(space).collection("pushOutbox")
            .whereEqualTo("actorUid", account).orderBy("createdAt", Query.Direction.DESCENDING).limit(100)
            .addSnapshotListener((snapshot, failure) -> {
                synchronized (PushRelay.class) {
                    if (!scope(account, space, epoch)) return;
                    if (failure != null) { error = "Notification retries are waiting for the server index or rules. Shared edits still work."; changed(); return; }
                    if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
                    for (DocumentSnapshot event : snapshot.getDocuments()) {
                        Timestamp created = event.getTimestamp("createdAt");
                        if (created != null && PushEventPolicy.activeEvent(created.toDate().getTime(), System.currentTimeMillis())) enqueue(account, space, event.getId());
                    }
                }
            });
    }
    private static void enqueue(String account, String space, String eventId) {
        Context app; synchronized (PushRelay.class) { app = context; } if (app == null) return;
        try {
            Data data = new Data.Builder().putString("uid", account).putString("coupleId", space).putString("eventId", eventId).build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(RelayWorker.class).setInputData(data)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).addTag(tag(account, space)).build();
            WorkManager.getInstance(app).enqueueUniqueWork("usspace-relay:" + digest(account + ":" + space + ":" + eventId), ExistingWorkPolicy.KEEP, request);
        } catch (RuntimeException ignored) { /* The committed server outbox remains available after restart. */ }
    }
    private static String tag(String account, String space) { return "usspace-relay-scope:" + digest(account + ":" + space); }
    private static String digest(String value) {
        try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(); for (byte b : bytes) result.append(String.format(java.util.Locale.US, "%02x", b & 255)); return result.toString(); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
    private static void changed() { if (context != null) context.sendBroadcast(new Intent(CHANGED).setPackage(context.getPackageName())); }
    private static final class HttpResponse { int status; JSONObject body; HttpResponse(int status, JSONObject body) { this.status = status; this.body = body; } }
    private static HttpResponse request(String method, String path, String token, JSONObject body) throws Exception {
        URL url = new URL(BASE_URL + path); if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null) throw new IllegalStateException("HTTPS required");
        HttpURLConnection connection = (HttpURLConnection)url.openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json"); if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) { connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); } }
            int code = connection.getResponseCode(); InputStream raw = code >= 200 && code < 400 ? connection.getInputStream() : connection.getErrorStream();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (raw != null) try (InputStream input = raw) { byte[] buffer = new byte[1024]; int read; while ((read = input.read(buffer)) != -1) { if (bytes.size() + read > 16384) throw new IllegalStateException("Response too large"); bytes.write(buffer, 0, read); } }
            String text = bytes.toString("UTF-8"); return new HttpResponse(code, text.isEmpty() ? new JSONObject() : new JSONObject(text));
        } finally { connection.disconnect(); }
    }
    public static final class RelayWorker extends Worker {
        public RelayWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }
        @NonNull @Override public Result doWork() {
            String account = getInputData().getString("uid"), space = getInputData().getString("coupleId"), eventId = getInputData().getString("eventId");
            if (!PushEventPolicy.id(account) || !PushEventPolicy.id(space) || !PushEventPolicy.id(eventId) || BASE_URL.isEmpty()) return Result.success();
            FirebaseAuth auth = FirebaseAuth.getInstance(); FirebaseUser user = auth.getCurrentUser();
            if (user == null || !account.equals(user.getUid())) return Result.success();
            try {
                FirebaseFirestore db = FirebaseFirestore.getInstance();
                DocumentSnapshot profile = Tasks.await(db.collection("users").document(account).get(Source.SERVER), 15, TimeUnit.SECONDS);
                DocumentSnapshot member = Tasks.await(db.collection("couples").document(space).collection("members").document(account).get(Source.SERVER), 15, TimeUnit.SECONDS);
                if (!space.equals(profile.getString("coupleId")) || !member.exists()) return Result.success();
                DocumentSnapshot event = Tasks.await(db.collection("couples").document(space).collection("pushOutbox").document(eventId).get(Source.SERVER), 15, TimeUnit.SECONDS);
                Timestamp created = event.getTimestamp("createdAt");
                if (!event.exists() || !account.equals(event.getString("actorUid")) || created == null || !PushEventPolicy.activeEvent(created.toDate().getTime(), System.currentTimeMillis())) return Result.success();
                JSONObject body = new JSONObject().put("coupleId", space).put("eventId", eventId);
                HttpResponse response = null;
                for (int attempt = 0; attempt < 2; attempt++) {
                    user = auth.getCurrentUser(); if (user == null || !account.equals(user.getUid()) || isStopped()) return Result.success();
                    String token = Tasks.await(user.getIdToken(attempt > 0), 15, TimeUnit.SECONDS).getToken();
                    if (token == null || auth.getCurrentUser() == null || !account.equals(auth.getCurrentUser().getUid())) return Result.success();
                    response = request("POST", "/relay", token, body); if (response.status != 401) break;
                }
                if (response.status >= 200 && response.status < 300 && response.body.optBoolean("consumed")) {
                    synchronized (PushRelay.class) { if (account.equals(uid) && space.equals(coupleId)) { outcome = response.body.optString("outcome"); changed(); } }
                    return Result.success();
                }
                return PushEventPolicy.retryable(response.status) ? Result.retry() : Result.success();
            } catch (Exception failure) { return permissionDenied(failure) ? Result.success() : Result.retry(); }
        }
    }
}
