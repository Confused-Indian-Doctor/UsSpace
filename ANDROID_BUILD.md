# UsSpace v0.14 signed Android build and verification

The current source targets **0.14.0 / versionCode 16**, keeps application ID `app.usspace.couple.v012`, and uses the original signing certificate. Historical v0.12.3 was versionCode 15. The `Android v0.14` workflow builds pushes to `main` and manual dispatches with JDK 17, Gradle 8.11.1, Android Gradle Plugin 8.7.3 and Android SDK 35.

The independent source-validation job runs the existing learning/sync/Us/privacy checks, new notification/preference/work-schedule tests, all **43 authenticated Firestore emulator cases**, and release compilation. Those cases comprise the previous 34 pairing/realtime/Us checks and nine v0.14 permissions checks. Emulator identities and the isolated demo project do not change live Firebase data. A successful source job alone is not a verified signed APK or a successful user-account sign-in.

## Signing with repository Actions secrets

| Secret | Value |
| --- | --- |
| `USSPACE_KEYSTORE_B64` | Base64 of the existing stable PKCS12 signing key, supplied separately. |
| `USSPACE_KEYSTORE_PASSWORD` | Existing keystore password. |
| `USSPACE_KEY_PASSWORD` | Existing private-key password; optional when identical to the keystore password. |
| `USSPACE_KEY_ALIAS` | Existing alias, if different from `usspace`. |
| `GOOGLE_SERVICES_JSON_B64` | Optional Firebase Android client configuration override. Otherwise `app/google-services.json` is used. |

The signed job runs when the keystore and password secrets are configured. Otherwise the source checks run and signing is skipped; the local original-key workflow below remains available. CI does not generate a replacement key. Keep signing material, passwords and service-account credentials out of source control and downloadable artifacts.

After signing, `scripts/verify-release-apk.py` checks the package/version, signature and actual certificate SHA-1 against the Firebase Android OAuth client. This preserves Google Sign-In and installation as an update over the existing app.

## Android runtime checks and artifacts

CI requires KVM and boots a disposable Android 35 Google APIs emulator. It installs the exact verified release APK, explicitly launches MainActivity, and checks that it remains resumed without app crashes, ANRs or uncaught WebView errors. Screenshots, accessibility snapshots, install/activity output and logcat provide the evidence.

The runtime suite retains both embedded courses/scripts, Google-button account-UI handoff or an actionable retry error, comfort/safety/grounding/voice-placeholder checks, the signed-out letter boundary, and real Bucket List photo-picker/JPEG-preview and Appreciation Jar screens. The v0.14 suite adds real Light/Dark rendering, force-stop/relaunch theme persistence, System mode following Android Light/Dark, seven notification category controls and quiet-hours toggles, and Work Schedule's signed-out guidance plus read-only Microsoft registration instructions. Guest instructions do not unlock connection fields, sign into Microsoft, or display fabricated shifts.

Only a successful signed verification job publishes **`UsSpace-v0.14-verified-apk`**. It contains `UsSpace-v0.14.apk`, `UsSpace-v0.14.apk.sha256`, signature/provenance reports, screenshots and runtime logs/results. Verify an extracted artifact with:

```sh
sha256sum -c UsSpace-v0.14.apk.sha256
```

The local-signing verification workflow publishes failures as `UsSpace-v0.14-runtime-diagnostics`, without a verified APK artifact. The main workflow's source-validation evidence artifact is `UsSpace-v0.14-firebase-verification`.

These checks validate packaging and actual emulator behavior; they do not authenticate either person's Google account, deliver live FCM to their phones, read a hospital workbook before registration/consent, or establish Samsung Health/Health Connect consent. Live push still needs an authorized server: the Spark-compatible Node worker has not been deployed, and no billing plan has been changed. Microsoft Graph still needs a public-client Entra registration and any hospital consent. See `PUSH_SETUP.md` and `WORK_SCHEDULE_SETUP.md`.

## Local runtime verification

With an Android SDK and an already running emulator:

```sh
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SERIAL=emulator-5554
python3 scripts/verify-release-apk.py /path/to/UsSpace-v0.14.apk --report artifacts/apk-verification.json
bash scripts/android-smoke-test.sh /path/to/UsSpace-v0.14.apk artifacts --existing-device
```

Omit `--existing-device` to create and boot an emulator after installing `system-images;android-35;google_apis;x86_64` and `emulator`. `ANDROID_EMULATOR_ACCEL` defaults to `on`; a local machine without KVM can explicitly set it to `off`. CI requires KVM.

## Signing locally with the original key

The `Android local signing and verification` workflow keeps the original key on the local machine. Push a branch under `android-signing-inputs/` to compile and produce **`UsSpace-v0.14-signing-inputs`**. Its `signing-inputs/app-release-unsigned.apk`, Android 35 signing tools, checksums and source commit are inputs for local signing; there is no key or password in the artifact. Restore executable permission on `apksigner`, `zipalign` and `aapt`, check `SHA256SUMS`, then align and sign with the existing key.

Verify the signed APK locally, then upload it to an HTTPS asset URL. On a temporary `android-apk-verification/` branch, add `.ci-artifacts/apk-source.json` with its `url`, lowercase `sha256` and signing-inputs `source_commit`. The workflow downloads that exact APK, verifies its checksum and Firebase OAuth certificate, checks that all app/build/rules/unit/protocol/server inputs match the compilation commit, and runs the full Android suite.

The named Android UI harnesses may advance independently for selectors/scrolling because they are not embedded in the APK. `automation-provenance.json` records their hashes and the verification commit; `SOURCE_COMMIT.txt` records the APK compilation commit. A verified artifact is published only after every required check passes. The main `Android v0.14` workflow remains the ongoing release path once repository signing secrets are available.
