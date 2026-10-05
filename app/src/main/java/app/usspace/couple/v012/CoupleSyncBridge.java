package app.usspace.couple.v012;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.QueryDocumentSnapshot;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.firestore.WriteBatch;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class CoupleSyncBridge {
    private final Activity activity;
    private final WebView webView;
    private final FirebaseFirestore db;
    private final FirebaseAuth auth;
    private final SecureRandom random = new SecureRandom();

    private ListenerRegistration userListener;
    private ListenerRegistration commonListener;
    private ListenerRegistration profilesListener;
    private String currentCoupleId = "";
    private boolean commonReady = false, commonFromCache = true, profilesFromCache = true, pendingWrites = false, profilePendingWrites = false;
    private String createdCoupleId = "";
    private boolean newSpace = false, commonExists = false, transactionPending = false;
    private String syncError = "";
    private Map<String, Object> cachedClients = new HashMap<>();
    private final java.util.Set<String> inFlightPatches = new java.util.HashSet<>();
    private Map<String, Object> cachedCommon = new HashMap<>();
    private final Map<String, Map<String, Object>> cachedProfiles = new LinkedHashMap<>();

    public CoupleSyncBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.db = FirebaseFirestore.getInstance();
        this.auth = FirebaseAuth.getInstance();
    }

    public void onSignedIn(FirebaseUser user) {
        if (user == null) return;
        Map<String, Object> profile = new HashMap<>();
        profile.put("uid", user.getUid());
        profile.put("name", user.getDisplayName() == null ? "" : user.getDisplayName());
        profile.put("email", user.getEmail() == null ? "" : user.getEmail());
        profile.put("photo", user.getPhotoUrl() == null ? "" : user.getPhotoUrl().toString());
        profile.put("lastSeenAt", FieldValue.serverTimestamp());
        db.collection("users").document(user.getUid()).set(profile, SetOptions.merge());
        listenToUser(user.getUid());
    }

    public void onSignedOut() {
        detachAll();
        currentCoupleId = ""; createdCoupleId = ""; newSpace = false; commonReady = false;
        cachedCommon.clear();
        cachedProfiles.clear();
        postSyncState(false, false, "", "", false);
    }

    @JavascriptInterface
    public String status() {
        JSONObject j = new JSONObject();
        try {
            FirebaseUser user = auth.getCurrentUser();
            j.put("signedIn", user != null);
            j.put("paired", user != null && !currentCoupleId.isEmpty());
            j.put("coupleId", currentCoupleId);
        } catch (Exception ignored) { }
        return j.toString();
    }

    @JavascriptInterface
    public void refresh() {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null) {
            postSyncState(false, false, "", "Sign in first", false);
            return;
        }
        onSignedIn(user);
    }

    private void listenToUser(String uid) {
        if (userListener != null) userListener.remove();
        userListener = db.collection("users").document(uid).addSnapshotListener((snap, error) -> {
            if (error != null) {
                postSyncState(true, false, "", "Could not read pairing state", false);
                return;
            }
            if (snap == null || !snap.exists()) return;
            String coupleId = snap.getString("coupleId");
            if (coupleId == null) coupleId = "";
            if (!coupleId.equals(currentCoupleId)) attachCouple(coupleId, false);
            else {
                if (!coupleId.isEmpty() && (commonListener == null || !syncError.isEmpty())) attachCouple(coupleId, false);
                postSyncState(true, !coupleId.isEmpty(), coupleId, syncError, false);
                if (commonReady) postSnapshot();
            }
        });
    }

    @JavascriptInterface
    public void createPair() {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null) {
            postSyncState(false, false, "", "Sign in with Google first", false);
            return;
        }
        if (!currentCoupleId.isEmpty()) {
            postSyncState(true, true, currentCoupleId, "Already paired", false);
            return;
        }
        createCodeAttempt(user, 0);
    }

    private void createCodeAttempt(FirebaseUser user, int attempt) {
        if (attempt >= 8) {
            postSyncState(true, false, "", "Could not allocate a pairing code. Try again.", false);
            return;
        }
        String code = String.format("%06d", 100000 + random.nextInt(900000));
        DocumentReference inviteRef = db.collection("pairInvites").document(code);
        {
            String coupleId = db.collection("couples").document().getId();
            DocumentReference coupleRef = db.collection("couples").document(coupleId);
            DocumentReference memberRef = coupleRef.collection("members").document(user.getUid());
            DocumentReference userRef = db.collection("users").document(user.getUid());
            Timestamp now = Timestamp.now();
            Timestamp expires = new Timestamp(now.getSeconds() + 15 * 60, now.getNanoseconds());

            Map<String, Object> couple = new HashMap<>();
            couple.put("ownerUid", user.getUid());
            couple.put("memberCount", 1L);
            couple.put("createdAt", FieldValue.serverTimestamp());

            Map<String, Object> member = memberMap(user);
            member.put("role", "creator");

            Map<String, Object> invite = new HashMap<>();
            invite.put("coupleId", coupleId);
            invite.put("creatorUid", user.getUid());
            invite.put("createdAt", FieldValue.serverTimestamp());
            invite.put("expiresAt", expires);
            invite.put("used", false);

            createdCoupleId = coupleId;
            WriteBatch batch = db.batch();
            batch.set(coupleRef, couple);
            batch.set(memberRef, member);
            batch.set(inviteRef, invite);
            Map<String, Object> userPairing = new HashMap<>();
            userPairing.put("coupleId", coupleId);
            userPairing.put("pairedAt", FieldValue.serverTimestamp());
            batch.set(userRef, userPairing, SetOptions.merge());
            batch.commit().addOnSuccessListener(v -> {
                newSpace = true;
                attachCouple(coupleId, true);
                JSONObject extra = new JSONObject();
                try { extra.put("pairCode", code); } catch (Exception ignored) { }
                postSyncState(true, true, coupleId, "", true, extra);
            }).addOnFailureListener(e -> {
                // An occupied random code is an update, which the invite rules reject.
                if (e instanceof FirebaseFirestoreException && ((FirebaseFirestoreException)e).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED && attempt < 2) createCodeAttempt(user, attempt + 1);
                else postSyncState(true, false, "", "Could not create private space. Check the Firebase pairing rules and connection.", false);
            });
        }
    }

    @JavascriptInterface
    public void joinPair(String rawCode) {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null) {
            postSyncState(false, false, "", "Sign in with Google first", false);
            return;
        }
        if (!currentCoupleId.isEmpty()) {
            postSyncState(true, true, currentCoupleId, "Already paired", false);
            return;
        }
        String code = rawCode == null ? "" : rawCode.replaceAll("\\D", "");
        if (code.length() != 6) {
            postSyncState(true, false, "", "Enter the 6-digit code", false);
            return;
        }
        DocumentReference inviteRef = db.collection("pairInvites").document(code);
        db.runTransaction(transaction -> {
            DocumentSnapshot invite = transaction.get(inviteRef);
            if (!invite.exists()) throw new IllegalStateException("Pairing code not found");
            Boolean used = invite.getBoolean("used");
            Timestamp expires = invite.getTimestamp("expiresAt");
            String coupleId = invite.getString("coupleId");
            String creatorUid = invite.getString("creatorUid");
            if (Boolean.TRUE.equals(used)) throw new IllegalStateException("Pairing code already used");
            if (expires == null || expires.compareTo(Timestamp.now()) <= 0) throw new IllegalStateException("Pairing code expired");
            if (coupleId == null || coupleId.isEmpty()) throw new IllegalStateException("Invalid pairing code");
            if (user.getUid().equals(creatorUid)) throw new IllegalStateException("Use the other person's Google account");

            DocumentReference coupleRef = db.collection("couples").document(coupleId);
            DocumentSnapshot couple = transaction.get(coupleRef);
            Long count = couple.getLong("memberCount");
            if (count == null || count != 1L) throw new IllegalStateException("This UsSpace already has two people");

            DocumentReference memberRef = coupleRef.collection("members").document(user.getUid());
            DocumentReference userRef = db.collection("users").document(user.getUid());

            Map<String, Object> inviteUpdate = new HashMap<>();
            inviteUpdate.put("used", true);
            inviteUpdate.put("usedByUid", user.getUid());
            inviteUpdate.put("usedAt", FieldValue.serverTimestamp());
            transaction.update(inviteRef, inviteUpdate);

            Map<String, Object> coupleUpdate = new HashMap<>();
            coupleUpdate.put("memberCount", 2L);
            coupleUpdate.put("lastJoinCode", code);
            coupleUpdate.put("lastJoinUid", user.getUid());
            transaction.update(coupleRef, coupleUpdate);

            Map<String, Object> member = memberMap(user);
            member.put("role", "partner");
            member.put("inviteCode", code);
            transaction.set(memberRef, member);
            Map<String, Object> userPairing = new HashMap<>();
            userPairing.put("coupleId", coupleId);
            userPairing.put("pairedAt", FieldValue.serverTimestamp());
            transaction.set(userRef, userPairing, SetOptions.merge());
            return coupleId;
        }).addOnSuccessListener(coupleId -> {
            attachCouple(coupleId, true);
            postSyncState(true, true, coupleId, "", true);
        }).addOnFailureListener(e -> postSyncState(true, false, "", safeMessage(e, "Could not join this UsSpace"), false));
    }

    @JavascriptInterface
    public void disconnect() {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null || currentCoupleId.isEmpty()) return;
        String coupleId = currentCoupleId;
        DocumentReference coupleRef = db.collection("couples").document(coupleId);
        DocumentReference memberRef = coupleRef.collection("members").document(user.getUid());
        DocumentReference userRef = db.collection("users").document(user.getUid());

        db.runTransaction(transaction -> {
            DocumentSnapshot couple = transaction.get(coupleRef);
            Long count = couple.getLong("memberCount");
            long next = Math.max(0L, (count == null ? 1L : count) - 1L);
            transaction.delete(memberRef);
            Map<String, Object> coupleUpdate = new HashMap<>();
            coupleUpdate.put("memberCount", next);
            coupleUpdate.put("lastLeaveUid", user.getUid());
            coupleUpdate.put("lastLeaveAt", FieldValue.serverTimestamp());
            transaction.update(coupleRef, coupleUpdate);
            transaction.update(userRef, Collections.singletonMap("coupleId", FieldValue.delete()));
            return null;
        }).addOnSuccessListener(v -> {
            attachCouple("", false);
            postSyncState(true, false, "", "", false);
        }).addOnFailureListener(e -> postSyncState(true, true, coupleId, "Could not disconnect", false));
    }

    @JavascriptInterface
    public void pushProfile(String profileJson) {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null || currentCoupleId.isEmpty()) return;
        try {
            Map<String, Object> profile = SyncPatchReducer.projectProfile(jsonObjectToMap(new JSONObject(profileJson)));
            Map<String, Object> document = new HashMap<>();
            document.put("payload", profile);
            document.put("updatedBy", user.getUid());
            document.put("updatedAt", FieldValue.serverTimestamp());
            db.collection("couples").document(currentCoupleId).collection("profiles").document(user.getUid())
                .set(document).addOnFailureListener(e -> postSyncState(true, true, currentCoupleId, "Profile sync failed — local copy kept", false));
        } catch (Exception e) { postSyncState(true, true, currentCoupleId, "Could not prepare shared profile", false); }
    }

    @JavascriptInterface
    public void pushPatch(String patchJson) {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null || currentCoupleId.isEmpty()) return;
        final String coupleId = currentCoupleId;
        try {
            Map<String, Object> patch = jsonObjectToMap(new JSONObject(patchJson));
            String clientId = String.valueOf(patch.get("clientId"));
            Object rawSequence = patch.get("sequence");
            if (!clientId.matches("[A-Za-z0-9_-]{8,100}") || !(rawSequence instanceof Number)
                || !(patch.get("changes") instanceof List) || ((List<?>)patch.get("changes")).size() > 300)
                throw new IllegalArgumentException("Invalid sync patch");
            long sequence = ((Number)rawSequence).longValue();
            if (sequence < 1) throw new IllegalArgumentException("Invalid sync sequence");
            String token = clientId + ":" + sequence;
            synchronized (inFlightPatches) { if (!inFlightPatches.add(token)) return; }
            transactionPending = true;
            postSyncState(true, true, coupleId, "", false);
            DocumentReference commonRef = db.collection("couples").document(coupleId).collection("shared").document("common");
            db.runTransaction(transaction -> {
                DocumentSnapshot snapshot = transaction.get(commonRef);
                Map<String, Object> previous = snapshot.exists() && snapshot.get("payload") instanceof Map
                    ? new HashMap<>((Map<String, Object>)snapshot.get("payload")) : new HashMap<>();
                Map<String, Object> clients = snapshot.exists() && snapshot.get("syncClients") instanceof Map
                    ? new HashMap<>((Map<String, Object>)snapshot.get("syncClients")) : new HashMap<>();
                Object cursor = clients.get(clientId);
                long acknowledged = cursor instanceof Number ? ((Number)cursor).longValue() : 0L;
                if (sequence <= acknowledged) return null;
                if (sequence != acknowledged + 1L) throw new IllegalStateException("Sync sequence gap");
                Map<String, Object> merged = SyncPatchReducer.applyPatch(previous, patch);
                clients.put(clientId, sequence);
                Map<String, Object> document = new HashMap<>();
                document.put("payload", merged);
                document.put("syncClients", clients);
                document.put("updatedBy", user.getUid());
                document.put("updatedAt", FieldValue.serverTimestamp());
                transaction.set(commonRef, document);
                return null;
            }).addOnSuccessListener(v -> {
                synchronized (inFlightPatches) { inFlightPatches.remove(token); transactionPending = !inFlightPatches.isEmpty(); }
                if (!coupleId.equals(currentCoupleId)) return;
                syncError = "";
                postPatchAck(clientId, sequence, true, "");
                postSyncState(true, true, coupleId, "", false);
            }).addOnFailureListener(e -> {
                synchronized (inFlightPatches) { inFlightPatches.remove(token); transactionPending = !inFlightPatches.isEmpty(); }
                if (!coupleId.equals(currentCoupleId)) return;
                syncError = "Waiting to sync — edits are saved on this phone";
                postPatchAck(clientId, sequence, false, syncError);
                postSyncState(true, true, coupleId, syncError, false);
            });
        } catch (Exception e) { postSyncState(true, true, coupleId, "Could not prepare realtime update", false); }
    }

    private void postPatchAck(String clientId, long sequence, boolean success, String error) {
        JSONObject response = new JSONObject();
        try { response.put("clientId", clientId); response.put("sequence", sequence); response.put("success", success); response.put("error", error); response.put("coupleId", currentCoupleId); } catch (Exception ignored) { }
        eval("window.onUsSyncAck&&window.onUsSyncAck(" + response + ");");
    }

    private void attachCouple(String coupleId, boolean justPaired) {
        if (commonListener != null) commonListener.remove();
        if (profilesListener != null) profilesListener.remove();
        commonListener = null;
        profilesListener = null;
        cachedCommon = new HashMap<>(); cachedClients = new HashMap<>();
        cachedProfiles.clear();
        commonReady = false; commonExists = false; commonFromCache = true; profilesFromCache = true; pendingWrites = false; profilePendingWrites = false; syncError = "";
        newSpace = coupleId != null && !coupleId.isEmpty() && coupleId.equals(createdCoupleId);
        currentCoupleId = coupleId == null ? "" : coupleId;
        if (currentCoupleId.isEmpty()) {
            postSyncState(auth.getCurrentUser() != null, false, "", "", false);
            return;
        }
        postSyncState(true, true, currentCoupleId, "", justPaired);
        final String attachedId = currentCoupleId;
        DocumentReference coupleRef = db.collection("couples").document(attachedId);
        commonListener = coupleRef.collection("shared").document("common").addSnapshotListener(MetadataChanges.INCLUDE, (snap, error) -> {
            if (!attachedId.equals(currentCoupleId)) return;
            if (error != null) {
                syncError = "Realtime sync interrupted — local edits are kept";
                postSyncState(true, true, attachedId, syncError, false);
                return;
            }
            if (snap == null) return;
            commonFromCache = snap.getMetadata().isFromCache();
            pendingWrites = snap.getMetadata().hasPendingWrites();
            // Do not replay a pending transaction back over its own local outbox.
            if (!pendingWrites) {
                commonExists = snap.exists();
                cachedCommon = snap.exists() && snap.get("payload") instanceof Map
                    ? new HashMap<>((Map<String, Object>)snap.get("payload")) : new HashMap<>();
                cachedClients = snap.exists() && snap.get("syncClients") instanceof Map
                    ? new HashMap<>((Map<String, Object>)snap.get("syncClients")) : new HashMap<>();
                if (!commonFromCache) { commonReady = true; syncError = ""; }
                postSnapshot();
            }
            postSyncState(true, true, attachedId, syncError, false);
        });
        profilesListener = coupleRef.collection("profiles").addSnapshotListener(MetadataChanges.INCLUDE, (snap, error) -> {
            if (!attachedId.equals(currentCoupleId)) return;
            if (error != null) {
                syncError = "Could not read shared profiles — local edits are kept";
                postSyncState(true, true, attachedId, syncError, false); return;
            }
            cachedProfiles.clear();
            if (snap != null) {
                profilesFromCache = snap.getMetadata().isFromCache();
                profilePendingWrites = snap.getMetadata().hasPendingWrites();
                for (QueryDocumentSnapshot doc : snap) {
                    Object payload = doc.get("payload");
                    if (payload instanceof Map) cachedProfiles.put(doc.getId(), SyncPatchReducer.projectProfile((Map<String, Object>)payload));
                }
            }
            postSnapshot();
            postSyncState(true, true, attachedId, syncError, false);
        });
    }

    private void postSnapshot() {
        try {
            JSONObject root = new JSONObject();
            root.put("coupleId", currentCoupleId);
            root.put("ready", commonReady);
            root.put("exists", commonExists);
            root.put("newSpace", newSpace);
            root.put("fromCache", commonFromCache);
            root.put("common", new JSONObject(SyncPatchReducer.projectCommon(cachedCommon)));
            root.put("clients", new JSONObject(cachedClients));
            JSONObject profiles = new JSONObject();
            for (Map.Entry<String, Map<String, Object>> e : cachedProfiles.entrySet()) profiles.put(e.getKey(), new JSONObject(e.getValue()));
            root.put("profiles", profiles);
            eval("window.onUsSharedSnapshot&&window.onUsSharedSnapshot(" + root + ");");
        } catch (Exception ignored) { }
    }

    private Map<String, Object> memberMap(FirebaseUser user) {
        Map<String, Object> m = new HashMap<>();
        m.put("uid", user.getUid());
        m.put("name", user.getDisplayName() == null ? "" : user.getDisplayName());
        m.put("email", user.getEmail() == null ? "" : user.getEmail());
        m.put("joinedAt", FieldValue.serverTimestamp());
        return m;
    }

    private Map<String, Object> jsonObjectToMap(JSONObject object) throws Exception {
        Map<String, Object> map = new HashMap<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            map.put(key, jsonValue(object.get(key)));
        }
        return map;
    }

    private Object jsonValue(Object value) throws Exception {
        if (value == JSONObject.NULL) return null;
        if (value instanceof JSONObject) return jsonObjectToMap((JSONObject) value);
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            List<Object> out = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) out.add(jsonValue(array.get(i)));
            return out;
        }
        return value;
    }

    private void postSyncState(boolean signedIn, boolean paired, String coupleId, String error, boolean justPaired) {
        postSyncState(signedIn, paired, coupleId, error, justPaired, null);
    }

    private void postSyncState(boolean signedIn, boolean paired, String coupleId, String error, boolean justPaired, JSONObject extra) {
        JSONObject j = extra == null ? new JSONObject() : extra;
        try {
            j.put("signedIn", signedIn);
            j.put("paired", paired);
            j.put("coupleId", coupleId == null ? "" : coupleId);
            j.put("justPaired", justPaired);
            j.put("ready", commonReady);
            j.put("newSpace", newSpace);
            j.put("pendingWrites", pendingWrites || profilePendingWrites || transactionPending);
            String phase = !paired ? (signedIn ? "unpaired" : "local") : !commonReady ? "connecting"
                : !syncError.isEmpty() || commonFromCache || profilesFromCache ? "offline"
                : pendingWrites || profilePendingWrites || transactionPending ? "syncing" : "live";
            j.put("state", phase);
            j.put("error", error == null ? "" : error);
        } catch (Exception ignored) { }
        eval("window.onUsSyncState&&window.onUsSyncState(" + j + ");");
    }

    private String safeMessage(Exception e, String fallback) {
        String m = e.getMessage();
        if (m == null || m.trim().isEmpty()) return fallback;
        if (m.contains("expired")) return "Pairing code expired";
        if (m.contains("already used")) return "Pairing code already used";
        if (m.contains("two people")) return "This UsSpace already has two people";
        if (m.contains("not found")) return "Pairing code not found";
        if (m.contains("other person's")) return "Open the code on the other person's Google account";
        return fallback;
    }

    private void eval(String js) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void detachAll() {
        if (userListener != null) userListener.remove();
        if (commonListener != null) commonListener.remove();
        if (profilesListener != null) profilesListener.remove();
        userListener = commonListener = profilesListener = null;
    }

    public void close() { detachAll(); }
}
