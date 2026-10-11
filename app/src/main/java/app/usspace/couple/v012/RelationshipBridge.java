package app.usspace.couple.v012;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Source;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Couple-scoped relationship date; never part of the common or private health projections. */
public final class RelationshipBridge {
    private static final String STORAGE = "usspace_v015_relationship";
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth = FirebaseAuth.getInstance();
    private final FirebaseFirestore db = FirebaseFirestore.getInstance();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final FirebaseAuth.AuthStateListener authListener;
    private ListenerRegistration userListener, memberListener, coupleListener, relationshipListener;
    private volatile String uid = "", coupleId = "", date = RelationshipPolicy.DEFAULT_START_DATE;
    private volatile String syncState = "local", error = "", renderedState = "{}";
    private volatile long authGeneration = 0, scopeGeneration = 0, mutationGeneration = 0, editGeneration = 0;
    private volatile boolean closed = false, paired = false;
    private boolean userReady = false, memberReady = false, coupleReady = false, memberExists = false;
    private boolean twoMembers = false, writing = false;
    private boolean storageBlocked = false;
    private String acknowledgedKey = "", acknowledgedOperation = "";
    private static final String STORAGE_SAVE_ERROR = "This phone could not save the date. Free some storage, then try again.";
    private static final String STORAGE_ACK_ERROR = "Your date reached your space, but this phone could not finish saving. Free some storage, then reopen the app.";
    private static final String STORAGE_CACHE_ERROR = "The shared date is available, but this phone could not keep an offline copy. Free some storage, then refresh.";
    private int retrySeconds = 5;

