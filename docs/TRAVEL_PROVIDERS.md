# Travel provider decisions and configuration

Checked against current documentation on 15 October 2026:

- Leaflet 1.9.4 API: https://leafletjs.com/reference.html
- OpenStreetMap standard tiles policy: https://operations.osmfoundation.org/policies/tiles/
- Bundled Android text recognition:
  https://developers.google.com/ml-kit/vision/text-recognition/v2/android

## Selected interfaces

Keep map rendering, place resolution and routing separate. The planned renderer
is bundled Leaflet 1.9.4 (BSD-2-Clause); it does not include tiles, place search or
routes. Use visible OpenStreetMap attribution with the standard HTTPS tile layer
only for a user-opened online map. Identify UsSpace in the Android User-Agent,
retain normal HTTP cache behaviour, and fetch only the visible viewport. Do not
prefetch, bulk-download or advertise offline coverage. Public OSM tiles have no
SLA and may block excessive usage. A different licensed tile provider must be
configured before any higher-volume launch. Preserve the Leaflet licence with its
bundled code. No vendor code has been added yet.

Place search and routing are not silently backed by public Nominatim/OSRM demo
servers. A configured provider must have suitable mobile/backend usage rights and
quotas. Intentionally public SDK keys require provider restrictions; server keys
stay in backend secrets. Manual titles and user-confirmed coordinates remain
usable without a place provider. Confirmed-by-you coordinates must not be labelled
as a provider-verified match. Missing coordinates remain list entries. External
navigation can hand off an explicitly selected location to an installed maps app.
Straight-line map bounds or distances are not road/walking route durations.

## Screenshot OCR

Google currently documents bundled `com.google.mlkit:text-recognition:16.0.1` for
Latin text. This avoids depending on a later model download. An image import must
validate content URI, MIME, byte length and decoded dimensions before recognition.
OCR is a source of candidate text, not proof of a place. Preserve the screenshot
and source when recognition fails, and require user review before saving.

## Planning and exploring

Manual planning and a deterministic draft builder must work without a key. A
configurable AI provider may receive only explicit selected travel inputs after
Firebase ID-token and current-pair authorization. No Health, Cycle, comfort mood,
profile history or unrelated memories enter that request. Unknown travel times,
opening hours, prices, availability and weather remain unknown, never fabricated.

Nearby places, routing, verified hours and weather require actual configured
providers. Each response must include provenance and, for weather, its source
observation timestamp. Missing setup needs an honest unavailable state and manual
alternatives. All proposed itinerary changes require Preview → Apply/Discard;
undo must use current revisions rather than overwriting a partner's newer edits.

Accommodation initially consists of notes and reviewed external reservation or
booking links. A future booking-provider integration requires a separate contract,
price/availability verification and checkout scope; there is no in-app checkout.

## Photo storage on the existing free Firebase project

The current app stores bounded compressed JPEGs in Firestore. Travel can reuse
this mechanism with private/pair-specific `travelPhotos` documents. The source
adds restricted Storage rules for a future configured bucket as well; rules alone
do not create a bucket or remove Firebase's Storage billing requirements. Do not
claim Storage uploads are active on Spark. Full-resolution originals remain on
the phone unless an actual permitted storage provider is configured.

## Implementation status

These are reviewed provider decisions, not a declaration that maps, OCR, AI,
weather or nearby search have already shipped. See TRAVEL_IMPLEMENTATION.md and
the actual release evidence before reporting any provider as working.
