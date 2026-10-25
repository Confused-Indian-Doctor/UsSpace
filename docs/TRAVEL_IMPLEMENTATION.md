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

Steps 1–7 are complete: source/security checks, original-key signing, all Android
runs and publication passed. The verified v0.17 APK is available in GitHub Releases;
the previous v0.15 download remains an archived fallback.

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

The deployed backend was rechecked on 24 October 2026: capabilities returned 200,
and unauthenticated planning returned 401. Metadata and weather report enabled;
Geoapify places/routing and AI remain unconfigured. See TRAVEL_PROVIDERS.md and
V017_SETUP.md for exact setup, licensing, quotas and availability limits.

## Actual verification checkpoint

Source `20b8f06225d984ead857a34c6ca4d84b94cdd48e` passed build run
`40143632730`: Android release/instrumentation compilation, 89 Firebase emulator
cases, 20 native queue-policy cases and 37 native import-policy cases. All 34
local JavaScript suites passed, including 14 travel-store cases. These source
and security results are distinct from installation results.

The original-key signed APK (versionCode 19) has SHA-256
`d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.
Package, version, alignment, Firebase OAuth and original certificate checks passed.
An independent download reconstructed those exact signed bytes. Cold image/text
run `40144080474` passed. Focused run `40144079908` and full run `40144079117`
passed the corrected Dark-mode panels and complete existing app journeys.

See [actual verification and limits](V017_VERIFICATION.md). The previous verified
v0.15 link remains an archived fallback; v0.17 is now published.

## Commit/listener handoff repair

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

All 34 local JavaScript suites passed after this change, including three new
acknowledgement/listener regressions. Native compilation and original-key signing passed; complete Android emulator
verification passed. Production service/device limits remain as stated above.