    public RelationshipBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        date = readDate("local:guest");
        authListener = firebaseAuth -> activity.runOnUiThread(() -> observeAuth(firebaseAuth.getCurrentUser()));
        auth.addAuthStateListener(authListener);
        publish();
    }

    @JavascriptInterface public String status() {
        // Never return the previous account's cached state during an auth callback race.
        if (!actualUid().equals(uid)) return safeState(actualUid());
        return renderedState;
    }

    @JavascriptInterface public void refresh() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            observeAuth(auth.getCurrentUser());
            if (!uid.isEmpty() && userListener == null) attachUser(uid, authGeneration);
            if (userReady && !coupleId.isEmpty() && (memberListener == null || coupleListener == null)) attachPair();
            if (paired && relationshipListener == null) attachRelationship();
            retryAcknowledgementCleanup();
            flush();
            publish();
        });
    }

    @JavascriptInterface public void updateStartDate(String requestedDate) {
        final String account = actualUid();
        final long authEpoch = authGeneration, scopeEpoch = scopeGeneration;
        final String space = coupleId;
        activity.runOnUiThread(() -> {
            if (closed || !actualUid().equals(account) || !uid.equals(account)
                    || authGeneration != authEpoch || scopeGeneration != scopeEpoch || !coupleId.equals(space)) return;
            if (!RelationshipPolicy.validDate(requestedDate)) {
                error = "Choose a valid date between 1900 and 2200.";
                publish();
                return;
            }
            if (!uid.isEmpty() && (!userReady || (!coupleId.isEmpty() && (!memberReady || !coupleReady)))) {
                error = "Checking your current space. Please try saving again in a moment.";
                publish();
                return;
            }
            // Durability precedes changing any UI state or starting a shared transaction.
            // A persisted operation is owned by this actual native UID and exact current couple.
            boolean saved = paired ? savePending(pairKey(), requestedDate, UUID.randomUUID().toString())
                    : saveDate(localKey(), requestedDate);
            if (!saved) { error = STORAGE_SAVE_ERROR; publish(); return; }
            date = requestedDate;
            editGeneration++;
            storageBlocked = false;
            acknowledgedKey = acknowledgedOperation = "";
            error = "";
            syncState = paired ? "pending" : "local";
            publish();
            flush();
        });
    }

    private void observeAuth(FirebaseUser user) {
        if (closed) return;
        String next = user == null ? "" : user.getUid();
        if (next.equals(uid) && (next.isEmpty() || userListener != null)) return;
        detachAll();
        handler.removeCallbacksAndMessages(null);
        authGeneration++;
        scopeGeneration++;
        uid = next;
        coupleId = "";
        paired = userReady = memberReady = coupleReady = memberExists = twoMembers = writing = false;
        storageBlocked = false;
        acknowledgedKey = acknowledgedOperation = "";
        retrySeconds = 5;
        error = "";
        date = readDate(localKey());
        syncState = next.isEmpty() ? "local" : "connecting";
        publish();
        if (!next.isEmpty()) attachUser(next, authGeneration);
    }

    private void attachUser(String account, long epoch) {
        userListener = db.collection("users").document(account).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!accountLive(account, epoch)) return;
            if (failure != null) {
                if (userListener != null) userListener.remove();
                userListener = null;
                userReady = false;
                invalidatePair("Your space could not be checked. Your local date is still saved.");
                handler.postDelayed(() -> { if (accountLive(account, epoch) && userListener == null) refresh(); }, 10000L);
                return;
            }
            // Cached user/couple identifiers alone cannot authorize exposing shared state or writing it.
            if (snapshot == null || snapshot.getMetadata().isFromCache() || snapshot.getMetadata().hasPendingWrites()) return;
            String next = snapshot.exists() ? stringField(snapshot, "coupleId") : "";
            if (!RelationshipPolicy.validScopeId(next)) next = "";
            userReady = true;
            if (!next.equals(coupleId)) {
                detachPair();
                scopeGeneration++;
                coupleId = next;
                paired = memberReady = coupleReady = memberExists = twoMembers = writing = false;
                storageBlocked = false;
                acknowledgedKey = acknowledgedOperation = "";
                date = readDate(localKey());
                error = "";
            }
            if (coupleId.isEmpty()) syncState = "local";
            else if (memberListener == null || coupleListener == null) attachPair();
            publish();
        });
    }

    private void attachPair() {
        if (!userReady || uid.isEmpty() || coupleId.isEmpty() || closed) return;
        String account = uid, space = coupleId;
        long epoch = authGeneration, scopeEpoch = scopeGeneration;
        if (memberListener == null) memberListener = db.collection("couples").document(space).collection("members").document(account)
                .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
                    if (!scopeLive(account, space, epoch, scopeEpoch)) return;
                    if (failure != null) { if (memberListener != null) memberListener.remove(); memberListener = null; memberReady = false;
                        invalidatePair("Your membership could not be checked. Refresh to reconnect."); return; }
                    if (snapshot == null || snapshot.getMetadata().isFromCache() || snapshot.getMetadata().hasPendingWrites()) return;
                    memberReady = true;
                    memberExists = snapshot.exists();
                    reconcilePair();
                });
        if (coupleListener == null) coupleListener = db.collection("couples").document(space)
                .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
                    if (!scopeLive(account, space, epoch, scopeEpoch)) return;
                    if (failure != null) { if (coupleListener != null) coupleListener.remove(); coupleListener = null; coupleReady = false;
                        invalidatePair("Your space could not be checked. Refresh to reconnect."); return; }
                    if (snapshot == null || snapshot.getMetadata().isFromCache() || snapshot.getMetadata().hasPendingWrites()) return;
                    coupleReady = true;
                    twoMembers = snapshot.exists() && Long.valueOf(2).equals(snapshot.getLong("memberCount"));
                    reconcilePair();
                });
    }

    private void reconcilePair() {
        if (!userReady || !memberReady || !coupleReady) return;
        boolean nextPaired = memberExists && twoMembers;
        if (!nextPaired) {
            // A server-confirmed disconnect revokes pending disclosure to the old pair,
            // including a queue restored after an app restart.
            Map<String, String> removals = new LinkedHashMap<>();
            removals.put(pairKey(), null);
            removals.put("pending:" + pairKey(), null);
            boolean removed = persist(removals);
            invalidatePair(removed ? "" : "Your old shared date is hidden. Free some storage, then refresh to clear its local copy.");
            return;
        }
        if (!paired) {
            paired = true;
            date = readDate(pairKey());
            syncState = readPending(pairKey()).length() == 0 ? "connecting" : "pending";
            error = "";
        }
        if (relationshipListener == null) attachRelationship();
        publish();
        flush();
    }

    private void attachRelationship() {
        if (!paired || closed) return;
        String account = uid, space = coupleId;
        long epoch = authGeneration, scopeEpoch = scopeGeneration;
        relationshipListener = relationshipRef(space).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!scopeLive(account, space, epoch, scopeEpoch) || !paired) return;
            if (failure != null) {
                if (relationshipListener != null) relationshipListener.remove();
                relationshipListener = null;
                syncState = readPending(pairKey()).length() == 0 ? "local" : "pending";
                error = "Date saved on this phone. Publish the latest Firestore rules, then refresh to sync.";
                publish();
                handler.postDelayed(() -> { if (scopeLive(account, space, epoch, scopeEpoch) && paired && relationshipListener == null) refresh(); }, 10000L);
                return;
            }
            if (snapshot == null) return;
            JSONObject pending = readPending(pairKey());
            if (pending.length() > 0) date = pending.optString("date", date);
            else if (snapshot.exists()) date = RelationshipPolicy.dateOrDefault(stringField(snapshot, "startDate"));
            else if (!snapshot.getMetadata().isFromCache()) date = RelationshipPolicy.DEFAULT_START_DATE;
            // A pending edit was already persisted atomically by Save. Rewriting its
            // cache here would mask a failed acknowledgement cleanup with another attempt.
            boolean cached = pending.length() > 0 || saveDate(pairKey(), date);
            syncState = pending.length() > 0 ? "pending" : snapshot.getMetadata().isFromCache() ? "local" : "synced";
            error = storageBlocked ? STORAGE_ACK_ERROR : cached ? "" : STORAGE_CACHE_ERROR;
            publish();
            flush();
        });
    }

    private void flush() {
        if (closed || writing || storageBlocked || !paired || !userReady || !memberReady || !coupleReady) return;
        String account = uid, space = coupleId, key = pairKey();
        long epoch = authGeneration, scopeEpoch = scopeGeneration;
        long writeEpoch = mutationGeneration;
        long editEpoch = editGeneration;
        JSONObject queued = readPending(key);
        if (queued.length() == 0 || !scopeLive(account, space, epoch, scopeEpoch)) return;
        String requestedDate = queued.optString("date"), operation = queued.optString("operation");
        writing = true;
        syncState = "pending";
        db.runTransaction(transaction -> {
            DocumentSnapshot user = transaction.get(db.collection("users").document(account));
            DocumentReference couple = db.collection("couples").document(space);
            DocumentSnapshot membership = transaction.get(couple.collection("members").document(account));
            DocumentSnapshot room = transaction.get(couple);
            DocumentReference target = relationshipRef(space);
            // The transaction reads the existing target so concurrent shared edits retry safely.
            transaction.get(target);
            if (!scopeLive(account, space, epoch, scopeEpoch) || mutationGeneration != writeEpoch || !paired || !user.exists()
                    || !space.equals(stringField(user, "coupleId")) || !membership.exists() || !room.exists()
                    || !Long.valueOf(2).equals(room.getLong("memberCount"))) throw new IllegalStateException("Your paired space changed.");
            Map<String, Object> values = new LinkedHashMap<>();
            values.put("startDate", requestedDate);
            values.put("updatedBy", account);
            values.put("updatedAt", FieldValue.serverTimestamp());
            transaction.set(target, values);
            return null;
        }).addOnCompleteListener(task -> {
            if (!scopeLive(account, space, epoch, scopeEpoch) || mutationGeneration != writeEpoch || !paired) return;
            writing = false;
            if (!task.isSuccessful()) {
                syncState = "pending";
                error = "Date saved on this phone. Shared saving will retry when your space is available.";
                publish();
                int seconds = retrySeconds;
                retrySeconds = Math.min(60, retrySeconds * 2);
                handler.postDelayed(() -> { if (scopeLive(account, space, epoch, scopeEpoch)) flush(); }, seconds * 1000L);
                return;
            }
            retrySeconds = 5;
            JSONObject pending = readPending(key);
            if (RelationshipPolicy.acknowledges(operation, pending.optString("operation"))) {
                if (!removePending(key)) {
                    // The server write succeeded. Suspend automatic re-sends while this
                    // exact durable operation awaits local acknowledgement cleanup.
                    storageBlocked = true;
                    acknowledgedKey = key;
                    acknowledgedOperation = operation;
                    syncState = "pending";
                    error = STORAGE_ACK_ERROR;
                    publish();
                    return;
                }
                date = requestedDate;
            }
            syncState = readPending(key).length() == 0 ? "synced" : "pending";
            error = "";
            publish();
            flush();
            // A partner edit can arrive while our transaction acknowledgement is in flight.
            // Fetch the latest server value after the queue drains so it is never hidden by
            // the optimistic overlay after that acknowledgement.
            if (readPending(key).length() == 0) relationshipRef(space).get(Source.SERVER).addOnSuccessListener(latest -> {
                if (!scopeLive(account, space, epoch, scopeEpoch) || mutationGeneration != writeEpoch
                        || editGeneration != editEpoch || !paired || readPending(key).length() > 0 || !latest.exists()) return;
                date = RelationshipPolicy.dateOrDefault(stringField(latest, "startDate"));
                if (!saveDate(key, date)) error = STORAGE_CACHE_ERROR;
                publish();
            });
        });
    }

    private void invalidatePair(String message) {
        mutationGeneration++;
        if (relationshipListener != null) relationshipListener.remove();
        relationshipListener = null;
        paired = writing = false;
        date = readDate(localKey());
        syncState = "local";
        error = message;
        publish();
    }

    private DocumentReference relationshipRef(String space) {
        return db.collection("couples").document(space).collection("relationship").document("profile");
    }
    private String stringField(DocumentSnapshot snapshot, String field) { Object value = snapshot.get(field); return value instanceof String ? (String) value : ""; }
    private String actualUid() { FirebaseUser user = auth.getCurrentUser(); return user == null ? "" : user.getUid(); }
    private boolean accountLive(String account, long epoch) { return !closed && authGeneration == epoch && account.equals(uid) && actualUid().equals(account); }
    private boolean scopeLive(String account, String space, long epoch, long scopeEpoch) { return accountLive(account, epoch) && scopeGeneration == scopeEpoch && space.equals(coupleId); }
    private String localKey() { return uid.isEmpty() ? "local:guest" : "local:account:" + uid; }
    private String pairKey() { return "pair:" + uid + ":" + coupleId; }
    private SharedPreferences storage() { return activity.getSharedPreferences(STORAGE, Context.MODE_PRIVATE); }
    private String readDate(String key) { return RelationshipPolicy.dateOrDefault(storage().getString(key, "")); }
    private boolean persist(Map<String, String> changes) {
        SharedPreferences preferences = storage();
        return RelationshipPolicy.commitKeepingPrevious(new RelationshipPolicy.StringStore() {
            @Override public String read(String key) { return preferences.contains(key) ? preferences.getString(key, null) : null; }
            @Override public boolean commit(Map<String, String> values) {
                SharedPreferences.Editor editor = preferences.edit();
                for (Map.Entry<String, String> entry : values.entrySet()) {
                    if (entry.getValue() == null) editor.remove(entry.getKey());
                    else editor.putString(entry.getKey(), entry.getValue());
                }
                return editor.commit();
            }
        }, changes);
    }
    private boolean saveDate(String key, String value) { Map<String, String> changes = new LinkedHashMap<>(); changes.put(key, value); return persist(changes); }
    private boolean removePending(String key) { Map<String, String> changes = new LinkedHashMap<>(); changes.put("pending:" + key, null); return persist(changes); }
    private JSONObject readPending(String key) {
        try {
            JSONObject pending = new JSONObject(storage().getString("pending:" + key, "{}"));
            if (RelationshipPolicy.validDate(pending.optString("date")) && !pending.optString("operation").isEmpty()) return pending;
        } catch (Exception ignored) { }
        return new JSONObject();
    }
    private boolean savePending(String key, String value, String operation) {
        try {
            Map<String, String> changes = new LinkedHashMap<>();
            changes.put(key, value);
            changes.put("pending:" + key, new JSONObject().put("date", value).put("operation", operation).toString());
            return persist(changes);
        } catch (Exception ignored) { return false; }
    }
    private void retryAcknowledgementCleanup() {
        if (!storageBlocked || !paired || !pairKey().equals(acknowledgedKey)) return;
        JSONObject pending = readPending(acknowledgedKey);
        if (RelationshipPolicy.acknowledges(acknowledgedOperation, pending.optString("operation"))) {
            if (!removePending(acknowledgedKey)) { error = STORAGE_ACK_ERROR; publish(); return; }
        }
        storageBlocked = false;
        acknowledgedKey = acknowledgedOperation = "";
        syncState = readPending(pairKey()).length() == 0 ? "synced" : "pending";
        error = "";
        // Reattach after the local queue drains so any intervening partner date is restored.
        if (relationshipListener != null) relationshipListener.remove();
        relationshipListener = null;
        attachRelationship();
        publish();
    }
    private String safeState(String account) {
        try { return new JSONObject().put("uid", account).put("coupleId", "").put("signedIn", !account.isEmpty())
                .put("paired", false).put("startDate", RelationshipPolicy.DEFAULT_START_DATE)
                .put("syncState", account.isEmpty() ? "local" : "connecting").put("pending", false).put("error", "").toString(); }
        catch (Exception ignored) { return "{}"; }
    }
    private void publish() {
        if (closed) return;
        String account = uid;
        long epoch = authGeneration, scopeEpoch = scopeGeneration;
        try {
            JSONObject state = new JSONObject().put("uid", account).put("coupleId", coupleId).put("signedIn", !account.isEmpty())
                    .put("paired", paired).put("startDate", date).put("syncState", syncState)
                    .put("pending", paired && readPending(pairKey()).length() > 0).put("error", error);
            renderedState = state.toString();
            String payload = renderedState;
            activity.runOnUiThread(() -> {
                if (closed || authGeneration != epoch || scopeGeneration != scopeEpoch || !actualUid().equals(account)) return;
                webView.evaluateJavascript("window.onUsRelationshipState&&window.onUsRelationshipState(" + payload + ")", null);
            });
        } catch (Exception ignored) { }
    }
    private void detachPair() {
        for (ListenerRegistration listener : new ListenerRegistration[] {memberListener, coupleListener, relationshipListener}) if (listener != null) listener.remove();
        memberListener = coupleListener = relationshipListener = null;
    }
    private void detachAll() { if (userListener != null) userListener.remove(); userListener = null; detachPair(); }
    public void close() { closed = true; authGeneration++; scopeGeneration++; handler.removeCallbacksAndMessages(null); detachAll(); auth.removeAuthStateListener(authListener); }
}
