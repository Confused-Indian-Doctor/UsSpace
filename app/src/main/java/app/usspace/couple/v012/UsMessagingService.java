package app.usspace.couple.v012;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Receives actual data-only Firebase Cloud Messaging. A server function sends the events. */
public final class UsMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> envelope = message.getData();
        if (!NotificationPolicy.valid(envelope, System.currentTimeMillis())) return;
        Data.Builder input = new Data.Builder();
        for (Map.Entry<String, String> field : envelope.entrySet()) input.putString(field.getKey(), field.getValue());
        OneTimeWorkRequest job = new OneTimeWorkRequest.Builder(NotificationBridge.DeliveryWorker.class).setInputData(input.build()).build();
        WorkManager.getInstance(this).enqueueUniqueWork("usspace_push_" + envelope.get("recipientUid") + "_" + envelope.get("eventId"), ExistingWorkPolicy.KEEP, job);
    }

    @Override public void onNewToken(@NonNull String token) {
        // The short background worker verifies opt-in, Android permission, auth and server membership.
        // A token is never sent to JavaScript or printed to a log.
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        String installation = getSharedPreferences("usspace_v014_notifications_private", MODE_PRIVATE).getString("installationId", "");
        if (user != null && installation.matches("[A-Za-z0-9_-]{8,100}")) {
            FirebaseFirestore.getInstance().collection("users").document(user.getUid()).collection("devices").document(installation)
                    .update("enabled", false, "updatedAt", FieldValue.serverTimestamp());
            sendBroadcast(new Intent("app.usspace.couple.v012.PREFERENCES_CHANGED").setPackage(getPackageName()).putExtra("uid", user.getUid()));
        }
        NotificationBridge.registerRefreshedToken(this, token);
    }
}
