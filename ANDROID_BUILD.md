# Signed Android build and emulator verification

The `Android v0.12` GitHub Actions workflow builds this Firebase-connected source on pushes to `main` and manual dispatches. It uses JDK 17, Gradle 8.11.1, Android Gradle Plugin 8.7.3 and Android SDK 35. An independent source-validation job runs the learning and sync protocol tests, two-client Firestore emulator/security tests, privacy checks and release compilation even if signing secrets are unavailable. Its unsigned output is never published.

Configure these repository Actions secrets before starting a signed build:

| Secret | Value |
| --- | --- |
| `USSPACE_KEYSTORE_B64` | Base64 of the existing stable PKCS12 signing key, supplied separately. |
| `USSPACE_KEYSTORE_PASSWORD` | Existing keystore password. |
| `USSPACE_KEY_PASSWORD` | Existing private-key password. Optional when identical to the keystore password. |
| `USSPACE_KEY_ALIAS` | Existing alias, if different from `usspace`. |
| `GOOGLE_SERVICES_JSON_B64` | Optional Base64 Firebase Android client configuration override. Otherwise the checked-in `app/google-services.json` is used. |

Never commit a signing key, signing passwords or service-account credentials. The automatic signed job runs when the repository contains the keystore and password secrets. Without those secrets, source and realtime checks still run and the signed job is skipped; use the local original-key workflow described below. CI never generates a replacement key. After building, `scripts/verify-release-apk.py` verifies the APK signature, package/version and that the actual signing certificate SHA-1 matches an Android OAuth client in the Firebase configuration. This protects the Google Sign-In identity across updates.

CI enables KVM, boots a disposable Android 35 Google APIs emulator, installs the verified release APK, explicitly launches MainActivity and observes the process for 20 seconds. The smoke test fails if boot, installation or launch times out, if the app exits, if an app crash/ANR appears in logcat, or if MainActivity is not resumed. It records a screenshot and emulator/install/launch/activity/logcat evidence.

Only a successful signed build and emulator smoke test publishes the `UsSpace-v0.12-verified-apk` artifact. It contains `UsSpace-v0.12.apk`, its SHA-256 checksum, signing verification JSON, a launch screenshot and the smoke-test logs. Download the artifact from the successful Actions run and verify the APK with `sha256sum -c UsSpace-v0.12.apk.sha256` from the extracted artifact directory.

For local verification with an Android SDK and an already running emulator:

```bash
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SERIAL=emulator-5554
python3 scripts/verify-release-apk.py /path/to/UsSpace-v0.12.apk --report artifacts/apk-verification.json
bash scripts/android-smoke-test.sh /path/to/UsSpace-v0.12.apk artifacts --existing-device
```

Omit `--existing-device` to let the script create and boot its own emulator after installing `system-images;android-35;google_apis;x86_64` and `emulator`. `ANDROID_EMULATOR_ACCEL` defaults to `on`; a local machine without KVM can explicitly set it to `off`. The CI build requires KVM.

The release is version 0.12.1 / versionCode 13 and keeps the original application ID and signing certificate. Firestore integration tests use isolated test accounts and a local emulator; they do not modify the live Firebase project.

The Android emulator validates packaging, startup and the embedded learning screens. Live Google authentication, two-account Firestore pairing/sync, Samsung Health data availability and Health Connect consent require suitable accounts and devices; the smoke test does not claim those account-dependent flows are verified.

## Signing locally when repository secrets cannot be configured

The separate `Android local signing and verification` workflow provides a path that keeps the original signing key on the local machine. Push a branch under `android-signing-inputs/` to compile the unsigned release and produce `UsSpace-v0.12-signing-inputs`. The artifact contains `signing-inputs/app-release-unsigned.apk`, the required Android 35 signing/verification tools, checksums and the source commit. It contains no signing key or passwords. After extraction, restore executable permission on `apksigner`, `zipalign` and `aapt`, check `SHA256SUMS`, then align and sign the APK locally with the original key.

Verify the locally signed APK with `scripts/verify-release-apk.py`, then upload that APK to a public HTTPS asset URL. On a temporary branch under `android-apk-verification/`, commit only `.ci-artifacts/apk-source.json` containing its `url`, lowercase `sha256` and the signing-inputs `source_commit`. That push downloads the exact signed APK over HTTPS, verifies its checksum, checks that the app/build/verification source matches the recorded source commit, and verifies its Firebase OAuth signing certificate. It then checks private sync payloads, boots the Android 35 emulator, installs and launches that APK, and publishes `UsSpace-v0.12-verified-apk` only after all checks succeed. The artifact records both source and verification commits. Never commit or upload the original signing key or passwords in either branch or artifact. The normal `Android v0.12` workflow remains the path for ongoing release builds with configured repository secrets.
