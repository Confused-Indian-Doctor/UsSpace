# UsSpace v0.16 setup and device checks

This updates the existing app to `0.16.0` / versionCode 18. Keep the application ID
`app.usspace.couple.v012`, the original signing key, app data and existing pairing.
The previous verified v0.15 APK and its successful Android run remain recorded in
[README.md](../README.md). The v0.16 source changes are under verification; they do
not establish live Watch import or two-phone push delivery.

## Back returns through the menus

Android Back closes the keyboard, system picker, visible modal or immediate nested
editor first. Then it returns to the previous submenu. At a submenu's root it
returns to **Us** or **Life**, and the next Back returns **Home**. Back from Home
exits the Activity normally.

For example: Bucket List editor → Bucket List → Us → Home → exit. Need Me → Show
memory → Back returns Need Me, then Us, then Home. Health and Work Schedule return
to Life. Home shortcuts use the same Us/Life parent. Selecting a main bottom tab
starts a fresh branch rather than restoring an older submenu.

## Samsung Health: grant read access on the phone

UsSpace uses the native Health Connect API on **Android 14 or newer**. It reads
Samsung Health records; it does not write health data, embed Samsung's app or read
Galaxy Watch directly. No Firebase sign-in or partner sharing is needed to import
into the local Health screen.

1. Sync the Galaxy Watch with **Samsung Health** and confirm the readings appear
   there. Update Samsung Health and the phone's Health Connect/system components
   if their integration is missing.
2. In **Samsung Health → Settings → Health Connect**, allow Samsung Health to write
   the data types you want. Wording can vary with the Samsung version.
3. In **UsSpace → Life → Health → Allow read access**, choose the read permissions
   you want. UsSpace supports partial grants and does not request write access.
4. Tap **Sync now**, or return from Health Connect settings to refresh. Steps,
   sleep, resting/recent heart rate, active/total calories, SpO₂, weight and exercise
   appear only when Samsung has exported a permitted record.

**Health Connect settings** and **Open Samsung Health** are direct recovery actions.
The screen distinguishes missing permissions, missing data and read failures.
Successful fields merge into the saved snapshot; a missing, denied or failed field
does not erase an earlier value or invent a zero. Recorded timestamps identify the
age of available readings. Watch-to-Samsung and Samsung-to-Health Connect export
timing determines freshness; this is not continuous medical monitoring.

Health snapshots and Cycle remain local and excluded from paired Firestore sync
and partner notifications. To verify on the actual phone, compare a new permitted
reading and timestamp with Samsung Health, deny one other permission, then confirm
the granted field updates while the saved denied field stays unchanged. Revoke
access in Health Connect and confirm the app reports that state instead of success.

The Google APIs CI emulator has no Samsung Health or Watch. Its UI test cancels or
denies permission and verifies real settings return, private empty-data behavior
and honest errors. That evidence is separate from a real Samsung record import.

## Push notifications on Firebase Spark

FCM can be used without changing the existing Firebase Spark plan. The v0.16
on-demand HTTPS backend needs no cron, Cloud Functions deployment or continuously
running Firestore watcher. Hosting and Firebase usage quotas still apply.

For each eligible shared change, the app writes an immutable typed push-outbox
record in the **same Firestore transaction** as its source change. Android
WorkManager sends only the event/couple identifiers with a current Firebase ID
token. The server rereads the persisted source, exact atomic commit, current pair,
recipient settings and device ownership before asking FCM to send. It does not
accept a client-selected recipient, message body or FCM token. Notifications remain
generic; Health, Cycle, private goals, comfort moods, contacts and letter drafts
are excluded.

The selected base URL is
`https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-push`.
**Deployment and live delivery have not yet been verified.** An address in the APK
does not activate the service. Required setup is:

1. Configure the complete Firebase Admin service-account JSON for `usspace-c859e`
   in the server host's private secret named `USSPACE_FIREBASE_ADMIN_JSON`. It must
   contain the matching service-account identity and full private key. The public
   Android `google-services.json`, an email address, an Android signing key or an
   API-key fragment cannot replace it. Upload the credential directly to the
   protected host facility; keep it out of chat, GitHub and downloadable artifacts.
2. Grant the server identity the Firestore, FCM-send and authentication-read
   permissions described in [PUSH_SETUP.md](../PUSH_SETUP.md). The selected adapter
   also checks the published Firestore rules, so its identity must be able to read
   that rules release. Delegating rule/index publication requires the corresponding
   additional permissions.
3. Publish the **complete current v0.16** [firestore.rules](../firestore.rules) in
   [Firebase → Firestore → Rules](https://console.firebase.google.com/project/usspace-c859e/firestore/databases/-default-/rules).
   The confirmed v0.15 publication predates this atomic outbox branch. Keep all
   existing privacy rules; do not replace them with an allow-all rule.
4. Deploy the repository's server adapter and verify its capability response for
   the expected project/protocol and rules. The optional recovery query uses a
   collection-scope `pushOutbox` index on `actorUid` ascending and `createdAt`
   descending. A server readiness response alone does not prove phone delivery.

The [full push setup](../PUSH_SETUP.md) documents the outbox contract, permissions,
server options, receipt/idempotence rules and bounded retries. The continuous Node
worker and Blaze Cloud Functions remain alternatives; they are unnecessary when
using the on-demand relay. Earlier shared content is not replayed as old alerts.
Normal paired data sync continues if push setup is incomplete or an alert expires.

## Enable and verify on both paired phones

1. Install the exact verified update on both phones. Open **Settings → Notifications**,
   opt in and use **Allow on this phone**. Each account's choices are independent.
2. Choose the seven categories and quiet hours. Use **Android notification settings**
   if the app or an individual Android channel is blocked, then **Retry registration**.
3. Use **Test on this phone** to check Android's local display path. It does not send
   to the partner and does not establish FCM/server delivery. It remains disabled
   while signed out, before opt-in or without Android permission.
4. With the recipient app in the background, send one ping from the other phone.
   Confirm exactly one generic alert opens the correct screen. Repeat with a note,
   shared goal, Bucket List update, Memory and upcoming calendar change.
5. Disable a category and test quiet hours: content should still sync while those
   alerts stay silent. Sign out or disconnect the pair and confirm the old account
   stops receiving notifications.

Delivery is best effort and subject to connectivity, Android scheduling, channel
settings and current privacy choices. A force-stopped app must be opened again.
Quiet-time alerts are suppressed rather than held for the morning. CI checks
policy, rules and real anonymous Android UI; successful real-phone FCM delivery
requires the configured server and this two-account device check.
