# UsSpace v0.12.1 Firestore verification

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
