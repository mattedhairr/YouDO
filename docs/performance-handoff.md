# Batch 9: performance and handoff

Candidate: v7.5.15 / Android versionCode 56. Public release is deferred.
Batch 10 starts only after this candidate's remaining gates pass and Batch 9 merges.

## Reproduce locally

Use Node 22 (CI) or 24, then `npm ci`. Run `npm test`, `npm run test:sql`,
`npm run typecheck`, `npm run lint`, `npm run build`, and `npm run verify:build`.
The SQL suites run in disposable PGlite databases, without network credentials.
The locked PGlite dependency replaces the former undocumented cache installation.
APK CI now runs those suites and verifies version consistency, initial bundle
budgets, and precaching of every generated JavaScript/CSS asset.

Run `npm run benchmark -- --outputJson .cache/performance.json` with other heavy
jobs stopped. The fixture has 5,510 goal nodes, 500 tasks, 5,000 sitting records,
and 1,834,580 JSON characters, below the 4 MiB cloud payload limit. No personal
workspace is loaded. Node timings are diagnostic; they are not phone timings.

## Measurements (2026-09-27, Windows, Node 24.19.0)

- Published-source baseline: initial JS 833.32 kB / 231.72 kB gzip; initial
  app CSS 119.61 kB / 21.83 kB gzip.
- Candidate before the version-only rebuild: initial JS 635.25 kB / 181.38 kB
  gzip; app CSS 71.82 kB / 14.63 kB gzip. Initial JS is about 24% smaller,
  compressed JS about 22% smaller, and initial CSS about 40% smaller.
- Total precache is approximately 1,016 KiB versus 1,010 KiB previously: this
  defers parsing/loading of screens; it does not reduce the full offline install.
- Original benchmark means: cold tree rollup + last-node search 0.63 ms,
  selected Calendar day 1.89 ms, all daily focus totals 2.23 ms, backup
  validation 12.26 ms, fingerprint 20.77 ms. After the tooling change, the same
  unchanged algorithms measured 0.99 / 2.70 / 3.13 / 15.75 / 31.20 ms. Harness
  and host scheduling differ; do not call this a product speedup or regression.
- A trial two-word fingerprint implementation measured 24.77 ms versus 20.77 ms
  for the original. It was removed. Existing hash compatibility and sync rules
  are unchanged. No speculative tree/history rewrite was retained.
- Build times taken alongside other checks are not startup measurements.
  Cold mobile launch timing remains part of the physical candidate check.

## Offline behavior

Goals, Calendar, Board and Blueprint Studio now have deferred chunks. Today,
session controls and workspace/auth ownership remain eager. Android packages
all chunks in the APK; the web worker precaches them.

The first offline test exposed a missing first-page service-worker claim:
an unopened Calendar chunk failed after the preview server was stopped.
The worker now claims clients after precaching; registration also handles an
already-loaded document. A fresh origin at 127.0.0.1:5180 then opened Calendar,
Board's shell, Goals and Studio for the first time with its server stopped,
and reloaded successfully from cache. This proves cached asset availability,
not live Board access without internet. The test used an empty disposable
offline workspace. Physical Android install-over remains pending.

## Dependency review

The initial npm audit reported 25 advisories (1 critical, 12 high, 9 moderate,
3 low). Compatible fixes plus selected patched Vite 6.4.3, Vitest 4.1.11,
React plugin 4.7.0, ESLint 9.39.5 and compatible TypeScript ESLint packages
leave 3 moderate reports and no high/critical findings. `npm audit --omit=dev`
reports zero vulnerabilities. These results are a dated registry check,
not a guarantee against future advisories.

The remaining reports are one chain: Capacitor CLI → xcode → uuid, advisory
GHSA-w5hq-g745-h8pq. The installed xcode code calls `uuid.v4()` without an output
buffer; the advisory concerns v3/v5/v6 buffer bounds. This is development-time
iOS project tooling, not shipped Android/web runtime. Keep the matching
Capacitor 8.5 toolchain; do not accept npm's suggested CLI downgrade merely to
remove the warning. Recheck when upstream xcode/Capacitor supplies a compatible
fix. Vite/Vitest major changes are covered by the full app/build gates.

