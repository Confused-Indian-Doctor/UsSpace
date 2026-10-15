package app.usspace.couple.v012;

import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
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
        OneTimeWorkRequest.Builder delivery = new OneTimeWorkRequest.Builder(NotificationBridge.DeliveryWorker.class).setInputData(input.build());
        // High-priority FCM has an expedited-work exemption on Android 12+. Ordinary work
        // could otherwise wait in Doze before checking the recipient's current membership.
        // Earlier Android versions would require an unrelated foreground-service notification.
        if (Build.VERSION.SDK_INT >= 31 && message.getPriority() == RemoteMessage.PRIORITY_HIGH)
            delivery.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
        OneTimeWorkRequest job = delivery.build();
        WorkManager.getInstance(this).enqueueUniqueWork("usspace_push_" + envelope.get("recipientUid") + "_" + envelope.get("eventId"), ExistingWorkPolicy.KEEP, job);
    }

    @Override public void onNewToken(@NonNull String token) {
        // The short background worker verifies opt-in, Android permission, auth and server membership.
        // A token is never sent to JavaScript or printed to a log.
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user != null) {
            // Rebinding replaces the token atomically after checking consent and membership.
            // A separate queued enabled=false write can arrive after that transaction and
            // silently disable the freshly registered token when a connection returns.
            sendBroadcast(new Intent("app.usspace.couple.v012.PREFERENCES_CHANGED").setPackage(getPackageName()).putExtra("uid", user.getUid()));
        }
        NotificationBridge.registerRefreshedToken(this, token);
    }
}
