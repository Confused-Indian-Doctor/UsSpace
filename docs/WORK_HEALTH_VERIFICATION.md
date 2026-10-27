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
