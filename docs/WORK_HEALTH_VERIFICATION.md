## Current delivery checkpoint — 2026-10-28

**Verified candidate is downloadable:**
https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.18.0-rc1/UsSpace-v0.18.0-candidate.apk
Release: https://github.com/Confused-Indian-Doctor/UsSpace/releases/tag/v0.18.0-rc1
Version0.18.0/code20, packageapp.usspace.couple.v012, original signing certificate.
APK SHA256208fef19cd36fe7085ece234df139267c533c64d4570c78511fcf08472613ece.
Public download fetched successfully (HTTP200),52328816 bytes, matching checksum.

Android run40609166501 **passed**: original-key upgrade/launch, cold/warm imports,
review selection guard, accepted-write/listener gap, actual offline/reconnect,
map/dark panels, trip preview/apply/discard/undo, account switch and unpair.
Fresh native travel UI report415 recorded steps/43 assertions; cold import and
unpair reports passed. Learning/Us/v014/v015/v016 suites reused only after
exact signed-APK/source/archive validation (not rerun under a different APK).
102 Firebase emulator cases and source/native checks passed in the same run.
Full evidence artifact12783383792 ZIP SHA256
057a85ef211d60d8d6798813c88f8f03404aab0bdb237370bcfab988ea6a53e7.
APK build sourcebc79f95951393b4ba2fd6a765d414b8086aaf06c; successful test source
027efb09dd19f4b4d0a9429b3e908faf3619a858 (runtime-continuation). Release source
main app unchanged between those commits. Work/source branchwork-health-sharing
throughdfacb4d plus final delivery documentation. Working tree should be clean.

Terminal GitHub upload credentials were rejected by uploads.github.com401;
repository CI40659251747 successfully published the exact pinned artifact.
No new signing key or secret was needed. Release is prerelease; **v0.17.0 remains
GitHub Latest** with its verified original download link and checksum intact.
No main merge or automatic stable-updater replacement.

Live backend: dedicated existing-owner Jubilee connection/private import and
replay verified (116 events,116 unknown timing, partial, no inferred free time).
Source success2026-10-27T18:00:19.834Z; laptop/helper must run for new updates.
Current consent-capable Firestore rules SHA256
c0668a82422574ab8a64910414813e764d24a966fec71736636dbb48dde94a5b;
activation40609550795 passed102 emulator cases and preserved owner binding.
No user consent created or enabled. Storage tests are emulator evidence, not
a claim of newly deployed live Storage rules.

Next actions require phones: install as Update (never uninstall to bypass
signature checks), verify actual Google sign-in, each person's Health Connect
availability/permissions/real Samsung records and independent sharing/revocation.
Production Google sign-in UI, actual Samsung/background reads and authenticated
FCM delivery remain unverified. FCM backend setup remains pending. Live place/
transcription providers remain blocked by credentials/access; fallbacks remain.
Do not claim every Instagram link is readable. Do not enable anyone's health/
cycle consent on their behalf. Keep v017 stable until phone pilot is accepted.

Detailed public delivery evidence: docs/verification/v018-candidate-verification.json.

---

# Work / health verification — 27 October 2026

This is source/build evidence, not a production sharing or Samsung/watch claim.

