# UsSpace v0.16 private push setup

The APK includes Firebase Cloud Messaging registration, Android notification permission, private per-account category settings, quiet hours, and guarded notification navigation. The repository contains an on-demand relay and two alternative server options below. **Installing the APK or publishing Firestore rules alone does not activate background push delivery.** An authorized server with Firebase Admin credentials must run the dispatcher, either on demand or as a continuous worker. A server deployment and a real two-phone delivery test are separate from the APK build; source tests and an emulator launch do not establish that a live worker has been authorized.

The existing project is on Firebase Spark. FCM itself is free. Firebase Cloud Functions deployment requires Blaze; this build does not change the billing plan. The optional trusted Node worker works with Spark and an existing external Node host, subject to Firestore's normal quotas and any hosting charges. It does not embed a website, run a server inside either phone, or let a client send arbitrary push messages.

## Option A: on-demand HTTPS relay while keeping Spark

`functions/src/relay.mjs` runs only when the sender has a new persisted outbox event. The Android sender creates a tiny typed outbox record in the same Firestore transaction as the shared change, then uses WorkManager to POST just `{coupleId,eventId}` with its current Firebase ID token. The trusted backend reads the event and source directly from Firestore, checks the exact commit/version, authenticates the actor and current couple, and calls FCM. It requires no permanent worker, scheduled task or Firebase Cloud Functions deployment. Normal Firestore data sync remains available when relay capability/rules have not yet been enabled.

The host must expose an HTTPS POST route backed by `makeOutboxRelay({db,auth,messaging,projectId,logger,serverTimestamp}).handle({method,authorization,body})`. Forward only the adapter's status/body, use `Cache-Control: no-store`, cap the JSON request body, and never expose Admin credentials to the browser/Android. For a 503 response with `retryAfterSeconds:30`, return a matching `Retry-After: 30` header. GET requests and request-supplied notification contents, recipients, tokens and categories are rejected.

The native capability switch must remain **off** until this route has its private server credentials, the matching v0.16 Firestore rules have been published, and an authenticated event has passed the verification procedure below. Deploying a route without credentials or sending an unauthenticated health request does not establish working notifications.

### Persisted outbox contract

Path: `couples/{coupleId}/pushOutbox/{eventId}`. Exact required fields: `id`, `actorUid`, `sourceKind`, `sourceId`, `categories`, `createdAt` (Firestore server timestamp). `receiptId` is additionally required for `jar`, `letter` and `bucket`, and forbidden for other sources. Events are immutable. There is no user text, health, cycle, mood, contact, photo or rota detail in an event.

| Source kind | Source path under the couple | Allowed categories |
| --- | --- | --- |
| common | `shared/common` | pings, notes, goals, memories, calendar |
| profile | `profiles/{actorUid}` | status |
| ping | `usPings/{sourceId}` | pings |
| work | `workSummaries/{actorUid}` | calendar |
| jar | `usJar/{sourceId}` | notes |
| letter | `usLetters/{sourceId}` | notes |
| bucket | `usBucket/{sourceId}` | bucket |

The adapter checks that both the event and the current source snapshot have the same exact Firestore `updateTime` as `event.createdAt`, including nanoseconds. Common/profile/work additionally require `source.updatedAt == event.createdAt`; pings require `source.createdAt == event.createdAt`. Extras require the named actor-private `users/{actorUid}/usReceipts/{receiptId}` with the same server timestamp and matching couple, operation, source kind and item ID. A newer source version or an event older than 15 minutes is acknowledged silently. A missing event, forged actor, mismatched source/category, foreign Firebase project, revoked/disabled authentication, or a pair that is no longer the exact current two accounts cannot send. Letter recipient/role checks remain enforced by the existing dispatcher.

A 200 response with `consumed:true` means the event was processed or safely suppressed; it does **not** claim delivery to a physical phone. Disabled categories/quiet hours remain silent. An explicit transient FCM rejection returns retriable 503, keeps a private server receipt and allows another send after at least 30 seconds, with at most three claims per source/device. The native worker must respect this delay. Each retry checks current pairing, source, preferences, roles and token ownership. Unknown/ambiguous transport outcomes are consumed without retransmitting; Android also deduplicates the stable event ID. A server crash after claiming an event can still lose an alert; paired content remains in Firestore.

## Option B: trusted Node host while keeping Spark

