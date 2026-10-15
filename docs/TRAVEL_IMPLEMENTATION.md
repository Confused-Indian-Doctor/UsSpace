# Bucket List travel upgrade

## Inspected baseline

Current checkout: Android Java, minSdk26/target35, Gradle8.11.1/AGP8.7.3,
bundled WebView assets; Firebase Auth/Firestore native bridges; no React/native
navigation rewrite. No AGENTS.md was found in the workspace search. Bucket List
is `bucket` under Us, implemented by `us-plans.js`, `UsExtrasBridge` and
`couples/{pair}/usBucket`. Existing photographs are small JPEG Firestore records.
There is no verified existing map renderer, place provider, Storage deployment,
travel schema, ACTION_SEND receiver or travel AI service. The checkout also has
unreleased v0.16 notification/Health/Back changes; preserve these.

## Ordered implementation

1. Add versioned travel models and non-destructive legacy projection; test strict
   validation, visibility, deduplication and revisions before wiring UI.
2. Add owner-private and current-pair Firestore paths, separately owned reactions,
   per-stop documents, deny-by-default Storage rules, and authenticated native
   CRUD with scoped listeners/offline queue. Test unrelated/forged/unpaired access.
3. Extend the existing Bucket List route with Dreams/Map/Trips/Memories, preserving
   non-travel entries and the Appreciation Jar. Add explicit destinations,
   collections, interests and reviewed import candidates. Native text/image shares
   must survive cold/warm launch and sign-in without creating items automatically.
4. Add map/place/routing interfaces, verified coordinates, manual trip/day editing
   and explicit preview/apply/undo. Unknown hours/prices/travel times stay unknown.
5. Add deterministic drafts plus authenticated configurable backend AI adapter;
   only selected travel fields may cross that boundary. Provider failures leave
   manual planning available. Add quotas/schema validation/SSRF protection.
6. Add completion, ratings, reflection, photos, saved offline itinerary reading,
   sourced TTS, and honest provider-unavailable states for nearby/weather.
7. Run existing and new tests, build with the original signing key, upgrade-install
   the exact APK, exercise real UI, capture all five requested screens and report
   actual results. Do not label unfinished source as a verified release.

## Data boundaries and conflicts

New records default private; importing does not infer a shared destination.
Legacy `usBucket` stays shared in its existing pair and is never silently copied
into another pair or broadened. Migration uses a stable legacy identity and keeps
all source fields/photos. Private drafts/imports stay owner scoped. Reactions use
one document per item/user. Items, collections, trips, stops, imports and memories
are separate versioned documents. Updates use expected revisions; itinerary-wide
apply is atomic and stale drafts require review. Deletion is a revisioned tombstone
so retries cannot resurrect an item. An undo is another checked change, not a
blind old snapshot overwrite. Account/unpair changes cancel listeners and clear
inaccessible shared UI/queued writes before rendering a new scope.

Health/Cycle/comfort/profile history are never travel inputs. No background
location or partner location sharing. Network sources are untrusted content.
No arbitrary social-video extraction, inferred coordinates, fake booking, invented
weather/opening hours or straight-line road-route claims.

## Verification status

Models, strict private/shared rules, durable native CRUD, Dreams, collections,
reactions, text/image import review, bundled on-device OCR, confirmed map pins and
manual trip editing have passed the branch CI build and Firebase rule emulator
suite (run 38796955645). This is source/build verification, not Android runtime
verification.

The working tree additionally includes deterministic itinerary drafts, explicit
preview/apply/undo, authenticated backend adapters, safe public-page metadata
fetching, provider quotas, and Memories completion/photos/reflections/individual
ratings. The planner and backend have local automated coverage. Memories has six
local behavioral tests, including private/shared scope, account switching, invalid
dates, cancellation and independently writable ratings. These newer changes still
need branch CI and Android runtime verification.

Remaining: exploring/audio/offline reading UX, production provider configuration
and deployment, complete regression/security checks, signed APK assembly with the
original certificate, exact upgrade-install/runtime tests and screenshots.
Existing v0.15 remains the last verified release. No new APK is claimed verified.

## Offline and exploring implementation checkpoint

User-invoked exploration reads only the selected saved place: nearby café
candidates, timestamped Open-Meteo forecasts, or Geoapify travel-time estimates to
another saved place in the same destination. Failure/quota/unconfigured responses
keep manual planning usable. Selecting a café opens a private edit/review rather
than silently saving. These paths have five local UI tests; live providers are not
yet configured or claimed tested. Forecast advice does not rewrite an itinerary.

Travel narration reads the visible saved title/location/notes using a separate,
foreground-only Android offline English TTS bridge. Transcript, play, pause,
resume and stop are available. It stops when leaving the app and on scope changes.
No synthetic Al voice, invented guide facts, or remote speech service is used.
Three local UI tests pass; native playback needs runtime verification.

Explicit offline itinerary copies contain trip/stop notes in app-private storage,
scoped to the signed-in account, at most 12 copies/1.5 MB. They are read-only and
labelled with save time; photos and map tiles are not downloaded. Shared copies
are cleared on observed membership revocation, sign-out or account switch. A
remote unpair cannot be detected while disconnected; the UI states this limit.
Four local tests cover reading, Back, account switching and removal. Native
lifecycle/restart/unpair behavior still requires Android runtime verification.