## Supabase Advisor decisions

Live dashboard: Security 0 errors, 46 warnings, 9 informational suggestions;
Performance 0 errors, 0 warnings, 20 informational suggestions.

- SECURITY DEFINER warnings describe deliberately exposed RPCs. The live
  catalog query found only `active_app_quotes()` anonymously callable, with an
  empty fixed search path; no elevated function lacked settings. Quotes are
  intentionally available before sign-in. Signed-in RPCs enforce account,
  membership or staff checks internally. New combined SQL contract checks
  protect anonymous exposure, private-table grants, pinned search paths and
  staff-only operations, alongside the existing behavioral SQL suites.
- The nine tables flagged for RLS without policies are RPC-only tables. Keep
  RLS enabled and direct grants revoked. Adding permissive policies would
  weaken access controls. Live catalog verification confirmed RLS=true and no
  anon/authenticated SELECT, INSERT, UPDATE or DELETE grants on all nine;
  authenticated also has no CREATE privilege in public. See
  `supabase/operations/inspect_advisors.sql` for
  repeatable read-only catalog checks.
- Leaked-password protection is disabled and the dashboard states it requires
  the Pro plan or above. No paid upgrade was made. Secure email change remains
  enabled. No authentication settings were changed in this batch.
- Fifteen suggestions concern foreign-key indices; five mark unused indices.
  Read-only live statistics show small tables (for example 20 quotes, 21 kudos,
  22 audit records, 3 memberships, 2 hashtag requests, 145 focus records).
  There is no measured slow query supporting new indices or removal of existing
  ones. Existing uniqueness, recent-message, expiry and Board indices remain.
  Recheck growth and EXPLAIN plans before changing them; zero recorded index
  scans on tiny tables is not proof an index is unnecessary.
- No SQL migration or grant change is proposed from these findings. The
  declined legacy Board bridge stays unapplied.

## Email templates and gate results

The source includes the original single-card verification, recovery and email
change templates from 827eaa9. The reverted 627d2cc logo refinement is excluded.
Those original templates were restored in Supabase before Batch 9. Do not append
HTML in its editor: replace the entire value and verify the saved preview.

Sept 27 candidate verification:

- Hosted disposable B opened v7.5.15 with Cloud live and its existing control
  task retained. Calendar, Goals, Blueprint Studio and live Board opened.
- User confirmed all five phone checks passed: deferred views opened offline,
  a short disposable sitting was saved, Calendar showed it, and after reconnect
  and Sync now the sitting appeared on Board. B enabled Board participation for
  this test. This is a user-reported physical result, not automated evidence.
- Signed candidate commit `d48fdeb`, workflow #207 succeeded:
  https://github.com/mattedhairr/YouDO/actions/runs/36313655442
  APK SHA256: `f1cd206e3bba1bf38c343937f4c31aa19f40620bf068f005b772b62e081f8aa3`.
  Permanent signer SHA256:
  `12c3ac6ccaa7850986223bbbbebedc860afdf8a44a9bbde542adfb5cc6dafb38`.

The user confirmed the install-over check on Sept 27: v7.5.15, retained B task,
and installation without uninstalling or clearing app data. The user also
reported a fresh password-reset email worked properly. Fresh signup confirmation
and email-change delivery checks were **waived by the user, not passed**, on
Sept 27. No additional account or credential changes were made for those flows.

Local final checks passed after a clean `npm ci`: typecheck, lint, all 415 tests,
all seven SQL suites, production build and build verification. Final initial
JS: 635,254 bytes / 181,375 gzip bytes. The first clean install attempt was
blocked by Windows holding the preview's esbuild executable open; stopping
that preview allowed the clean install to complete normally.

Batch 6's extended physical Discard retest remains **waived, not passed**.
Batch 10 will carry the prepared scrolling release-note fix and separate
General/hashtag rooms. This batch does not publish those features.
