# Firebase status — UsSpace v0.12

Connected project: `usspace-c859e`
Android package: `app.usspace.couple.v012`

The current `app/google-services.json` is installed and validated.

Validated Google identity configuration:
- Android OAuth client present for `app.usspace.couple.v012`.
- Android OAuth certificate hash matches the v0.12 signing SHA-1.
- Web OAuth client present, so Firebase/Credential Manager can request Google ID tokens.
- Firebase config validation passes.
- Local privacy payload test passes: Health and Cycle fields are excluded from shared sync payloads.

Firestore database is now created as the Firebase `(default)` database.
Observed console location: `asia-south2`.

Remaining Firebase console action:
1. Firestore Database → Rules.
2. Replace the default rules with the included `firestore.rules` and publish before using live pairing/sync.

Health and cycle data remain local/private by default and are excluded from shared Firestore payloads.
