# Board loading and update delivery

Released as part of v7.6.0. The v7.5.17 / Android versionCode 58 candidate
results below are historical. The latest public release is v7.6.1, which keeps
the updater and Board fixes. Physical updater checks remain pending, not passed
or waived.

## Behavior

- Board reads rankings immediately, in parallel with private backup sync and
  Community context. A second read follows synchronization. Cancelled views
  ignore results; a failed synchronization retains the first ranking. Excluded
  sitting explanations are collapsed under **Focus sync details**.
- Android update metadata comes from the existing latest GitHub Release check.
  An APK requires an official repository download URL and GitHub SHA-256 digest.
  The native plugin checks the bytes, package ID, version name, newer versionCode
  and the installed signing certificate before showing Android's installer.
  Downloads are restricted to HTTPS GitHub/release-asset hosts and 100 MiB.
  Android's source permission and installation confirmation remain user actions.
  Missing asset metadata or an older shell falls back to the release page.
- Website workers explicitly skip waiting and claim clients. The app checks
  on startup, returning to the page, reconnecting, and hourly; Settings also
  offers a check. Activation offers **Refresh app**, without automatic reload.
  Refresh preserves localStorage, IndexedDB, cookies and sign-in. Active
  sittings and device-save errors block restart actions in the app.
- Vercel revalidates entry HTML and serves the worker without cache reuse.
  The production build check rejects waiting-message-only workers because
  manual registration does not send that message. This was reproduced locally:
  repeated reloads kept v7.5.16 while the server already served v7.5.17.

## Verification checkpoint

- 428 application tests passed, including slow-sync ranking ordering, cancellation,
  update asset validation, download failure/retry, permission flow, and worker
  activation without automatic reload or clearing storage.
- Type checking, lint and production build passed. Asset/version/worker checks
  passed; initial JavaScript is 639,939 bytes / 183,064 gzip.
- No SQL was changed or applied for this work.
- Browser verification: the existing disposable B preview advanced from v7.5.16
  to v7.5.17 by normal reloads after correcting worker activation; sign-in and
  Cloud live state remained. A temporary comment in the built worker simulated
  another deployment: Settings offered Refresh app and the update notice appeared.
  Its Refresh app action was exercised without clearing site data. The temporary
  built artifact was then regenerated from unchanged source.
- After Refresh app, B's existing **Batch 7 control B survives deletion** task
  remained in Backlog. A warm Board navigation showed B's ranking in 2,084 ms
  measured from the automation click to the visible row. This includes automation
  overhead and is one browser observation, not a phone/network performance guarantee.
- Signed candidate workflow **#210** passed at `28883de`, including application,
  SQL, web-build, Android compilation, signature and release-identity gates:
  https://github.com/mattedhairr/YouDO/actions/runs/36332583677
  Artifact **YouDO-APK**, archive SHA-256:
  `7f18ba62a4fedb28cf40da6dcdacdb2ae14763388de11133e482612527701e89`.
- Physical Android install-over/updater checks are still pending. Automated tests
  and a signed build are not a physical pass.

## Outstanding physical checks after release

1. Verify v7.6.1 installation over the existing app with disposable B; retain
   its task, Calendar history and login.
2. Test download failure/retry, Android permission denial/allow, cancellation of
   the installer, and successful installation of v7.6.1 from an older signed
   build. An installed app cannot install itself or downgrade.
3. Confirm Board response on the phone and repeat Batch 10's outstanding room
   and release-note touch checks. Keep earlier waived checks recorded as waived.
4. The Blueprint Studio change and consistent release identity were completed
   for v7.6.0; v7.6.1 subsequently corrected the form examples. Neither release
   turns the unreported physical checks above into passes.

Users on an older shell need one normal APK installation to gain the in-app
installer. Later official updates can use the new flow. A sideloaded Android app
cannot silently install an update; the system asks for confirmation.
