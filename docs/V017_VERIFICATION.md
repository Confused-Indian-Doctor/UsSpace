# v0.17 Android verification

This is the existing Java/WebView app, package `app.usspace.couple.v012`,
version 0.17.0 / code 19. The original source history and both original PNG
assets were restored before compilation. Existing goals and other sections
remain in the application.

Compilation source: `20b8f06225d984ead857a34c6ca4d84b94cdd48e`.
APK SHA-256: `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.
Original certificate SHA-1: `67eafa2c1f58fe0c4bf3ea2470f6628072157310`.

## Source and security tests

[Build 40143632730](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40143632730)
passed Android release and separate instrumentation compilation using JDK 17,
Gradle 8.11.1 and SDK 35. The signed release contains no instrumentation class.

- 34 local JavaScript suites passed, including 14 travel-store cases.
- 89 Firebase emulator cases passed against the actual Firestore/Storage rules.
- 20 native travel queue-policy and 37 native import-policy cases passed.
- Existing privacy, navigation, relationship, language, notification, health and
  work-schedule policy tests passed. The date policy also checked 109,938 dates.
- APK signature, unchanged identity, package/version, 16 KB ZIP alignment and
  Firebase OAuth certificate checks passed. An independent transport download
  reconstructed the exact signed bytes.
- Comparing all 683 ZIP entries against the preceding fully tested APK found
  changes only in `assets/travel.css` and build-revision metadata. Native code,
  libraries and every other bundled asset are byte-identical. The signature
  block is checked separately using the original certificate.

The compiler inputs came from Actions; signing used the existing original key
in its private workspace binding. Only signed APKs and public SDK/compiler
inputs were transported through GitHub. Repository signing secrets are not
required for the separate exact-APK installation workflow, and no replacement
key was created. The main workflow can therefore pass source validation while
its automatic signing job is skipped when repository secrets are absent.

The security cases exercise paired and unrelated clients, owner-only data,
reaction ownership, forged pair/owner fields, field/size validation, revocation
and revision conflicts. Unit tests cover non-destructive legacy projection,
deduplication/ambiguous imports, retry overlays, ordering, planner validation,
provider failures, quotas and SSRF boundaries. These are not production tests.

## Actual Android runs

| Run | Scope | Current result |
| --- | --- | --- |
| [40144080474](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40144080474) | Cold-process image URI and text sharing; private review; explicit discard | Passed |
| [40144079908](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40144079908) | Native Firebase SDK travel journey and Dark panel pixels | Passed |
| [40144079117](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40144079117) | In-place upgrade, complete existing UI regression and travel | Passed |

These runs install the APK identified above. A separate, original-key-signed test
APK connects the native SDK to disposable demo Auth/Firestore emulators. No
JavaScript state is injected into the release. Test accounts, places and notes
are fixtures, not the couple's production data or live place-search results.

The travel journey checks real map rendering and numbered pins, source/details
navigation, itinerary preview/discard/apply/undo, server revisions/tombstones,
warm URL/image OCR review, a committed edit during delayed listener delivery,
an actual transport-blocked offline save/reconnect, account isolation and
unpairing cleanup. Pixel checks inspect the real Dark tab, map caption and
draft-panel backgrounds. Screenshots are captured from the running APK.

The full journey additionally checks both embedded language courses, Google
provider account UI, comfort/grounding/safety flows, private letters, original
bucket editor, real photo picker/JPEG preview, appreciation jar, appearance and
restart persistence, relationship dates/milestones, nested/modal/parent Back,
Home exit/relaunch, notification controls and Health Connect recovery states.

Search/filter controls, individual memory ratings/reflections, drag ordering
and AI failure paths have source/security coverage; this report does not claim
that every control has an independent emulator interaction test.

## External limits

Manual entry, reviewed imports, saved places and deterministic/manual planning
do not require AI/place/routing credentials. Optional AI, live place search and
road/walking routing remain unconfigured; see [provider setup](TRAVEL_PROVIDERS.md).
Online map tiles depend on connectivity and the provider's terms. Saved notes
are not downloaded maps. Offline TTS depends on an installed Android voice.

Demo tests do not establish production two-phone Google login/pairing, partner
FCM delivery or physical Samsung Health/Galaxy Watch export. The notification
relay still needs its separate verified deployment/recovery setup. Health and
Cycle remain private and excluded from travel/provider requests. Confirmed
unpairing clears shared data; a disconnected phone cannot detect remote
revocation until it reconnects.

The earlier candidate beginning `b9786d50` passed a complete Android run, but was
superseded by the Dark contrast fix. Its results are not substituted for this
APK's runtime evidence. Publication is the final step. The previous v0.15 download stays current until
the new release is available.

[Actual screenshots](screenshots/v0.17/README.md) · [Machine-readable results](V017_TEST_RESULTS.json).
