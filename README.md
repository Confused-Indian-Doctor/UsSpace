# UsSpace v0.14.0

## Verified Android release

[Download UsSpace v0.14.0 APK](https://cb2f5cbc-8097-415e-9aa7-aaa4176cb607.sandbox.floot.app/_cdn/static/cfda2e14-3302-4481-9fc0-952b46707bdf-UsSpace-v0.14.0.apk).
Install it as an update on both phones and keep the existing pair.

[Android 35 verification passed](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37783875100):
original signing certificate, exact APK checksum, install/launch, both embedded language
courses, Google account UI handoff, all 51 existing Us checks, and all 40 distinct v0.14
screen checks. All 43 authenticated Firestore emulator tests passed. The new checks verify
real Light/Dark/System rendering, restart persistence, all seven notification controls,
category and quiet-hour toggle/restore, and the private Microsoft setup boundary.

Live push still requires the authorized external worker or Cloud Functions described below.
Live hospital workbook access still requires Microsoft app registration and consent.
The emulator uses an anonymous app session and does not claim personal account login,
live push delivery, hospital access or publishing the new Firebase rules.

This release continues the verified v0.12.3 Android app with the same application ID,
original signing key, Google Sign-In and paired Firestore data. It adds private per-user
System/Light/Dark appearance, seven opt-in push categories and quiet hours, and a native
Microsoft Graph Excel Work Schedule reader under Life with a compact Today view.
The existing Us features, Health Connect, language courses and calendar remain available.

- [Push setup](PUSH_SETUP.md): Firebase Spark can use the trusted external Node worker;
  Cloud Functions are an alternative requiring Blaze. No billing plan was changed and
  live server delivery is inactive until the selected server is configured.
- [Work Schedule setup](WORK_SCHEDULE_SETUP.md): Microsoft read access is used through
  a public-client app registration and PKCE. Paste the existing SharePoint Excel link into
  private on-phone settings. The source link, Microsoft tokens and full rota are not
  shared with the partner. Optional shift-time summaries are off by default.
- [Android notification integration](NOTIFICATIONS_ANDROID.md) and [Android builds](ANDROID_BUILD.md).

Health and Cycle stay private by default. Private goals, comfort moods and letter drafts
never generate partner pushes. Publish the complete updated `firestore.rules` before
activating the new private settings/device and optional work-summary collections.

## Continuing the existing v0.12.x features

The v0.12.x foundation combined Health Connect and the embedded Namma ↔ Nammal language module with two-account identity and realtime couple sync. Version 0.14 keeps that foundation and the comfort, letters and shared-plans features added in v0.12.3.

## Android identity
- Package/applicationId: `app.usspace.couple.v012`
- Current version: `0.14.0` / versionCode 16; historical v0.12.3 used versionCode 15.
- The Google sign-in button uses Credential Manager's explicit account selection flow, with visible progress and actionable errors.
- Firebase Authentication turns the Google ID token into the app identity.
- Each signed-in Google account has its own `/users/{uid}` document.

## Pairing
- One signed-in user creates a private UsSpace and receives a random six-digit invite code.
- Codes expire after 15 minutes and are single-use.
- The creator sees the generated invitation while waiting for the second account. Valid invitations return after reopening the app, and the creator can generate a fresh code without discarding the space.
- The second signed-in Google account joins with that code.
- The card shows "Waiting for partner" until the second account joins, then "Realtime" once server sync is ready.
- Firestore rules and the transaction model cap a space at two members.
- Either member can disconnect their own account.

## Realtime data model
- `/couples/{coupleId}/shared/common` — next visit, duties, non-private goals, love notes, memories, language progress.
- `/couples/{coupleId}/profiles/{uid}` — that person's Today/status/check-in summary.
- Firestore snapshot listeners push changes back into the WebView UI.
- Shared edits use transactions and idempotent change patches, so unrelated edits and the two learners’ progress do not replace one another.
- A persistent local outbox retains shared edits while offline and retries after the server snapshot arrives. The UI distinguishes connecting, queued/offline, syncing and live states.
- Pairing first hydrates existing shared data before publishing local changes.
- Firestore Android offline persistence remains enabled.

## Embedded language learning

Both course packs ship as Android assets: Kannada for Al and Malayalam for Yashika. Each beginner track includes 14 structured units, native script and Romanization, everyday vocabulary and phrases, grammar explanations, dialogues, recognition quizzes, typed practice, lesson checkpoints and spaced review. The alphabet reference, phrase book, language dates and per-learner progress work offline. Paired phones share learning progress through the same private two-person Firestore space.

Pronunciation uses Android text-to-speech with an installed offline Kannada or Malayalam voice. Course content and written pronunciation are bundled; voice data is supplied by the phone’s speech engine. If a voice is unavailable, the app explains how to install it and all written exercises remain available.

## Privacy boundary
The native bridge never sends `health`, `healthHistory`, or `cycle` in the shared projection. `firestore.rules` rejects these keys too. Health Connect remains read-only. Cycle data remains local to the phone, and Health/Cycle stay private by default in v0.14.

## Existing experiences inside Us

- **Need Me? / From Al:** all six curated comfort categories, gentle breathing and 5-4-3-2-1 grounding, little reminders, memories and an explicit message composer. These are saved personal words, not generated AI or a live response from Al. There is an honest placeholder until a real voice recording exists.
- **Safety:** an always-available unsafe action and local risk-expression detection replace the persona with real contact options and country-selected crisis/emergency help. Detection is a local aid, not a clinical classifier. No one is notified automatically. Configure Al and a trusted person's telephone numbers locally.
- **Open When…:** eight editable letters. Choose which signed-in account is Al and which is Yashika once, with the actual account identities shown for confirmation. Drafts stay in Al's account and on his phone. Review and explicitly publish a letter to make its envelope available to Yashika. Opening an envelope has no shared read receipt.
- **Appreciation Jar:** either person adds a short appreciation, revisits an older note with author/date attribution and adds an optional heart.
- **Bucket List:** categories, locations, target dates, priority, notes, photos and Dreaming / Planning / Booked / Done states. Completion offers a reviewed Memory prefill including date, place and photo.

Comfort moods, grounding activity, free text and local contacts never enter the sync store. The Message Al composer excludes the mood unless the user explicitly checks the sharing option and then saves the message. Letters use dedicated role-bound queries rather than the common shared document. New shared records use an account/couple-scoped persistent outbox and transaction receipts. Compressed JPEG attachments live in separate per-photo documents; memories and bucket items contain only a photo ID. Photos are uploaded only after Save, and picker access is limited to the selected document.

**Publish the complete v0.14 `firestore.rules` before using the new private settings/device and optional work-summary collections.** The user previously published the v0.12.3 rules; those do not include the v0.14 additions. Existing pairing and Us-feature rules remain intact, and updating the rules does not require disconnecting the two working accounts. Install the APK over the current app; preserve the application ID and signing key.

## Build and live Firebase setup

The supplied `app/google-services.json` connects the app to Firebase project `usspace-c859e`. This Android client configuration is included in the repository and in the APK. Private signing material and service-account keys are excluded from source control.

1. Use the matching signing key supplied separately; its SHA-1 is recorded in `FIREBASE_SETUP.md`.
2. Confirm Google is enabled in Firebase Authentication.
3. Deploy the included `firestore.rules` to the existing `(default)` Firestore database before live pairing/sync.
4. Build using Gradle 8.11.1 (`gradle :app:assembleDebug`) or Android Studio. See `ANDROID_BUILD.md` for signed release builds and emulator verification in GitHub Actions.

The Android v0.14 workflows retain the embedded learning, sync protocol, comfort, letters, photos and plans tests and add notification/preference/work-schedule checks. The isolated authenticated Firestore suites contain 43 cases: the previous 34 pairing/realtime/Us cases and nine v0.14 permission cases. A successful signed job verifies the original APK certificate against Firebase OAuth, boots Android 35, installs and launches the APK, and records real UI checks for Light/Dark/System rendering, persistence across a force-stop, notification settings, and the signed-out read-only Microsoft setup boundary. See `ANDROID_BUILD.md` for artifact names and evidence. A source/build check alone does not establish successful live Google sign-in, personal-phone push delivery, hospital workbook access or health consent.

## Stable identity from v0.12 onward
`app.usspace.couple.v012` is intentionally treated as the permanent Android application ID from v0.12 onward. Version 0.14 and subsequent releases keep this application ID and signing certificate so they install as updates over the existing app.

For Google Sign-In builds, use the stable signing key supplied separately and register its SHA-1 in Firebase. The project reads the key from `USSPACE_KEYSTORE_*` environment variables; the key itself is deliberately excluded from this source archive.
