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
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialInterruptedException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.GetCredentialUnsupportedException;
import androidx.credentials.exceptions.NoCredentialException;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.FirebaseNetworkException;
import com.google.firebase.FirebaseTooManyRequestsException;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
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
    private volatile boolean signingIn;
    private volatile String lastAuthError = "";
    private NotificationBridge notificationBridge;
    private boolean signingOut;

    public void setNotificationBridge(NotificationBridge bridge) { notificationBridge = bridge; }

    public AuthBridge(Activity activity, WebView webView, CoupleSyncBridge sync) {
        this.activity = activity;
        this.webView = webView;
        this.sync = sync;
        this.mainExecutor = activity::runOnUiThread;
        this.auth = FirebaseAuth.getInstance();
        this.credentialManager = CredentialManager.create(activity);
        this.auth.addAuthStateListener(firebaseAuth -> {
            FirebaseUser user = firebaseAuth.getCurrentUser();
            if (user != null) {
                signingIn = false;
                lastAuthError = "";
                sync.onSignedIn(user);
            } else {
                sync.onSignedOut();
            }
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
            if (signingIn) return;
            if (auth.getCurrentUser() != null) {
                publishState();
                return;
            }
            lastAuthError = "";
            signingIn = true;
            publishState();
            try {
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

                // A user-pressed button uses the explicit flow. Unlike the bottom
                // sheet, it supports adding an account and reauthentication.
                GetSignInWithGoogleOption googleIdOption = new GetSignInWithGoogleOption.Builder(webClientId)
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
                                postError(credentialError(e));
                            }
                        });
            } catch (RuntimeException e) {
                postError("Could not open Google sign-in. Update Google Play services, then try again.");
            }
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
                    signingIn = false;
                    lastAuthError = "";
                    publishState();
                } else {
                    postError(firebaseError(task.getException()));
                }
            });
        } catch (Exception e) {
            postError("Google Sign-In response could not be read.");
        }
    }

    @JavascriptInterface
    public void signOut() {
        activity.runOnUiThread(() -> {
            if (signingOut) return;
            signingOut = true;
            if (notificationBridge != null) notificationBridge.beforeSignOut(this::finishSignOut);
            else finishSignOut();
        });
    }

    private void finishSignOut() {
        signingIn = false;
        lastAuthError = "";
        auth.signOut();
        signingOut = false;
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
            j.put("signingIn", signingIn);
            j.put("authState", signingIn ? "signing_in" : !lastAuthError.isEmpty() ? "error" : user != null ? "signed_in" : "signed_out");
            j.put("error", lastAuthError);
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
        lastAuthError = message;
        signingIn = false;
        publishState();
    }

    private String credentialError(GetCredentialException error) {
        if (error instanceof GetCredentialCancellationException) {
            return "Google sign-in was cancelled. Tap Sign in with Google to try again.";
        }
        if (error instanceof NoCredentialException) {
            return "No Google account is available. Add a Google account in your phone's Settings, then try again.";
        }
        if (error instanceof GetCredentialProviderConfigurationException
                || error instanceof GetCredentialUnsupportedException) {
            return "Google sign-in is unavailable on this phone. Install or update Google Play services, then try again.";
        }
        if (error instanceof GetCredentialInterruptedException) {
            return "Google sign-in was interrupted. Check your connection, then try again.";
        }
        return "Google sign-in could not open. Check your connection and update Google Play services, then try again.";
    }

    private String firebaseError(Exception error) {
        if (error instanceof FirebaseNetworkException) {
            return "Firebase could not be reached. Check your internet connection, then try again.";
        }
        if (error instanceof FirebaseTooManyRequestsException) {
            return "Too many sign-in attempts. Wait a moment, then try again.";
        }
        if (error instanceof FirebaseAuthException) {
            String code = ((FirebaseAuthException) error).getErrorCode();
            switch (code) {
                case "ERROR_OPERATION_NOT_ALLOWED":
                case "ERROR_ADMIN_RESTRICTED_OPERATION":
                    return "Google sign-in is disabled for UsSpace. Enable Google in Firebase Console: Authentication > Sign-in method.";
                case "ERROR_USER_DISABLED":
                    return "This account is disabled for UsSpace. Re-enable it in Firebase Authentication or use another Google account.";
                case "ERROR_ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL":
                    return "This email already uses another sign-in method. Try a different Google account.";
                case "ERROR_INVALID_CREDENTIAL":
                    return "Google sign-in was rejected. Check the Firebase Google provider and the APK's registered signing certificate.";
                default:
                    // Firebase error codes are safe diagnostics; never expose
                    // credentials, ID tokens or raw exception messages.
                    return "Firebase Google sign-in failed (" + code + "). Please try again.";
            }
        }
        return "Firebase Google sign-in failed. Check your connection, then try again.";
    }

    private void eval(String js) {
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }
}
