# Secure configuration handoff

User requests that the agent complete setup and ask only for needed secure inputs
and device verification. Deployment authorization persists. On 2026-10-27 the
user said they can open the cloud environment settings and do not know where the
original signing key is kept.

## First user action: backend credential binding

In this task's environment settings, bind the existing Firebase Admin JSON for
project `usspace-c859e` as secret `USSPACE_FIREBASE_ADMIN_JSON`. Do not put it in
chat, source, logs or normal environment-variable text. If the file cannot be
found, use Firebase Console → project settings → Service accounts, and report
that situation before creating another credential. The connected Floot backend
already has its own credential; do not reset it merely to grant workspace access.
The agent cannot retrieve that existing backend secret through connected tools.

After binding, the agent must recheck current environment readiness, verify the
project using the configured SDK without printing credentials, read the canonical
existing paired identities and inspect live rules before changing anything.
Then configure the documented dedicated export and scoped ingress credentials,
existing-owner binding, roster access rules and authenticated real refresh.
Do not enable health/cycle consent for either person during setup.

## Original signing identity

Release records identify the excluded private PKCS12 filename as
`UsSpace-v0.12-dev-signing-key.p12`, alias `usspace`. It was previously held under
`/workspace/private/usspace-v012-original-signing/`, not in the recovery backup.
Public original SHA256:
`B5:ED:FC:C2:56:FE:B4:6E:DC:9F:A4:F2:C4:E9:5A:EA:E3:A8:57:2B:24:8E:F2:34:BA:2A:61:B4:EA:EF:C3:08`.

Search the owner's secure backups/laptop for that file. Alternatively inspect
GitHub repository Settings → Secrets and variables → Actions for signing secret
NAMES only: `USSPACE_KEYSTORE_B64`, `USSPACE_KEYSTORE_PASSWORD`, optional alias/key
password. GitHub refuses this session's secret-metadata access (403); that does
not prove secrets are absent. Existing secrets cannot be downloaded from GitHub.
If signing exists there, use an original-key CI build instead of exporting secrets.

Bind the original file privately via `USSPACE_KEYSTORE_PATH`, with password secret
`USSPACE_KEYSTORE_PASSWORD`; optional `USSPACE_KEY_PASSWORD` and `USSPACE_KEY_ALIAS`.
Never create a replacement key. Run `python3 scripts/check-work-health-bindings.py`
to print only binding readiness and public original-certificate match. A missing
key blocks upgrade delivery, not the authorized roster backend setup.

## User/device verification after connection and signed build

The agent verifies backend owner/partner/third-account rules and real source
refresh first. Then guide the user through installing the original-key upgrade,
launching it, checking a known own roster event and last-source-refresh status,
failed refresh preservation and account switching. Never uninstall to bypass a
signature mismatch. Keep v0.17 until required replacement gates pass. Samsung and
cycle consent require each person's own phone/account and remain separate.

## Phone-only signing setup follow-up

User supplied the original-named PKCS12 attachment; a private copy is retained at
`/workspace/private/usspace-approved-signing/UsSpace-v0.12-dev-signing-key.p12`.
Certificate remains unverified without password access. User found their password
and screenshot confirms they saved GitHub repository secret
`USSPACE_KEYSTORE_PASSWORD`. It is not bound to this workspace. GitHub API public
key request returns403, so this session cannot add `USSPACE_KEYSTORE_B64` itself.

User uses only a phone and could not download the offline HTML converter. An
additive GET-only HTML utility is prepared on the existing backend:
`/_api/usspace-signing-key-helper`. It does not accept uploads or need a password.
Browser File API converts the selected file locally; CSP meta blocks network
connections; no analytics/storage/external scripts are included. The user can
switch to airplane mode after loading and before selecting the key. Converted
text must go only into GitHub secret `USSPACE_KEYSTORE_B64`, never chat/screenshots.
Clipboard history must be cleared separately; clear-page button cannot erase it.

Remote typecheck and synthetic-byte roundtrip/clipboard/clear/wrong-extension
checks passed. Actual phone execution unverified. Source version1793105494723;
publish job553f16a3-c50c-43dd-9be5-86696ec34dd2. Check terminal deployment and
fetch live HTML before claiming the link is ready. No actual private key or
password was embedded, logged or used in these tests. Existing app routes remain.

