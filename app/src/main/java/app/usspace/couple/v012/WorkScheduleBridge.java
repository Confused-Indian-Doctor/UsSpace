package app.usspace.couple.v012;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Source;
import net.openid.appauth.AuthState;
import net.openid.appauth.AuthorizationException;
import net.openid.appauth.AuthorizationRequest;
import net.openid.appauth.AuthorizationResponse;
import net.openid.appauth.AuthorizationService;
import net.openid.appauth.AuthorizationServiceConfiguration;
import net.openid.appauth.CodeVerifierUtil;
import net.openid.appauth.ResponseTypeValues;
import net.openid.appauth.TokenRequest;
import net.openid.appauth.GrantTypeValues;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Native read-only Microsoft Graph connection; no token or coworker row crosses the WebView bridge. */
public final class WorkScheduleBridge {
    public static final int OAUTH_REQUEST_CODE = 7414;
    public static final String REDIRECT = "app.usspace.couple.v012://oauth2redirect";
    public static final String DEFAULT_LINK = "";
    private static final String SCOPES = "openid profile offline_access https://graph.microsoft.com/Files.Read.All https://graph.microsoft.com/User.Read";
    private final Activity activity; private final WebView webView;
    private final FirebaseAuth firebase = FirebaseAuth.getInstance(); private final FirebaseFirestore db = FirebaseFirestore.getInstance();
    private final AuthorizationService authorization; private final WorkScheduleVault vault;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final FirebaseAuth.AuthStateListener authListener;
    private ListenerRegistration userListener, memberListener, summaryListener;
    private volatile String uid = "", coupleId = ""; private volatile long epoch;
    private volatile boolean closed, busy, paired, sharing;
    private JSONObject config = defaults(); private JSONArray shifts = new JSONArray(), worksheets = new JSONArray();
    private volatile AuthState microsoft; private AuthorizationRequest pending;
    private String error = "", warning = "", updatedAt = "", sharingCouple = "", sharingError = "", ownSummaryKey = "", publishingKey = "";
    private JSONObject partnerSummary = null; private boolean loading;
    private Intent deferredOAuth; private int deferredOAuthResult;

