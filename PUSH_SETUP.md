# UsSpace v0.14 private push setup

The APK includes Firebase Cloud Messaging registration, Android notification permission, private per-account category settings, quiet hours, and guarded notification navigation. The repository contains two real server options below. **Installing the APK or publishing Firestore rules alone does not activate background push delivery.** An authorized server with Firebase Admin credentials must run the dispatcher. No server has been deployed or connected to this user's Firebase project during this build.

The existing project is on Firebase Spark. FCM itself is free. Firebase Cloud Functions deployment requires Blaze; this build does not change the billing plan. The optional trusted Node worker works with Spark and an existing external Node host, subject to Firestore's normal quotas and any hosting charges. It does not embed a website, run a server inside either phone, or let a client send arbitrary push messages.

## Option A: trusted Node host while keeping Spark

1. Publish this repository's `firestore.rules` in the existing `usspace-c859e` project.
2. Use a private, continuously running Node 22 host. Give its dedicated server identity access to this Firebase project: Firestore read/write (`roles/datastore.user`) and FCM send (`roles/firebasecloudmessaging.admin`). Use the host's Application Default Credentials, or a service-account file kept only on that host. Neither a GitHub token nor `google-services.json` is an Admin credential.
3. On the host, install the committed dependencies:

   ```sh
   npm --prefix functions install --ignore-scripts --no-audit --no-fund
   npm --prefix functions run check
   ```

4. Supply the project and explicit worker opt-in through the host's protected environment:

   ```sh
   export USSPACE_FIREBASE_PROJECT_ID=usspace-c859e
   export USSPACE_PUSH_WORKER_ENABLE=1
   # Only if the host does not already provide Application Default Credentials:
   export GOOGLE_APPLICATION_CREDENTIALS=/secure/host-only/usspace-worker.json
   npm --prefix functions run start:worker
   ```

   Configure the host's process supervisor to restart this command after a failure and on host restart. Keep credentials outside this repository, APK and downloadable artifacts.

5. Only one worker holds the renewed server-side lease. It watches the existing shared documents and the new strict collections through Firebase Admin. Initial snapshots and restarts establish quiet baselines; old notes, copied memories, rota rows and pairing imports are not replayed as notifications. Persistent monotonic cursors and source-version delivery receipts prevent duplicate sends. Updates made while the worker was offline remain visible in normal Firestore sync; historical pushes are intentionally not queued.

The worker logs that it is active, and stores server-only lease/cursor records. Do not use the Firebase demo/emulator environment with this live messaging worker; it refuses that configuration. Choose one server option rather than paying for two watchers of the same changes.

## Option B: Firebase Cloud Functions

This is an alternative for a project whose owner has separately enabled Blaze and authorized deployment. It is not required by the Spark-compatible worker.

```sh
npm --prefix functions install --ignore-scripts --no-audit --no-fund
npm --prefix functions run check
firebase deploy --project usspace-c859e --only firestore:rules,functions:usspace-push
```

The functions use Node 22 and `us-central1`; update the global region in `functions/src/index.mjs` if the Firestore project's location requires another region. No service-account secret belongs in the Android application. The default Functions service identity must be able to read the project's Firestore documents and send through Firebase Cloud Messaging.

## What sends a notification

| Category | Verified server source | Destination |
| --- | --- | --- |
| Pings | A new typed `kind: 'ping'` note from the existing Send love action; or an explicit immutable `usPings` document | Home |
| Notes | A new ordinary love note, Appreciation Jar note, or explicitly released Open When letter | Love notes, Jar, or Letters |
| Status | A change to the writer's own shared profile status | Home |
| Goals | A change to a visible/accountable shared goal | Goals |
| Bucket list | A meaningful new or changed shared bucket-list item | Bucket List |
| Memories | A meaningful shared memory change | Memories |
| Calendar | An upcoming shared duty/plan change, next-visit change/cancellation, or an explicitly enabled shift-times summary change | Calendar or Home |

The backend derives the actor from authenticated, persisted document metadata. It resolves the other person from the current two-member couple, confirms both user-account pairing records, checks the device's owning account, and rechecks notification preferences and quiet hours before sending. It never accepts a client-supplied recipient, token, message preview or arbitrary send request. A letter notification requires the current Al/Yashika role mapping and published recipient. Draft saves, Health, Cycle, Need Me moods, contact details, private goals, photos and learning progress have no push source.

All FCM messages are **data-only**, with generic category wording and bounded IDs. Notification text contains no actual note, letter, status, goal, memory title, address, tutorial, simulation, raw rota or health/cycle content. The Android receiver checks the current signed-in user, live pairing, device preference, category and quiet hours again, and deduplicates the event before displaying a notification.

## Settings and quiet hours

Notifications are off by default. Each person enables notifications and grants Android permission on their own phone. The seven category switches are independent. Quiet hours use the recipient's chosen IANA time zone, including daylight-saving changes. The start time is inclusive and the end time exclusive; a range crossing midnight works normally. Equal start and end mean silence all day. Unsupported/malformed time zones fail closed.

Quiet-time updates still sync in the application, but their push alerts are suppressed rather than held until morning. FCM transport uses normal priority, a 15-minute TTL and per-category collapse keys. Delivery is best effort: receipts claim each source/device once before the send, so a server crash or transport failure can lose an alert instead of replaying duplicate notifications. Firestore content remains the authoritative record. Admin receipts never contain token values or source text; invalid tokens are removed only if they still match the failed registration.

## Private schemas

- `users/{uid}/devices/{installationId}`: `uid`, `installationId`, `token`, `platform: 'android'`, `enabled`, `updatedAt` (server timestamp). The owner alone can read, register, rotate or delete a device.
- `users/{uid}/preferences/v014`: `theme` (`system`, `light`, `dark`), `notifications.enabled`, all seven boolean `notifications.categories`, `notifications.quietHours` (`enabled`, `start`, `end`, `timeZone`), `updatedAt` (server timestamp). No partner access.
- `couples/{coupleId}/usPings/{id}`: `id`, `senderUid`, `createdAt` (server timestamp); create-only for a current pair.
- `couples/{coupleId}/workSummaries/{uid}`: `uid`, `coupleId`, `date`, `start`, `end`, `timeZone`, `enabled: true`, `updatedAt` (server timestamp). Only the owner can publish/change it, current paired members can read it, and the owner can revoke it even after leaving the old pair. Raw rota details stay out of this document.
- `_pushDeliveries`, `_pushWorkerCursors`, `_pushWorkerLeases`: server only; every client read/write is denied.

Keep server dispatch/cursor records private. A host operator can remove old delivery records after an appropriate retention period (for example 30 days); cursors for active sources and the current worker lease should remain available across restarts.

## Verify on the two phones

After a server option is running:

1. Install the same v0.14 update on both phones and retain the existing pairing.
2. On each phone, open Settings → Notifications, opt in, grant Android notification permission, and select categories/quiet hours.
3. Put the receiving app in the background. Use Send love on the other phone; confirm exactly one generic ping opens Home.
4. Add a Jar note, a visible goal change, a future calendar edit and a Bucket List update; confirm enabled categories arrive with the right destination. Publish one reviewed letter; confirm only its intended recipient receives the letter alert.
5. Disable one category, then enable quiet hours covering the current recipient time. Confirm content still syncs while those alerts stay silent.
6. Switch/sign out accounts or leave the pair, then repeat an update. The previous account/pair must receive no notification.

The emulator/build checks verify schema permissions, source detection, pairing/role guards, quiet hours, token ownership, payload privacy, idempotence and Android integration. A successful emulator install is not a claim that live FCM delivered to the user's personal phones before their server was configured.