Deployment succeeded; live helper GET returned200 with text/html, no-store,
expected title/file input and network-blocking CSP meta. Evidence:
`artifacts/signing-helper-live-check.json`. No phone browser or real key operation
is claimed. Await user adding the key secret; Firebase binding remains pending.

## Prepared admin-only configuration automation

`node scripts/configure-jubilee-roster.mjs --owner-email <existing-owner-email>`
inspects the existing canonical owner/pair and live rule hash using the securely
bound `USSPACE_FIREBASE_ADMIN_JSON`. Optional `--save-live-rules <new-file>` writes
reviewable source only, refusing to overwrite a file. Never select a user by a
client-provided display name; the exact existing Site owner's email is just the
lookup input, verified against Firebase and canonical paired role/pointers.

Only after inspecting/diffing the actual live source and verifying the staged
rules, use `--apply --expected-current-rules-sha256 <inspected-hash>`. This refuses
changed live rules or any existing binding, preserves all existing records, and
never rotates/re-enables a connection silently. Dedicated raw credentials are
created inside the admin process and stored only in the default-denied
`jubileeBindings/current`, with scoped hashes in `rosterCredentials`. Output is
only a token SHA256 verifier and expiry metadata, for Sites configuration. No
bearer secret, Firebase private key or account data is printed.

`firestore.roster-private.rules` preserves the existing tested non-travel/travel
rules and adds private manual/helper roster access. It grants no health/cycle,
consent or partner roster sharing. `bash scripts/test-private-roster-rules.sh`
runs90 baseline +4 stage-specific emulator cases in an isolated temporary tree.
First run passed94/94. Six pure configuration tests also passed. No production
rule/binding write occurred; admin access remains unavailable here.

Prepared Floot wrapper fallback reads dedicated configuration from the server-only
binding, retaining existing env-secret support. Deploy that small wrapper update
only as part of activation after actual live-rule inspection. Existing v0.18
Android candidate source is unchanged by these backend setup tools.

## Current phone-only Firebase setup

User said they have the Admin JSON, but inspection run40599687692 on branch
`roster-activation` stopped with `firebase-admin-secret-required` BEFORE any SDK
read/write. User then confirmed the repository secret was missing. Do not assume
that a selected “added” chat answer establishes credential readiness.

A browser-local JSON helper is now deployed at
https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-firebase-secret-helper
Backend source version1793142654641; publish joba32b18fd-f55d-4b32-a017-29d98459205c
succeeded. Live GET200 HTML/no-store and CSP connect-src none checked. Synthetic
checks cover wrong type/project/format/extension, clear/read race, name copy,
full JSON copy and fallback. File stays in browser; no upload route is added.
User selects the JSON, copies its exact name/value into GitHub Repository secrets.
Do not request JSON/password screenshots or chat contents.

Inspection workflow `.github/workflows/roster-activation.yml` runs ONLY the
separate `roster-activation` branch, preserving the long Android build. It uses a
one-way email verifier from authenticated Sites owner metadata, then existing
Firebase canonical role and BOTH current pair pointers/members. No names/UIDs
are hardcoded. Discovery scans at most30 role docs; ambiguous/missing matches
stop for review. No raw email, pair ID, work roster or medical data is output.
Only rule fingerprints and boolean readiness are retained. Nine configuration
unit tests pass. Optional own-account email override can be a private secret
`USSPACE_ROSTER_OWNER_EMAIL` if the Site email differs; never create new users.

`/workspace/usspace-roster-activation` is a separate worktree at branch
roster-activation; last inspection commitbb65c39420ab0981509033cdc7195eee30b64306
(parentfcc047c). Main working copy remains work-health-sharing. After user confirms
the JSON secret is actually listed, bring the newest admin CLI changes into that
branch and push a normal inspection commit (skip-ci suppresses that workflow).
First inspection is read-only. Review actual live rule hash against known source
before any apply. Do not expose live unknown rule source in public artifacts.

