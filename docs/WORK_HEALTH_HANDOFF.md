# UsSpace work / health continuation handoff

## Exact state

Repository `/workspace/usspace`, branch `work-health-sharing`, based on the prior
travel milestone `eebce2317f061546a4bc618c80703e788a0383fb`. The final exact commit,
working tree, source/artifact checksums and verification flags are recorded after
commit in `/workspace/USSPACE_WORK_HEALTH_CHECKPOINT.json`. A full local Git
continuation bundle and checksum are saved outside the repository. Nothing was
pushed, deployed or published. See WORK_HEALTH_VERIFICATION.md for evidence.

## What is implemented

- Real Jubilee Work source located and inspected through Sites. Laptop helper
  posts parsed snapshots to `/api/sync`; D1 stores `rota_snapshots`; sessions and
  overrides use existing merge helpers. Working helper/parser/updater untouched.
- Sanitized, authenticated export prepared as additive Site files under
  `integrations/jubilee/site/`, also present as untracked additive files in
  `/workspace/jubilee-work-inspect`. Existing Site source is at commit
  `a17247a847a719c2703584e4a9ce9fc80ae6bc40`, version12. No production data read.
- Existing UsSpace Floot/Firebase Admin backend has prepared roster routes using
  the tested generated core. Optional Firebase Functions wrappers are alternatives;
  Android uses the existing Floot backend. No new hosting/billing service enabled.
- Scoped/revocable helper credentials, stable upserts, source times, explicit
  cancellations and safe authoritative coverage. Failed/partial imports keep
  prior events. Generic types/titles prevent hospital details entering UsSpace.
- Source date-only/unknown-hour records remain visible. The real helper often
  omits end hours; no guessed shift duration or free time is produced. Timetable
  coverage is not treated as complete working-roster coverage.
- Existing calendar filters by Mine/current partner/Together with labelled colour
  differences. Own manual entries and reviewed JSON import are separate from
  helper records. Partner entries are never invented. Each account controls its
  own busy-only/details roster consent; legacy shared entries remain legacy.
- Existing Health Connect reader now has per-account connection gating, separate
  background opt-in and actual feature detection. A best-effort hourly worker
  caches private snapshots independently of sharing and sends only categories
  with current consent. Foreground/manual snapshots use the existing bridge.
- Incremental change-ID ledger, token reset, deduplicated snapshots, updates and
  deletion reconciliation. Steps use HC aggregation, not raw phone/watch sums.
  Measurement time/source, last sync, missing fields and manual provenance remain
  distinct. No zero is substituted for blank/missing metrics.
- Separate steps/sleep/workouts/HR and dates/predictions/symptoms consent. Available
  menstruation import is reviewed; manual fallback works. Predictions stay
  estimates with contraception warning. A usual period length is not an actual
  recorded end date.
- Firestore rules check owner/current pair, both membership generations and
  category/revision on every shared read/write. Queued old uploads fail after
  revocation. Independent owner opt-ins, live listeners, account/pair-generation
  guards and cache-only partner-data rejection are implemented. New summaries
  never enter common sync, travel AI, analytics or notification previews.

## Verified here

40 source runners passed; full Firebase regression100 passed; focused care12
passed (102 distinct emulator cases across both runs). Rota127 + Work181 +
Health28 pure Java assertions passed. Android release/instrumentation compilation
and packaging passed, 16KB alignment passed, release DEX lacks the test runner.
Both APKs are unsigned. No original-key signing, upgrade installation or runtime
verification is claimed. Detailed logs are in `artifacts/` and hashes in the
checkpoint. Fixture providers are not proof of live Jubilee/Samsung processing.

## Blocked / not complete

- Original approved signing material is not bound; all expected signing variable
  names are absent. A request for secure binding is pending. No new key was made.
- adb lists no device; `/dev/kvm` is absent. No replacement was installed/launched.
- Backend routes, rules and additive Jubilee export are local only. Export and
  ingress secrets plus existing Firebase owner binding need setup. No production
  health/cycle reads or two-phone tests were performed. No new account was made.
- Alpha12 Health Connect feature dependency and native worker/permission/cache
  behavior require device testing. The background worker is best effort and has
  a network constraint; foreground still refreshes after opening. Incremental
  ledger reconciliation happens in the foreground reader; background summaries
  are bounded snapshots, not a complete historical synchronization engine.
- App-managed partner views/cache-only snapshots are cleared/rejected, but no
  selective erasure of Firebase SDK disk-cache bytes is claimed. Previously
  viewed/saved copies cannot be recalled. Do not promise physical remote deletion.
- Timestamp-less legacy memberships retain original features but cannot grant
  care consent until fresh server-generated join timestamps exist. Re-pairing or
  an authorized verified migration is needed; never create new accounts.
- Real Jubilee source currently lacks complete authoritative roster coverage;
  missing entries cannot be treated as cancelled/free by inference. Closed-app
  backend source polling is not added. Laptop/helper and an app refresh are needed.
- Legacy shared calendar entries remain shared. Only new separate roster records
  follow the new owner/category consent; there is no silent legacy migration.
- Additive Site files now pass the existing Jubilee production build and the unchanged updater regression suite; live authenticated export/deployment remains unverified.
  SDK/AGP lint has the Firebase Auth Kotlin metadata diagnostic described in the
  verification document; no check was disabled.

## Next concrete steps

1. Read WORK_HEALTH_INTEGRATION.md for paths and exact setup variable names.
2. Bind the existing original signing key/passwords securely, verify its known
   certificate, and rebuild. Keep all secret values out of chat/source/logs.
3. Validate the additive Jubilee files against its existing Site build. Configure
   the existing-owner UID, exact source person, dedicated export token/hash and
   scoped ingress credential. Keep hospital/laptop tokens separate and local.
4. Obtain authorization before deploying the prepared existing-backend additions,
   Firestore rules or Jubilee export. Do not change Site audience or billing.
5. Upgrade-install the exact original-key candidate, launch, and run full Android
   regressions plus the two-phone Samsung/Health Connect and cycle/privacy cases
   listed in WORK_HEALTH_VERIFICATION.md. Capture real UI/theme/accessibility data.
6. Only replace the current release after all required exact-APK gates pass.

Verified v0.17 release remains:
https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk
SHA-256 `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.


### Latest rota follow-up

User confirmed the laptop helper works. Local Jubilee export build and unchanged
updater tests now pass (source fixture, not a new live refresh). Production Site
is still v12; UsSpace backend still lacks roster routes. No deployment, runtime
secret configuration or production binding was performed. See the verification
follow-up and `/workspace/USSPACE_ROTA_FOLLOWUP_CHECKPOINT.json` for exact state.
