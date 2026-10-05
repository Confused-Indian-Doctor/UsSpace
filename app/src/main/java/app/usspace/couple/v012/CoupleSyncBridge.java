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
        currentCoupleId = "";
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
            else postSyncState(true, !coupleId.isEmpty(), coupleId, "", false);
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
        inviteRef.get().addOnSuccessListener(existing -> {
            if (existing.exists()) {
                createCodeAttempt(user, attempt + 1);
                return;
            }
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

            WriteBatch batch = db.batch();
            batch.set(coupleRef, couple);
            batch.set(memberRef, member);
            batch.set(inviteRef, invite);
            Map<String, Object> userPairing = new HashMap<>();
            userPairing.put("coupleId", coupleId);
            userPairing.put("pairedAt", FieldValue.serverTimestamp());
            batch.set(userRef, userPairing, SetOptions.merge());
            batch.commit().addOnSuccessListener(v -> {
                attachCouple(coupleId, true);
                JSONObject extra = new JSONObject();
                try { extra.put("pairCode", code); } catch (Exception ignored) { }
                postSyncState(true, true, coupleId, "", true, extra);
            }).addOnFailureListener(e -> postSyncState(true, false, "", "Could not create private space", false));
        }).addOnFailureListener(e -> postSyncState(true, false, "", "Could not check pairing code", false));
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
    public void push(String commonJson, String profileJson) {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null || currentCoupleId.isEmpty()) return;
        try {
            Map<String, Object> common = jsonObjectToMap(new JSONObject(commonJson == null ? "{}" : commonJson));
            // Hard privacy boundary: these keys can never be uploaded by this bridge.
            common.remove("health");
            common.remove("healthHistory");
            common.remove("cycle");
            Map<String, Object> profile = jsonObjectToMap(new JSONObject(profileJson == null ? "{}" : profileJson));
            profile.remove("health");
            profile.remove("healthHistory");
            profile.remove("cycle");

            DocumentReference coupleRef = db.collection("couples").document(currentCoupleId);
            WriteBatch batch = db.batch();
            Map<String, Object> commonDocument = new HashMap<>();
            commonDocument.put("payload", common);
            commonDocument.put("updatedBy", user.getUid());
            commonDocument.put("updatedAt", FieldValue.serverTimestamp());
            Map<String, Object> profileDocument = new HashMap<>();
            profileDocument.put("payload", profile);
            profileDocument.put("updatedBy", user.getUid());
            profileDocument.put("updatedAt", FieldValue.serverTimestamp());
            batch.set(coupleRef.collection("shared").document("common"), commonDocument, SetOptions.merge());
            batch.set(coupleRef.collection("profiles").document(user.getUid()), profileDocument, SetOptions.merge());
            batch.commit().addOnFailureListener(e -> postSyncState(true, true, currentCoupleId, "Sync failed — local copy kept", false));
        } catch (Exception e) {
            postSyncState(true, true, currentCoupleId, "Could not prepare sync payload", false);
        }
    }

    private void attachCouple(String coupleId, boolean justPaired) {
        if (commonListener != null) commonListener.remove();
        if (profilesListener != null) profilesListener.remove();
        commonListener = null;
        profilesListener = null;
        cachedCommon = new HashMap<>();
        cachedProfiles.clear();
        currentCoupleId = coupleId == null ? "" : coupleId;
        if (currentCoupleId.isEmpty()) {
            postSyncState(auth.getCurrentUser() != null, false, "", "", false);
            return;
        }
        postSyncState(true, true, currentCoupleId, "", justPaired);
        DocumentReference coupleRef = db.collection("couples").document(currentCoupleId);
        commonListener = coupleRef.collection("shared").document("common").addSnapshotListener((snap, error) -> {
            if (error != null) {
                postSyncState(true, true, currentCoupleId, "Realtime sync interrupted", false);
                return;
            }
            if (snap != null && snap.exists()) {
                Object payload = snap.get("payload");
                if (payload instanceof Map) cachedCommon = new HashMap<>((Map<String, Object>) payload);
            }
            postSnapshot();
        });
        profilesListener = coupleRef.collection("profiles").addSnapshotListener((snap, error) -> {
            if (error != null) return;
            cachedProfiles.clear();
            if (snap != null) {
                for (QueryDocumentSnapshot doc : snap) {
                    Object payload = doc.get("payload");
                    if (payload instanceof Map) cachedProfiles.put(doc.getId(), new HashMap<>((Map<String, Object>) payload));
                }
            }
            postSnapshot();
        });
    }

    private void postSnapshot() {
        try {
            JSONObject root = new JSONObject();
            root.put("common", new JSONObject(cachedCommon));
            JSONObject profiles = new JSONObject();
            for (Map.Entry<String, Map<String, Object>> e : cachedProfiles.entrySet()) {
                profiles.put(e.getKey(), new JSONObject(e.getValue()));
            }
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
            j.put("state", paired ? "live" : (signedIn ? "unpaired" : "local"));
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
