# Bucket List travel upgrade

## Existing app and ordered implementation

Continue the Java Android/WebView app (minSdk 26, target 35), bundled HTML/JS/CSS,
Firebase authentication and existing two-person pairing. Bucket List remains
under Us; no bottom-navigation tab or application rewrite is introduced.

1. Versioned models, lossless legacy projection, private/shared documents,
   user-owned reactions, strict access rules and durable revision-checked writes.
2. Dreams cards, search, category/collection/interest filters and explicit private
   import review. Existing non-travel goals remain available.
3. Native cold/warm ACTION_SEND text and image imports, persistent sign-in inbox,
   bounded file validation, bundled on-device OCR and reviewed deduplication.
4. Confirmed place selection, separate map/place/routing interfaces and editable
   day timelines with accessible reorder/move/remove and reviewed undo.
5. Deterministic drafts and optional authenticated backend AI ordering, with
   Preview → Apply/Discard and revision conflict checks.
6. Memories, compressed photos, individual ratings/shared reflection, explicit
   offline itinerary copies, foreground TTS and optional sourced exploration.
7. Source/security verification, original-key signing, exact-APK upgrade/runtime
   verification, five screenshots and a verified release artifact.

Steps 1–6 are implemented in the travel source branch. Step 7 is in progress;
the existing v0.15 artifact remains the verified release.

## Data and privacy

New imports, ideas, collections and trips default private. Shared destinations
require explicit selection and the current canonical pair. Legacy usBucket data
is not deleted or silently moved: a non-destructive projection retains original
fields/photos, and an explicit copied experience records its legacy identity.

Records and trip stops are separate schema-versioned documents. Reactions are
separate user-owned documents. Firestore rules validate identity, allowed fields,
types and sizes. Storage rules restrict owner/current-pair access if a Storage
provider is later configured. Current compressed JPEG photos use bounded private
or pair-specific Firestore documents on the existing Spark setup.

Native writes persist a bounded account-scoped queue, use idempotent receipts and
expected revisions, and retry transient failures. Deletions are revisioned
tombstones. Itinerary-wide parent/stop changes are atomic. Stale drafts require
review; undo is a new checked transaction, not a blind snapshot overwrite.
Confirmed membership revocation, sign-out and account changes remove inaccessible
shared records, pending writes and offline copies.

Health, Cycle, comfort moods and unrelated profile/history data never enter travel
or provider requests. There is no background location or partner tracking.
Remote unpairing cannot be detected while disconnected; dated offline copies
explain this limitation. Saved notes do not imply downloaded photographs or maps.

## Imports, providers and planning

Imported content is untrusted. Images are MIME/magic/size/dimension checked;
OCR yields candidate text, never confirmed locations. Restricted social sources
remain links with caption/screenshot/manual fallbacks. Public HTML metadata uses
bounded HTTPS fetching with pinned public DNS, redirect checks and SSRF defenses.

Bundled Leaflet renders only confirmed points; a missing coordinate does not
remove an idea from the list. Online OSM tiles require an explicit map action,
attribution and normal viewport caching. There is no offline map download.
External navigation opens an installed maps application. Geographic proximity
is never presented as road travel time.

Manual trips and deterministic drafts work without paid keys. Unknown hours,
prices, reservations and travel times stay unknown. The optional backend enforces
Firebase authentication, current-pair authorization, selected-record scope,
quotas and structured output. AI proposes ordering of selected references and
cannot silently change an accepted itinerary. Accommodation uses notes and
external reservation/booking links; there is no in-app checkout.

The deployed backend was rechecked on 23 October 2026: capabilities returned 200,
and unauthenticated planning returned 401. Metadata and weather report enabled;
Geoapify places/routing and AI remain unconfigured. See TRAVEL_PROVIDERS.md and
V017_SETUP.md for exact setup, licensing, quotas and availability limits.

## Actual verification checkpoint

Source 243850a8a6f53f0588def0eaa0ebc17d24ebde75 passed build run 39984306333:
JavaScript regressions/travel tests, native Java policy tests, 89 Firebase emulator
tests and Android release/instrumentation compilation. These are not device tests.

The signed v0.17.0 APK (versionCode 19) has SHA-256
4630506e9803af968db6c58cee0e4efbe52c08c347c05d1b114756f336b34391.
Local SDK checks verified alignment, package/version and the original certificate.
Android run 39997856349 is running the full exact-APK upgrade/runtime suite.
Focused run 39995392469 passed real map rendering, reviewed trip removal/undo,
offline itinerary reading and native screenshot OCR. It failed when a reviewed
idea saved offline was absent from Dreams after the save confirmation. This
remains an unresolved runtime failure; diagnostic run 39999848818 retains both
scroll-search directions, and a separate test APK adds demo-only queue reads.

Do not report this APK as verified until its runtime job passes. The rejected
older v0.17 layout candidate must not be delivered. Real production two-phone
Google login/sync, Samsung Health export and FCM delivery are not established by
demo-emulator tests; live paid providers are not configured or claimed tested.

## Commit/listener handoff fix under verification

Diagnostic run 40002978826 proved the reviewed QA-preflight-save item and its
receipt existed on the demo server while the paused-listener UI had lost the
item. The write was accepted; its local optimistic overlay had been removed
before a document snapshot arrived. Successful operations now retain a durable,
account-scoped acknowledged overlay until every affected revision is observed.
Acknowledged edits show as synced, are not sent again or offered for discard,
and cannot override newer snapshots or cross an account/pair boundary.

The regression harness separately covers a paused SDK listener with an accepted
transaction and a real Firestore transport block on the disposable runner. The
latter rejects port 8080 traffic during Save and restores the exact test firewall
rule before reconnection/cleanup. No device or production firewall is changed.
The native SDK creates transactions directly from its datastore; pausing normal
listeners is therefore not a sufficient substitute for blocking its transport.
Reference: https://github.com/firebase/firebase-android-sdk/blob/master/firebase-firestore/src/main/java/com/google/firebase/firestore/remote/RemoteStore.java

All 29 local JavaScript suites passed after this change, including three new
acknowledgement/listener regressions. Native compilation, new signed APK and
complete emulator verification are still pending for the new source.
