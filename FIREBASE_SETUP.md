# Firebase connection required for live v0.12 sync

Use these exact Android app details in Firebase:

- Android package name: `app.usspace.couple.v012`
- Development signing SHA-1: `67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`
- Development signing SHA-256: `B5:ED:FC:C2:56:FE:B4:6E:DC:9F:A4:F2:C4:E9:5A:EA:E3:A8:57:2B:24:8E:F2:34:BA:2A:61:B4:EA:EF:C3:08`

Then:

1. Enable Google in Firebase Authentication providers.
2. Firestore has been created as `(default)` (observed console location: `asia-south2`).
3. Replace the default Firestore rules with the included `firestore.rules` and publish.
4. The refreshed OAuth-enabled `google-services.json` is already present at `app/google-services.json`.

The source uses Firebase BoM 34.19.0 plus Credential Manager 1.3.0 and Google ID 1.1.1, matching Firebase's current Android Google Sign-In guidance when this source was prepared.

## Signing key
The matching development signing key is kept separately as `UsSpace-v0.12-dev-signing-key.p12` and is NOT inside the source ZIP. Do not commit that key to the public GitHub repository.

Signing passwords belong in private environment variables or GitHub Actions secrets. The matching key is supplied separately.
Alias: `usspace`

This is a development identity for sideload/testing, not a Play Store production signing key.
