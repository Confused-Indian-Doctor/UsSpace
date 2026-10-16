# Hosted backend dependencies

Explicit project dependencies required for the server-only travel/push adapters:

- `firebase-admin@13.4.0`
- `@google-cloud/firestore@7.11.0`

Import Firestore and FieldValue directly from `@google-cloud/firestore` in the
host wrapper. Depending solely on firebase-admin's optional Firestore dependency
left its internal `build/src/path` module absent from this host's deployed bundle.
The explicit dependency and static import were verified with a clean typecheck,
working Firebase permission probes, and HTTP 401 responses for unauthenticated
travel requests. Other generated policy/model helpers are copied from the tested
Node/browser sources by the repository's preparation scripts.

No AI, geocoding or signing secrets belong in these files. See
`../../docs/TRAVEL_PROVIDERS.md` and `../../docs/V017_SETUP.md`.
