# Firebase status — UsSpace v0.12.2

Connected project: `usspace-c859e`  
Android package: `app.usspace.couple.v012`  
Version: `0.12.2` / code 14

The supplied Android client configuration has the Android and Web OAuth clients used by Google Sign-In. The release uses the original signing certificate, SHA-1 `67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`. Client configuration and signed APK identity were verified.

[Previous v0.12.1 verification](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/37372641976) passed all 15 authenticated Firestore emulator tests, the production native transaction reducer tests, bundled learning/UI tests and privacy checks. Tests include delivery to a second client, concurrent lesson progress, persisted offline edits, atomic two-person pairing, profile ownership and denial of Health/Cycle payloads. They use a demo emulator and do not modify the live project. Version 0.12.2 adds explicit Google-button sign-in and invitation visibility, restoration and renewal; its verification evidence is recorded in its [Actions runs](https://github.com/Confused-Indian-Doctor/UsSpace/actions) and verified APK artifact.

Both Kannada and Malayalam beginner tracks contain 14 units and 140 phrases, with script guides, grammar, dialogues, recall and typed practice, checkpoints and spaced review. All 64 original phrases and their IDs were preserved.

The included `firestore.rules` must be published to the existing `(default)` database for live account pairing. This session has no Firebase administrator connection and has not deployed rules or verified live paired devices. A user-provided phone screenshot confirms one account signed in. The updated rules enforce private shared payloads, atomic membership removal and invitations created by a current owner of a space with one member.

Health Connect remains read-only. Health history, Cycle data and private goals stay on this phone and are excluded from shared projections and the native transaction reducer.
