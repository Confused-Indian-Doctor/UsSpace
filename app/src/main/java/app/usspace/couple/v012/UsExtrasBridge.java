package app.usspace.couple.v012;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QueryDocumentSnapshot;
import com.google.firebase.firestore.QuerySnapshot;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.firestore.Transaction;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Paired Us features live in dedicated collections, never in the common health/mood projection. */
public final class UsExtrasBridge {
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth = FirebaseAuth.getInstance();
    private final FirebaseFirestore db = FirebaseFirestore.getInstance();
    private final FirebaseAuth.AuthStateListener authListener;
    private ListenerRegistration userListener, membershipListener, lettersListener;
    private final List<ListenerRegistration> featureListeners = new ArrayList<>();
    private final Map<String, ListenerRegistration> heartListeners = new HashMap<>();
    private final Set<String> inFlight = new HashSet<>();
    private volatile String uid = "", coupleId = "";
    private volatile long generation = 0;
    private volatile boolean closed = false, ready = false;
    private String error = "";
    private final Map<String, String> readErrors = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> members = new LinkedHashMap<>();
    private Map<String, Object> roles = null;
    private String letterRole = "";
    private final Map<String, Map<String, Object>> bucket = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> jar = new LinkedHashMap<>();
    private final Map<String, List<String>> hearts = new LinkedHashMap<>();
    private final Map<String, String> photos = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> letters = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> drafts = new LinkedHashMap<>();

