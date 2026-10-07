# UsSpace v0.12.3 Firestore verification

Run `bash scripts/test-firebase-realtime.sh` from the repository root with Node 22 and Java 17. The launcher runs the shipped app's private-default, learning-engine, UI, and sync tests, installs the locked Firebase test SDK, and starts a local Firestore emulator under `demo-usspace`. It needs network access to download tooling, but uses no Firebase login and touches no live project data.

The authenticated emulator suite exercises actual Firestore transactions, listeners, and the checked-in security rules:

1. A creator atomically creates the couple, member, invite, and user pairing records using the native blind-batch pattern.
2. A valid unused invite adds exactly one second account, consumes the code, and leaves exactly two members.
3. A second authenticated client receives a committed shared note through `onSnapshot`.
4. Concurrent learner progress updates retain both learners' XP and known cards; a retried operation does not double XP.
5. Concurrent XP increments for the same learner both survive Firestore transaction retries; two devices completing the same unit award its thirty-point bonus once and retain both practice gains.
6. The shipped persistent outbox retains a lesson completion across restart, then delivers it to the partner and clears on acknowledgement.
7. The shipped projection omits private goals, Health, Cycle, health history, and unexpected nested learning fields from an actual shared document.
8. Signed-out clients and nonmembers cannot access shared data, profiles, or member collections.
9. Members can publish their own profiles and cannot replace their partner's profile.
10. Firestore rejects explicit `health`, `healthHistory`, or `cycle` payload keys and forbidden fields nested under learner progress or profile life, including authenticated member writes.
11. Expired and used invitations, forged member creation, and a third member are rejected.
12. The creator cannot consume their own invitation as the second person.
13. Disconnecting removes the leaving member's shared-data access and preserves the remaining member's data; lowering the count without atomically leaving is rejected.
14. Signed-in absent-invite lookup succeeds; signed-out invite probes and couple/invite list queries are rejected.

`realtime_emulator_test.mjs` imports the same `realtime-sync.js` reducer shipped in the APK. Its client transaction wrapper applies the native protocol's sequence guard to test real Firestore retries and two-client delivery. Native reducer checks separately exercise the Java implementation. Private-goal filtering is a production projection guarantee; Firestore access rules do not infer privacy from arbitrary free text.

GitHub Actions runs this suite before creating signing inputs and before installing the final signed APK. The verification artifact includes `firebase-realtime-tests.log`. These tests validate local rule semantics and simulated authenticated accounts; deploying the checked-in rules and signing into two real Google accounts are separate live-project operations.


## Private comfort, letters, appreciation and plans

`us_extras_emulator_test.mjs` adds sixteen authenticated emulator cases, using actual two-account invite transactions, document writes, scoped queries, retry receipts and a second-client server listener. The existing eighteen pairing/realtime cases remain unchanged.

| Boundary | Verified operation and rejection |
| --- | --- |
| Account roles | Two distinct current members select Al/Yashika once; one-member spaces, third accounts, duplicate identities, unknown fields and reassignment are rejected. |
| Shared membership | Anonymous, signed-in unpaired and third accounts cannot read/list/write roles, bucket items, jar notes, photos or letters. Leaving immediately revokes shared reads and writes. |
| Draft secrecy | Account-owner reads, edits and list queries succeed, including after disconnect. The partner and anonymous clients cannot access draft bodies. Saving a draft creates no published letter. |
| Publication | Only the immutable Al UID explicitly writes released letters to the immutable Yashika UID. No roles, wrong recipients/authors, unknown categories, nested fields and oversized content fail. |
| Letter discovery | Al queries `authorUid == own UID`; Yashika queries `recipientUid == own UID`. Broad lists and queries scoped to the wrong identity are denied. Missing-letter reads for Al enable publication transactions without granting recipient access to draft content. |
| Appreciation | A committed appreciation reaches the second authenticated server listener. Each author can edit/delete their own note; the partner cannot forge authorship or alter creation identity. |
| Hearts | Each account toggles only its own boolean heart; a parent note must exist. Partner impersonation, unknown mood fields and outsider reads fail. |
| Bucket list | Both current members can merge independent planning edits and move Dreaming → Planning → Booked → Done, retaining suggestion/creation identity. Invalid categories, priorities, states, dates, photo links and maximum overflows fail. |
| Photos | Shared members can read bounded JPEG data with a JPEG SOI prefix; only the owner replaces it. External URLs, PNG/SVG, malformed/oversized data, nested maps and ownership transfers are denied. Native photo validation additionally decodes JPEG start/end markers. |
| Retries | Own missing-receipt reads and atomic receipt/item creation succeed; replay applies the mutation once. Cross-account receipts, updates/deletes, spoofed timestamps, mismatched IDs and unsupported kinds fail. |
| Private selections | New shared schemas reject `mood`, `health`, `healthHistory`, `cycle`, contacts, drafts and safety history, including nested-map attempts. Comfort moods/contact choices/history never leave local device storage. |

New Firestore path schemas:

- `couples/{cid}/usRoles/identity`: immutable paired identity mapping.
- `couples/{cid}/usBucket/{id}`, `usJar/{id}`, `usJar/{id}/hearts/{uid}`, `usPhotos/{id}`: membership-bound scalar documents.
- `couples/{cid}/usLetters/{category}`: explicitly published, role-bound author/recipient content, with query scoping.
- `users/{uid}/usLetterDrafts/{cid_category}`: account-private editable drafts.
- `users/{uid}/usReceipts/{cid_operationId}`: own-account immutable transaction receipts; a current membership is required when creating a receipt.

All resulting new-feature documents have strict key allowlists, scalar types and limits. Photo payloads stay in `usPhotos`; Memories reference a scalar `photoId` through the shipped projection/native reducer. Existing legacy common arrays are preserved and are not fully recursively inspected by Firestore rules; client projection tests validate their safe photo reference format. These tests exercise the local demo emulator, not a production deployment or a real Google account. The updated rules must be published to the live Firebase project before the new shared features can sync.
