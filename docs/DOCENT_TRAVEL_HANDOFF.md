# Docent-inspired travel continuation — 25 October 2026

## State and release

Branch: `travel-docent-review`. Recovered base:
`1f72e60158f07fe254bdb0a9db9cf9bd9efb09e3`. Phase A audit commit:
`498fa8a`. The implementation commit is the next commit on this branch.
For the exact final full commit, working tree and artifact hashes, read
`/workspace/USSPACE_DOCENT_CHECKPOINT.json`, written after the final commit.
Repository: `/workspace/usspace`. Recovery files and safe support were restored
into separate directories; original assets/history were preserved.

**Keep the current original-key release**:
https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk
APK SHA-256: `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.
Version/package/signing configuration are unchanged. No replacement APK was
built, signed, installed, published or deployed. No push or remote mutation.
Never substitute a key. Signing secrets remain excluded; none of the five
expected signing variable names has a nonempty value in this environment.

## Implemented, with evidence limits

- B: Existing travel-models extractor conservatively splits bounded caption/OCR
  lines and explicit recommendation wording, preserving each source URL and
  excerpt. Mentions remain labelled and initially unselected. Private review
  groups Places / Restaurants / Stays; title, category, context and inclusion
  are editable. Extra candidates can be added. Caption re-extraction appends
  candidates for review without overwriting corrected candidates. No AI parsing.
- Duplicate warnings check source/place identities, exact normalized names with
  matching context and repeated candidates within a batch. Separate saves need
  an explicit checkbox; nothing is merged/deleted. Candidate matching is
  conservative, not a semantic guarantee of extracting every place in a video.
- Native inbox now also persists pasted text and edited reviews. Drafts are
  account scoped; restored shared selection is accepted only for the same current
  live pair. Transient provider match arrays are excluded from persisted drafts.
  Identical native shares report an existing/recent import instead of silent
  suppression. Discard keeps using native acknowledgement and cleanup.
- Public HTML descriptions and available author attribution are retained as
  source evidence. Instagram and other restricted social hosts remain blocked;
  keep links and use pasted captions/screenshots/manual entry. No scraping bypass.
- C: Per-candidate place search uses the existing authenticated Geoapify route,
  adding title + city/country context. Matches require explicit selection. Edited
  names/context, replaced review and account changes reject stale async results.
  Unresolved records retain null verifiedPlace and are usable without pins.
- Map above an adjustable saved-items panel; pointer, keyboard and toggle resize;
  search and All/Places/Restaurants/Stays filters; item counts, collection title,
  privacy per record, notes/photos/source links and existing add-to-trip controls.
  Marker/list selection is connected and list selection centers confirmed pins.
  Loading/empty/tile-failure/manual states remain. Uses existing theme tokens.
- E: Plan a trip opens the existing unsaved trip editor; existing saved-item
  picker and Preview/Apply/Discard/Undo/revision-conflict flows are retained.
  It does not bulk-plan the selected collection automatically. User chooses the
  records in the existing planner. Private/shared scopes remain explicit.
- D groundwork: ACTION_SEND local MP4 text extraction in the existing native
  inbox. 20 MB, 120 seconds, <=2,073,600 pixels, <=1920 per side; MP4 signature,
  native metadata validation, at most 12 keyframe samples, local Latin OCR.
  Reports sampled/partial text and no audio transcription. Raw media is private
  internal storage, resumes from inbox after process loss, is deleted on discard
  or processing completion; orphan files older than one hour are cleaned at
  startup. No remote video fetch or external upload. **Syntax/policy verified
  only; codec/OCR/persistence/permission behavior needs Android runtime evidence.**
- Optional backend transcription adapter in existing travel-providers. Accepts
  bounded decoded mono PCM WAV only, verifies signature/chunks/duration from
  bytes, requires exact explicit consent, uses fixed OpenAI HTTPS endpoint,
  disallows redirects, supports abort/timeout, quota hook, bounded output and
  unverified transcript provenance. Does not retain media. **Contract only:
  no key, Android consent/upload/audio-decoding transport or deployed endpoint.**

## Verification performed here

- Recovery ZIP and internal manifests passed; full Git restored, 261 file
  hashes/modes verified, fsck passed, clean initial branch matched GitHub main.
- 37 JavaScript/Node source suite runners passed. Initial new map fixture lacked
  a standard DOM dataset property; corrected the fixture, then all seven map
  tests passed. Original assertions were not removed or weakened.
- New import review suite: 12 behavioral cases, covering multi-place captions,
  mentions, category/context edits, explicit match selection, malformed/provider
  outage fallback, stale callbacks/account switches, duplicate confirmation,
  durable draft contract, current-pair restore and untrusted media/text.
- Transcription adapter: four contract tests covering byte bounds, missing setup,
  consent, cancellation, quotas, malformed responses and minimal fixed-host sends.
  Test responses are fixtures, not proof of real transcription/Instagram access.
- Native policies: existing 37 import + 20 queue assertions and 11 video bounds
  passed using the JDK 21 compiler module with `-source 17 -target 17`.
  `--release 17` is unavailable (ct.sym missing), so no Java 17 API compatibility
  claim. Changed native files passed compiler-API syntax parsing; no Android
  symbol/type checking. Existing Android Java compilation has NOT been run.
- Generated browser/Node/Floot copies match (`prepare-travel-server.py --check`).
  Git whitespace checks passed. Detailed source logs in `artifacts/docent-*`.

## Not verified / blocked / incomplete

- Current environment: configured proxy:8080 is unreachable. Connected GitHub
  and Drive reads work; no managed secret bindings. Missing Android SDK, Gradle,
  adb/emulator/device and approved signing material. Firebase test packages and
  emulator dependencies are absent and cannot currently be downloaded. No new
  Firebase emulator, Android build/sign/upgrade/runtime result is claimed.
- Stays is an additive travel-only category in source rules. Rules are NOT
  deployed; currently deployed rules will reject this category until an
  authorized deployment. Legacy shared Bucket categories remain unchanged.
- Live place/routing credentials and live authenticated provider checks are
  unavailable. No actual Instagram content processing has been demonstrated.
- Transcription is not reachable from Android. Configure provider and implement
  bounded native audio decoding, provider-specific consent UI and authenticated
  upload/cancellation transport before advertising it. No media is sent now.
- Only user-provided local MP4 is accepted; lawful remote-video ingestion is not
  implemented. On-device sampled OCR is incomplete by design. Container metadata
  bounds do not prove all codec/parser failure paths are safe. Native decoding
  calls are not hard-isolated; test malformed/hostile media and consider isolated
  worker processing before release. Unsupported formats use caption/screenshots.
- Native MP4 external grant denial, cold/warm launches, restart during copying,
  resume, activity teardown/cancellation, account switches and disk cleanup need
  real emulator/device tests. Existing runtime automation must explicitly select
  plain-text mention candidates under the new review behavior.
- WebView pointer resize/focus behavior, light/dark pixels, screen reader and
  actual marker/list interactions are source-tested only. Collection bulk drafts
  are not added; existing explicit trip selection/planning is retained.
- Production two-phone Google login, FCM and Samsung/Watch checks retain all
  previous limitations from the recovery docs. No non-travel sections replaced.

## Next concrete steps

1. Restore working HTTPS proxy/build dependencies, full SDK 35/Gradle 8.11.1/JDK17
   and original signing identity through secure bindings, without reading secrets.
2. Run all Firebase demo emulator checks including the new Stays access test;
   compile Android. Resolve actual failures without weakening assertions.
3. Run native cold/warm/sign-in/restart and malicious/denied/local-video tests,
   plus existing offline retries/account/unpair/privacy and full regression runs.
   Verify cleanup/cancellation/decoder bounds and capture theme/accessibility UI.
4. Finish the optional audio decode + consent + upload integration against the
   adapter. Explain provider, payload and retention before sending. Run a real
   authorized provider check only after setup; label unavailable otherwise.
5. Verify deterministic drafts and accepted-itinerary preservation with reviewed
   imported items. Consider an explicit collection-to-draft picker using the
   existing planner, retaining Preview → Apply/Discard and revision checks.
6. A replacement release requires approved original-key signing, package/hash/
   certificate checks, same-APK upgrade install and real runtime gates. Keep
   v0.17.0 until then. Do not deploy/publish without authorization.
