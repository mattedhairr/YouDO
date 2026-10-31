# YouDO Release Procedure

How a change goes from an idea to a published YouDO release, step by step, exactly as it was done for v8.3.0 and v8.3.1 (October 2026). It is written so that anyone, with any coding tool, can follow it.

> **Where things live**
> - Code and releases: https://github.com/mattedhairr/YouDO (owner `mattedhairr`)
> - Website (production): https://youdo-app.vercel.app, deployed by Vercel from `main`
> - Server: Supabase project ref `iyrnywfaxakvjkmddmqv`
> - Android APK: built by GitHub Actions (`.github/workflows/build-apk.yml`) and attached to each GitHub Release as `YouDO.apk`
> - Announcements: the YouDO Telegram channel (posted by the owner)

---

## The whole flow at a glance

1. Work on a branch (`fixes`) made from `main`. Commit only when every check passes.
2. Optional: build a test APK of the branch by hand from GitHub Actions.
3. When the work is done, pick the version number and update every place it appears (the "ecosystem").
4. If the server changed, run the SQL or deploy the function in Supabase, one step at a time.
5. Push the branch, open a pull request into `main`, wait for green checks, then merge.
6. Tag the merge commit `vX.Y.Z` and push the tag.
7. The push to `main` builds the signed APK. Download it and rename it to `YouDO.apk`.
8. Create the GitHub Release `YouDO vX.Y.Z` with the CHANGELOG notes, attach `YouDO.apk`, publish it as Latest.
9. Verify: the release API, the website version, an in-app update check.
10. Post on Telegram. Delete the work branch.

Each step is explained below.

---

## 1. Daily work

### Branches

- `main` is always the released code. **Every push to `main` builds an Android APK and deploys the website to production**, so never push unfinished work to `main`.
- Work happens on a branch made from `main`. We use `fixes`:
  ```bash
  git checkout main
  git pull --ff-only
  git checkout -b fixes
  ```
- Vercel builds a preview of every pushed branch and pull request. That is fine.
- Do **not** add other branches to the `on: push` triggers in `build-apk.yml`. Only `main` and the existing `release-*`/`hotfix-*` patterns build automatically.

### The checks (gates)

Run all of these before every commit. Judge them only by their exit codes (0 = pass), never by reading or grepping the output.

| Check | Command | When |
|---|---|---|
| Types | `npm run typecheck` | always |
| Lint | `npm run lint` | always |
| Unit tests | `npm test` (= `vitest run`) | always |
| Web build | `npm run build` | always before a release, and for UI changes |
| Bundle budget | `npm run verify:build` (after `npm run build`) | same as the build. The first-load JS has a tight gzip budget, so new first-screen code should be lazy-loaded |
| SQL tests | `npm run test:sql` | whenever anything in `supabase/` changes |

On Windows PowerShell 5.1, use `npx.cmd` instead of `npx`, because `npx` is blocked by the execution policy. Do not change the execution policy.

A guarded commit in Git Bash looks like this:
```bash
npm run typecheck; T=$?; npm run lint; L=$?; npx vitest run; V=$?
if [ $T -eq 0 ] && [ $L -eq 0 ] && [ $V -eq 0 ]; then git add -A && git commit -m "fix(area): what changed"; fi
```

Commit messages follow `type(area): summary`, for example `fix(widgets): …`, `feat(guide): …`, `chore(release): v8.3.1 — …`.

### A test APK from a branch (optional)

The Android side cannot be compiled on the Windows PC, so CI is the first real compile of Java changes.

1. Push the branch: `git push -u origin fixes`.
2. Open https://github.com/mattedhairr/YouDO/actions/workflows/build-apk.yml.
3. Click **Run workflow**, choose the branch under **Use workflow from**, then click **Run workflow**.
4. When the run is green, download the **YouDO-APK** artifact from the run page (it is a zip file with `app-release.apk` inside).

Test builds are signed with the same key as releases, so they install over the released app.

---

## 2. Pick the version number

Choose the number only **after** the work is finished, from what actually shipped:

- **Patch** `X.Y.Z+1`: fixes only (for example 8.3.0 → 8.3.1).
- **Minor** `X.Y+1.0`: new features (for example 8.2.0 → 8.3.0).
- **Major** `X+1.0.0`: a redesign, or anything that needs a reinstall.

