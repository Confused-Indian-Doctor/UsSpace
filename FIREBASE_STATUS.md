# Firebase status — UsSpace v0.12.3

Connected project: `usspace-c859e`  
Android package: `app.usspace.couple.v012`  
Version: `0.12.3` / code 15

The supplied Android client configuration has the Android and Web OAuth clients used by Google Sign-In. The release uses the original signing certificate, SHA-1 `67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`. Client configuration and signed APK identity were verified.

[Previous v0.12.1 verification](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37372641976) passed all 15 authenticated Firestore emulator tests, the production native transaction reducer tests, bundled learning/UI tests and privacy checks. Tests include delivery to a second client, concurrent lesson progress, persisted offline edits, atomic two-person pairing, profile ownership and denial of Health/Cycle payloads. They use a demo emulator and do not modify the live project. Version 0.12.2 adds explicit Google-button sign-in and invitation visibility, restoration and renewal; its verification evidence is recorded in its [Actions runs](https://github.com/Confused-Indian-Doctor/UsSpace/actions) and verified APK artifact.

Both Kannada and Malayalam beginner tracks contain 14 units and 140 phrases, with script guides, grammar, dialogues, recall and typed practice, checkpoints and spaced review. All 64 original phrases and their IDs were preserved.

The user confirmed that publishing the v0.12.2 rules and pairing the two phones worked. This session has no Firebase administrator connection. Publish the current expanded `firestore.rules` to the existing `(default)` database for v0.12.3 letters, appreciation notes, photos and bucket items. Do not disconnect the existing pair. All previous invite/member/shared rule branches remain intact; the new collections have separate strict field and ownership boundaries.

Open When roles bind the actual Al and Yashika account UIDs through a one-time explicit confirmation. Drafts are private to their owner; released letters are queried only by their author or assigned recipient. Letter opens, private comfort selections and local contact settings are never shared automatically. New transactions use immutable, account-owned operation receipts to avoid duplicate replay after an interrupted connection.

Health Connect remains read-only. Health history, Cycle data and private goals stay on this phone and are excluded from shared projections and the native transaction reducer.
