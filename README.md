# UsSpace

## v0.17.0 — Dreams, Map, Trips and Memories

[**Download the verified UsSpace v0.17.0 APK**](https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk).
Install it as an update over the existing app to keep its data and pairing.
Open **Us → Bucket List** for the upgraded travel space; original non-travel goals
and all other sections remain available.

- Save private ideas from text, links, screenshots or manual entry; review before
  saving, organise collections and choose your interest independently.
- Map confirmed places, edit day timelines, preview/apply/discard changes and undo.
- Keep completed experiences, photos, ratings and reflections as memories.
- Save itinerary notes for offline reading. New imports start private; sharing
  requires an explicit destination. Health/Cycle privacy remains unchanged.

The exact original-key APK passed Android 35 installation, in-place upgrade,
launch and full UI regression checks. All 34 JavaScript suites, 89 Firebase
security/realtime emulator cases and native policy checks passed. Dark travel
panels were checked using actual screen pixels.

[Verification report](docs/V017_VERIFICATION.md) ·
[Screenshots](docs/screenshots/v0.17/README.md) ·
[Download runtime evidence](https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0-verification.zip) ·
[APK checksum](https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk.sha256) ·
[Provider/setup instructions](docs/TRAVEL_PROVIDERS.md).

Manual planning works without paid keys. Optional AI, place search and road
routing still need provider configuration. Emulator tests do not establish live
two-phone FCM delivery or physical Samsung Health/Galaxy Watch export.

## Recovery and navigation features included in v0.17

- Android Back closes a modal, keyboard or nested editor first, then returns to the
  previous submenu or its **Us/Life** parent. Another Back returns Home; Back from
  Home exits normally. Selecting a main tab starts a fresh navigation branch.
- Samsung Health imports use Android 14+ Health Connect with explicit **read-only**
  permission. Partial grants import only available Samsung-origin fields, preserve
  other saved values and keep all Health/Cycle data on the phone. Empty results
  are shown honestly; missing readings do not become fabricated zeroes.
- Notification settings add explicit phone permission, Android settings, registration
  retry and a local phone test. Categories and quiet hours remain independent.
  The Spark-compatible HTTPS relay uses an immutable outbox written atomically
  with each shared change; Android schedules authenticated delivery requests on
  demand. It needs no cron or continuously running worker.

Live partner FCM delivery remains unverified and needs its separate outbox/recovery
setup. Travel-backend readiness does not establish notification delivery. Firebase
Admin credentials stay in the server's private secret facility. Realtime Firestore
sync operates independently from push setup. A local phone test does not prove
partner delivery, and no physical Galaxy Watch export is claimed by emulator tests.

See [v0.16 setup and device checks](docs/V016_SETUP.md),
[push server setup](PUSH_SETUP.md), and [Android verification](ANDROID_BUILD.md).

## Previously verified v0.15 Android release

