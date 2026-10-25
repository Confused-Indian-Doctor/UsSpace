# UsSpace v0.17 travel upgrade

The existing Android Java/WebView app remains package `app.usspace.couple.v012`.
Version 0.17.0 uses versionCode 19 and the original signing identity. This document
records setup; source compilation alone is not an installation-test result.

## Firebase

Publish the complete repository `firestore.rules` to project `usspace-c859e`.
The user confirmed publishing the travel version on 16 October 2026. New private
records live under their owner's user path; shared records live under the current
pair. Reactions have independently writable user-owned documents. Trip changes
use checked revisions and atomic parent/stop transactions. Existing `usBucket`
records are projected without deleting or silently changing their visibility.

Small compressed travel photos use the existing Firestore approach, so manual
saving does not require a new paid Storage bucket. `storage.rules` supplies strict
owner/pair restrictions if a Storage-backed photo provider is deployed later; the
app does not claim those files have been uploaded to Storage.

## Optional backend

The endpoint base is `https://usspace-notify-cb2f5cbc.floot.app/_api/`.
The hosted backend was published separately from the Android build. Its source
mirror is in `notification-server/floot`. Required explicit server dependencies:
`firebase-admin@13.4.0` and `@google-cloud/firestore@7.11.0`. The latter must be an
explicit dependency for this host's server bundler. No API secret is in the APK.

Firebase Admin permission probes and authentication-required responses were
verified in the preview before deployment. AI and Geoapify keys are not configured;
manual entry, external Maps search and deterministic drafts remain available.
Open-Meteo weather is enabled for user-requested saved-place lookups on this
personal, non-commercial deployment, with quotas and attribution. Disable it with
`USSPACE_TRAVEL_WEATHER_ENABLED=false` if the service's terms or intended usage
change. See `TRAVEL_PROVIDERS.md` for exact variables, quotas and provider links.

The notification relay reports unavailable until its complete verified outbox
rules and recovery setup are ready. Do not equate the travel backend's readiness
with tested FCM delivery, or a Samsung emulator with a real Samsung Health export.
Health/Cycle remain private by default and are never travel-planning inputs.

## Offline reading and privacy

Use **Save itinerary for offline reading** on a synced trip. Copies contain notes,
not map tiles or downloaded photographs. They are read-only, dated, account-scoped
and stored in app-private storage. Signing out, changing accounts or observing a
revoked pair clears shared copies. Remote revocation cannot be detected while the
phone is disconnected; this limitation is shown beside saved copies.

No background location tracking or partner location sharing is enabled. Nearby
lookups use a user-selected saved place. Travel audio reads the visible saved
notes using an offline Android voice, with a transcript and playback controls.

## Verification

Source `20b8f06225d984ead857a34c6ca4d84b94cdd48e` passed build run
`40143632730`: Android release/instrumentation compilation, 89 Firebase emulator
cases, 20 native queue-policy cases, 37 native import-policy cases and existing
regressions. All 34 local JavaScript suites also passed.

The original-key signed APK SHA-256 is
`d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.
An independent download reconstructed the exact signed bytes. Cold image/text
run `40144080474`, focused `40144079908` and full `40144079117` passed. The
verified v0.17 release is now published; the v0.15 download remains an archive. See [the detailed test report](V017_VERIFICATION.md).

The earlier candidate beginning `4630506e` was rejected after an accepted edit
vanished from the paused-listener UI. The new source retains acknowledged edits
until their revisions arrive through the listener, without resending them or
showing them as unsent. A separate test blocks the emulator's real Firestore
transport to verify pending offline saves and reconnection.

The backend was rechecked on 24 October 2026: capabilities returned 200 and an
unauthenticated planning request returned 401. Metadata and weather are enabled;
AI, place search and routing still require optional provider configuration.