| Layer | Actual result | Evidence |
| --- | --- | --- |
| Existing source | Continued clean `eebce2317f061546a4bc618c80703e788a0383fb`; retained travel work/history | Git branch `work-health-sharing` |
| Jubilee discovery | Inspected real Site v12, source `a17247a847a719c2703584e4a9ce9fc80ae6bc40`; helper/updater unchanged | `artifacts/jubilee-inspected-source.json`, `jubilee-updater-preserved.log` |
| Source/regressions | 40 Node/JS suite runners passed, including all bundled UI scripts | `artifacts/work-health-source-results.json`, focused final logs |
| Roster service | Stable IDs, update/cancel/replay, failed/partial refresh preservation, overnight/DST, exact-person filtering, unknown hours, mismatched credential owner | `artifacts/roster-service-final.log` |
| Jubilee provider | Fixed endpoint, separate credential, bounded/no-redirect fetch and unavailable/malformed fallbacks | `artifacts/jubilee-provider-tests.log` |
| UI behavior | Actual bundled handlers exercise consent prompt/cancel/revision, account/cache isolation, missing metrics, cycle fallback, date-only source events excluded from common payload | `artifacts/care-app-ui-final.log` |
| Firebase full regression | 100 real demo Firestore/Storage emulator cases passed | `artifacts/work-health-regression-emulator-final.log` |
| Focused care emulator | 12 passed; includes two later cases for full 120-record native batches/scoped queries and date-only busy records | `artifacts/paired-care-final-check.log` |
| Offline and identity | Actual queued SDK write fails after another owner session revokes; reciprocal owner consent; third-user denial; same-ID re-pair generations; forged generations rejected | Focused care emulator log |
| Pure native policies | 127 rota + 181 Work Schedule + 28 HealthSyncPolicy assertions passed with JDK17 | `care-rota-parser.log`, `care-work-native.log`, `care-health-native.log` |
| Android compilation | SDK35 / AGP8.7.3 / Gradle8.11.1 / JDK17 release and instrumentation compile/package passed | `artifacts/work-health-delivery-final.log` |
| Package/alignment | `app.usspace.couple.v012`, candidate 0.18.0/code20; 16KB ZIP alignment passed; test instrumentation class absent from release DEX | `artifacts/work-health-apk-metadata.json` |
| Original-key signing | **Blocked**: approved key/password bindings absent; both APK signature checks fail as unsigned | Signature logs and APK metadata |
| Device/upgrade/runtime | **Not performed**: adb reports no device; no emulator/KVM available; unsigned replacement cannot satisfy original-key upgrade checks | `artifacts/work-health-devices.log` |
| Production | **Not deployed/published**: no real authenticated Jubilee export, production paired health test, or positive Samsung/Watch import performed | Setup is explicitly pending |

The 100-case full run and 12-case focused run overlap; the focused run adds two
cases after the full run. Do not sum them as 112 distinct cases (102 distinct
current emulator cases are covered across the runs).

Build setup was restored using JDK17, Android SDK35/build tools35, Gradle8.11.1
and Firebase CLI14.12.1. Java proxy settings and the system CA trust store were
used; TLS checks were not disabled. Stable Health Connect1.1.0 demanded newer
SDK/AGP, so SDK35-compatible1.1.0-alpha12 is pinned for feature detection. Its
pre-release status needs runtime review. AGP lint emits a diagnostic about the
existing Firebase Auth Kotlin2.3 metadata versus its Kotlin2.0 analyzer. The build
still exits zero; no tests/checks were disabled to obtain that result. This is
not a claim of clean dependency lint analysis.

Earlier failures are retained in logs: initial missing build tools/proxy trust,
Health Connect toolchain mismatch, a legitimate missing-document listener edge,
and membership-generation tightening that initially blocked timestamp-less
legacy fixtures. Those were fixed by restoring supported tooling, permitting
missing shared documents only under valid consent, attaching fresh listeners
after consent, and preserving legacy pairing without allowing forged timestamps.
Original regression assertions were not removed or weakened.

Exact final APK hashes, source hashes, full Git commit and working-tree state are
recorded in `/workspace/USSPACE_WORK_HEALTH_CHECKPOINT.json` after the milestone
commit. `artifacts/work-health-apk-metadata.json` records the unsigned artifacts.
The unsigned candidate is **not** an approved release or installable upgrade.
The prepared Floot transport wrappers still require hosting validation. The
additive Site route now passes the existing Site build, as recorded in the
follow-up below; neither integration has been deployed.

## Required original-key/runtime gates still outstanding

- Supply only the approved signing identity through secure bindings; never paste
  secret values or create a replacement key. Rebuild/verify package, certificate,
  Firebase OAuth signing identity and 16KB alignment for those exact signed bytes.
- Upgrade-install over the approved v0.17 APK, launch, capture actual screenshots
  and validate new UI plus every retained app section on Android.
- Use the two existing production accounts on their own phones to connect Health
  Connect and confirm Samsung-origin steps/sleep/workouts/HR availability. Verify
  no-data/denied states, phone/watch aggregation, record changes/deletions, private
  background cache and supported background permission/scheduling. No hardware
  data or audible/positive Samsung export is inferred from source tests.
