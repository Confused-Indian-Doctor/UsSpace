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
