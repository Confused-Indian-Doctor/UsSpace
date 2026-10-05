# UsSpace v0.12 Firestore security test matrix

The supplied source states that an earlier Work build passed the intended matrix. These Firestore emulator checks have not been re-run for the current changes; run them against a local demo project before deploying the rules:

1. Signed-out client cannot read a couple.
2. Creator can create a couple with exactly one initial member.
3. Random authenticated third account cannot list couples.
4. Valid unused pairing code can add exactly one second account.
5. Expired pairing code is rejected.
6. Used pairing code is rejected.
7. A third member cannot increment memberCount beyond two.
8. A non-member cannot read shared/common.
9. A member can read/write shared/common and their own profile.
10. A member cannot write the other member's profile.
11. Any cloud payload containing health, healthHistory, or cycle is rejected.
12. A member can disconnect itself without deleting the other member's data.

Pair-code allocation regression checks:

13. A signed-in client can get a nonexistent invite document, observing that it does not exist, before atomically creating its couple/member/invite/user pairing documents.
14. A signed-out client cannot get the same nonexistent invite document.
15. A signed-in client cannot get an existing expired invite or list invite documents.

The dependency-free payload regression exercises initialization and the actual shared/profile projection functions extracted from the shipped `index.html`:

```sh
node firebase-tests/privacy_payload_test.js
```

It checks Health/Cycle private defaults, omission of sensitive fields and sentinel values, exclusion of private goals, retention of language progress and ordinary shared fields, and the 30-check-in profile limit. This check does not validate Firestore rule semantics or real account authentication.
