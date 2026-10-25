# UsSpace v0.17 screenshots

Captured from the actual original-key signed release APK on Android 35 in
[run 40144079908](https://github.com/Confused-Indian-Doctor/UsSpace/actions/runs/40144079908).
The accounts, saved places and notes are demo fixtures. They are not personal
production data or results from an unconfigured place-search/AI provider.

APK SHA-256: `d30475c2891236ff6073f3b668fc26acf7d1052735afb4f6bf47aa2078e07a59`.

| Screen | Screenshot | Appearance |
| --- | --- | --- |
| Dreams and independent interest choices | [Dreams](Dreams.png) | Light |
| Private import review | [Import review](Import-review.png) | Dark |
| Saved confirmed place with online OSM map and attribution | [Map](Map.png) | Dark |
| Numbered stop and editable day timeline | [Trip timeline](Trip-timeline.png) | Dark |
| Completed experience | [Memories](Memories.png) | Dark |
| Proposed change awaiting acceptance | [Draft preview](Itinerary-preview.png) | Dark |

The Android test measured actual screenshot pixels within accessible panel
bounds to catch light backgrounds left behind in Dark mode:

| Panel | Mean luminance (0–255) | Evidence |
| --- | --- | --- |
| Unselected travel tab | 52.653 | [Tabs](Dark-Tabs.png) |
| Map caption | 50.825 | [Map caption](Dark-Map-caption.png) |
| Draft preview copy | 97.209 | [Draft panel](Dark-Draft-preview.png) |

All passed the dark-background threshold of 130. This is a targeted regression
check, not a claim of a complete accessibility certification.

See the [verification report](../../V017_VERIFICATION.md) and
[provider setup](../../TRAVEL_PROVIDERS.md).