1. Publish this repository's `firestore.rules` in the existing `usspace-c859e` project.
2. Use a private, continuously running Node 22 host. Give its dedicated server identity access to this Firebase project: Firestore read/write (`roles/datastore.user`) and FCM send (`roles/firebasecloudmessaging.admin`). The authenticated HTTPS relay additionally needs Firebase Authentication Viewer (`roles/firebaseauth.viewer`) to check revoked/disabled users. Use the host's Application Default Credentials, or a service-account file kept only on that host. Neither a GitHub token nor `google-services.json` is an Admin credential.
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

5. Set the host's readiness check to `GET /healthz` if you supplied `PORT`. It returns only `{"status":"ready"}` with HTTP 200 after all seven shared-source watchers have connected and the worker owns an unexpired lease. It returns 503 during startup/lost readiness. It has no send endpoint and exposes no account, token or document contents. A healthy HTTP response alone does not prove that FCM was accepted by a device.

6. Only one worker holds the renewed server-side lease. It watches the existing shared documents and the new strict collections through Firebase Admin. Initial snapshots and restarts establish quiet baselines; old notes, copied memories, rota rows and pairing imports are not replayed as notifications. Persistent monotonic cursors and source-version delivery receipts prevent duplicate sends. A live source cursor advances only after its dispatcher finishes; transient Firestore failures retry without silently consuming that update. Permission/authentication failures stop the process so the host supervisor can flag a configuration error. Updates made while the worker was offline remain visible in normal Firestore sync; historical pushes are intentionally not queued.

The worker logs that it is active, and stores server-only lease/cursor records. Do not use the Firebase demo/emulator environment with this live messaging worker; it refuses that configuration. Choose one dispatch option. The relay and continuous worker share source/device receipts, but running both is unnecessary.

## Create the dedicated server credential

Use a dedicated identity rather than the APK configuration or an account password:

