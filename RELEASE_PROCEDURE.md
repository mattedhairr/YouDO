# YouDO Standard Release Procedure & Checklist (SOP)

Use this exact procedure whenever preparing, testing, or publishing a release for YouDO. Copy and paste the prompt below into a chat when starting a release.

---

## 📋 Release Prompt to Give the Agent

```markdown
We are preparing a new release for YouDO. Please execute the standard pre-release protocol:
1. Run full typechecks, test suite, and production build to ensure 0 errors.
2. Audit recently touched UI components for unstyled tags, dead CSS classes, and logic regressions.
3. Check if any Supabase SQL migrations are needed (do NOT run in production without confirmation; ensure idempotent syntax and matching snippet headers).
4. Bump version numbers across all 3 codebases: package.json, version.ts, and android/app/build.gradle (versionName & increment versionCode).
5. Add the changelog entry to CHANGELOG.md using the official project template.
6. Clean up temporary branches and scratch files, commit to main, and push.
7. Tag the release (vX.Y.Z) and verify the GitHub Actions APK build.
Report status after each phase.
```

---

## 🛠️ Step-by-Step Release Checklist

### Phase 1: Quality Assurance & Code Integrity
- [ ] **TypeScript Typecheck:** Run `npm run typecheck` (must exit code 0).
- [ ] **Unit & Integration Tests:** Run `npm test` (all test suites must pass).
- [ ] **Production Build Check:** Run `npm run build` (Vite build and PWA service worker generate without errors).
- [ ] **UI & Styling Audit:**
  - Verify all modal/bottom sheet overlays follow iOS style (`rounded-t-[28px]`, grab handle, theme color tokens).
  - Check for unstyled naked tags (`<label>`, `<input>`, `<button>`, `<textarea>`) missing Tailwind classes.
  - Check for any leftover obsolete custom CSS classes.
- [ ] **Database & Supabase Check:**
  - Are any DB changes required? If yes, ensure additive SQL (`CREATE OR REPLACE FUNCTION`), include `-- Supabase Snippet Name: ...` headers, and confirm with user before touching live production.

---

### Phase 2: Version Synchronization (The "Rule of 4")
All four locations must be identical before tagging:
1. `package.json` ➔ `"version": "X.Y.Z"`
2. `src/lib/version.ts` ➔ `export const APP_VERSION = 'X.Y.Z';`
3. `android/app/build.gradle`:
   - `versionName "X.Y.Z"`
   - `versionCode <N + 1>` *(MUST increment by 1 for Android OS install-over)*
4. `CHANGELOG.md`:
   - Add new top entry under `## [vX.Y.Z] - YYYY-MM-DD - Short Title`
   - Include 3–6 user-facing bullets
   - End with: `- **Android APK** - versionName **X.Y.Z**, versionCode **N**. Installs safely over v...`

---

### Phase 3: Git Hygiene & Repository State
- [ ] **Scratch & Untracked Files:** Remove any `.tmp`, `scratch.txt`, or temporary test files.
- [ ] **Branch Cleanup:** Delete merged or abandoned feature/fix branches locally and remotely (e.g., `git push origin --delete <branch>`). Ensure work is on `main`.
- [ ] **Commit:** Commit all staged files with clear message (e.g., `chore: prepare vX.Y.Z release`).
- [ ] **Push to Main:** Push `main` to `origin/main`.

---

### Phase 4: Tagging & Build Automation
- [ ] **Tag the Commit:**
  ```powershell
  git tag vX.Y.Z
  git push origin vX.Y.Z
  ```
  *(Note: If hotfixing or re-tagging before public release, delete the tag remotely with `git push origin :refs/tags/vX.Y.Z` before pushing the new one).*
- [ ] **Monitor GitHub Actions:**
  - Open `https://github.com/mattedhairr/YouDO/actions`
  - Ensure `Build Android APK` completes successfully (green checkmark).

---

### Phase 5: GitHub Release & APK Publishing
- [ ] Download `YouDO-APK` artifact from the successful GitHub Actions run.
- [ ] Extract `app-debug.apk` and rename to `YouDO.apk`.
- [ ] Open `https://github.com/mattedhairr/YouDO/releases/new?tag=vX.Y.Z`.
- [ ] Set title: `YouDO vX.Y.Z`.
- [ ] Copy the exact markdown block for `[vX.Y.Z]` from `CHANGELOG.md` into the release notes.
- [ ] Attach `YouDO.apk` to the release assets (GitHub automatically creates the `sha256` digest for in-app updates).
- [ ] Publish the release.

---

### Phase 6: Device Verification & Announcements
- [ ] **In-App Update Test:** Open secondary phone ➔ Settings ➔ App Updates ➔ verify release highlights, download progress bar, signature verification, and smooth install.
- [ ] **Feature Smoke Test:** Verify primary new features (e.g. Support Chat, Exam selection).
- [ ] **Telegram Announcement:** Post release notes to the Telegram channel and discussion group.