    public UsExtrasBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        authListener = firebaseAuth -> observeAuth(firebaseAuth.getCurrentUser());
        auth.addAuthStateListener(authListener);
    }

    @JavascriptInterface
    public void refresh() {
        activity.runOnUiThread(() -> {
            if (closed) return;
            observeAuth(auth.getCurrentUser());
            if (!error.isEmpty() || !readErrors.isEmpty()) restartScope();
            postSnapshot();
        });
    }

    private void observeAuth(FirebaseUser user) {
        if (closed) return;
        String nextUid = user == null ? "" : user.getUid();
        if (nextUid.equals(uid) && (nextUid.isEmpty() || userListener != null)) return;
        detachUser();
        resetScope("");
        uid = nextUid;
        error = "";
        postSnapshot();
        if (uid.isEmpty()) return;
        String account = uid;
        userListener = db.collection("users").document(account).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!currentAccount(account)) return;
            if (failure != null) {
                detachUser();
                resetScope("");
                error = readError(failure);
                postSnapshot();
                return;
            }
            String nextCouple = snapshot != null && snapshot.exists() ? snapshot.getString("coupleId") : "";
            if (nextCouple == null) nextCouple = "";
            if (!nextCouple.isEmpty() && !nextCouple.matches("[A-Za-z0-9_-]{1,140}")) nextCouple = "";
            if (!nextCouple.equals(coupleId)) {
                resetScope(nextCouple);
                error = "";
                postSnapshot();
                attachMembership();
            } else if (!nextCouple.isEmpty() && membershipListener == null) attachMembership();
        });
    }

    private void restartScope() {
        String previousCouple = coupleId;
        resetScope(previousCouple);
        error = "";
        if (!previousCouple.isEmpty()) attachMembership();
    }

    private void attachMembership() {
        if (uid.isEmpty() || coupleId.isEmpty() || closed) return;
        if (membershipListener != null) membershipListener.remove();
        String account = uid, space = coupleId;
        long epoch = generation;
        membershipListener = db.collection("couples").document(space).collection("members").document(account)
                .addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
                    if (!currentScope(account, space, epoch)) return;
                    if (failure != null) {
                        resetScope(space);
                        error = readError(failure);
                        postSnapshot();
                        return;
                    }
                    // Firestore's device cache is shared across accounts. Never reveal feature data
                    // in a new scope until the server verifies this account's own membership.
                    if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
                    if (!snapshot.exists()) {
                        resetScope(space);
                        error = "This account is no longer in this space. Refresh your pairing.";
                        postSnapshot();
                    } else if (!ready) {
                        ready = true;
                        error = "";
                        attachFeatures(account, space, epoch);
                        postSnapshot();
                    }
                });
    }

    private void attachFeatures(String account, String space, long epoch) {
        DocumentReference couple = db.collection("couples").document(space);
        featureListeners.add(couple.collection("members").addSnapshotListener((snapshot, failure) -> {
            if (!liveScope(account, space, epoch)) return;
            if (failure != null) { featureError("members", failure); return; }
            readErrors.remove("members");
            members.clear();
            if (snapshot != null) for (QueryDocumentSnapshot doc : snapshot) {
                Map<String, Object> person = new LinkedHashMap<>();
                person.put("uid", doc.getId());
                person.put("name", safeText(doc.get("name"), 160));
                members.put(doc.getId(), person);
            }
            postSnapshot();
        }));
        featureListeners.add(couple.collection("usRoles").document("identity").addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!liveScope(account, space, epoch)) return;
            if (failure != null) { roles = null; detachLetters(); featureError("roles", failure); return; }
            readErrors.remove("roles");
            roles = null;
            if (snapshot != null && snapshot.exists()) {
                String al = safeText(snapshot.get("alUid"), 160), yashika = safeText(snapshot.get("yashikaUid"), 160);
                if (!al.isEmpty() && !yashika.isEmpty() && !al.equals(yashika)) {
                    roles = new LinkedHashMap<>(); roles.put("alUid", al); roles.put("yashikaUid", yashika);
                }
            }
            if (snapshot != null && snapshot.getMetadata().hasPendingWrites()) detachLetters();
            else attachLetters(account, space, epoch);
            postSnapshot();
        }));
        featureListeners.add(couple.collection("usBucket").addSnapshotListener((snapshot, failure) -> {
            if (!liveScope(account, space, epoch)) return;
            if (failure != null) { bucket.clear(); featureError("bucket", failure); return; }
            readErrors.remove("bucket");
            replace(bucket, snapshot, UsExtrasPolicy.keys("bucket"));
            postSnapshot();
        }));
        featureListeners.add(couple.collection("usJar").addSnapshotListener((snapshot, failure) -> {
            if (!liveScope(account, space, epoch)) return;
            if (failure != null) { jar.clear(); detachHearts(); featureError("jar", failure); return; }
            readErrors.remove("jar");
            replace(jar, snapshot, UsExtrasPolicy.keys("jar"));
            attachHearts(couple, account, space, epoch);
            postSnapshot();
        }));
        featureListeners.add(couple.collection("usPhotos").addSnapshotListener((snapshot, failure) -> {
            if (!liveScope(account, space, epoch)) return;
            if (failure != null) { photos.clear(); featureError("photos", failure); return; }
            readErrors.remove("photos");
            photos.clear();
            if (snapshot != null) for (QueryDocumentSnapshot doc : snapshot) {
                try {
                    Map<String, Object> field = new HashMap<>(); field.put("data", doc.get("data"));
                    photos.put(doc.getId(), UsExtrasPolicy.jpeg(field));
                } catch (IllegalArgumentException ignored) { }
            }
            postSnapshot();
        }));
        featureListeners.add(db.collection("users").document(account).collection("usLetterDrafts").whereEqualTo("coupleId", space)
                .addSnapshotListener((snapshot, failure) -> {
                    if (!liveScope(account, space, epoch)) return;
                    if (failure != null) { drafts.clear(); featureError("drafts", failure); return; }
                    readErrors.remove("drafts");
                    replace(drafts, snapshot, UsExtrasPolicy.keys("draft"));
                    postSnapshot();
                }));
    }

    private void attachLetters(String account, String space, long epoch) {
        String nextRole = roles == null ? "" : account.equals(roles.get("alUid")) ? "authorUid"
                : account.equals(roles.get("yashikaUid")) ? "recipientUid" : "";
        if (nextRole.equals(letterRole) && (nextRole.isEmpty() || lettersListener != null)) return;
        detachLetters();
        letterRole = nextRole;
        if (nextRole.isEmpty()) return;
        String queryRole = nextRole;
        Query query = db.collection("couples").document(space).collection("usLetters").whereEqualTo(queryRole, account);
        lettersListener = query.addSnapshotListener((snapshot, failure) -> {
            if (!liveScope(account, space, epoch) || !queryRole.equals(letterRole)) return;
            if (failure != null) { letters.clear(); featureError("letters", failure); return; }
            readErrors.remove("letters");
            replace(letters, snapshot, UsExtrasPolicy.keys("letter"));
            postSnapshot();
        });
    }

    private void attachHearts(DocumentReference couple, String account, String space, long epoch) {
        for (String id : new ArrayList<>(heartListeners.keySet())) if (!jar.containsKey(id)) {
            heartListeners.remove(id).remove(); hearts.remove(id); readErrors.remove("heart:" + id);
        }
        for (String id : jar.keySet()) if (!heartListeners.containsKey(id)) {
            heartListeners.put(id, couple.collection("usJar").document(id).collection("hearts").addSnapshotListener((snapshot, failure) -> {
                if (!liveScope(account, space, epoch) || !jar.containsKey(id)) return;
                if (failure != null) { hearts.remove(id); featureError("heart:" + id, failure); return; }
                readErrors.remove("heart:" + id);
                List<String> active = new ArrayList<>();
                if (snapshot != null) for (QueryDocumentSnapshot doc : snapshot)
                    if (Boolean.TRUE.equals(doc.getBoolean("active"))) active.add(doc.getId());
                hearts.put(id, active);
                postSnapshot();
            }));
        }
    }

    private void featureError(String part, Exception failure) {
        readErrors.put(part, readError(failure));
        postSnapshot();
    }

    private static void replace(Map<String, Map<String, Object>> target, QuerySnapshot snapshot, Set<String> keys) {
        target.clear();
        if (snapshot == null) return;
        for (QueryDocumentSnapshot doc : snapshot) {
            Map<String, Object> safe = new LinkedHashMap<>();
            for (String key : keys) {
                Object value = doc.get(key);
                if (value instanceof String || value instanceof Boolean) safe.put(key, value);
            }
            safe.put("id", doc.getId());
            target.put(doc.getId(), safe);
        }
    }

    @JavascriptInterface
    public void mutate(String raw) {
        activity.runOnUiThread(() -> beginMutation(raw));
    }

    private void beginMutation(String raw) {
        String account = uid, space = coupleId, operationId = "";
        long epoch = generation;
        try {
            if (closed || raw == null || raw.length() > 180000) throw new IllegalArgumentException("Invalid Us update");
            JSONObject request = new JSONObject(raw);
            operationId = UsExtrasPolicy.id(request.getString("operationId"));
            if (!liveScope(account, space, epoch) || !account.equals(request.optString("uid")) || !space.equals(request.optString("coupleId")))
                throw new IllegalStateException("Refresh your pairing before saving");
            // `at` is only the frontend's pending display time. Persisted time is derived below.
            Set<String> requestKeys = UsExtrasPolicy.values("operationId", "uid", "coupleId", "kind", "id", "fields", "at");
            Iterator<String> topKeys = request.keys();
            while (topKeys.hasNext()) if (!requestKeys.contains(topKeys.next())) throw new IllegalArgumentException("Unsupported Us update field");
            String kind = request.getString("kind"), id = UsExtrasPolicy.id(request.getString("id"));
            JSONObject incoming = request.getJSONObject("fields");
            Map<String, Object> fields = new LinkedHashMap<>();
            Iterator<String> keys = incoming.keys();
            while (keys.hasNext()) { String key = keys.next(); fields.put(key, incoming.get(key)); }
            UsExtrasPolicy.checkFields(kind, id, fields);
            String receiptKey = space + "_" + operationId;
            String inFlightKey = account + ":" + receiptKey;
            if (!inFlight.add(inFlightKey)) return;
            String op = operationId;
            db.runTransaction(transaction -> {
                if (!liveScope(account, space, epoch)) throw new IllegalStateException("Sign-in or pairing changed");
                DocumentReference couple = db.collection("couples").document(space);
                DocumentSnapshot currentUser = transaction.get(db.collection("users").document(account));
                DocumentSnapshot currentMember = transaction.get(couple.collection("members").document(account));
                DocumentSnapshot currentCouple = transaction.get(couple);
                if (!currentUser.exists() || !space.equals(currentUser.getString("coupleId")) || !currentMember.exists() || !currentCouple.exists())
                    throw new IllegalStateException("This account is no longer in this space");
                DocumentReference receipt = db.collection("users").document(account).collection("usReceipts").document(receiptKey);
                if (transaction.get(receipt).exists()) return null;
                String now = Instant.now().toString();
                String actorName = safeText(currentMember.get("name"), 160);
                applyMutation(transaction, couple, currentCouple, account, space, kind, id, fields, now, actorName);
                if (!liveScope(account, space, epoch)) throw new IllegalStateException("Sign-in or pairing changed");
                Map<String, Object> receiptData = new LinkedHashMap<>();
                receiptData.put("operationId", op); receiptData.put("coupleId", space); receiptData.put("kind", kind);
                receiptData.put("itemId", id); receiptData.put("at", FieldValue.serverTimestamp());
                transaction.set(receipt, receiptData);
                return null;
            }).addOnSuccessListener(result -> {
                if (!currentScope(account, space, epoch)) return;
                inFlight.remove(inFlightKey);
                if (liveScope(account, space, epoch)) ack(account, space, op, true, "", epoch);
            }).addOnFailureListener(failure -> {
                if (!currentScope(account, space, epoch)) return;
                inFlight.remove(inFlightKey);
                ack(account, space, op, false, mutationError(failure), epoch);
            });
        } catch (Exception failure) {
            if (!operationId.isEmpty() && currentScope(account, space, epoch)) ack(account, space, operationId, false, mutationError(failure), epoch);
        }
    }

    private void applyMutation(Transaction transaction, DocumentReference couple, DocumentSnapshot coupleData,
                               String account, String space, String kind, String id, Map<String, Object> fields,
                               String now, String actorName) throws FirebaseFirestoreException {
        DocumentReference target;
        DocumentSnapshot previous;
        Map<String, Object> update = new LinkedHashMap<>();
        switch (kind) {
            case "roles": {
                if (!"identity".equals(id)) throw new IllegalArgumentException("Invalid role identity");
                String al = UsExtrasPolicy.text(fields, "alUid", 160, true), yashika = UsExtrasPolicy.text(fields, "yashikaUid", 160, true);
                if (al.equals(yashika) || (!account.equals(al) && !account.equals(yashika)) || !Long.valueOf(2).equals(coupleData.getLong("memberCount")))
                    throw new IllegalArgumentException("Choose the two current accounts");
                if (al.contains("/") || yashika.contains("/")
                        || !transaction.get(couple.collection("members").document(al)).exists()
                        || !transaction.get(couple.collection("members").document(yashika)).exists())
                    throw new IllegalArgumentException("Both accounts must be paired first");
                target = couple.collection("usRoles").document("identity");
                previous = transaction.get(target);
                if (previous.exists()) {
                    if (!al.equals(previous.getString("alUid")) || !yashika.equals(previous.getString("yashikaUid")))
                        throw new IllegalStateException("Account roles are already set for this space");
                    return;
                }
                update.put("alUid", al); update.put("yashikaUid", yashika);
                transaction.set(target, update);
                return;
            }
            case "bucket": {
                target = couple.collection("usBucket").document(id);
                previous = transaction.get(target);
                if (!previous.exists()) {
                    update.put("id", id); update.put("title", ""); update.put("category", "Date"); update.put("location", "");
                    update.put("targetDate", ""); update.put("suggestedBy", account); update.put("suggestedName", actorName);
                    update.put("priority", "Normal"); update.put("notes", ""); update.put("photoId", "");
                    update.put("state", "Dreaming"); update.put("completedDate", ""); update.put("completedPhotoId", ""); update.put("createdAt", now);
                    if (!fields.containsKey("title")) throw new IllegalArgumentException("Add a title");
                }
                for (String key : UsExtrasPolicy.values("title", "location", "notes")) if (fields.containsKey(key))
                    update.put(key, UsExtrasPolicy.text(fields, key, key.equals("title") ? 160 : key.equals("location") ? 240 : 4000, key.equals("title")));
                if (fields.containsKey("category")) update.put("category", UsExtrasPolicy.choice(fields, "category", UsExtrasPolicy.CATEGORIES));
                if (fields.containsKey("state")) update.put("state", UsExtrasPolicy.choice(fields, "state", UsExtrasPolicy.STATES));
                if (fields.containsKey("priority")) update.put("priority", UsExtrasPolicy.choice(fields, "priority", UsExtrasPolicy.PRIORITIES));
                for (String key : UsExtrasPolicy.values("targetDate", "completedDate")) if (fields.containsKey(key)) update.put(key, UsExtrasPolicy.date(fields, key));
                for (String key : UsExtrasPolicy.values("photoId", "completedPhotoId")) if (fields.containsKey(key)) update.put(key, UsExtrasPolicy.photoId(fields, key));
                update.put("updatedAt", now); update.put("updatedBy", account);
                break;
            }
            case "jar": {
                target = couple.collection("usJar").document(id);
                previous = transaction.get(target);
                if (previous.exists() && !account.equals(previous.getString("authorUid"))) throw new IllegalStateException("Only the writer can edit this note");
                update.put("text", UsExtrasPolicy.text(fields, "text", 1500, true));
                if (!previous.exists()) {
                    update.put("id", id); update.put("authorUid", account); update.put("authorName", actorName); update.put("createdAt", now);
                }
                break;
            }
            case "heart": {
                if (!transaction.get(couple.collection("usJar").document(id)).exists()) throw new IllegalStateException("This note is no longer available");
                Object active = fields.get("active");
                if (!(active instanceof Boolean)) throw new IllegalArgumentException("Choose a heart state");
                target = couple.collection("usJar").document(id).collection("hearts").document(account);
                update.put("uid", account); update.put("active", active); update.put("at", now);
                transaction.set(target, update);
                return;
            }
            case "photo": {
                target = couple.collection("usPhotos").document(id);
                previous = transaction.get(target);
                if (previous.exists() && !account.equals(previous.getString("ownerUid"))) throw new IllegalStateException("Only the photo owner can replace it");
                update.put("data", UsExtrasPolicy.jpeg(fields));
                if (!previous.exists()) { update.put("id", id); update.put("ownerUid", account); update.put("createdAt", now); }
                break;
            }
            case "draft": {
                String category = UsExtrasPolicy.choice(fields, "category", UsExtrasPolicy.LETTERS);
                if (!id.equals(space + "_" + category)) throw new IllegalArgumentException("Draft identity changed");
                target = db.collection("users").document(account).collection("usLetterDrafts").document(id);
                // The complete private draft never passes through any couple/shared collection.
                update.put("id", id); update.put("coupleId", space); update.put("category", category);
                update.put("title", UsExtrasPolicy.text(fields, "title", 200, false)); update.put("body", UsExtrasPolicy.text(fields, "body", 12000, false));
                update.put("updatedAt", now);
                transaction.set(target, update);
                return;
            }
            case "letter": {
                String category = UsExtrasPolicy.choice(fields, "category", UsExtrasPolicy.LETTERS);
                if (!id.equals(category)) throw new IllegalArgumentException("Letter identity changed");
                DocumentSnapshot identity = transaction.get(couple.collection("usRoles").document("identity"));
                String recipient = identity.exists() ? identity.getString("yashikaUid") : null;
                if (!identity.exists() || !account.equals(identity.getString("alUid")) || recipient == null || recipient.equals(account)
                        || !transaction.get(couple.collection("members").document(recipient)).exists())
                    throw new IllegalStateException("Set Al and Yashika's paired accounts before sending a letter");
                target = couple.collection("usLetters").document(category);
                // Reading the existing letter is authorized only for its author/recipient.
                transaction.get(target);
                update.put("id", category); update.put("category", category);
                update.put("title", UsExtrasPolicy.text(fields, "title", 200, true)); update.put("body", UsExtrasPolicy.text(fields, "body", 12000, true));
                update.put("authorUid", account); update.put("recipientUid", recipient); update.put("publishedAt", now);
                transaction.set(target, update);
                return;
            }
            default: throw new IllegalArgumentException("Unknown Us update");
        }
        transaction.set(target, update, SetOptions.merge());
    }

    @JavascriptInterface
    public boolean openLink(String raw) {
        if (!allowedLink(raw) || closed) return false;
        activity.runOnUiThread(() -> {
            if (closed) return;
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(raw))); }
            catch (ActivityNotFoundException | SecurityException e) { postLinkError(); }
        });
        return true;
    }

    static boolean allowedLink(String raw) {
        if (raw == null || raw.length() > 2048 || raw.matches("(?s).*\\p{Cntrl}.*")) return false;
        try {
            Uri uri = Uri.parse(raw);
            String scheme = uri.getScheme();
            if ("https".equalsIgnoreCase(scheme)) return uri.getHost() != null && !uri.getHost().isEmpty() && uri.getUserInfo() == null;
            if ("tel".equalsIgnoreCase(scheme)) return raw.substring(4).matches("[+0-9(). -]{1,40}");
            if ("sms".equalsIgnoreCase(scheme)) {
                String[] parts = raw.substring(4).split("\\?", 2);
                if (!parts[0].matches("[+0-9(). -]{1,40}")) return false;
                // sms: is an opaque Android Uri; hierarchical query APIs reject valid sms links.
                return parts.length == 1 || parts[1].matches("body=[A-Za-z0-9%+_.~!*'()-]*");
            }
        } catch (RuntimeException ignored) { }
        return false;
    }

    private void postLinkError() {
        if (!closed) webView.evaluateJavascript("window.toast&&window.toast('No app could open that contact link. You can call or message them directly.');", null);
    }

    private boolean currentAccount(String account) {
        FirebaseUser user = auth.getCurrentUser();
        return !closed && !account.isEmpty() && account.equals(uid) && user != null && account.equals(user.getUid());
    }

    private boolean currentScope(String account, String space, long epoch) {
        return currentAccount(account) && space.equals(coupleId) && generation == epoch;
    }

    private boolean liveScope(String account, String space, long epoch) {
        return ready && !space.isEmpty() && currentScope(account, space, epoch);
    }

    private void resetScope(String nextCouple) {
        generation++;
        if (membershipListener != null) membershipListener.remove();
        membershipListener = null;
        clearFeatures();
        inFlight.clear();
        ready = false;
        coupleId = nextCouple;
    }

    private void clearFeatures() {
        for (ListenerRegistration listener : featureListeners) listener.remove();
        featureListeners.clear();
        detachHearts();
        detachLetters();
        members.clear(); bucket.clear(); jar.clear(); photos.clear(); drafts.clear(); roles = null; readErrors.clear();
    }

    private void detachLetters() {
        if (lettersListener != null) lettersListener.remove();
        lettersListener = null; letterRole = ""; letters.clear(); readErrors.remove("letters");
    }

    private void detachHearts() {
        for (ListenerRegistration listener : heartListeners.values()) listener.remove();
        heartListeners.clear(); hearts.clear();
    }

    private void detachUser() {
        if (userListener != null) userListener.remove();
        userListener = null;
    }

    private void postSnapshot() {
        if (closed) return;
        long epoch = generation;
        String account = uid, space = coupleId;
        try {
            JSONObject snapshot = new JSONObject();
            snapshot.put("uid", account); snapshot.put("coupleId", space); snapshot.put("ready", ready);
            String partner = "";
            for (String member : members.keySet()) if (!account.equals(member)) { partner = member; break; }
            snapshot.put("partnerUid", partner); snapshot.put("members", array(members));
            snapshot.put("error", !error.isEmpty() ? error : readErrors.isEmpty() ? "" : readErrors.values().iterator().next());
            snapshot.put("roles", roles == null ? JSONObject.NULL : new JSONObject(roles));
            snapshot.put("bucket", array(bucket)); snapshot.put("jar", array(jar)); snapshot.put("letters", array(letters)); snapshot.put("drafts", array(drafts));
            snapshot.put("hearts", new JSONObject(hearts)); snapshot.put("photos", new JSONObject(photos));
            evalScoped("window.onUsExtrasSnapshot&&window.onUsExtrasSnapshot(" + snapshot + ");", account, space, epoch);
        } catch (Exception ignored) { }
    }

    private static JSONArray array(Map<String, Map<String, Object>> docs) {
        JSONArray result = new JSONArray();
        for (Map<String, Object> doc : docs.values()) result.put(new JSONObject(doc));
        return result;
    }

    private void ack(String account, String space, String operationId, boolean success, String failure, long epoch) {
        try {
            JSONObject result = new JSONObject();
            result.put("uid", account); result.put("coupleId", space); result.put("operationId", operationId);
            result.put("success", success); result.put("error", failure);
            evalScoped("window.onUsExtrasAck&&window.onUsExtrasAck(" + result + ");", account, space, epoch);
        } catch (Exception ignored) { }
    }

    private void evalScoped(String javascript, String account, String space, long epoch) {
        activity.runOnUiThread(() -> {
            if (closed || generation != epoch || !account.equals(uid) || !space.equals(coupleId)) return;
            FirebaseUser user = auth.getCurrentUser();
            if (!account.isEmpty() && (user == null || !account.equals(user.getUid()))) return;
            if (account.isEmpty() && user != null) return;
            webView.evaluateJavascript(javascript, null);
        });
    }

    private static String safeText(Object text, int max) {
        if (!(text instanceof String)) return "";
        String result = (String) text;
        return result.length() <= max ? result : result.substring(0, max);
    }

    private static String readError(Exception failure) {
        if (failure instanceof FirebaseFirestoreException && ((FirebaseFirestoreException) failure).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED)
            return "Publish the updated UsSpace Firestore rules in usspace-c859e, then refresh. Your private drafts stay on this phone.";
        return "Us extras could not sync yet. Your saved local edits are kept; check your connection and refresh.";
    }

    private static String mutationError(Exception failure) {
        Throwable problem = failure;
        for (int n = 0; n < 6 && problem.getCause() != null; n++) problem = problem.getCause();
        if (problem instanceof IllegalArgumentException || problem instanceof IllegalStateException) {
            String message = problem.getMessage();
            if (message != null && message.length() <= 160) return message;
        }
        if (failure instanceof FirebaseFirestoreException && ((FirebaseFirestoreException) failure).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED)
            return "This update was not allowed. Publish the latest Firestore rules and check your paired account.";
        return "Could not sync this edit yet. Your local edit is kept; try again when connected.";
    }

    public void close() {
        if (closed) return;
        closed = true;
        auth.removeAuthStateListener(authListener);
        detachUser();
        resetScope("");
    }
}
