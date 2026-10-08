# Firebase status — UsSpace v0.14.0

Connected client project: `usspace-c859e`  
Permanent Android package: `app.usspace.couple.v012`  
Current source version: `0.14.0` / versionCode 16

The existing Firebase Android/Web client configuration, Google Sign-In and original signing identity are preserved. The original certificate SHA-1 is `67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`. Release verification checks the actual signed APK against that OAuth configuration; source configuration alone does not establish a finished v0.14 APK or a live Google account sign-in.

## Current setup requirements

The user published the v0.12.3 rules and retains a working pair. The full v0.14 `firestore.rules` adds owner-only per-user preferences/device registration, strict explicit pings, and opt-in times-only work summaries. Publish the complete rules to the same `(default)` database; do not disconnect or recreate the pair. Existing invite/member/shared and Us-feature rule branches remain intact.

The user is on Spark. FCM is free, but deploying Cloud Functions requires Blaze. A trusted external Node worker is supplied as the Spark-compatible option. No authorized host or Firebase Admin credentials have been configured in this session, so that worker has not been deployed and live push delivery is not activated or claimed. No billing plan was changed. See `PUSH_SETUP.md` for either server option.

Microsoft workbook access also needs a public-client Entra registration and any required hospital tenant consent. The app provides private setup and read-only instructions, with an empty workbook-link default. Paste the existing sharing link into encrypted on-phone settings after signing in. The invitation URL, tokens and full rota are absent from public defaults and shared Firestore data. See `WORK_SCHEDULE_SETUP.md`.

## Current verification scope

The isolated authenticated Firestore suites contain **43 cases**: all 34 preceding pairing/realtime/Us checks plus nine v0.14 preference/device/ping/summary permission cases. They use demo/emulator accounts, not the live project. The existing native transaction, learning, comfort, letters, plans, photo and privacy tests are retained, with new push/preference/rota checks.

Android v0.14 verification boots Android 35, installs and launches the signed APK, retains the earlier feature runtime checks, and adds real System/Light/Dark rendering, force-stop persistence, notification category/quiet-hours controls and the signed-out Work Schedule setup boundary. A successful source job does not substitute for the final runtime artifact. The resulting Actions logs/artifacts record the outcome of each stage; no live personal-account FCM or hospital workbook read is inferred from an emulator pass.

## Preserved privacy and features

Open When roles bind the actual Al/Yashika account UIDs through explicit confirmation. Drafts remain private to their owner; released letters are readable only by the author or assigned recipient. Letter opens, private Need Me moods and local contacts are never shared automatically. Account-owned immutable receipts retain the existing replay protection.

Health Connect stays read-only. Health history, Cycle data and private goals stay on the phone and are excluded from shared projections and the native transaction reducer. None generates a partner notification. Appearance and notification preferences and device tokens are owner-only; the other partner cannot read them. A work summary requires explicit sharing and includes only the verified owner's shift date/times/timezone. Turning it off deletes the summary, with owner revocation permitted after leaving an old pair.

Both embedded beginner tracks retain 14 units and 140 phrases, script guides, grammar, dialogues, recall/typed practice, checkpoints and spaced review. All 64 original phrases and IDs remain preserved. Need Me, Open When, Bucket List, Appreciation Jar, calendar, goals, memories, Google Sign-In and existing Firestore pairing/realtime sync remain part of the same app.

## Historical verification

Historical v0.12.3 was version `0.12.3` / code 15 and introduced the Us collections with 34 authenticated emulator cases. The user confirmed publishing those rules. Earlier, [v0.12.1 verification](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37372641976) passed its 15 authenticated Firestore tests, native reducer, learning/UI and privacy checks. Version 0.12.2 added explicit Google-button sign-in and invitation visibility, restoration and renewal; the user confirmed live pairing after its rules publication. Those older outcomes are history, while the [current Actions runs](https://github.com/Confused-Indian-Doctor/UsSpace/actions) and versioned artifacts record v0.14 build/runtime results.
