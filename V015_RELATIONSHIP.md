# UsSpace v0.15 — Together for

This version extends the working v0.14 app. Package name and original signing certificate stay unchanged; install the APK over the existing app on both phones.

The first Home card counts complete local calendar days since **25 March 2023** (the starting day is day zero). It refreshes at local midnight, when the app returns to the foreground, and after a device date/time-zone change. Years and months use calendar anchors rather than dividing days by 365 or 30. A 29 February start celebrates its anniversary on 28 February in a non-leap year; month-end anchors clamp short months without drifting later months.

Tap the card to see actual anniversaries, saved Memories, Trip calendar entries, and completed Bucket List moments. Edit the date in **Settings → Relationship** using **DD/MM/YYYY**, then choose **Save relationship date**. Future dates show zero elapsed days and “Starts soon”. System, Light and Dark use the existing per-account Appearance preference.

## Enable the shared relationship date

Publish this repository's complete [firestore.rules](firestore.rules) in **Firebase Console → UsSpace (`usspace-c859e`) → Firestore Database → Rules → Publish**. The new additive rule allows only the current two-account pair to read/update `/couples/{coupleId}/relationship/profile` with `startDate`, the authenticated `updatedBy`, and a server timestamp. Existing Health, Cycle, private goals, moods and letter-draft protections remain in place.

The app shows a rules/connectivity message instead of claiming cloud success when these new rules have not been published. Publishing rules does not create or overwrite the date: only an explicit date Save writes the profile. Once both accounts are paired, either partner can save the date and both receive the realtime update. Guest and unpaired dates are local and are never silently copied into an existing pair. Pending saves remain scoped to their original account/couple. On a fully offline restart, shared cache is shown after membership is server-confirmed, avoiding disclosure from a stale pairing; locally saved guest/unpaired dates remain available immediately.

## Android Back

Android closes the keyboard/system picker first. The app then closes one visible modal or one meaningful nested editor/page. At section level Back returns Home; Back from Home finishes the Activity normally. The app uses an explicit section router and Android 13+ Back callbacks, with a legacy Android fallback.

## Verification

Release validation includes the existing Firebase/privacy/learning/comfort/letters/plans/notifications/rota suites, new calendar and navigation tests, authenticated Firestore relationship tests, Gradle release compilation, original-certificate verification, and actual Android 35 installation/UI interaction. Emulator evidence covers counter/date edit/restart/restore, anniversary and day milestones, Appearance, all major routes, nested/modal Back, and Home exit/relaunch. Personal Google accounts and their live pairing are not signed in by CI; authenticated Firestore emulator tests validate the shared relationship profile with the same production rules.

The existing notification server and Microsoft Graph setup remain separate v0.14 deployment prerequisites. This update does not activate those services.
