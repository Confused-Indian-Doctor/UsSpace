# Jubilee Work, rosters and optional paired health/cycle sharing

## Existing source inspected

UsSpace started this task clean at `eebce2317f061546a4bc618c80703e788a0383fb`
on travel-docent-review. This work is on `work-health-sharing`; no previous app
section/navigation or travel feature was replaced.

The actual Jubilee Work Site was found through Sites, not guessed from its name:
https://jubilee-work.alameenashraf.chatgpt.site
Site ID `appgprj_6ac263cb6520819198b56c2a1e15482b`, version 12, source commit
`a17247a847a719c2703584e4a9ce9fc80ae6bc40`. Read-only source checkout:
`/workspace/jubilee-work-inspect`.

Its existing `windows-helper/helper.py` calls `rota_parser.parse_workbook`, then
POSTs `{action:'complete', helperId, jobId, snapshot}` to `/api/sync` after a
claimed update. The server validates counts and atomically saves the parsed
snapshot into D1 `rota_snapshots` while rebasing saved edits. `/api/sessions`
combines that snapshot with saved overrides using the existing merge helpers.
The helper's paired update token and hospital browser profile remain on the
laptop. No hospital cookies/passwords were read, copied or transferred.

The existing helper, parser, installer, `/api/sync`, `/api/sessions` and updater
are unchanged. Only additive local Site files are prepared under
`integrations/jubilee/site/` and mirrored into the inspection checkout.
Initial audit state above is historical. On 2026-10-27, user-authorized deployment published the additive export as Jubilee v13, source `330123a61d4efd48de254ce3919f389fb8f12e52`. Existing audience and D1 binding were preserved.

## Sanitized integration

`functions/src/roster-service.mjs` implements owner-scoped, revocable, expiring
helper credentials stored as hashes and bound to one Firebase UID/source ID.
The primary Android route reuses the existing Floot/Firebase Admin backend at
`/_api/usspace-roster/jubilee-refresh`; credentials/import routes live alongside
it. Generated core modules match the tested Node source. These routes were deployed on 2026-10-27; live refresh remains disabled pending secure configuration. The optional Firebase Functions wrappers are also source-only:

- `rosterIntegration?action=issue|revoke`: existing Firebase ID token; owner only.
- `rosterIntegration?action=refresh`: scoped credential; schema accepts only
  stable opaque IDs, kind, source timestamp, timing/date and cancellation.
- `refreshJubileeRoster`: Firebase ID token, server-only owner binding and two
  separate backend secrets; reads the fixed Jubilee export endpoint. The app
  cannot select another owner or provide a fetching URL.

Source events upsert deterministic IDs separately from manual events. Changed
hours update the same source event, explicit cancellations are retained as
cancelled records, older event/source revisions are rejected, duplicate IDs in
one refresh are rejected, and failed/partial refreshes cannot erase missing
entries. Only complete authoritative refreshes cancel missing entries within
explicit coverage. Bounded transactions fail without erasing the prior roster.
No patient names, coworkers, rooms, internal notes or workbook details cross the
new projection. Titles become generic Shift/Teaching/On-call/Leave/Personal work
event. Both supplied instants and London civil-date conversion handle BST/GMT;
ambiguous or nonexistent local hours are not guessed.

**Actual source limitation:** Jubilee's parser deliberately often leaves end
hours empty, and sometimes provides a student meeting time rather than the
individual tutor's hours. The adapter retains these as date-only/time-unknown
calendar entries; it does not synthesize an end time or count them as known
availability. The current timetable also does not prove complete roster coverage,
so its export remains partial. Removal by omission and free-time highlighting
stay disabled unless an authoritative coverage contract is supplied later.

Native refresh is manual or on opening/resuming for the existing canonical
`usRoles/identity.alUid`, with a 15-minute foreground cooldown. Backend ownership
is separately checked against the configured existing Firebase UID. No names or
new accounts are used as identity keys. No paid scheduler is enabled. Closed-app
source polling is not added; upstream updates still require the laptop/helper.

## Setup, without secret values

1. Review the additive Site files in `integrations/jubilee/site/`. Copy them to
   the existing Jubilee checkout; preserve the existing Site ID, auth, D1 binding
   and updater. Validate/build there before any authorized publication.
2. Configure Site secrets `USSPACE_EXPORT_TOKEN_SHA256` and
   `USSPACE_EXPORT_PERSON`. The latter is the exact existing rota-person string,
   used only server-side for filtering. Generate a fresh, random read-only export
   token through secure tooling; its SHA-256 is stored on the Site, its original
   value only in the UsSpace backend secret `JUBILEE_USSPACE_EXPORT_TOKEN`.
   Do not reuse the laptop's update token or hospital authentication.
3. Use the existing Al account's Firebase authentication to issue a credential
   for source `jubilee`. Store it only as backend secret
   `JUBILEE_USSPACE_INGRESS_CREDENTIAL`. It expires after 90 days and can be revoked
   by its issuing account. No credential belongs in the APK or source.
4. Configure admin-only `jubileeBindings/current` with `{ownerUid: <existing
   Firebase UID>, enabled: true}`. Verify it against the existing paired-role
   identities; never bind by a client-supplied display name/email.