1. Open [Service accounts for usspace-c859e](https://console.cloud.google.com/iam-admin/serviceaccounts?project=usspace-c859e), select **Create service account**, and name it `usspace-push-worker`.
2. Give that service account **Cloud Datastore User** (`roles/datastore.user`), **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`), and (for the authenticated relay) **Firebase Authentication Viewer** (`roles/firebaseauth.viewer`) in this project. The first allows the worker to read authorized source records and maintain its private lease/cursors/receipts; the second allows FCM sends; the third allows the relay to verify that the signed-in user has not been disabled or revoked. These are server permissions; Firestore client rules still protect both phones.
3. Prefer attaching this identity to a host that supplies short-lived Application Default Credentials. If the selected host requires a file instead, create a JSON key under this dedicated service account's **Keys → Add key → Create new key → JSON**, then upload it directly to that host's **private secret-file** facility. Set `GOOGLE_APPLICATION_CREDENTIALS` to its mounted path. Do not paste the JSON into chat, commit it to GitHub, put it in a public/static upload, or include it in an APK. Revoke a key if it has been shared publicly.
4. Confirm the [Firebase Cloud Messaging API](https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=usspace-c859e) is enabled. No Firebase billing-plan upgrade is needed for FCM sends or this external worker.

Creating the identity/keys and assigning those roles requires the project owner's IAM access. `google-services.json`, the original Android signing key, Google Sign-In access, and a GitHub token cannot substitute for this server identity.

### Container-ready deployment

`functions/Dockerfile` runs the exact committed worker as a non-root Node 22 process. Build from the `functions` directory; copy only `functions/worker.env.example`'s non-secret settings into the protected deployment settings. Mount the credential privately at the path supplied to `GOOGLE_APPLICATION_CREDENTIALS`. Run a single instance with restart-on-failure, a writable/reachable Firestore project and outbound HTTPS/gRPC to Google APIs. The Docker build copies only application source and package metadata; it never copies a credential file or repository signing material.

```sh
docker build -t usspace-push ./functions
# Configure protected environment and a read-only private credential mount in
# your host's deployment UI, then run usspace-push with the restart policy enabled.
```

A free host is suitable only if its plan actually keeps background processes running and permits these outbound connections. A web service that sleeps when idle or a short-lived cron invocation cannot continuously watch Firestore; sleeping delays/drops alerts even though normal paired data still syncs. GitHub Actions is not an always-on notification host. No provider's free-plan availability is guaranteed by the APK.

## Option C: Firebase Cloud Functions

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

Quiet-time updates still sync in the application, but their push alerts are suppressed rather than held until morning. FCM transport uses high priority only for opted-in user-visible pings/notes, normal priority for routine status/goals/bucket/memories/calendar updates, a 15-minute TTL and per-category collapse keys. Delivery is best effort: the continuous worker/Functions dispatch retries explicit FCM server/quota rejections up to three times, using the same event ID and rechecking the current source, account, pairing, device binding, category and quiet hours before every attempt. Quota/rate failures use a longer backoff. Unknown/ambiguous transport outcomes and permanent token errors are not retried. A successful FCM send followed by a receipt-write failure retries only the receipt, never that send. Receipts still claim each source/device once before the send; a server crash at that boundary can lose an alert rather than create a new replay. Android also deduplicates the stable event ID. These limits apply to background notifications, not normal data sync. Firestore content remains the authoritative record. Admin receipts never contain token values or source text; invalid tokens are removed only if they still match the failed registration.

## Private schemas

- `users/{uid}/devices/{installationId}`: `uid`, `installationId`, `token`, `platform: 'android'`, `enabled`, `updatedAt` (server timestamp). The owner alone can read, register, rotate or delete a device.
- `users/{uid}/preferences/v014`: `theme` (`system`, `light`, `dark`), `notifications.enabled`, all seven boolean `notifications.categories`, `notifications.quietHours` (`enabled`, `start`, `end`, `timeZone`), `updatedAt` (server timestamp). No partner access.
- `couples/{coupleId}/usPings/{id}`: `id`, `senderUid`, `createdAt` (server timestamp); create-only for a current pair.
- `couples/{coupleId}/workSummaries/{uid}`: `uid`, `coupleId`, `date`, `start`, `end`, `timeZone`, `enabled: true`, `updatedAt` (server timestamp). Only the owner can publish/change it, current paired members can read it, and the owner can revoke it even after leaving the old pair. Raw rota details stay out of this document.
- `couples/{coupleId}/pushOutbox/{eventId}`: immutable typed routing metadata and exact atomic server timestamp, as described above. No source text or recipient/token input.
- `_pushDeliveries`, `_pushWorkerCursors`, `_pushWorkerLeases`: server only; every client read/write is denied.

Keep server dispatch/cursor records private. A host operator can remove old delivery records after an appropriate retention period (for example 30 days); cursors for active sources and the current worker lease should remain available across restarts.

## Verify on the two phones

After a server option is running:

1. Install the same current UsSpace update on both phones and retain the existing pairing.
2. On each phone, open Settings → Notifications, opt in, grant Android notification permission, and select categories/quiet hours.
3. Put the receiving app in the background. Use Send love on the other phone; confirm exactly one generic ping opens Home.
4. Add a Jar note, a visible goal change, a future calendar edit and a Bucket List update; confirm enabled categories arrive with the right destination. Publish one reviewed letter; confirm only its intended recipient receives the letter alert.
5. Disable one category, then enable quiet hours covering the current recipient time. Confirm content still syncs while those alerts stay silent.
6. Switch/sign out accounts or leave the pair, then repeat an update. The previous account/pair must receive no notification.

The emulator/build checks verify schema permissions, source detection, pairing/role guards, quiet hours, token ownership, payload privacy, idempotence and Android integration. A successful emulator install is not a claim that live FCM delivered to the user's personal phones before their server was configured.

## Reliability checks in the repository

```sh
npm --prefix functions run check
npm --prefix functions test
```

The original 20 push-policy/privacy cases remain in place. The 15-case fault-injection suite under `functions/test/reliability.test.mjs` verifies retry success and exhaustion, quota backoff, ambiguous failures, revocation during a retry, final-guard/receipt Firestore failures, safe cursor acknowledgement, baseline suppression, worker lease loss and all seven source categories. These tests use an in-memory database and messaging seam to reproduce failures; they never call FCM, use production credentials, or claim real device delivery.

The 22-case `functions/test/relay.test.mjs` additionally verifies authenticated on-demand delivery, exact schema/project/actor/source/commit checks, private receipt linkage, all category routes, quiet-hours/preferences, concurrent idempotence and bounded HTTP retry receipts. It also uses test seams and makes no production FCM calls.
