Install this original-key signed candidate over your existing UsSpace app. Choose **Update**; do not uninstall or create another account. The current stable v0.17.0 release remains unchanged.

Adds private travel-import review and existing map/trip integration, a roster calendar connected to the existing Jubilee Work output, and independent Health Connect/cycle-sharing controls. Health/cycle sharing stays off until each owner explicitly enables the relevant categories on their own account.

Verification completed:
- Original signing certificate, package, version0.18.0 (20), Firebase OAuth registration and16KB ZIP alignment.
- Actual Android35 emulator upgrade from the checksum-pinned v0.17.0 APK, data-preservation checks and launch.
- Cold/warm travel imports, explicit selection, accepted-write/listener gap, real offline save/reconnect, map/dark-theme panels, trip preview/apply/discard/undo, account switching and unpairing.
- Five earlier UI suites reused only after exact signed APK/source/archive verification, including health/notification UI recovery.
-102 Firestore/Storage emulator cases passed, including owner/partner/unrelated-account and consent revocation/offline retry checks. Consent-capable Firestore rules were deployed without creating or enabling any user consent.
- Existing Jubilee owner/pair verified, real private source import and idempotent replay, plus the deployed authenticated refresh endpoint. Its export remains partial: missing source hours stay unknown and do not imply free time. Updates require the laptop/helper to run.

Outstanding: actual Samsung Health records/permissions and each partner's sharing choices on their own phones; production Google sign-in UI and authenticated FCM delivery. This candidate does not claim those device/live-service checks passed. Live place/transcription providers require configuration; inaccessible Instagram links retain caption/screenshot/manual fallbacks.

Android evidence: https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40609166501
APK build source: bc79f95951393b4ba2fd6a765d414b8086aaf06c. Test source:027efb09dd19f4b4d0a9429b3e908faf3619a858. Release app source is unchanged between those commits.

SHA256:208fef19cd36fe7085ece234df139267c533c64d4570c78511fcf08472613ece
