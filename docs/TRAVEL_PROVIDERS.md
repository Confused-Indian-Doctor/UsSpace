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

## Optional backend configuration (new travel service)

The backend is deployed at `https://usspace-notify-cb2f5cbc.floot.app`. For a
replacement deployment, deploy the
`notification-server/floot/endpoints/usspace-travel` routes with their matching
helpers, or host `functions/src/travel-service.mjs` behind an HTTPS adapter with
Firebase Admin authentication. Android currently uses
`https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-travel/`.
The public capabilities endpoint must report protocol 1 and project
`usspace-c859e`, and must pass the real Firebase Admin permission probe. Do not
report ready from environment-variable presence alone.

Configure secrets through the hosting provider's secret manager, never GitHub
source, APK assets or chat:

- `USSPACE_FIREBASE_ADMIN_JSON`: complete Firebase Admin service-account
  JSON for `usspace-c859e` (the existing notification backend configuration).
- `USSPACE_TRAVEL_GEOAPIFY_KEY`: Geoapify server API key. Used for place search,
  nearby cafés and real walking/cycling/driving route estimates. Transit returns
  unavailable. Apply provider account quotas and key restrictions appropriate to
  your hosting egress; this key is never returned to the mobile app.
- `USSPACE_TRAVEL_WEATHER_ENABLED=false`: disable Open-Meteo requests. The
  personal, non-commercial backend enables the free weather adapter by default for an
  explicitly selected saved place. Check eligibility for its non-commercial free
  service or use an appropriate subscription before deployment. Weather is a
  timestamped forecast with source attribution, never a reservation guarantee.
- `USSPACE_TRAVEL_AI_PROVIDER=openai` or `gemini`,
  `USSPACE_TRAVEL_AI_KEY`, and `USSPACE_TRAVEL_AI_MODEL`: optional server-only AI
  configuration. Choose a currently supported model for the account. The adapter
  accepts only a validated ordering of selected place references. It cannot invent
  new places, prices or opening hours. Missing keys or malformed output leave the
  deterministic draft available.

The service enforces canonical pair membership, selected-record authorization,
revision checks, per-user daily and minute quotas, a project AI quota, and a
project-wide paid-provider budget (default 100 calls/day). These application limits
supplement the provider's own billing limits; they do not make paid APIs free.
Firestore quota documents are server-only. Re-check membership after external
calls so a revoked pairing cannot receive a late response.

Documentation checked for the implemented REST adapters:

- https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/
- https://apidocs.geoapify.com/docs/places/
- https://apidocs.geoapify.com/docs/routing/
- https://open-meteo.com/en/docs
- https://platform.openai.com/docs/api-reference/chat
- https://ai.google.dev/api/generate-content

Geoapify/OSM attribution accompanies results; weather attribution accompanies
forecasts. An explicitly chosen area result is labelled an area centre, rather
than presented as the exact location of a venue. The current deterministic mobile
planner groups by geographic proximity and labels travel times unknown; the
optional route endpoint is separate until route estimates are integrated into
reviewed drafts. No offline map-download feature is implemented.
