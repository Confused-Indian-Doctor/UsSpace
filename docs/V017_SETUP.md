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

The source-build workflow passed for commit
`87a07b57dffac47c77662b33a876385cc062ef7c`. The signed APK checksum is
`0880ddac9160808ae09e44090f93af5609d6ce079afda0a0b6c842cd265f0d37`.
The first runtime attempt stopped before upgrade input while the old app's
WebView was loading. The second installed and launched v0.17, then stopped at the
upgrade date-persistence assertion; captured UI is being inspected. Neither run
establishes completed runtime verification. Do not call this a verified release
until the final Android job and travel UI checks pass.