- Verify account switch during foreground/worker/permission callbacks; signed-out
  and re-pair privacy; revocation while offline and during background publication;
  cache-only snapshots; native listener generation guards and reconnect cleanup.
- Verify menstruation unavailable/permission denied/manual fallback, review of
  actual imported dates, and separately enabled dates/predictions/symptoms.
- Validate/build the additive Jubilee Site files before any authorized deployment.
  Configure existing-owner bindings and separate export/ingress secrets, then
  perform a real sanitized source refresh with the existing laptop helper running.
- Verify publication byte hashes only after authorization and all release gates.

Current verified release remains:
https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk
SHA-256 `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.


## Rota follow-up: Jubilee source confirmed working

The user confirmed the existing laptop helper updates Jubilee successfully.
Read-only hosting checks still found Jubilee v12 and no `usspace-roster` routes
in the published UsSpace backend's source tree. No production change was made.
The additive export now passes the existing Jubilee production build; the output
includes `/api/usspace-export`. The unchanged `scripts/test-sync.mjs` suite also
passed using a local fixture assembled from the existing bundled source, covering
owner/cross-site access, helper leases, replays, count validation, saved edits,
rollback, expiry, pairing/revocation and evening scheduling. This is source test
proof, not a new live hospital refresh. Logs: `artifacts/jubilee-export-build.log`
and `artifacts/jubilee-existing-updater-tests.log`.

The local dependency installer temporarily changed only pnpm store/cache paths;
that generated manifest change was restored. Helper/updater source stayed
unchanged. No secrets or owner binding were configured. Deployment authorization
and the existing original-key APK delivery remain outstanding. Microsoft OAuth
inside the old APK is a separate optional route; the prepared Jubilee bridge
reuses the working laptop source instead.


## Authorized deployment, 2026-10-27

Jubilee v13 and the six-file UsSpace roster backend addition deployed successfully.
Remote roster typecheck clean. Live missing-auth401 and forged-token/credential400
probes passed (`artifacts/jubilee-deployed-backend-access-tests.json`). Jubilee
export probes hit hosting edge403/code1010; this is an environment limitation,
not proof of handler authorization. No live source export, owner binding, private
calendar upsert, health sharing, rule deployment or signed Android runtime is
claimed. Dedicated integration secrets remain unconfigured. See latest handoff.

## 2026-10-28 authenticated source milestone

Firebase Admin secret corrected by user; inspection rerun40604474417 succeeded.
Reviewed live rules exactly matched e7f2904. Private-roster stage applied and
confirmed in40607522798 (SHA256 a6d36e5868f2c6d993fd868946882c71a664961af5dcd4dd06da59403569a5e7).
Existing canonical owner/current pair verified; no new account or pair created.
Server-only90-day dedicated credential/binding created. No health/cycle or
partner roster consent granted. Hospital credentials remain with the helper.

Floot source1793146440495 published by6c8c73b7-f701-4cf2-a509-af1da3578487.
Sites v13 redeployed at envrevision1, deploymentappgdep_6ae13eb7c16c8191b9eaa0e6ee552025.
Remote typecheck clean;20 pure service/config tests passed; three live routes
returned401 for unauthenticated requests.

Real source/import verification40607707510 passed:116 own-source events upserted,
0 cancellations,116 unknown timings, partial/non-authoritative. Same exact
refresh replay returned replayed:true, proving duplicate refresh idempotence.
Upstream successful refresh2026-10-27T18:00:19.834Z. Unknown times remain date-only;
no free-time coverage or omission-based cancellation inferred. Evidence
artifacts/jubilee-live-source-result.json; artifact12782245980 ZIP checksum
078fa13cdfbcb55b388fa7cf6a4a94d628174e71d0d2ca6987256517c7d5d1d2.

Next: monitor40607852634, which additionally verifies the real deployed refresh
endpoint using an ephemeral Admin-issued ID token for the existing owner. This
is explicitly not proof of Google sign-in UI. Never log token/session contents.
Monitor exact signed APK runtime40605394313, currently in upgrade/travel step.
Release v0.17 remains current. Next phone actions only after required APK gates.
