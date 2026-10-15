# UsSpace v0.16 signed Android build and verification

The current source targets **0.16.0 / versionCode 18**, keeps application ID `app.usspace.couple.v012`, and uses the original signing certificate. Historical v0.12.3 was versionCode 15. The `Android v0.16` workflow builds pushes to `main` and manual dispatches with JDK 17, Gradle 8.11.1, Android Gradle Plugin 8.7.3 and Android SDK 35.

The independent source-validation job runs the existing learning/sync/Us/privacy checks, new notification/preference/work-schedule tests, the authenticated Firestore emulator cases, and release compilation. Those cases cover pairing/realtime/Us behavior, notification/settings/work permissions, the relationship profile and the new atomic push-outbox contract. Emulator identities and the isolated demo project do not change live Firebase data. A successful source job alone is not a verified signed APK or a successful user-account sign-in.

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

The runtime suite retains both embedded courses/scripts, Google-button account-UI handoff or an actionable retry error, comfort/safety/grounding/voice-placeholder checks, the signed-out letter boundary, and real Bucket List photo-picker/JPEG-preview and Appreciation Jar screens. The retained v0.14 suite verifies real Light/Dark rendering, force-stop/relaunch theme persistence, System mode following Android Light/Dark, seven notification category controls and quiet-hours toggles, and Work Schedule's signed-out guidance plus read-only Microsoft registration instructions. The retained v0.15 suite exercises the live counter, relationship date editor and timeline, their appearance modes and Home actions. Its Back checks now require the previous submenu or Us/Life parent before Home. The additional v0.16 suite checks real Health Connect permission cancellation/settings return, a private empty-data state, signed-out notification recovery controls and actual Android notification settings return. Guest instructions do not unlock connection fields, sign into Microsoft, or display fabricated shifts.

Only a successful signed verification job publishes **`UsSpace-v0.16-verified-apk`**. It contains `UsSpace-v0.16.apk`, `UsSpace-v0.16.apk.sha256`, signature/provenance reports, screenshots and runtime logs/results. Verify an extracted artifact with:

```sh
sha256sum -c UsSpace-v0.16.apk.sha256
```

The local-signing verification workflow publishes failures as `UsSpace-v0.16-runtime-diagnostics`, without a verified APK artifact. The main workflow's source-validation evidence artifact is `UsSpace-v0.16-firebase-verification`.

These checks validate packaging and actual emulator behavior; they do not authenticate either person's Google account, deliver live FCM to their phones, read a hospital workbook before registration/consent, or establish Galaxy Watch/Samsung export. Health permission is denied or cancelled during CI; this does not establish a successful real-data import. Live push still needs an authorized server. The selected Spark-compatible on-demand HTTPS backend has not yet been deployed or verified; its complete Firebase Admin credential and matching outbox rules remain setup requirements. No billing plan has been changed. Microsoft Graph still needs a public-client Entra registration and any hospital consent. See `PUSH_SETUP.md` and `WORK_SCHEDULE_SETUP.md`.

## Local runtime verification

With an Android SDK and an already running emulator:

```sh
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SERIAL=emulator-5554
python3 scripts/verify-release-apk.py /path/to/UsSpace-v0.16.apk --report artifacts/apk-verification.json
bash scripts/android-smoke-test.sh /path/to/UsSpace-v0.16.apk artifacts --existing-device
```

Omit `--existing-device` to create and boot an emulator after installing `system-images;android-35;google_apis;x86_64` and `emulator`. `ANDROID_EMULATOR_ACCEL` defaults to `on`; a local machine without KVM can explicitly set it to `off`. CI requires KVM.

## Signing locally with the original key

The `Android local signing and verification` workflow keeps the original key on the local machine. Push a branch under `android-signing-inputs/` to compile and produce **`UsSpace-v0.16-signing-inputs`**. Its `signing-inputs/app-release-unsigned.apk`, Android 35 signing tools, checksums and source commit are inputs for local signing; there is no key or password in the artifact. Restore executable permission on `apksigner`, `zipalign` and `aapt`, check `SHA256SUMS`, then align and sign with the existing key.

Verify the signed APK locally, then upload it to an HTTPS asset URL. On a temporary `android-apk-verification/` branch, add `.ci-artifacts/apk-source.json` with its `url`, lowercase `sha256` and signing-inputs `source_commit`. The workflow downloads that exact APK, verifies its checksum and Firebase OAuth certificate, checks that all app/build/rules/unit/protocol/server inputs match the compilation commit, and runs the full Android suite.

The named Android UI harnesses may advance independently for selectors/scrolling because they are not embedded in the APK. `automation-provenance.json` records their hashes and the verification commit; `SOURCE_COMMIT.txt` records the APK compilation commit. A verified artifact is published only after every required check passes. The main `Android v0.16` workflow remains the ongoing release path once repository signing secrets are available.

## Relationship, navigation and recovery coverage

The retained v0.15 baseline adds 54 relationship calendar/UI checks and 60 native
policy/persistence assertions with 109,938 Gregorian dates. The updated navigation
suite has 49 cases: immediate submenu history, canonical Us/Life parents, fresh main
tab branches, modal/nested-page priority, no loops and Home exit. Actual emulator
checks cover date edits/restart/restore, milestones, rendered Light/Dark/System cards
and timeline, Home actions, submenu → parent → Home, meaningful internal learning
Back, modal closure and Home exit/relaunch.

`scripts/android-v016-smoke.py` follows every preceding Android suite. Its assertions
use real accessibility controls, native permission/settings Activities, screenshots
and empty/signed-out states. It never grants health permission, injects health records,
reads private app storage or claims authenticated FCM delivery. The four release UI
harnesses are recorded in verification provenance. The signed-verification job has a
75-minute limit, including a 60-minute emulator step; source checks run separately.
The new APK is publishable as verified only after all required jobs pass.

See [V015_RELATIONSHIP.md](V015_RELATIONSHIP.md) for the preserved calendar policy
and historical v0.15 behavior, and [v0.16 setup](docs/V016_SETUP.md) for the new Back,
Samsung Health and on-demand notification prerequisites. The owner's confirmed
v0.15 rule publication predates the new v0.16 push-outbox rule branch.

## Previously verified v0.15 release

The original-key signed APK was compiled from `17904b3783f1551c86840f37540188568478179c` and exercised by
[the successful Android verification run](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/38166736333) at
`9f8d5196f9c41a332fc55c63b0bd4ef541831af3`. The APK SHA-256 is
`c341cd382fcd89c50fc94913fdbc1b28c3763c1079b7d7466a162c9753c4a8dd`; its size is 8,679,473 bytes. Verification-harness changes after
compilation are recorded separately in the automation provenance. The application,
Firebase rules and protected build/test inputs must still match the compilation
commit. The original certificate SHA-1 remains
`67:EA:FA:2C:1F:58:FE:0C:4B:F3:EA:24:70:F6:62:80:72:15:73:10`.
