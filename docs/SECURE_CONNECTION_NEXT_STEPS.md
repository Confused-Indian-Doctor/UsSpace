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
