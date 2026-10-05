package app.usspace.couple.v012;

import android.app.Activity;
import android.os.CancellationSignal;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;

import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;

import org.json.JSONObject;

import java.util.concurrent.Executor;

public class AuthBridge {
    private final Activity activity;
    private final WebView webView;
    private final FirebaseAuth auth;
    private final CredentialManager credentialManager;
    private final CoupleSyncBridge sync;
    private final Executor mainExecutor;

    public AuthBridge(Activity activity, WebView webView, CoupleSyncBridge sync) {
        this.activity = activity;
        this.webView = webView;
        this.sync = sync;
        this.mainExecutor = activity::runOnUiThread;
        this.auth = FirebaseAuth.getInstance();
        this.credentialManager = CredentialManager.create(activity);
        this.auth.addAuthStateListener(firebaseAuth -> {
            FirebaseUser user = firebaseAuth.getCurrentUser();
            if (user != null) sync.onSignedIn(user);
            else sync.onSignedOut();
            publishState();
        });
    }

    @JavascriptInterface
    public String status() {
        return userJson(auth.getCurrentUser()).toString();
    }

    @JavascriptInterface
    public void signIn() {
        activity.runOnUiThread(() -> {
            int clientIdResource = activity.getResources().getIdentifier(
                    "default_web_client_id", "string", activity.getPackageName());
            if (clientIdResource == 0) {
                postError("Firebase Google Sign-In is not configured yet.");
                return;
            }
            String webClientId = activity.getString(clientIdResource);
            if (webClientId == null || webClientId.trim().isEmpty()) {
                postError("Firebase web client ID is missing.");
                return;
            }

            GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(webClientId)
                    .setAutoSelectEnabled(false)
                    .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build();

            credentialManager.getCredentialAsync(
                    activity,
                    request,
                    new CancellationSignal(),
                    mainExecutor,
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse result) {
                            handleCredential(result.getCredential());
                        }

                        @Override
                        public void onError(@NonNull GetCredentialException e) {
                            postError("Google Sign-In cancelled or failed.");
                        }
                    });
        });
    }

    private void handleCredential(Credential credential) {
        try {
            if (!(credential instanceof CustomCredential)) {
                postError("Google did not return an ID token.");
                return;
            }
            CustomCredential custom = (CustomCredential) credential;
            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(custom.getType())) {
                postError("Unexpected Google credential type.");
                return;
            }
            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(custom.getData());
            AuthCredential firebaseCredential = GoogleAuthProvider.getCredential(google.getIdToken(), null);
            auth.signInWithCredential(firebaseCredential).addOnCompleteListener(activity, task -> {
                if (task.isSuccessful() && auth.getCurrentUser() != null) {
                    sync.onSignedIn(auth.getCurrentUser());
                    publishState();
                } else {
                    postError("Firebase could not sign this Google account in.");
                }
            });
        } catch (Exception e) {
            postError("Google Sign-In response could not be read.");
        }
    }

    @JavascriptInterface
    public void signOut() {
        auth.signOut();
        sync.onSignedOut();
        ClearCredentialStateRequest request = new ClearCredentialStateRequest();
        credentialManager.clearCredentialStateAsync(
                request,
                new CancellationSignal(),
                mainExecutor,
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override public void onResult(Void result) { publishState(); }
                    @Override public void onError(@NonNull ClearCredentialException e) { publishState(); }
                });
    }

    public void publishState() {
        JSONObject data = userJson(auth.getCurrentUser());
        eval("window.onUsAuthState&&window.onUsAuthState(" + data + ");");
    }

    private JSONObject userJson(FirebaseUser user) {
        JSONObject j = new JSONObject();
        try {
            j.put("signedIn", user != null);
            if (user != null) {
                j.put("uid", user.getUid());
                j.put("name", user.getDisplayName() == null ? "" : user.getDisplayName());
                j.put("email", user.getEmail() == null ? "" : user.getEmail());
                j.put("photo", user.getPhotoUrl() == null ? "" : user.getPhotoUrl().toString());
            }
        } catch (Exception ignored) { }
        return j;
    }

    private void postError(String message) {
        JSONObject j = new JSONObject();
        try {
            j.put("signedIn", auth.getCurrentUser() != null);
            j.put("error", message);
        } catch (Exception ignored) { }
        eval("window.onUsAuthState&&window.onUsAuthState(" + j + ");");
    }

    private void eval(String js) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }
}