The Android `versionCode` goes up by exactly 1 for **every** release, whatever the version name. Android refuses to install an APK whose versionCode is not higher than the installed one.

---

## 3. Update the whole ecosystem

Every one of these must say the same version before tagging. The examples are for v8.3.1, versionCode 85.

| # | File | What to change |
|---|---|---|
| 1 | `package.json` | `"version": "8.3.1"` |
| 2 | `package-lock.json` | the two `"version"` lines at the top (the root one and `packages[""]`) |
| 3 | `src/lib/version.ts` | `export const APP_VERSION = '8.3.1';` |
| 4 | `android/app/build.gradle` | `versionCode 85` and `versionName "8.3.1"` |
| 5 | `CHANGELOG.md` | a new top entry (see the template below) |
| 6 | `fastlane/metadata/android/en-US/changelogs/85.txt` | a new file named after the versionCode: a plain-text summary under 500 characters for F-Droid, IzzyOnDroid and Orion Store |
| 7 | `README.md` | update the feature sections if anything user-facing changed |
| 8 | `docs/*.md` | update a doc if the behaviour it describes changed |
| 9 | `docs/screenshots/` | only when the look changed: capture the screens, then run `node scripts/frame-screenshots.mjs docs/screenshots <name>=<capture> …` |

### CHANGELOG entry template

```markdown
## [v8.3.1] - 2026-10-31 - Short Human Title

- **Main change** — One clear sentence a user understands.
- **Another change** — Only distinct, meaningful changes; group small fixes as "Smaller fixes".
- **Android APK** — versionName **8.3.1**, versionCode **85**. Installs over v8.3.0 (84).

---
```

Rules:

- Use 3–6 bullets written for users, not developers. No file names.
- Write each bullet as `- **Title** — text`. The in-app update pop-up shows the bold part as the title and the rest as the line (`highlightParts` in `src/lib/appUpdate.ts`).
- The pop-up hides the `Android APK` line automatically.
- The last bullet is always the Android APK line.

When everything is updated, run all the gates again (including `npm run build` and `npm run verify:build`). Then commit:
```bash
git commit -m "chore(release): v8.3.1 — short title"
```

---

## 4. Server changes (only if `supabase/` changed)

- The `.sql` files in `supabase/` are the source of truth. Each one must be safe to run twice (`create or replace`, `if not exists`, drop-then-add for constraints), so re-running it never duplicates anything.
- New server pieces also go into the fresh-setup path; see `scripts/supabase-setup-order.mjs` and `scripts/build-supabase-setup.mjs`. Run `npm run test:sql`.
- **To apply to production:**
  1. Open the Supabase dashboard → project `iyrnywfaxakvjkmddmqv` → **SQL Editor** → New query.
  2. Paste the whole file and click Run.
  3. Do **not** save it as a saved query; only diagnostic queries are kept there.
- **Edge functions** (`supabase/functions/send-push`, `delete-account`):
  ```powershell
  npx.cmd supabase functions deploy <name> --project-ref iyrnywfaxakvjkmddmqv --use-api
  ```
- **Secrets that hold JSON** (for example `FIREBASE_SERVICE_ACCOUNT`) are set in the dashboard (Edge Functions → Secrets), never with `supabase secrets set` from PowerShell, which strips the quotes and breaks push.
- Do production steps one at a time and confirm each one before the next. If you are not sure whether a step already ran, check read-only first (for example, look for the column or function) before running it again.
- Apply the server part **before** publishing an app that needs it. Where possible the app fails politely on an older server (for example "needs the latest server update").

---

## 5. Merge into `main`

1. Push the branch:
   ```bash
   git push -u origin fixes
   ```
2. Open https://github.com/mattedhairr/YouDO/compare/main...fixes?expand=1 and give the pull request a title (for example `v8.3.1 — widgets that keep up with the day`) and a short description listing the changes and the checks that passed.
3. Click **Create pull request**.
4. Wait for both checks to go green:
   - **PR checks / Typecheck, lint, tests and web build** (`.github/workflows/pr-checks.yml`);
   - **Vercel** (the preview deployment).
5. Click **Merge pull request** → **Confirm merge** (a normal merge commit).

---

## 6. Tag the release

```bash
git checkout main
git pull --ff-only
git tag v8.3.1
git push origin v8.3.1
```