Current candidate run40598231847 uses sourcebc79f95951393b4ba2fd6a765d414b8086aaf06c.
Its signed APK SHA256208fef19cd36fe7085ece234df139267c533c64d4570c78511fcf08472613ece
differs from prior d88..., so the proof guard refused reuse and ALL Android
runtime suites are running fresh. Signature/OAuth/version/alignment checks pass;
workspace independently verified the downloaded signed APK too. Exact pending
artifact12777128835, ZIP SHA256c05d0277c727196a8c97ea66af056b60f5ee1effadbf5682e22898b54f156ec7,
saved under artifacts/v018-signed-runtime-pending/. Do not offer it as verified
or publish a replacement until runtime checks pass. Original v0.17 unchanged.

Prepared local collision guard additionally rejects occupied deterministic source
IDs belonging to a manual/other-source/other-owner record before any write;
all target reads settle before failure, no partial merge. Eleven roster service
unit cases pass. Generated Floot core updated locally, not deployed. Source-error
and ID-collision tests are unit evidence, not real source refresh proof.

## Continuation: exact APK travel fault isolation

Latest complete runtime attempt40598231847 signed/compiled/upgraded/launched the
original-key APK SHA256208fef19cd36fe7085ece234df139267c533c64d4570c78511fcf08472613ece.
Learning, Us features, v014, v015 and v016 real UI reports passed. Travel failed
at preflight: review remained open, no import receipt reached demo server.
Title detection alone was insufficient because the review itself contains it.
Diagnostics also used an ActivityMonitor reference that became null.

The harness now tracks the resumed Activity and pauses only private snapshot
listeners (demo-project-only, separate instrumentation APK), leaving actual
Firebase transactions online for the accepted-write/listener-gap assertion.
The existing separate real transport-blocked offline durability scenario remains.
No release app source changed. The exact-runtime workflow consumes the pinned
signed artifact12777128835 and pinned prior evidence12779811228, verifying
archive/binary/signature/source checks before reusing the five passed reports.
Upgrade and all native travel checks remain required. Eight evidence guard
unit tests and real pinned-evidence validation passed locally. Runtime pending.

Roster inspection40604474417 now receives a nonempty Admin secret but rejects
invalid-admin-configuration before connecting. User asked to validate the local
JSON using the no-upload phone helper; never request or log credential contents.
Connection/rule publication remain blocked. v0.17 release unchanged.

## 2026-10-28 live setup milestone

User corrected GitHub Admin JSON. Inspection40604474417 rerun succeeded:
canonical existing owner/current pair verified, no binding existed; live rules
matched repository commit e7f29047a671c44c5d6e129a6b86d0f339c95247
(normalized SHA256 b5d20d2d6eaca416ace1d07cc4d62868b852c65b69e1fc7da970687da0aac24d).
Reviewed differences: immutable membership generations, Stays travel category,
owner-only manual/helper roster reads. Shared health/cycle paths stay denied.
Initial application attempts failed with API400 on PATCH (no release changed);
corrected UpdateReleaseRequest envelope. Activation40607522798 succeeded.
Current private rules SHA256 a6d36e5868f2c6d993fd868946882c71a664961af5dcd4dd06da59403569a5e7.
Dedicated90-day credential/binding created server-side; bearer values never
returned, logged, published or transferred to Sites. Only the one-way export
verifier was supplied to Sites, alongside exact configured source-person filter.
Both runtime entries marked secret. Existing v13 source redeployed with envrev1:
appgdep_6ae13eb7c16c8191b9eaa0e6ee552025 succeeded.

Floot wrapper now uses server-only binding fallback; collision preflight core
deployed after20 service/config tests and clean remote typecheck. Publish
6c8c73b7-f701-4cf2-a509-af1da3578487 succeeded at existing backend URL.
All three roster routes rejected unauthenticated POSTs with401 after deploy.

Real-source import/replay verification run40607707510 is active. It uses existing
owner binding plus tested fixed-host provider adapter, logs counts/status only,
then replays the exact same refresh to require idempotence. No source events or
workplace text go into logs. Provider failure must leave existing events intact.
APK exact-byte run40605394313 rerun passed102 Firebase emulator checks and
reached upgrade/travel runtime; terminal result still pending at this checkpoint.
No APK release publication. Original v0.17 download remains current.