    public WorkScheduleBridge(Activity activity, WebView webView) {
        this.activity = activity; this.webView = webView; this.authorization = new AuthorizationService(activity); this.vault = new WorkScheduleVault(activity);
        this.authListener = auth -> activity.runOnUiThread(() -> observeIdentity(auth.getCurrentUser())); firebase.addAuthStateListener(authListener);
    }
    private static JSONObject defaults() {
        JSONObject value = new JSONObject();
        try { value.put("clientId", "").put("tenant", "common").put("workbookLink", DEFAULT_LINK).put("worksheet", "").put("person", "Alameen Ashraf").put("zone", "Europe/London").put("driveId", "").put("itemId", "");
            JSONObject mapping = new JSONObject(); for (String key : new String[]{"date", "person", "start", "end", "location", "tutorialRoom", "simulation", "shift"}) mapping.put(key, -1); value.put("columnMapping", mapping);
        } catch (Exception ignored) { } return value;
    }
    private boolean account(String account, long generation) { return !closed && !account.isEmpty() && account.equals(uid) && generation == epoch && firebase.getCurrentUser() != null && account.equals(firebase.getCurrentUser().getUid()); }
    private boolean scope(String account, String space, long generation) { return account(account, generation) && space.equals(coupleId) && paired; }
    private void observeIdentity(FirebaseUser user) {
        if (closed) return; String next = user == null ? "" : user.getUid(); if (next.equals(uid)) { post(); return; }
        String oldUid = uid; detach(); epoch++; uid = next; coupleId = ""; paired = false; busy = false; loading = false;
        config = defaults(); microsoft = null; pending = null; deferredOAuth = null; shifts = new JSONArray(); worksheets = new JSONArray(); error = warning = updatedAt = sharingError = ownSummaryKey = sharingCouple = publishingKey = ""; sharing = false; partnerSummary = null;
        // A sign-out/account switch destroys this connection's encrypted token and private rota cache.
        if (!oldUid.isEmpty()) vault.erase(oldUid);
        post(); if (next.isEmpty()) return;
        String account = uid; long generation = epoch; loading = true;
        worker.execute(() -> {
            JSONObject saved = null; boolean unreadable = false;
            try { String encoded = vault.read(account); if (!encoded.isEmpty()) saved = new JSONObject(encoded); } catch (Exception ignored) { unreadable = true; vault.erase(account); }
            JSONObject result = saved; boolean failed = unreadable;
            activity.runOnUiThread(() -> {
                if (!account(account, generation)) return; loading = false;
                try {
                    if (result != null) {
                        config = validateConfig(result.optJSONObject("config") == null ? defaults() : result.getJSONObject("config"));
                        if (result.has("auth")) microsoft = AuthState.jsonDeserialize(result.getString("auth"));
                        if (result.has("pending")) pending = AuthorizationRequest.jsonDeserialize(result.getString("pending"));
                        shifts = sanitizeShifts(result.optJSONArray("shifts")); updatedAt = result.optString("updatedAt");
                        sharing = result.optBoolean("sharing", false); sharingCouple = result.optString("sharingCouple");
                    }
                } catch (Exception ignored) { microsoft = null; pending = null; shifts = new JSONArray(); sharing = false; error = "Your private work connection needs to be set up again."; }
                if (failed) error = "The private work cache could not be opened. Reconnect Microsoft.";
                post(); attachUser(account, generation);
                if (deferredOAuth != null) { Intent resultIntent = deferredOAuth; int resultCode = deferredOAuthResult; deferredOAuth = null; onActivityResult(OAUTH_REQUEST_CODE, resultCode, resultIntent); }
            });
        });
    }
    private void attachUser(String account, long generation) {
        if (!account(account, generation)) return;
        userListener = db.collection("users").document(account).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!account(account, generation)) return;
            if (failure != null) { paired = false; partnerSummary = null; detachPair(); post(); return; }
            if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
            String next = snapshot.exists() ? snapshot.getString("coupleId") : ""; if (next == null || !next.matches("[A-Za-z0-9_-]{1,140}")) next = "";
            if (!next.equals(coupleId)) {
                String previous = coupleId; detachPair(); paired = false; partnerSummary = null; ownSummaryKey = "";
                if (!previous.isEmpty() && sharing) { sharing = false; sharingCouple = ""; deleteSummary(account, previous, generation); persist(); }
                coupleId = next;
                if (sharing && !next.equals(sharingCouple)) { sharing = false; sharingCouple = ""; persist(); }
            }
            if (!coupleId.isEmpty() && memberListener == null) attachMember(account, coupleId, generation);
            post();
        });
    }
    private void attachMember(String account, String space, long generation) {
        memberListener = db.collection("couples").document(space).collection("members").document(account).addSnapshotListener(MetadataChanges.INCLUDE, (snapshot, failure) -> {
            if (!account(account, generation) || !space.equals(coupleId)) return;
            if (failure != null) { paired = false; partnerSummary = null; if (summaryListener != null) { summaryListener.remove(); summaryListener = null; } post(); return; }
            if (snapshot == null || snapshot.getMetadata().isFromCache()) return;
            if (!snapshot.exists()) { paired = false; partnerSummary = null; sharing = false; sharingCouple = ""; deleteSummary(account, space, generation); persist(); if (summaryListener != null) { summaryListener.remove(); summaryListener = null; } post(); return; }
            paired = true;
            if (summaryListener == null) {
                summaryListener = db.collection("couples").document(space).collection("workSummaries").addSnapshotListener(MetadataChanges.INCLUDE, (values, problem) -> {
                    if (!scope(account, space, generation)) return;
                    if (problem != null) { partnerSummary = null; sharingError = "Work sharing could not sync. Publish the v0.14 Firestore rules, then refresh."; post(); return; }
                    // Do not reveal a new account's shared cache before server acknowledgement.
                    if (values == null || values.getMetadata().isFromCache()) return;
                    partnerSummary = null; ownSummaryKey = "";
                    for (DocumentSnapshot doc : values.getDocuments()) {
                        JSONObject safe = summaryJson(doc, space);
                        if (safe == null) continue;
                        if (doc.getId().equals(account)) ownSummaryKey = summaryKey(safe);
                        else partnerSummary = safe;
                    }
                    post(); if (sharing) publishSummary();
                });
            }
            if (sharing) publishSummary(); post();
        });
    }
    private JSONObject summaryJson(DocumentSnapshot doc, String space) {
        try {
            Map<String, Object> data = doc.getData(); if (data == null || !Boolean.TRUE.equals(data.get("enabled"))) return null;
            String owner = doc.getString("uid"), cid = doc.getString("coupleId"), date = doc.getString("date"), start = doc.getString("start"), end = doc.getString("end"), zone = doc.getString("timeZone");
            if (!doc.getId().equals(owner) || !space.equals(cid) || !WorkSchedulePolicy.validZone(zone) || !WorkSchedulePolicy.validDate(date) || !WorkSchedulePolicy.validTime(start) || !WorkSchedulePolicy.validTime(end)) return null;
            if (!LocalDate.now(ZoneId.of(zone)).toString().equals(date)) return null;
            return new JSONObject().put("uid", owner).put("coupleId", cid).put("date", date).put("start", start).put("end", end).put("timeZone", zone).put("enabled", true);
        } catch (Exception ignored) { return null; }
    }
    private void detachPair() { if (memberListener != null) memberListener.remove(); if (summaryListener != null) summaryListener.remove(); memberListener = summaryListener = null; }
    private void detach() { if (userListener != null) userListener.remove(); userListener = null; detachPair(); }
    @JavascriptInterface public String status() { return publicState().toString(); }
    @JavascriptInterface public void requestRender() { activity.runOnUiThread(() -> { post(); if (sharing && paired) publishSummary(); }); }
    public void onIdentity(String ignoredUid) { activity.runOnUiThread(() -> observeIdentity(firebase.getCurrentUser())); }
    @JavascriptInterface public void configure(String json) {
        activity.runOnUiThread(() -> {
            if (uid.isEmpty() || closed || busy || loading) return;
            try {
                JSONObject next = validateConfig(new JSONObject(json));
                boolean identityChanged = !next.optString("clientId").equals(config.optString("clientId")) || !next.optString("tenant").equals(config.optString("tenant"));
                boolean sourceChanged = !next.toString().equals(config.toString());
                if (sourceChanged) { if (sharing && !coupleId.isEmpty()) deleteSummary(uid, coupleId, epoch); sharing = false; sharingCouple = ""; shifts = new JSONArray(); updatedAt = ""; warning = ""; }
                if (identityChanged) { microsoft = null; pending = null; }
                config = next; error = ""; persist(); post();
            } catch (Exception failure) { error = failure.getMessage() == null ? "Check the Microsoft and Excel setup fields." : failure.getMessage(); post(); }
        });
    }
    private static JSONObject validateConfig(JSONObject input) throws Exception {
        JSONObject value = defaults();
        String client = input.optString("clientId", "").trim(), tenant = input.optString("tenant", "common").trim(), link = input.optString("workbookLink", DEFAULT_LINK).trim();
        if (!client.isEmpty() && !WorkSchedulePolicy.validClientId(client)) throw new IllegalArgumentException("Use the application/client ID from your Microsoft app registration.");
        if (!WorkSchedulePolicy.validTenant(tenant)) throw new IllegalArgumentException("Tenant must be common, organizations, a tenant ID, or an onmicrosoft.com domain.");
        if (!WorkSchedulePolicy.validLink(link)) throw new IllegalArgumentException("Use an HTTPS SharePoint or OneDrive Excel sharing link.");
        String person = input.optString("person", "Alameen Ashraf").trim(), zone = input.optString("zone", "Europe/London").trim(), sheet = input.optString("worksheet", "").trim();
        if (person.isEmpty() || person.length() > 160) throw new IllegalArgumentException("Enter Al’s name exactly as it appears in the rota.");
        if (!WorkSchedulePolicy.validZone(zone)) throw new IllegalArgumentException("Use a valid timezone, for example Europe/London.");
        if (sheet.length() > 160) throw new IllegalArgumentException("Worksheet name is too long.");
        String drive = input.optString("driveId", "").trim(), item = input.optString("itemId", "").trim();
        if (drive.length() > 240 || item.length() > 240 || !drive.matches("[A-Za-z0-9!_.,~-]*") || !item.matches("[A-Za-z0-9!_.,~-]*") || drive.isEmpty() != item.isEmpty()) throw new IllegalArgumentException("Supply both Microsoft Graph drive and item IDs, or leave both blank.");
        value.put("clientId", client).put("tenant", tenant).put("workbookLink", link).put("person", person).put("zone", zone).put("worksheet", sheet).put("driveId", drive).put("itemId", item);
        JSONObject mapping = new JSONObject(), source = input.optJSONObject("columnMapping");
        for (String key : new String[]{"date", "person", "start", "end", "location", "tutorialRoom", "simulation", "shift"}) { Object raw = source == null ? null : source.opt(key); int column = -1; if (raw != null && raw != JSONObject.NULL) { if (!(raw instanceof Number) || ((Number) raw).doubleValue() != ((Number) raw).intValue()) throw new IllegalArgumentException("Column mappings must be whole column numbers."); column = ((Number) raw).intValue(); } if (column < -1 || column > 119) throw new IllegalArgumentException("Column mappings must be between 1 and 120, or Automatic."); mapping.put(key, column); }
        value.put("columnMapping", mapping); return value;
    }
    @JavascriptInterface public void connect() {
        activity.runOnUiThread(() -> {
            if (closed || uid.isEmpty() || busy || loading) return;
            if (!WorkSchedulePolicy.validClientId(config.optString("clientId"))) { error = "Set up a Microsoft public-client app and enter its client ID first. Workbook read access alone cannot identify this app."; post(); return; }
            try {
                String tenant = config.getString("tenant");
                AuthorizationServiceConfiguration endpoints = new AuthorizationServiceConfiguration(Uri.parse("https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/authorize"), Uri.parse("https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token"));
                pending = new AuthorizationRequest.Builder(endpoints, config.getString("clientId"), ResponseTypeValues.CODE, Uri.parse(REDIRECT))
                        .setScope(SCOPES).setCodeVerifier(CodeVerifierUtil.generateRandomCodeVerifier()).setPrompt("select_account").build();
                busy = true; error = ""; persist(); post();
                activity.startActivityForResult(authorization.getAuthorizationRequestIntent(pending), OAUTH_REQUEST_CODE);
            } catch (Exception ignored) { pending = null; busy = false; error = "Microsoft sign-in could not open. Install or update a browser, then try again."; persist(); post(); }
        });
    }
    public boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != OAUTH_REQUEST_CODE) return false;
        activity.runOnUiThread(() -> {
            if (loading) { deferredOAuth = data == null ? new Intent() : data; deferredOAuthResult = resultCode; return; }
            String account = uid; long generation = epoch;
            if (!account(account, generation) || pending == null) { busy = false; post(); return; }
            AuthorizationRequest expected = pending;
            AuthorizationResponse response = data == null ? null : AuthorizationResponse.fromIntent(data);
            AuthorizationException failure = data == null ? null : AuthorizationException.fromIntent(data);
            if (response == null || !WorkSchedulePolicy.acceptOAuthCallback(expected.state, response.state, expected.clientId, response.request.clientId,
                    expected.redirectUri.toString(), response.request.redirectUri.toString(), expected.configuration.authorizationEndpoint.toString(), response.request.configuration.authorizationEndpoint.toString(),
                    expected.configuration.tokenEndpoint.toString(), response.request.configuration.tokenEndpoint.toString())) {
                pending = null; busy = false; error = resultCode == Activity.RESULT_CANCELED || failure != null ? "Microsoft sign-in was cancelled or not authorised. You can try again." : "Microsoft sign-in could not be verified. Please reconnect."; persist(); post(); return;
            }
            AuthState state = new AuthState(response, failure);
            TokenRequest exchange = new TokenRequest.Builder(expected.configuration, expected.clientId).setGrantType(GrantTypeValues.AUTHORIZATION_CODE)
                    .setAuthorizationCode(response.authorizationCode).setRedirectUri(expected.redirectUri).setCodeVerifier(expected.codeVerifier).build();
            authorization.performTokenRequest(exchange, (tokens, tokenError) -> activity.runOnUiThread(() -> {
                if (!account(account, generation)) return;
                pending = null; busy = false;
                if (tokens == null || tokenError != null) { microsoft = null; error = "Microsoft could not finish sign-in. Check the app registration’s redirect and public-client settings."; persist(); post(); return; }
                state.update(tokens, tokenError); microsoft = state; error = ""; persist(); post(); refresh();
            }));
        }); return true;
    }
    @JavascriptInterface public void refresh() {
        activity.runOnUiThread(() -> {
            if (closed || uid.isEmpty() || busy || loading) return;
            if (microsoft == null || !microsoft.isAuthorized()) { error = "Connect your Microsoft account to read the Excel rota."; post(); return; }
            String account = uid; long generation = epoch; AuthState state = microsoft; JSONObject connection = cloneJson(config); busy = true; error = ""; post();
            worker.execute(() -> {
                try {
                    String token = freshToken(state, account, generation);
                    if (!account(account, generation) || microsoft != state) return;
                    WorkScheduleGraph.Result graph = WorkScheduleGraph.fetch(token, connection);
                    RotaParser.Config parser = parserConfig(connection); parser.date1904 = graph.date1904; RotaParser.Result parsed = RotaParser.parse(graph.rows, parser);
                    JSONArray own = new JSONArray();
                    for (RotaParser.Shift shift : parsed.shifts) own.put(new JSONObject().put("date", shift.date).put("start", shift.start).put("end", shift.end).put("location", shift.location).put("tutorialRoom", shift.tutorialRoom).put("simulation", shift.simulation).put("label", shift.label));
                    activity.runOnUiThread(() -> {
                        if (!account(account, generation) || microsoft != state) return;
                        busy = false; shifts = own; worksheets = new JSONArray(graph.worksheets); updatedAt = Instant.now().toString();
                        warning = parsed.warning == null || parsed.warning.isEmpty() ? graph.warning : parsed.warning; error = parsed.success ? "" : "The rota could not identify Al’s rows. Check the name and column mapping.";
                        persist(); post(); if (sharing) publishSummary();
                    });
                } catch (Exception failure) {
                    String message = failure instanceof WorkScheduleGraph.GraphFailure ? failure.getMessage() : failure instanceof java.io.IOException || failure instanceof IllegalArgumentException ? failure.getMessage() : "The Excel rota could not be read. Check the worksheet and column mapping.";
                    activity.runOnUiThread(() -> { if (!account(account, generation) || microsoft != state) return; busy = false; error = message == null ? "Could not refresh the rota. Your last private copy remains available." : message; post(); });
                }
            });
        });
    }
    private String freshToken(AuthState state, String account, long generation) throws Exception {
        CountDownLatch finished = new CountDownLatch(1); AtomicReference<String> token = new AtomicReference<>(); AtomicReference<Exception> failure = new AtomicReference<>();
        state.performActionWithFreshTokens(authorization, (access, idToken, error) -> {
            if (error != null || access == null) failure.set(new java.io.IOException("Microsoft sign-in expired. Reconnect your Microsoft account."));
            else if (account(account, generation) && microsoft == state) token.set(access);
            else failure.set(new java.io.IOException("Microsoft account changed. Reconnect to refresh."));
            finished.countDown(); activity.runOnUiThread(() -> { if (account(account, generation) && microsoft == state) persist(); });
        });
        if (!finished.await(35, TimeUnit.SECONDS)) throw new java.io.IOException("Microsoft took too long to respond. Please try again.");
        if (failure.get() != null) throw failure.get(); return token.get();
    }
    private static RotaParser.Config parserConfig(JSONObject config) {
        RotaParser.Config result = new RotaParser.Config(); result.person = config.optString("person"); result.zone = config.optString("zone"); JSONObject map = config.optJSONObject("columnMapping"); if (map == null) return result;
        result.dateColumn = map.optInt("date", -1); result.personColumn = map.optInt("person", -1); result.startColumn = map.optInt("start", -1); result.endColumn = map.optInt("end", -1); result.locationColumn = map.optInt("location", -1); result.tutorialRoomColumn = map.optInt("tutorialRoom", -1); result.simulationColumn = map.optInt("simulation", -1); result.shiftColumn = map.optInt("shift", -1); return result;
    }
    @JavascriptInterface public void setSharing(boolean enabled) {
        activity.runOnUiThread(() -> {
            if (closed || uid.isEmpty()) return;
            if (!enabled) { sharing = false; sharingCouple = ""; sharingError = ""; persist(); if (!coupleId.isEmpty()) deleteSummary(uid, coupleId, epoch); post(); return; }
            if (!paired || todaySummary() == null || microsoft == null || !microsoft.isAuthorized()) { sharingError = "Pair your phones and refresh a complete shift for today before sharing its times."; post(); return; }
            sharing = true; sharingCouple = coupleId; sharingError = ""; persist(); publishSummary(); post();
        });
    }
    private Map<String, Object> todaySummary() {
        String zone = config.optString("zone", "Europe/London"); LocalDate today; try { today = LocalDate.now(ZoneId.of(zone)); } catch (Exception ignored) { return null; }
        for (int i = 0; i < shifts.length(); i++) { JSONObject shift = shifts.optJSONObject(i); if (shift == null) continue; Map<String, Object> result = WorkSchedulePolicy.summary(uid, coupleId, shift.optString("date"), shift.optString("start"), shift.optString("end"), zone, today); if (result != null) return result; }
        return null;
    }
    private String summaryKey(JSONObject value) { return value.optString("uid") + "|" + value.optString("coupleId") + "|" + value.optString("date") + "|" + value.optString("start") + "|" + value.optString("end") + "|" + value.optString("timeZone"); }
    private void publishSummary() {
        if (!sharing || !paired || !coupleId.equals(sharingCouple)) return;
        String account = uid, space = coupleId; long generation = epoch; Map<String, Object> projection = todaySummary();
        if (projection == null) { deleteSummary(account, space, generation); return; }
        String key = summaryKey(new JSONObject(projection)); if (key.equals(ownSummaryKey) || key.equals(publishingKey)) return;
        publishingKey = key;
        projection.put("updatedAt", FieldValue.serverTimestamp());
        db.runTransaction(transaction -> {
            DocumentSnapshot user = transaction.get(db.collection("users").document(account));
            DocumentSnapshot member = transaction.get(db.collection("couples").document(space).collection("members").document(account));
            if (!scope(account, space, generation) || !sharing || !space.equals(sharingCouple) || !space.equals(user.getString("coupleId")) || !member.exists()) throw new IllegalStateException("The paired account changed.");
            transaction.set(db.collection("couples").document(space).collection("workSummaries").document(account), projection); return null;
        }).addOnSuccessListener(activity, ignored -> { if (account(account, generation)) { if (key.equals(publishingKey)) publishingKey = ""; if (scope(account, space, generation) && sharing && space.equals(sharingCouple)) { ownSummaryKey = key; sharingError = ""; post(); } else deleteSummary(account, space, generation); } })
          .addOnFailureListener(activity, ignored -> { if (account(account, generation)) { if (key.equals(publishingKey)) publishingKey = ""; if (sharing) sharingError = "The work summary has not synced. Check your connection and the v0.14 Firestore rules."; post(); } });
    }
    private void deleteSummary(String account, String space, long generation) {
        if (!account(account, generation) || space.isEmpty()) return;
        sharingError = "Removing the shared work summary; reconnect if your phone is offline.";
        db.collection("couples").document(space).collection("workSummaries").document(account).delete()
                .addOnSuccessListener(activity, ignored -> { if (account(account, generation)) { ownSummaryKey = ""; sharingError = ""; post(); } })
                .addOnFailureListener(activity, ignored -> { if (account(account, generation)) { sharingError = "Removing the old summary is waiting for a connection. Sharing is off on this phone."; post(); } });
    }
    @JavascriptInterface public void disconnect() {
        activity.runOnUiThread(() -> {
            if (uid.isEmpty() || closed) return;
            if (!coupleId.isEmpty()) deleteSummary(uid, coupleId, epoch);
            microsoft = null; pending = null; shifts = new JSONArray(); worksheets = new JSONArray(); updatedAt = warning = error = sharingCouple = ""; busy = false; sharing = false;
            persist(); post();
        });
    }
    @JavascriptInterface public void clearCache() { activity.runOnUiThread(() -> { if (uid.isEmpty() || closed) return; shifts = new JSONArray(); worksheets = new JSONArray(); updatedAt = ""; if (sharing && !coupleId.isEmpty()) deleteSummary(uid, coupleId, epoch); persist(); post(); }); }
    private void persist() {
        if (uid.isEmpty() || closed) return;
        try {
            JSONObject privateData = new JSONObject().put("config", config).put("shifts", shifts).put("updatedAt", updatedAt).put("sharing", sharing).put("sharingCouple", sharingCouple);
            if (microsoft != null) privateData.put("auth", microsoft.jsonSerializeString()); if (pending != null) privateData.put("pending", pending.jsonSerializeString());
            vault.write(uid, privateData.toString());
        } catch (Exception ignored) { error = "Your private work connection could not be saved securely. Reconnect after restarting the app."; }
    }
    private JSONObject publicState() {
        JSONObject value = new JSONObject();
        try {
            value.put("uid", uid).put("coupleId", coupleId).put("paired", paired).put("configured", WorkSchedulePolicy.validClientId(config.optString("clientId"))).put("needsSetup", !WorkSchedulePolicy.validClientId(config.optString("clientId")))
                    .put("connected", microsoft != null && microsoft.isAuthorized()).put("busy", busy || loading).put("config", config).put("shifts", shifts).put("worksheets", worksheets).put("error", error).put("warning", warning).put("updatedAt", updatedAt)
                    .put("sharing", sharing).put("sharingError", sharingError).put("canConfigure", !uid.isEmpty()).put("canShare", paired && todaySummary() != null && microsoft != null && microsoft.isAuthorized()).put("offline", !error.isEmpty() && shifts.length() > 0);
            Map<String, Object> own = todaySummary(); value.put("summary", own == null ? JSONObject.NULL : new JSONObject(own)); value.put("partnerSummary", paired && partnerSummary != null ? partnerSummary : JSONObject.NULL);
        } catch (Exception ignored) { } return value;
    }
    private static JSONObject cloneJson(JSONObject source) { try { return new JSONObject(source.toString()); } catch (Exception ignored) { return defaults(); } }
    private static JSONArray sanitizeShifts(JSONArray input) {
        JSONArray result = new JSONArray(); if (input == null) return result;
        for (int i = 0; i < Math.min(input.length(), 730); i++) { JSONObject value = input.optJSONObject(i); if (value == null || !WorkSchedulePolicy.validDate(value.optString("date"))) continue;
            JSONObject safe = new JSONObject(); try { safe.put("date", value.getString("date")); for (String key : new String[]{"start", "end", "location", "tutorialRoom", "simulation", "label"}) { String text = value.optString(key, ""); if (text.length() > 240) text = text.substring(0, 240); if ((key.equals("start") || key.equals("end")) && !text.isEmpty() && !WorkSchedulePolicy.validTime(text)) text = ""; safe.put(key, text); } result.put(safe); } catch (Exception ignored) { } }
        return result;
    }
    private void post() { if (!closed) { JSONObject state = publicState(); activity.runOnUiThread(() -> { if (!closed && state.optString("uid").equals(uid) && state.optString("coupleId").equals(coupleId)) webView.evaluateJavascript("window.UsWorkSchedule&&window.UsWorkSchedule.onNativeState(" + state + ");", null); }); } }
    public void close() { if (closed) return; closed = true; epoch++; firebase.removeAuthStateListener(authListener); detach(); authorization.dispose(); worker.shutdownNow(); microsoft = null; pending = null; shifts = new JSONArray(); partnerSummary = null; }
}
