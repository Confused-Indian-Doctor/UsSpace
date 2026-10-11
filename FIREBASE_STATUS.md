# Firebase status — UsSpace v0.15.0

Connected client project: `usspace-c859e`  
Permanent Android package: `app.usspace.couple.v012`  
Current source version: `0.15.0` / versionCode 17

The Firebase Android/Web client configuration, Google Sign-In, paired data model
and original signing identity are preserved. The original certificate SHA-1 is
`67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`. Release verification
checks the actual signed APK against that OAuth configuration.

## Rules and shared relationship date

The owner confirmed publishing the complete v0.15 `firestore.rules` on
11 October 2026. This is an owner confirmation, not an independent Firebase
administrator check by CI. The additive rule permits the current two-account pair
to read and explicitly save `/couples/{coupleId}/relationship/profile`, containing
a strict Gregorian `startDate`, the authenticated `updatedBy` and a server
timestamp. The default date is 25 March 2023. Publishing rules does not create or
overwrite the date; an explicit Save writes the profile. Existing pairing, Us,
owner-only preferences/devices, optional work summaries and privacy branches remain.
Do not disconnect or recreate the existing pair.

Each account receives relationship-profile changes through a Firestore snapshot
listener. Guest/unpaired dates remain local and are never automatically copied into
a paired profile. Queued writes and caches stay scoped to their original
account/couple; server-confirmed membership gates shared data after a fully offline
restart. See [V015_RELATIONSHIP.md](V015_RELATIONSHIP.md).

## Remaining service setup

The user is on Spark. FCM is free, but deploying Cloud Functions requires Blaze.
The supplied trusted external Node worker is the Spark-compatible option. No
authorized host or Firebase Admin credentials have been configured in this
session, so the worker has not been deployed and live push delivery is not
activated or claimed. No billing plan was changed. See [PUSH_SETUP.md](PUSH_SETUP.md).

Microsoft workbook access still needs a public-client Entra registration and any
required hospital tenant consent. The app provides private setup and read-only
instructions, with an empty workbook-link default. Paste the existing sharing link
into encrypted on-phone settings after signing in. The invitation URL, tokens and
full rota are absent from public defaults and shared Firestore data. See
[WORK_SCHEDULE_SETUP.md](WORK_SCHEDULE_SETUP.md).

## Verification scope

All **56 authenticated Firestore emulator cases** passed: the previous 34
pairing/realtime/Us cases, nine v0.14 preference/device/ping/summary permission cases
and 13 relationship-profile cases. Authenticated demo/emulator accounts exercise
paired realtime delivery, offline queued writes and access restrictions without
changing live Firebase data. Existing native transaction, learning, comfort,
letters, plans, photo and privacy suites remain; push/preference/rota checks are
retained. The relationship addition passes **54 feature tests**, **36 navigation
tests**, **60 native date/persistence assertions**, and validation of all
**109,938 supported Gregorian dates**.

[Android v0.15 runtime verification passed](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/38166736333), using verification commit
`9f8d5196f9c41a332fc55c63b0bd4ef541831af3`. Android 35 installed and launched the exact original-key
signed APK compiled from `17904b3783f1551c86840f37540188568478179c`. Existing embedded language, Google
account-UI handoff, Us and v0.14 checks remain. New actual-input checks cover the
local-date counter, date edit/restart/restore, anniversary/day milestones,
System/Light/Dark card and timeline rendering, Home actions, main and nested routes,
modal closure and normal Home exit/relaunch. APK identity, signatures, screenshots,
accessibility snapshots and logs are recorded in the successful artifact.

The Android app session is anonymous. The account-UI handoff does not authenticate
either person's Google account. Production pairing on personal phones, live push
delivery, hospital workbook access and Samsung Health/Health Connect consent are
not inferred from an emulator pass. Rules publication is recorded separately from
the owner's confirmation above.

## Preserved privacy and features

Open When roles bind the actual Al/Yashika account UIDs through explicit
confirmation. Drafts remain private to their owner; released letters are readable
only by the author or assigned recipient. Letter opens, private Need Me moods and
local contacts are never shared automatically. Account-owned immutable receipts
retain the existing replay protection.

Health Connect stays read-only. Health history, Cycle data and private goals stay
on the phone and are excluded from shared projections and the native transaction
reducer. None generates a partner notification. Appearance and notification
preferences and device tokens are owner-only; the other partner cannot read them.
A work summary requires explicit sharing and includes only the verified owner's
shift date/times/timezone. Turning it off deletes the summary, with owner
revocation permitted after leaving an old pair. The shared relationship date is
relationship data and does not change Health/Cycle protections.

Both embedded beginner tracks retain 14 units and 140 phrases, script guides,
grammar, dialogues, recall/typed practice, checkpoints and spaced review. All
64 original phrases and IDs remain preserved. Need Me, Open When, Bucket List,
Appreciation Jar, calendar, goals, memories, Google Sign-In and Firestore
pairing/realtime sync remain part of the same app.

## Historical verification

Historical v0.12.3 used versionCode 15 and introduced the Us collections with
34 authenticated emulator cases. The owner confirmed publishing those rules.
Earlier, [v0.12.1 verification](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37372641976)
passed its 15 authenticated Firestore cases, native reducer, learning/UI and privacy
checks. Version 0.12.2 added explicit Google-button sign-in and invitation
visibility, restoration and renewal; the owner confirmed live pairing after its
rules publication.

The previous [v0.14 Android verification](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37783875100)
passed the exact signed APK, embedded language, Google UI handoff, 51 existing Us
checks, 40 distinct v0.14 screen checks and all 43 authenticated Firestore emulator
cases. Version 0.15 continues that working release with versionCode 17 and the
same package/key. Current versioned Actions artifacts record the new outcome.
