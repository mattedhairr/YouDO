# v7.3.0 release review

Release candidate: **v7.3.0 / versionCode 39**, based on the published
**v7.2.1 / versionCode 38** release. Package metadata, lockfile metadata,
the in-app version, Android versionName, and the changelog agree. The package
ID and permanent signing identity are unchanged, so the APK installs over
v7.2.1 without uninstalling or clearing device data.

## Verified for this candidate

- 291 automated tests, TypeScript checking, ESLint, and the Vite production
  build pass.
- The isolated Community Chat, baseline Community, and account-session SQL
  suites pass.
- The owner reported successful installation of the current Community SQL and
  reusable staff-role operation in the hosted Supabase project.
- The signed Android candidate installs over the previous release and the
  owner confirmed the Community flows on the target phone.
- At 390 × 844 and 320 × 640 preview sizes, the Community unread badge does
  not shift the Board control. The compact broadcast event remains readable in
  both collapsed and expanded states.
- Broadcasts retain their own cross-device read cursor even though they now
  appear inside Chat. Opening Board alone does not mark Chat or a broadcast as
  read.
- The public owner identity remains **Admin**. The private owner role alone can
  appoint or remove other admins.

## Before publishing

1. Merge the complete `codex/community-essentials` branch, including the final
   Community UI correction.
2. Build from the merged commit with **Build Android APK**. Confirm the workflow
   reports versionName **7.3.0**, versionCode **39**, and the pinned signing
   certificate.
3. Install that exact artifact over v7.2.1 without uninstalling. Recheck the
   Board badge, compact broadcast event, message send/retry, reply, recent
   edit/delete, reporting, and admin removal.
4. Publish tag and GitHub Release **v7.3.0** only after the merged artifact
   passes. Attach the verified APK; a branch commit or workflow artifact alone
   is not a release.

No additional Supabase run is required for the final unread-layout and guidance
copy corrections. Existing non-blocking build advisories remain: the main Vite
bundle exceeds 500 kB and Capacitor App is imported both statically and
dynamically. CI action-runtime deprecation notices do not alter the APK, but
their action majors should be upgraded in a separate verified maintenance
batch.