The tag must point at the merge commit on `main`, which is the code users get.

If a tag has to be redone before the release is public:
```bash
git tag -d v8.3.1
git push origin :refs/tags/v8.3.1
```
Then tag again.

---

## 7. Get the signed APK

1. The merge to `main` starts **Build Android APK** automatically. Watch it at https://github.com/mattedhairr/YouDO/actions. It usually takes several minutes.
2. When it is green, open the run and download the **YouDO-APK** artifact (a zip file of about 11 MB).
3. Unzip it and rename `app-release.apk` to **`YouDO.apk`**.

The build signs the APK with the permanent release key, stored in the repository secrets `YOUDO_SIGNING_KEYSTORE_BASE64` and `YOUDO_SIGNING_PASSWORD`. Never replace that key: a differently signed APK cannot install over the app, and every user would have to reinstall.

---

## 8. Publish the GitHub Release

1. Open https://github.com/mattedhairr/YouDO/releases/new?tag=v8.3.1.
2. Fill in the release:
   - **Title:** `YouDO v8.3.1`
   - **Notes:** the bullets of the `[v8.3.1]` CHANGELOG entry (without the `##` heading line).
3. Drop `YouDO.apk` into **Attach binaries**. GitHub records its SHA-256 digest automatically.
4. Keep the label on **Latest**. Not Pre-release, and not left as a draft.
5. Click **Publish release**.

Why these details matter: the in-app updater reads https://api.github.com/repos/mattedhairr/YouDO/releases/latest.

- It **ignores drafts and pre-releases**.
- It only accepts an `.apk` asset from this repository's release downloads that has a `sha256:` digest.
- On the phone it then checks the bytes, the package, a higher versionCode and the signing certificate before Android's installer opens.

---

## 9. Verify

- **Release API:** open https://api.github.com/repos/mattedhairr/YouDO/releases/latest and check:
  - `"tag_name": "v8.3.1"`;
  - `"draft": false` and `"prerelease": false`;
  - an asset named `YouDO.apk` with a `"digest": "sha256:…"`.
- **Website:**
  1. Open https://youdo-app.vercel.app → Settings → About and check that it shows the new version.
  2. If it doesn't, open Vercel → the YouDO project → Deployments and check for a **Production** deployment of the merge commit. Vercel occasionally misses a push; if so, use **Create Deployment** → `main`.
- **Phone:**
  1. Open Settings → App updates → **Check again**. Otherwise phones check by themselves within 6 hours.
  2. The update pop-up that users see comes from the version they already have installed. A pop-up redesign therefore only shows from the release after it.
- **Device checks:** run the pre-release test list (the changes that could not be tested in the browser, such as widgets, notifications and the installer) on a real phone.

---

## 10. Announce and clean up

- **Telegram:** the owner posts it themselves. A good shape:
  - a title line `YouDO vX.Y.Z is out`;
  - one short line per change with an emoji;
  - "Update in the app (Settings → App Updates) or download it here:" followed by the release link;
  - which version it installs over, and any one-time step.
- **Delete the work branch** once it is merged:
  ```bash
  git branch --merged main
  git push origin --delete fixes
  git branch -d fixes
  ```
  Only `main` should remain.
- Remove scratch files. Temporary files like `.claude/launch.json` (local dev preview) are never committed.
- Update `HANDOFF.md` with where things stand.

---

## Hotfix (something broken right after a release)

Use the same flow on a fresh `fixes` branch, with a patch version (for example 8.3.1 → 8.3.2) and versionCode +1. Never re-use or move a tag that is already public; always release a new number.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Phones don't see the update | The release is a draft or pre-release, the APK has no digest, or the phone's 6-hour cache hasn't expired yet (use Check again). |
| "App not installed" on the phone | versionCode not increased, or the APK is signed with another key. |
| APK build fails at the signing step | The repository secrets are missing or changed (Settings → Secrets and variables → Actions). |
| Website still shows the old version | Vercel missed the push; redeploy `main` from the Vercel dashboard. A phone's PWA may also need **Refresh app**. |
| Push notifications stopped | Check the `FIREBASE_SERVICE_ACCOUNT` secret (set through the dashboard) and redeploy `send-push`. |
| `npx` won't run in PowerShell | Use `npx.cmd`. |