[Download UsSpace v0.15.0 APK](https://cb2f5cbc-8097-415e-9aa7-aaa4176cb607.sandbox.floot.app/_cdn/static/a9986d44-129f-4426-aee2-b90b1e9d15f5-UsSpace-v0.15.0.apk).
Install it as an update on both phones and keep the existing pair and app data.

[Android 35 verification passed](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/38166736333): the exact signed APK was installed,
launched and exercised through real device input. Its original signing certificate
is unchanged. All existing Us, language, privacy and v0.14 appearance/notification/rota
checks remain, with new live-counter, date edit/restart, milestone, card/timeline theme,
Home action, nested/modal Back and Home exit/relaunch checks.
The APK was compiled from `17904b3783f1551c86840f37540188568478179c`; its runtime
verification uses commit `9f8d5196f9c41a332fc55c63b0bd4ef541831af3`. APK SHA-256:
`c341cd382fcd89c50fc94913fdbc1b28c3763c1079b7d7466a162c9753c4a8dd`.

All **56 authenticated Firestore emulator cases**, **54 relationship feature tests**,
**36 navigation tests** and **60 native date/persistence assertions** passed; the date
policy also validated all **109,938 supported Gregorian dates**.

The dominant Home **Together for** card computes complete device-local calendar days
since **25 March 2023**, with an anchored years/months/days breakdown and tasteful
anniversary/round-day states. Tap it for actual anniversaries, Memories, trips and
completed Bucket List moments. Edit the date in **Settings → Relationship**.
In that v0.15 release, Android Back closes the keyboard/system picker or visible
modal/nested page first, then returns section-level pages Home. The v0.16 navigation
change above adds the requested intermediate parent menus.
See [Relationship details and shared-date setup](V015_RELATIONSHIP.md).

The owner confirmed publishing the complete v0.15 [firestore.rules](firestore.rules)
on 11 October 2026. This enables the new couple-owned relationship profile while
retaining the existing pairing and privacy rules. Existing Health and Cycle data
remain private and excluded from sharing. The anonymous Android session verifies
actual app UI; authenticated Firestore emulator clients verify paired realtime
delivery and access rules. CI does not sign into personal accounts or independently
verify production rule publication.

Live push requires the authorized server described in the v0.16 setup above or
one of the alternative dispatchers documented below. Hospital workbook access still requires Microsoft registration and consent.
The app extends the working v0.14 version with the same application ID, original key,
Google Sign-In, pairing/realtime sync, Health Connect, embedded language learning,
Need Me, Open When, Bucket List, Appreciation Jar, calendar, goals and memories.

- [Push setup](PUSH_SETUP.md): Firebase Spark can use the v0.16 on-demand HTTPS
  relay or an optional trusted continuous Node worker. Cloud Functions are an
  alternative requiring Blaze. No billing plan was changed; live delivery needs
  a configured, verified server and both phones opted in.
- [Work Schedule setup](WORK_SCHEDULE_SETUP.md): Microsoft read access is used through
  a public-client app registration and PKCE. Paste the existing SharePoint Excel link into
  private on-phone settings. The source link, Microsoft tokens and full rota are not
  shared with the partner. Optional shift-time summaries are off by default.
- [Android notification integration](NOTIFICATIONS_ANDROID.md) and [Android builds](ANDROID_BUILD.md).

Health and Cycle stay private by default. Private goals, comfort moods and letter drafts
never generate partner pushes. The complete v0.15 rules include the existing
owner-only preferences/devices and optional work-summary collections.

## Continuing the existing v0.12.x features

The v0.12.x foundation combined Health Connect and the embedded Namma ↔ Nammal language module with two-account identity and realtime couple sync. Versions 0.14 and 0.15 keep that foundation and the comfort, letters and shared-plans features added in v0.12.3.

## Android identity
- Package/applicationId: `app.usspace.couple.v012`
- Current source and verified APK: `0.17.0` / versionCode 19. Previous verified
  v0.15 used code 17; v0.16 source used code 18 and v0.12.3 used code 15.
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
- `/couples/{coupleId}/relationship/profile` — the paired couple's editable relationship start date, written only on an explicit Save.
- Firestore snapshot listeners push changes back into the WebView UI.
- Shared edits use transactions and idempotent change patches, so unrelated edits and the two learners’ progress do not replace one another.
- A persistent local outbox retains shared edits while offline and retries after the server snapshot arrives. The UI distinguishes connecting, queued/offline, syncing and live states.
- Pairing first hydrates existing shared data before publishing local changes.
- Firestore Android offline persistence remains enabled.

## Embedded language learning

Both course packs ship as Android assets: Kannada for Al and Malayalam for Yashika. Each beginner track includes 14 structured units, native script and Romanization, everyday vocabulary and phrases, grammar explanations, dialogues, recognition quizzes, typed practice, lesson checkpoints and spaced review. The alphabet reference, phrase book, language dates and per-learner progress work offline. Paired phones share learning progress through the same private two-person Firestore space.

Pronunciation uses Android text-to-speech with an installed offline Kannada or Malayalam voice. Course content and written pronunciation are bundled; voice data is supplied by the phone’s speech engine. If a voice is unavailable, the app explains how to install it and all written exercises remain available.

## Privacy boundary
The native bridge never sends `health`, `healthHistory`, or `cycle` in the shared projection. `firestore.rules` rejects these keys too. Health Connect remains read-only. Cycle data remains local to the phone, and Health/Cycle stay private by default in v0.16.

## Existing experiences inside Us

- **Need Me? / From Al:** all six curated comfort categories, gentle breathing and 5-4-3-2-1 grounding, little reminders, memories and an explicit message composer. These are saved personal words, not generated AI or a live response from Al. There is an honest placeholder until a real voice recording exists.
- **Safety:** an always-available unsafe action and local risk-expression detection replace the persona with real contact options and country-selected crisis/emergency help. Detection is a local aid, not a clinical classifier. No one is notified automatically. Configure Al and a trusted person's telephone numbers locally.
- **Open When…:** eight editable letters. Choose which signed-in account is Al and which is Yashika once, with the actual account identities shown for confirmation. Drafts stay in Al's account and on his phone. Review and explicitly publish a letter to make its envelope available to Yashika. Opening an envelope has no shared read receipt.
- **Appreciation Jar:** either person adds a short appreciation, revisits an older note with author/date attribution and adds an optional heart.
- **Bucket List:** categories, locations, target dates, priority, notes, photos and Dreaming / Planning / Booked / Done states. Completion offers a reviewed Memory prefill including date, place and photo.

Comfort moods, grounding activity, free text and local contacts never enter the sync store. The Message Al composer excludes the mood unless the user explicitly checks the sharing option and then saves the message. Letters use dedicated role-bound queries rather than the common shared document. New shared records use an account/couple-scoped persistent outbox and transaction receipts. Compressed JPEG attachments live in separate per-photo documents; memories and bucket items contain only a photo ID. Photos are uploaded only after Save, and picker access is limited to the selected document.

**The owner confirmed publishing the complete v0.15 rules.** The new v0.16 notification outbox requires the current complete `firestore.rules`; the earlier publication does not establish that these newer rules are live. They retain the relationship profile and all earlier pairing, Us-feature, owner-only settings/device and optional work-summary branches. Publishing these rules does not create or overwrite a relationship date and does not require disconnecting the pair. Install the APK over the current app; preserve the application ID and signing key.

## Build and live Firebase setup

The supplied `app/google-services.json` connects the app to Firebase project `usspace-c859e`. This Android client configuration is included in the repository and in the APK. Private signing material and service-account keys are excluded from source control.

1. Use the matching signing key supplied separately; its SHA-1 is recorded in `FIREBASE_SETUP.md`.
2. Confirm Google is enabled in Firebase Authentication.
3. Use the complete included `firestore.rules` in the existing `(default)` Firestore database. The confirmed v0.15 publication predates the new v0.16 atomic push-outbox branch.
4. Build using Gradle 8.11.1 (`gradle :app:assembleDebug`) or Android Studio. See `ANDROID_BUILD.md` for signed release builds and emulator verification in GitHub Actions.

The Android v0.16 workflows retain the embedded learning, sync protocol, comfort, letters, photos and plans tests and add notification/preference/work-schedule checks. The isolated authenticated Firestore suites cover pairing/realtime/Us behavior, private settings/work permissions, relationship profiles and the new atomic notification outbox. The verified v0.15 baseline had 56 cases; v0.16 retains those checks and extends them. A successful signed job verifies the original APK certificate against Firebase OAuth, boots Android 35, installs and launches the APK, and records real UI checks for Light/Dark/System rendering, persistence across a force-stop, notification settings, and the signed-out read-only Microsoft setup boundary. See `ANDROID_BUILD.md` for artifact names and evidence. A source/build check alone does not establish successful live Google sign-in, personal-phone push delivery, hospital workbook access or health consent.

## Stable identity from v0.12 onward
`app.usspace.couple.v012` is intentionally treated as the permanent Android application ID from v0.12 onward. Version 0.14 and subsequent releases keep this application ID and signing certificate so they install as updates over the existing app.

For Google Sign-In builds, use the stable signing key supplied separately and register its SHA-1 in Firebase. The project reads the key from `USSPACE_KEYSTORE_*` environment variables; the key itself is deliberately excluded from this source archive.
