# Working on YouDO (for people and AI coding tools)

Start with [HANDOFF.md](HANDOFF.md), which says where the work stands. Releases follow [RELEASE_PROCEDURE.md](RELEASE_PROCEDURE.md) step by step.

## How the owner likes to work

1. **Plan first.** Explain the plan and get a clear yes before changing the repo, GitHub or the server. Read-only checks are fine.
2. **Mock first for design.** For any visual change, show a static mock (an HTML page rendered to a phone-width image) and wait for approval before building it.
3. **Fix only what is reported.** One reported flaw gets one fix. The owner's existing design choices are intentional; ask in one line before touching anything else.
4. **Commit only on green.** Typecheck, lint and tests must all exit 0, judged by exit codes, never by grepping output. See the gates in RELEASE_PROCEDURE.md.
5. **Commit or push only when asked.** Never push unfinished work to `main`: every push to `main` builds an APK and deploys the website.
6. **Keep the CI triggers as they are.** Don't add other branches to `build-apk.yml`'s push triggers; test APKs of other branches are run by hand from the Actions tab.
7. **Version at the end.** Call planned work "the next release". Pick the number only once the work is done.
8. **Test once.** The owner tests on the phone once, just before a release. Keep a running list of on-device checks instead of asking after every change.
9. **Supabase one step at a time.**
   - `supabase/*.sql` files are the source of truth and must be safe to re-run.
   - Run them in the SQL Editor without saving them as saved queries.
   - Use `npx.cmd` on Windows PowerShell.
   - Set JSON secrets through the dashboard.
   - Confirm each production step before the next.
10. **No passwords.** Never type passwords or secrets; the owner signs in themselves. Ask before downloading files.
11. **Fictional data only.** Screenshots and test data must be made up, never real users or real numbers.
12. **The owner posts announcements.** Telegram posts are written by the owner; only offer a draft when asked.
13. **Be brief.** Short answers and no unnecessary work.

## Project conventions

- Logic goes in `src/lib/` as pure functions with Vitest tests beside them (`*.test.ts`).
- UI must work in both looks: the default Liquid Glass look and the **Classic Look** (`legacyStyle`, `src/legacy/`).
- UI must also work in light and dark mode and at phone width.
- Colours come from theme tokens (`--primary` and friends), so everything follows the user's accent colour.
- Animations respect `prefers-reduced-motion`.
- First-screen JavaScript has a gzip budget (`npm run verify:build`). Lazy-load anything new that is not needed at startup.
- Android-native code (widgets, updater, focus sounds, notifications) is Java in `android/app/src/main/java/com/mattedhairr/youdo/`. It cannot be compiled locally, so CI is its first compile.
- Commit messages: `type(area): summary`, for example `fix(widgets): …`, `feat(hub): …`, `chore(release): vX.Y.Z — …`.
