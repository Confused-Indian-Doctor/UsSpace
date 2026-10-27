# UsSpace work / health continuation handoff

## Exact state

Repository `/workspace/usspace`, branch `work-health-sharing`, based on the prior
travel milestone `eebce2317f061546a4bc618c80703e788a0383fb`. The final exact commit,
working tree, source/artifact checksums and verification flags are recorded after
commit in `/workspace/USSPACE_WORK_HEALTH_CHECKPOINT.json`. A full local Git
continuation bundle and checksum are saved outside the repository. The original implementation checkpoint was local-only. The latest authorized deployment is documented below; see WORK_HEALTH_VERIFICATION.md for evidence.

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
3. Preserve the now-validated additive Jubilee files. Configure
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


### Authorized backend deployment — 2026-10-27

User explicitly said “Yes deploy”. Existing Jubilee source was fetched again;
remote HEAD matched the inspected v12 source. Three additive export files were
committed/pushed at `330123a61d4efd48de254ce3919f389fb8f12e52`; helper/parser,
`/api/sync` and `/api/sessions` remained unchanged. Source checkout is clean.
Jubilee v13 deployed successfully at
https://jubilee-work.alameenashraf.chatgpt.site
Saved version `appgprj_6ac263cb6520819198b56c2a1e15482b~appgver_02691e54ead881918a69ee6dc0293c20`;
deployment `appgdep_6ae07d29c5408191a769e6de5201903b`, env revision0.
Audience remains public; export has its own fail-closed bearer authentication.

Existing UsSpace backend published successfully at
https://usspace-notify-cb2f5cbc.floot.app
Job `3f28ab91-ec27-48e1-b048-ea58797cb7fd`; source version1793096933277;
checkpoint `9091662f-ac87-4ced-8c93-e329956b5b7f`.
Six additive roster files were applied; remote typecheck clean. Existing
Firebase Admin, push and travel code was read and preserved. Backend publication
was web-only; no Floot mobile build/store identity or billing change occurred.
Floot's generic no-auth/no-database publication notices do not recognize this
project's external Firebase auth/database. Do not provision a replacement.

Live backend probes: missing authentication rejected401; forged Firebase token
rejected400; invalid import credential rejected400. These establish rejection,
not successful authenticated processing. Site export probes were blocked by
hosting edge403/code1010 before reaching the handler, so runtime export auth and
actual sanitized source refresh remain unverified. Logs in `artifacts/`.

**Connection is not activated:** no dedicated export/ingress secret, exact source
person or existing UID binding was configured, and no Firestore rules were
published. The platform exposes secure user credential connection requests but
no direct secret setter for generated backend integration credentials; do not
work around this by printing secrets or adding a public bootstrap/admin route.
Next: securely provision the dedicated tokens using the documented existing-owner
flow, verify the canonical paired UID, configure Site hash/person and backend
secrets/binding, inspect current live rules before scoped deployment, then test
an authenticated real export/private upsert. Never reuse helper/hospital tokens.
The user has authorized this roster connection deployment; another conversational
approval is not required for these remaining steps within the same scope.

The Sites source helper was absent from the execution filesystem and its skill
resource was unavailable. Fallback used fresh credential solely via hidden stdin
and subprocess environment for Git fetch/push, then packaged the unchanged,
already-passing build. Native save/deploy tools accepted the archive and reported
success. No credential was written to source/config/logs. Archive checksum and
exact local continuation state: `/workspace/USSPACE_DEPLOY_CHECKPOINT.json`.
Original signing key/device remain unavailable; no new APK release or installation.

### Original-key GitHub candidate, 2026-10-27

User reports both GitHub repository signing secrets added; password name was
confirmed by their screenshot and key name by their reply. Secrets remain inside
GitHub, not this workspace. Pushed `work-health-sharing` including all existing
implementation history plus candidate CI at
`2b8125a72aad9307b094b4f08f0cdb903d9d3fb5`.

Run https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40591869021
is in progress at this checkpoint. New `.github/workflows/android-v018-candidate.yml`
is branch-push/manual only, has contents-read permission, never publishes releases,
and restores the original key only inside its runner. Runs full source/native/
Firebase rules checks, signed release + separate instrumentation compilation,
strict original certificate/Firebase OAuth + v20/0.18.0 + 16KB alignment checks,
exact SHA256-pinned approved v0.17 baseline, upgrade preservation and existing
Android/travel runtime harnesses. Failure diagnostics exclude APKs; verified
candidate artifact uploads only after all preceding gates pass.

Verifier preserves its v0.17 defaults and mandatory original SHA1/SHA256 checks;
new explicit version args support v0.18. Checked locally against the verified
v0.17 APK: default succeeds; requesting v0.18 rejects it. Existing smoke harness
now accepts an explicitly required baseline path, preserving its old v0.15 default.
No app runtime code or test assertion was changed in this CI preparation.
Workflow parse and Python/shell syntax checks passed. Monitor remote run, fix
actual failures and retrieve exact artifacts. Neither signing correctness nor
runtime success has yet been claimed. CI watch log:
`artifacts/v018-ci-watch.log`; metadata `/workspace/USSPACE_DEPLOY_CHECKPOINT.json`.
Backend Firebase credential binding and live roster activation remain pending.

Initial candidate run40591869021 passed all102 Firebase emulator cases and source/native checks, then failed at the added functions dependency-install step because no functions lockfile is committed. Corrected to the existing project's `npm install --ignore-scripts` workflow and retained its `npm run check`; no assertions were weakened. The initial run never reached signing or emulator installation. Log `artifacts/v018-ci-failure.log`.