5. Review and deploy the existing Floot backend additions and Firestore rules only after authorization; the Android client uses that existing backend. Firebase Functions wrappers are optional alternatives.
   Keep the existing Spark/billing decisions; Functions availability may need a
   compatible existing backend/approved billing setup. No billing upgrade was made.
6. Perform a real authenticated, sanitized export/refresh with the laptop running.
   Source contract fixtures are not proof of live hospital access or deployment.

## Calendar and independent roster sources

The existing Calendar remains the page. Mine / the configured partner name /
Together filters include the existing legacy list and separate private roster
records. Labels/symbols accompany person colours. New entries from both Calendar
entry points belong only to the signed-in owner and start private. Each partner
can add shifts, teaching, on-call, leave or personal events. A bounded JSON file
can be reviewed before manual records are saved. No partner shifts are invented.

Exact manual times use Europe/London. Overnight end dates advance correctly;
DST gaps are rejected and ambiguous hours need GMT/BST selection. Imported
unknown times remain explicitly unknown. Imported source records are read-only
on the phone and cannot overwrite manual records. Source status/last successful
upstream refresh and stale status are shown. Known roster gaps require explicit,
fresh coverage from both people and no unknown/truncated timing; gaps are not a
promise of availability. Existing previously shared legacy calendar entries
remain shared; they are not silently deleted or reassigned to new owners.

Calendar sharing is independently enabled as busy-only or details. Busy-only
public records contain no title/type details. Coverage is omitted for unknown
timing, stale/incomplete sources or the bounded roster display limit.

## Health Connect

The existing Samsung-only native reader is extended, not replaced. App-open and
manual reads use existing aggregation and date windows. Steps use Health Connect
aggregation rather than summing phone/watch records. Sleep/workout intervals are
bounded; record IDs/last-modified times deduplicate paginated snapshots. The new
account/grant-scoped change-log ledger records stable IDs, updates, deletions and
tokens; expired/failed tokens reset for the next snapshot. Current summaries are
still reconciled from bounded provider reads. An initial ledger has no historical
ID index; an unknown deletion conservatively invalidates provider-only fields
that a successful rescan confirms absent. Manual fields retain their provenance.

Android permissions are app-scoped, so an additional local per-Firebase-account
connection is required. Sign-out/account change removes that connection and the
background opt-in. A late permission result from another account cannot bind the
new account. Existing Android permission grants alone never auto-connect a new
Firebase account. Each partner must connect on their own phone.

Background support uses Health Connect's actual feature status. A separately
requested permission and account opt-in enable a best-effort hourly WorkManager
job for private steps/sleep/workouts/heart rate snapshots. It saves through the
existing account-scoped native snapshot format and delivers that cache through
the existing foreground bridge on opening. Sharing is then checked independently
per category; private background reads do not require partner consent. Android may delay it;
no continuous/live monitoring is claimed. On opening the app the normal private
reader refreshes again. Background cycle imports are not added.

The SDK35-compatible `connect-client:1.1.0-alpha12` supplies feature detection;
stable 1.1.0 demanded a newer SDK/AGP. This pinned pre-release dependency needs
real-device verification before release. No Health Connect writes, background
location or partner tracking are added.

Blank manual metrics stay absent, never zero. Measurements carry per-field source
and timestamp; mixed manual/imported fields retain provenance. Last synced is
distinct from measurement time. Missing/denied fields do not fabricate readings.

Period import separately asks `READ_MENSTRUATION`, reads only available Samsung
period records in the last 30 days, and offers review before using recorded dates.
No records/unsupported/denied cases retain the working manual tracker. An unknown
actual end date is not inferred from usual period length. Predictions and recorded
dates remain separate, and the existing contraception warning stays in place.

## Consent, revocation and cache behavior

Raw private health/cycle records remain local and account-scoped. Earlier
unscoped records are preserved separately and require an explicit ownership
review before local import. Health data never joins the common relationship
payload, travel AI, analytics or notification previews.

`users/{uid}/careConsent/{category}` has independent steps, sleep, workouts,
heartRate, cycleDates, cyclePredictions, cycleSymptoms and roster decisions.
Only that UID can change its consent, in a revision-checked online transaction.
Consent binds both current membership join timestamps and the canonical pair;
clients cannot forge or rewrite join timestamps. Legacy timestamp-less members
keep original app access but cannot enable care sharing until a fresh verified
membership is established. The new rules preserve that legacy compatibility.

Only selected summaries use separate `careShares` documents; roster projections
use `rosterPublic`. Server rules recheck consent revision, category, owner, both
current memberships and both pairing pointers on each write/read. Offline writes
cannot reinstate revoked consent. Unpairing/re-pairing denies prior reads even
when an old pair ID is reused. Owner revocation deletes the shared copy where
possible; protection does not depend on deletion finishing.

Real-time listeners attach only after current consent. Account/pair generations,
permission errors and cache-only snapshots clear or reject partner UI data.
Partner projections are not placed in JavaScript localStorage. No claim is made
that the Firebase SDK selectively erases all previously cached disk bytes;
previously fetched copies may remain inside its app-private cache. The new UI
never renders cache-only partner data. This and independently saved/viewed copies
must not be described as remotely recallable.

Consent changes require connectivity. Unknown/offline consent status is explicitly
unconfirmed, not labelled private or successfully revoked. Each owner must enable
sharing for themselves; one partner cannot enable the other's health or cycle.
