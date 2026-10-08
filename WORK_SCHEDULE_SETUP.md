# Work Schedule: Microsoft Graph setup

UsSpace v0.14 continues the existing Android app. The Work Schedule page reads the existing SharePoint-hosted `.xlsx` rota through Microsoft Graph and displays only the configured person's shifts. It does not embed the SharePoint website or an Excel web app. There are no sample shifts presented as real work data.

## What needs setting up once

Al's invited account already has workbook read access. That invitation identifies a reader; it does not register UsSpace as a Microsoft OAuth client. Before live Microsoft sign-in works, create a **public-client Microsoft Entra app registration** and enter its application/client ID in **Life → Work Schedule → Set up Microsoft**. After Google sign-in, paste the existing Excel sharing link provided in the conversation into the private connection settings on Al's phone. The public source and APK have an empty workbook-link default; the actual invitation link is not included in either.

1. Open [Microsoft Entra App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade). Create a registration named **UsSpace Android** in a directory where you can register applications. If your account cannot create a registration, ask a directory administrator to register it; you do not need to supply UsSpace with an administrator password.
2. For a registration outside the workbook's hospital tenant, choose **Accounts in any organizational directory and personal Microsoft accounts**. A hospital-managed registration can instead use its tenant ID and the account types that its administrator allows.
3. Open **Authentication → Add a platform → Mobile and desktop applications**. Add this exact custom redirect URI:

   ```text
   app.usspace.couple.v012://oauth2redirect
   ```

4. Under advanced authentication settings, set **Allow public client flows** to **Yes**. Do not create a client secret or select a Web platform. This APK is a public client and uses authorization-code PKCE.
5. Under **API permissions → Microsoft Graph → Delegated permissions**, add **Files.Read.All** and **User.Read**. The sign-in flow also requests `openid`, `profile`, and `offline_access` to identify the connection and refresh its access on this phone. The app never requests `Files.ReadWrite`, application permissions, or tenant-wide background credentials.
6. Copy **Application (client) ID** into UsSpace. Set Microsoft tenant to **common** for the multi-tenant/personal-account registration. If the SharePoint guest identity must authenticate in the hospital directory, use the hospital's tenant GUID or `…onmicrosoft.com` tenant domain instead. Use **organizations** for a registration restricted to organizational identities.
7. Paste the existing workbook sharing link on Al's phone, choose the worksheet, enter Al's name exactly as the rota writes it, and keep timezone **Europe/London**. Save the settings, press **Connect Microsoft**, and sign in with the invited account. Then press **Refresh rota**. The link is stored only in that signed-in account's encrypted native settings, never in Firestore or source control.

Workbook access and application consent are separate. SharePoint guest/one-time-email-code invitations, hospital conditional-access policy, and administrator-consent restrictions may require the workbook tenant's administrator to allow this public client. UsSpace cannot grant that access itself. Sign-in failures leave existing Firebase pairing and Google Sign-In unchanged.

## Excel source and column mapping

The existing source is an ordinary SharePoint Excel sharing link. Paste it once into private setup on the phone; no source link is preloaded. UsSpace resolves the supplied link with the Graph `u!` base64url sharing token, obtains the drive/item IDs, and reads the selected worksheet's used range. An optional **Graph source override** accepts a drive ID and item ID for that same workbook when a tenant cannot resolve its sharing link. Both fields must be supplied together; no token or sharing secret should be pasted into them. Test fixtures use only synthetic `example.sharepoint.com` links.

Automatic header recognition supports date/person tables, dates across columns with a row for Al, people across columns with a date row, and week-commencing date headings. The parser understands British dates, ISO dates, Excel serial dates, numeric clock fractions, and written ranges such as `08:00–17:00`. Unknown labels such as `Day`, `Nights`, or `Off` retain their text without invented working hours.

If the first read cannot identify Al, use **Column mapping (optional)**. Numbers are ordinary Excel column positions: **A = 1, B = 2**, up to 120; leave a field blank for automatic detection. Map date, person, start time, end time, location, tutorial room, simulation, and shift label as needed. Do not map a coworker's column as Al's. Ambiguous matching names return no shifts and ask for the exact full name.

Some Microsoft tenants require write permissions for Excel's workbook APIs even for GET requests. UsSpace keeps its read-only permissions and falls back to downloading the `.xlsx` file through Graph's read-only content endpoint, then reading it natively in memory. Workbook parsing honors Excel's 1900/1904 date system. A Microsoft bearer token is sent only to `graph.microsoft.com`, never to a SharePoint download redirect.

Reads are bounded to a 15 MB workbook, 30 MB expanded XML, 5,000 rows, 120 columns, 2,000 characters per cell, and 730 own shifts. ZIP traversal, external XML entities, DTDs, and unreasonable ranges are rejected. A stale cached rota is labelled as cached; refresh and check the original rota when an important shift has changed.

## Privacy and the optional partner summary

- Microsoft tokens, private connection settings, pending PKCE state, and Al's own cached shifts are AES-GCM encrypted with Android Keystore and scoped to the current Firebase UID. They are never copied to JavaScript storage, Firestore, notifications, source-control secrets, or logs. Signing out of Google or changing the Firebase account destroys that account's local Microsoft connection and cached rota.
- Coworker rows are filtered out natively before any schedule data reaches the display. Location, tutorial room, simulation, workbook link, and full rota are never included in the partner summary.
- **Share today's shift times is off by default.** After pairing and reading a complete current-day shift, Al can explicitly turn it on. The shared document contains only the owner UID, current couple ID, date, start/end time, timezone, enabled flag, and server update timestamp.
- The partner may see “Kuttu starts at 08:00” or “Kuttu is working until 17:00.” Shared summaries are used only for the current paired space and current date. A change may create a generic optional calendar-category push; its payload contains no shift time, workplace, or rota details.
- Turning sharing off deletes the cloud summary. If offline, the app clearly reports that removal is waiting for a connection. Microsoft disconnect and private-cache clearing also remove the summary. Changing paired spaces requires a new sharing choice.
- Health and Cycle remain private by default. Work Schedule does not enable or read either sharing preference.

## Validation included in the build

The project retains all earlier tests. New pure Java tests exercise own-person selection, ambiguous identities, table and week layouts, both Excel date systems, clock fractions, native XLSX decoding, bounded/unsafe workbook rejection, OAuth callback binding, and exact summary projection. New JavaScript tests cover account/couple isolation, today/weekly views, honest unconnected states, setup validation, quiet summary wording, explicit privacy toggles, and read-only setup instructions while signed out.

Emulator checks verify the real APK opens the Work Schedule page and shows the honest setup state. Live access to this hospital workbook must be verified on Al's phone after the public-client registration and any tenant consent are in place; the build does not claim to have authenticated an unregistered app or read the hospital's private workbook.
