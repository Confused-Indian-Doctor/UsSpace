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

Architecture inspection and plan recorded. Travel implementation and Android
verification are pending; existing v0.15 remains the last verified release.
