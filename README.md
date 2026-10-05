# UsSpace v0.12 — Firebase-ready Android source

UsSpace v0.12 combines the v0.11 Health Connect build and the embedded Namma ↔ Nammal language module with two-account identity and realtime couple sync.

## Android identity
- Package/applicationId: `app.usspace.couple.v012`
- Version: `0.12.0` / versionCode 12
- Google Sign-In uses Android Credential Manager.
- Firebase Authentication turns the Google ID token into the app identity.
- Each signed-in Google account has its own `/users/{uid}` document.

## Pairing
- One signed-in user creates a private UsSpace and receives a random six-digit invite code.
- Codes expire after 15 minutes and are single-use.
- The second signed-in Google account joins with that code.
- Firestore rules and the transaction model cap a space at two members.
- Either member can disconnect their own account.

## Realtime data model
- `/couples/{coupleId}/shared/common` — next visit, duties, non-private goals, love notes, memories, language progress.
- `/couples/{coupleId}/profiles/{uid}` — that person's Today/status/check-in summary.
- Firestore snapshot listeners push changes back into the WebView UI.
- Firestore Android offline persistence is used by the SDK automatically.

## Privacy boundary
The native bridge never sends `health`, `healthHistory`, or `cycle`. `firestore.rules` rejects these keys too. Health Connect remains read-only. Cycle data remains local to the phone in v0.12.

## Build and live Firebase setup

The supplied `app/google-services.json` connects the app to Firebase project `usspace-c859e`. This Android client configuration is included in the repository and in the APK. Private signing material and service-account keys are excluded from source control.

1. Use the matching signing key supplied separately; its SHA-1 is recorded in `FIREBASE_SETUP.md`.
2. Confirm Google is enabled in Firebase Authentication.
3. Deploy the included `firestore.rules` to the existing `(default)` Firestore database before live pairing/sync.
4. Build using Gradle 8.11.1 (`gradle :app:assembleDebug`) or Android Studio. See `ANDROID_BUILD.md` for signed release builds and emulator verification in GitHub Actions.

The Android workflow separately compiles the source and checks privacy before requiring signing secrets. A successful signed job verifies the APK certificate against the Firebase OAuth configuration and records emulator installation/launch evidence. Configuration and source checks do not establish successful live Google sign-in, pairing or health consent.

## Stable identity from v0.12 onward
`app.usspace.couple.v012` is intentionally treated as the permanent Android application ID from v0.12 onward. Future v0.13+ releases should keep this same application ID and signing certificate so they install as updates rather than separate apps.

For Google Sign-In builds, use the stable signing key supplied separately and register its SHA-1 in Firebase. The project reads the key from `USSPACE_KEYSTORE_*` environment variables; the key itself is deliberately excluded from this source archive.
