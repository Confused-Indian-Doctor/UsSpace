# Travel extension audit — 25 October 2026

## Recovery and environment

The previous workspace did not persist. Drive recovery ZIP SHA-256
`1cf19644628063d5a241b7259c09d0d901b0b919a7d14884d0480f96d369e554`
and all internal SHA256SUMS passed. RESTORE.py restored 261 exact source files,
full available Git history and a clean travel-recovered branch at
`1f72e60158f07fe254bdb0a9db9cf9bd9efb09e3`, without overwrites. Original
recovery documents remain in `/workspace/usspace-recovery/usspace-recovery-2026-10-25T060824Z/`.
No AGENTS.md was found in the workspace or restored repository. GitHub connector
read main and recent commits at that same HEAD; open PRs were empty. Terminal
HTTPS failed to connect to configured proxy:8080. Connected Drive/GitHub reads work.
No configured secret bindings or outbound identities were reported. Gradle,
Android SDK/adb/emulator and approved signing availability are not established.
JDK compiler module exists although javac executable is absent; Node and ffmpeg
are present. No build/sign/publish helper from the recovery support was executed.

## Existing implementation and gaps before edits

| Area | Existing path / behavior | Gap |
| --- | --- | --- |
| Android share | MainActivity cold/warm receiver, TravelImportBridge bounded SharedPreferences inbox, ownership/sign-in handling | Persisted raw text/image, but edited review and pasted web text did not persist |
| OCR | MIME/magic/12 MB/40 MP validation, bundled Latin OCR, resume pending images | No video; OCR lines treated as selected ideas without recommendation evidence |
| Extraction | travel-models.extract URLs or first text line; travel.js screenshot line splitting | Multiple caption recommendations, categories, evidence and mention distinction missing |
| Metadata | travel-fetch pinned public DNS, restricted social hosts, bounded redirects/HTML; authenticated import endpoint | Review used title only; descriptions not retained as supporting evidence |
| Place search | Existing Geoapify backend adapter, server key, explicit user confirmation | Not connected to individual import candidates/context |
| Map | Bundled Leaflet, optional attributed tiles, confirmed pins only, list/details | No category/search filters, adjustable saved panel or collection planning entry |
| Collections | Scoped private/shared records and explicit selection | New category Stays needs additive travel-only rules update; old non-travel categories preserved |
| Trips | Existing picker, day timeline, move/reorder/remove, preview/apply/discard/undo, revision conflicts, deterministic/optional AI | Reuse these flows; collection planning must never mutate accepted trips |
| Security | Owner/current-pair rules, user reactions, scope generation, offline cache cleanup, provider quotas and travel-only AI projection | Keep these boundaries; verify new async result and restored review handling |
| Video | No import/processing/upload path | Must add bounded adapters and explicit consent before any external transmission; no proof of live Instagram processing |

## Release boundary

Keep the approved v0.17.0/code 19:
https://github.com/Confused-Indian-Doctor/UsSpace/releases/download/v0.17.0/UsSpace-v0.17.0.apk
SHA-256 `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.
Prior runtime results apply to those exact bytes, not these edits. No release
replacement, deployment or publication is authorized by this work.

## Verification plan

Run existing source suites plus behavioral import/map cases. Compile pure Java
policies with the available compiler module. Separate Firebase emulator, Android
compilation, original-key signing, upgrade and runtime results; do not promote
source tests to device evidence. Production live providers require real setup;
fixture responses test contracts only. Native resume/sign-in/permissions/media
and draggable WebView behavior require Android runtime evidence before release.
