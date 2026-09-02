# Changelog — YouDO

All notable changes to **YouDO** are documented here. Newest release first.

---

## How to write a release entry (template)

Use this file for **both** the project history and **GitHub Release descriptions**.

### When adding a new version

1. Add a new block **at the top** of the release list (below this instructions section).
2. Bump `package.json`, `src/lib/version.ts`, and `android/app/build.gradle` (`versionName` + `versionCode`) to match.
3. Copy the new block into the GitHub Release description when publishing.

### Copy rule (GitHub Releases)

Copy **only the release block** — from the version heading through the **Data Safety** section.

- **Include:** `## [vX.Y.Z] …` → intro paragraph → all `###` sections for that version
- **Exclude:** the `---` divider after the block, older releases, and this instructions section

### Fixed section order (every release)

Use these headings in this order. **Do not rename them.** Omit a section only if it truly has nothing to say (patch releases may skip Cloud).

| Section | Purpose |
|---|---|
| `### 🚀 What you will notice` | User-visible changes. Lead with outcomes, not implementation. Bold the feature name, then an em dash, then detail. |
| `### ☁ Cloud` | Sign-in, sync, backup, multi-device, restore. Skip if no cloud work shipped. |
| `### ⚙ Under the hood` | Technical fixes, refactors, performance, data migrations. Keep readable — no jargon dumps. |
| `### 💾 Data Safety` | **Required for every shipped APK.** Always include `versionName`, `versionCode`, package id, and install-over note. |

### Heading line format

```markdown
## [vX.Y.Z] — YYYY-MM-DD ("Short subtitle in quotes")
```

- **Subtitle:** 3–8 words; describes the theme of the release.
- **Intro paragraph:** 1–3 sentences immediately under the heading. Explain *why* this release exists, not a bullet list.

### Bullet style

```markdown
- **Feature name** — What changed for the user in plain language.
```

- One idea per bullet.
- Prefer **you** language (“your goal edits stay put”) over internal terms (“refactored syncMerge”).
- Past releases stay as-is historically; do not rewrite old user-facing claims unless factually wrong.

### Unpublished / internal builds

Append to the heading line: `*not published as a GitHub Release*`

### Data Safety line format

```markdown
### 💾 Data Safety
- **Android APK**: versionName **X.Y.Z**, versionCode **N**. Same package id `com.mattedhairr.youdo` — install over **A.B.C**.
```

---

## [v6.1.2] — 2026-09-02 ("Polished goal interactions")

This patch release smooths the everyday Goal and Blueprint Studio interactions so navigation, progress feedback, and task details feel dependable on a phone.

### 🚀 What you will notice
- **Reliable back gestures** — Leaving Blueprint Studio with the device edge gesture no longer exits the app unexpectedly after a second swipe.
- **Instant completion feedback** — Goal progress updates immediately after marking work done, without requiring a second tap.
- **Editable micro-steps** — Existing Blueprint Studio steps can now be renamed without changing their completion state.
- **Descriptions where you need them** — Goal items with descriptions now provide a compact description action, consistent with Scheduled and Backlog cards.
- **Cleaner branch navigation** — Sibling branches are presented in a compact, aligned branch rail with less empty space around the task list.

### ⚙ Under the hood
- Completion mutations invalidate cached rollups before rendering the next state, preventing stale progress bars.
- The new step rename operation updates labels immutably and preserves step completion evidence.

### 💾 Data Safety
- **Android APK**: versionName **6.1.2**, versionCode **29**. Same package id `com.mattedhairr.youdo` and the permanent v6+ signing identity — install directly over **6.1.1** (28) without uninstalling or clearing app data.

---

## [v6.1.1] — 2026-09-02 ("Safer sync and recovery")

This maintenance release keeps the public Board useful from its first few aspirants through a much larger community, while hardening account entry and the update path without changing anyone's saved preparation data.

### 🚀 What you will notice
- **A Board that scales gracefully** — Real opted-in aspirants appear while the Board forms; after ranking unlocks, a focused Top 10, personal position card, and optional nearby-competitor view replace an endless list.
- **Stronger new accounts** — New passwords require at least 10 characters, while all existing users can continue signing in with their current password.
- **Fresher update notices** — YouDO checks periodically and invalidates update results left by an older installed version, preventing stale or self-referencing notices after an upgrade.
- **Community within reach** — Settings now separates the official Telegram updates channel from the discussion group used for questions, feedback, and screenshot-based bug reports.
- **Settings that fit every phone** — Data, backup, and community rows now keep their icons and actions aligned while descriptions wrap cleanly on narrow displays.
- **Sync that refuses to guess** — If this device and cloud both changed, YouDO now pauses with both copies intact instead of silently choosing a winner; Settings offers an explicit safe-combine review.
- **Useful recovery history** — Restore points show goal-tree, leaf-task, and planned-card counts, retain up to 10 genuinely changed copies, and no longer churn merely because the app was reopened.

### ⚙ Under the hood
- Supabase ownership policies now evaluate the authenticated user once per statement and are scoped explicitly to signed-in users, removing the current Auth RLS Initialization Plan performance warnings without weakening isolation.
- Cloud writes now use compare-and-swap protection, persisted device/cloud fingerprints, and branch-preserving goal merges so a stale device or write race cannot erase newer branches.
- Backup, restore-point, and public Board owner columns already have the required indexes; no user rows or historical progress are migrated.

---

## [v6.1.0] — 2026-09-01 ("Blueprints without friction")

Blueprint Studio now behaves like a real working surface rather than a sequence of disconnected forms. You can move through a large preparation tree, build several different branches, review exactly what changed, and save the complete blueprint only when it feels right.

### 🚀 What you will notice
- **One Studio workspace** — Create and edit from the same clean tree instead of choosing between two overlapping modes.
- **Work freely before saving** — Apply several operations to a Studio draft, move anywhere in the hierarchy, inspect the ordered history, and undo the newest change without leaving.
- **Start where you are** — Opening Studio from deep inside a goal takes you directly to that phase, section, task, or subtask instead of making you navigate again from the beginning.
- **Faster bulk building** — Named lists and numbered ranges open directly from the relevant branch, with empty editable fields, reliable number entry, duplicate protection, and a live preview.
- **Cross-branch editing** — Keep selections while moving between phases or sections, see every selected item in one place, then rename, remove, or add the same inner structure across them.
- **Focused final review** — Only paths changed in the current sitting open automatically; new nodes, edited nodes, and newly added leaf-task steps are visibly identified before the final save.
- **Less interface noise** — Redundant Build/Edit actions and repeated confirmation screens are removed, while contextual breadcrumbs, sibling navigation, swipe-back, and compact mobile controls keep orientation clear.

### ⚙ Under the hood
- Studio changes remain isolated from the saved workspace until one atomic final commit; stale goal data and active-session branch removal are still rejected safely.
- Existing goal completion, scheduling links, Today-task progress, and historical Plan records remain intact unless their branch is intentionally removed.
- Review-path detection covers additions, edits, steps, and removals so unrelated branches remain collapsed even in a large blueprint.
- Android CI now verifies versionName **6.1.0**, versionCode **27**, and the permanent v6+ signing certificate before uploading the APK.

### 💾 Data Safety
- **Android APK**: versionName **6.1.0**, versionCode **27**. Same package id `com.mattedhairr.youdo` and the permanent v6+ signing identity — install directly over **6.0.0** (26) without uninstalling or clearing app data.
- The v6.0.0 in-app updater can discover this stable GitHub Release, show its first three highlights, and open the official download page; YouDO never installs an APK silently.
- A Studio draft changes no saved goal data until **Save blueprint** succeeds. Leaving with unapplied work requires explicit discard confirmation, and the latest draft operation remains undoable before saving.

---

## [v6.0.0] — 2026-08-31 ("Account-safe execution")

YouDO now treats each signed-in account as the owner of one local-first workspace, while rebuilding task history around what actually happened on each date. This release prioritizes protecting preparation progress before adding anything decorative.

### ✨ What you will notice
- **Your workspace belongs to you** — Sign in or create an account before doing real work; YouDO never silently mixes plans from different accounts on one phone.
- **An honest Plan timeline** — Scheduled, failed, and later-completed backlog appearances are shown on their correct dates without turning one task into dozens of completed cards.
- **Offline work reconnects safely** — Changes save on the phone immediately and automatically retry cloud sync when internet access returns.
- **Manual and session work stay distinct** — Plan identifies manual, timed-session, and mixed completion without rewriting older failed appearances incorrectly.
- **Completed cards read as completed** — Scheduled and backlog cards gain a consistent strike-through and restrained fade after completion.
- **Cleaner Goals** — Goal rows keep the blueprint hierarchy readable while operational metadata remains in Plan, where it belongs.
- **Safer destructive actions** — Running tasks cannot be removed by bulk edits, imports, replanning, or goal deletion; account deletion requires a server-confirmed request.
- **Future update notices** — From v6 onward, YouDO checks once daily for a newer stable GitHub Release and presents three brief highlights without interrupting a focus session.

### ☁️ Cloud
- **Account-first start** — Existing device data is identified before the workspace opens. Keep the device plan, restore the signed-in cloud copy, or intentionally start empty.
- **Safe sign-out** — YouDO syncs first and refuses to clear the device workspace when unsynced changes cannot reach Supabase.
- **Restore points** — The live cloud workspace and up to three visit snapshots remain available from Settings.
- **Permanent deletion** — Delete Account removes the Auth user, cloud backups, restore points, and public Board row through the authenticated `delete-account` Edge Function.
- **Multi-device merge protection** — Session records merge by identity; newer goal/task structure wins without OR-merging stale completion flags, and an active sitting blocks unsafe replacement.

### 🔧 Under the hood
- Date-specific task occurrences now come from one tested timeline model shared by Plan cards, day totals, failure counts, backlog recovery, and focus statistics.
- Manual step completion records its own evidence so partial manual work and timed work can coexist without corrupting historical status.
- Android builds use a repository-secret signing identity, pin its certificate fingerprint in CI, and print the APK checksum before publishing.
- Stale guest-mode documentation and the obsolete authentication modal were removed; the Help Center, README, Settings, and Supabase function source now describe the same account model.

### 💾 Data Safety
- **Android APK**: versionName **6.0.0**, versionCode **26**, same package id `com.mattedhairr.youdo`.
- **One-time signing reset**: the private key used for the published v5 APK is no longer available, so Android cannot install v6 over v5. Sync or export first, uninstall v5 once, then install v6 and restore/sign in. v6 establishes the permanent signing baseline used by future updates.
- On first opening v6 with an existing device plan, choose **Keep this device plan** to secure that local copy to the signed-in account, or **Restore cloud workspace** only when the cloud copy is the one you intend to keep.
- Historical manual completions created before v6 may not contain enough timestamp evidence to reconstruct every old date perfectly; v6 records that evidence for future work instead of guessing and rewriting history.

---

## [v5.0.0] — 2026-08-30 ("Blueprint Studio")

YouDO can now help you construct and reshape a large exam plan without making you manage the entire hierarchy at once. This major release also includes the Board, navigation, and Settings polish prepared for v4.1.0 but never published separately.

### 🚀 What you will notice
- **Blueprint Studio** — Create a new goal blueprint through one focused question at a time, or open an existing tree and choose exactly where to work.
- **Bulk structure without repetition** — Add named lists or numbered ranges at any hierarchy level and repeat the same structure or steps across several selected branches.
- **Partial blueprints** — Build one phase completely now while keeping later phases as clean shells that are ready when you return.
- **Cross-branch selection** — Select items under different phases or sections without losing earlier selections, review the selected paths, and update them together.
- **Safe preview and undo** — See the complete result before applying a bulk operation, then undo the entire tree change with one tap.
- **Batch planning controls** — Schedule, replan, or unplan multiple eligible leaf tasks; an active focus task stays protected.
- **Session-aware reopening** — Returning to YouDO during a focus session opens the running task's Scheduled or Backlog location automatically, including after midnight.
- **One-tap destination home** — Tap Goals while deep in the hierarchy to return to Goals home; tapping Today returns to Scheduled with filters cleared.
- **Clearer guidance** — Goal examples, placeholders, account fields, and Help content now use concise aspirant-focused language without assuming a particular exam.
- **v4.1.0 polish included** — Compact Board introduction, premium bottom navigation, refined Settings groups and toggles, and a smaller guest account card are included in this release.

### ⚙ Under the hood
- Blueprint edits apply atomically, reject stale drafts, preserve linked Today-task progress, skip duplicate names and steps, and block removal of the task used by an active session.
- Goal-tree operations are covered by dedicated tests; the complete suite now contains 66 passing tests.
- Navigation distinguishes automatic active-session routing from intentional bottom-tab taps, so both behaviors remain predictable.
- **versionCode 25** is higher than v4.0.0 (23) and the unpublished v4.1.0 build (24).

### 💾 Data Safety
- **Android APK**: versionName **5.0.0**, versionCode **25**. Same package id `com.mattedhairr.youdo` and existing stable signing workflow — install over **4.0.0** (23), an internal **4.1.0** build (24), and earlier compatible builds.
- Android also requires the same signing certificate. If the installed APK came from an older or different signing key, uninstall it once before installing v5.0.0; future APKs produced by the current workflow can then install over it.

---

## [v4.1.0] — 2026-08-30 ("Board and settings polish") *not published as a GitHub Release*

A focused visual refinement makes the public Board, bottom navigation, and Settings easier to scan and more comfortable to use without changing their behavior.

### 🚀 What you will notice
- **Compact Board introduction** — The honesty reminder and ranking context now fit in a concise header, leaving more room for the leaderboard.
- **Premium navigation dock** — Today, Goals, Plan, and Board have clearer icon-and-label states, balanced spacing, compact badges, and a separate Settings action.
- **Refined Settings** — Stronger section hierarchy, consistent cards and controls, larger reliable toggles, and cleaner data-management rows.
- **Compact guest account card** — Sign in and account creation remain prominent without taking unnecessary vertical space.

### ⚙ Under the hood
- Shared, responsive styling keeps the updated dock and Settings controls aligned across narrow phone widths and safe-area insets.
- Rejected masthead experiments were removed before release; the existing Today header remains unchanged.
- **versionCode 24** for sideload install-over from 4.0.0 (23).

### 💾 Data Safety
- **Android APK**: versionName **4.1.0**, versionCode **24**. Same package id `com.mattedhairr.youdo` and existing signing workflow — install over **4.0.0** (23) and earlier. **versionCode 24 is required.**

---

## [v4.0.0] — 2026-08-30 ("Board and day countdown")

Opt-in public Board ranks net focus among signed-in aspirants, and Today at a glance now shows how much of the day is left.

### 🚀 What you will notice
- **Board tab** — Fourth dock tab (Today · Goals · Plan · Board). Rank total net focus for Today, Week (Monday–today), or Month (1st–today). Streak, bar hours, and exam label are context only — rank is hours.
- **Opt-in public board** — Settings → Public board: off by default. Add a display name and optional “Preparing for” label; preview before you join. Turn off and your public row is deleted.
- **Waiting room** — Rankings stay hidden until 10 people opt in; you can still join so the count can grow.
- **End-of-day countdown** — Today at a glance shows **Xh Ym left today** under the headline (gold under 3h, muted red under 1h; **Day ended** at midnight). Separate from streak revive copy.

### ☁ Cloud
- Board prefs (`pacePrefs`) sync with your workspace backup like streak meta.
- Hours publish after you stop a sitting and when you open the app or Board (honor system — not verified).

### ⚙ Under the hood
- Supabase table + RLS in `supabase/public_pace.sql` (run once in SQL editor).
- Rank up/down arrows compare to the last snapshot for that tab, not live twitch.
- Help guide updated for the Board tab.
- **versionCode 23** for sideload install-over from 3.8.0 (22).

### 💾 Data Safety
- **Android APK**: versionName **4.0.0**, versionCode **23**. Same package id `com.mattedhairr.youdo` — install over **3.8.0** (22) and earlier. **versionCode 23 is required.**

---

## [v3.8.0] — 2026-08-20 ("Polish and revive fixes")

Cleaner focus notifications, clearer streak revive UI, and scheduled-today tasks added after a miss now count toward saving your streak.

### 🚀 What you will notice
- **Focus notification** — Single app icon, compact shade layout, expanded view with elapsed time, and a cleaner pause/resume control on lock screen and notification shade.
- **Streak revive clarity** — Glance and Today banner show hours/minutes left to restore your streak; broken streak value is struck through.
- **Scheduled tasks after midnight** — Tasks you add to today during the revive window are included in the save-streak list (backlog snapshot stays frozen).

### ⚙ Under the hood
- Briefing slider thumb resized to a pill for better proportions on wide bars.
- Shared revive countdown hook for consistent deadline copy across Glance and Today.
- **versionCode 22** for sideload install-over from 3.7.2 (21).

### 💾 Data Safety
- **Android APK**: versionName **3.8.0**, versionCode **22**. Same package id `com.mattedhairr.youdo` — install over **3.7.2** (21) and earlier. **versionCode 22 is required.**

---

## [v3.7.2] — 2026-08-19 ("Stable installs and streak sync")

Sideload install-over should work across GitHub Actions builds, and the daily streak bar (plus revive state) now travels with cloud backup.

### 🚀 What you will notice
- **Streak bar syncs** — Your daily focus bar and revive progress stay with your account across phones.
- **Reliable APK upgrades** — CI reuses one signing key so a higher `versionCode` can install over the previous YouDO build.

### ⚙ Under the hood
- Streak meta included in backup / cloud merge (last-write-wins with best-streak kept).
- GitHub Actions caches a stable Android debug keystore (root cause of “App not installed” despite version bumps).
- **versionCode 21** for sideload install-over from 3.7.1 (20).

### 💾 Data Safety
- **Android APK**: versionName **3.7.2**, versionCode **21**. Same package id `com.mattedhairr.youdo` — install over **3.7.1** (20) and earlier. **versionCode 21 is required.**
- **First install after this fix:** if an older CI APK used a different signing key, uninstall once, then install 3.7.2. Later upgrades should install over without uninstalling.

---

## [v3.7.1] — 2026-08-19 ("Streak revive rules")

Clearer streak recovery: one-day window, scheduled tasks required on backlog revive, and a 1.5× focus challenge when there was no backlog at the miss.

### 🚀 What you will notice
- **1-day revive window** — One calendar day after a miss to restore your streak (not two).
- **Backlog revive** — Clear marked backlog **and** today’s scheduled Save streak tasks, then hit the daily bar.
- **Challenge revive** — No backlog at the miss? Hit **1.5×** your bar that day (6h bar → 9h) to restore.

### ⚙ Under the hood
- Frozen scheduled-today snapshot on backlog revive; challenge path when backlog snapshot is empty.
- **versionCode 20** for sideload install-over from 3.7.0 (19) and earlier.

### 💾 Data Safety
- **Android APK**: versionName **3.7.1**, versionCode **20**. Same package id `com.mattedhairr.youdo` — install over **3.7.0** (19), **3.6.1** (18), and earlier. **versionCode 20 is required** — sideload will fail if the APK was built with an older code.

---

## [v3.7.0] — 2026-08-19 ("Glance and streak bar")

Smarter Today briefing, a daily focus bar for streaks, and a backlog catch-up path to restore a broken streak — plus a reliable sideload upgrade from 3.6.x.

### 🚀 What you will notice
- **Today at a glance** — Morning briefing vs progress view; each card shows a different stat with no repeated numbers.
- **Streak bar** — Set how much net focus counts as a day (30 min–10 h) in Settings.
- **Save streak** — Miss a day with overdue backlog? Finish marked tasks within 2 days and hit the bar once to restore your streak.
- **Restore streak** — Banner on Today and a dedicated backlog group show countdown and which tasks to clear.

### ⚙ Under the hood
- Threshold-aware streak math with frozen backlog snapshot and revive window.
- **versionCode 19** for sideload install-over from 3.6.1 (18) and earlier.

### 💾 Data Safety
- **Android APK**: versionName **3.7.0**, versionCode **19**. Same package id `com.mattedhairr.youdo` — install over **3.6.1** (18), **3.6.0** (17), **3.5.0** (16), and earlier. **versionCode 19 is required** — sideload will fail if the APK was built with an older code.

---

## [v3.6.1] — 2026-08-18 ("Shade pause polish")

Reliable install-over from 3.6.0, plus a lockscreen-friendly Focus notification that pauses or resumes without opening the app.

### 🚀 What you will notice
- **Big Pause / Resume** — Gold or green round button on the Focus notification; easier to hit from the shade or lockscreen.
- **No app jump** — Tapping Pause or Resume updates the sitting in the background; YouDO stays closed.
- **Lockscreen** — Focus notification uses a live channel (not buried under Silent).

### ⚙ Under the hood
- Custom Capacitor notification plugin with background receiver and native session sync.
- **versionCode 18** for sideload install-over (fixes failed upgrade from 3.6.0 builds).

### 💾 Data Safety
- **Android APK**: versionName **3.6.1**, versionCode **18**. Same package id `com.mattedhairr.youdo` — install over **3.6.0** (17), **3.5.0** (16), and earlier. **versionCode 18 is required** — sideload will fail if the APK was built with an older code.

---

## [v3.6.0] — 2026-08-18 ("Pause from the shade")

Focus sittings are easier to control when the phone is locked or the app is closed — pause from the notification shade, keep paused sittings paused, and stop with clearer save-or-discard choices.

### 🚀 What you will notice
- **Shade controls** — While a sitting runs, pull down the notification and tap **Pause** or **Resume** without opening the app.
- **Paused stays paused** — If you paused before closing the app, reopening no longer auto-resumes or shows “I kept working.”
- **Stop choices** — **Save progress** keeps focus time (and any steps you checked); **Discard sitting** throws the sitting away.
- **No sittings on done tasks** — Completed tasks no longer offer **Start focus session**.
- **Smoother glance** — Today's slide-to-continue drops the trailing chevrons and fades out cleanly into Today.

### ⚙ Under the hood
- Stale session recovery appears immediately on reopen (no wait on the clock check).
- `@capacitor/local-notifications` with a quiet ongoing Focus channel on Android.

### 💾 Data Safety
- **Android APK**: versionName **3.6.0**, versionCode **17**. Same package id `com.mattedhairr.youdo` — install over **3.5.0** (16), **3.4.2** (14), and earlier. **versionCode 17 is required** for sideload install-over.

---

## [v3.5.0] — 2026-08-18 ("Faster goals and a clearer open")

Moving through a deep Goal Blueprint is quicker, session details match the rest of Daily Focus Stats, and app open no longer stacks Today's glance on top of an unfinished sitting.

### 🚀 What you will notice
- **Goal location bar** — See where you are, go up one level, jump to any ancestor from the path map, and switch siblings with chips.
- **Session summary** — Plan-day **Summary** uses cards, an efficiency bar, outcome badges, and step chips instead of a plain text dump.
- **Slide to continue** — Got it has clearer idle motion, drag feedback, and a confirm state.
- **Cleaner chrome** — YouDO and the date sit on one aligned row; Today progress is a slim strip under the quote; bottom tabs stay compact.

### ⚙ Under the hood
- Today's glance opens before paint when there is no stored session (no wait on the clock check).
- If a focus session is still running when you reopen the app, only Resume / Discard is shown — Today's glance waits.
- Goal header metadata (kind, done count, dates) wraps as whole labels at every drillable level.

### 💾 Data Safety
- **Android APK**: versionName **3.5.0**, versionCode **16**. Same package id `com.mattedhairr.youdo` — install over **3.4.2** (14), **3.4.1** (13), **3.4.0** (12), and **3.3.x** (11). **versionCode 16 is required** — sideload will fail if the APK was built with an older code (including a broken **3.5.0** build at code **15**).

---

## [v3.4.2] — 2026-08-17 ("Today briefing and slide to dismiss")

Daily open flow and calendar session details — plus a reliable APK upgrade path from 3.4.1.

### 🚀 What you will notice
- **Today at a glance** — Each time you open the app, a short summary covers scheduled work, backlog, done count, focus so far, and up next.
- **Slide to Got it** — Dismiss the briefing with a classic slide-to-unlock control (drag to the end, release to close).
- **Session details on tap** — Plan day stats list sessions by number; tap **Summary** for the full sitting breakdown (nothing shown until you ask).

### ⚙ Under the hood
- Session summary text built from task steps, path, and focus times.
- Responsive grid fixes from 3.4.1 carried forward where not yet on your device.

### 💾 Data Safety
- **Android APK**: versionName **3.4.2**, versionCode **14**. Same package id `com.mattedhairr.youdo` — install over **3.4.1** (13), **3.4.0** (12), and **3.3.x** (11). **versionCode 14 is required** — sideload will fail if the APK was built with an older code.

---

## [v3.4.1] — 2026-08-16 ("UI polish and layout fixes")

Patch release after 3.4.0 — cleaner task actions, clearer calendar session log, and grids that stay aligned on every screen width.

### 🚀 What you will notice
- **Task actions layout** — Remove sits on its own row; Jump and Duplicate share one row with no empty slot.
- **Calendar session log** — Day stats show Session 1, 2, 3… with times instead of cryptic task titles.
- **Stats on narrow screens** — Scheduled, Completed, and Failed stay in one balanced row when you resize or use a smaller phone.

### ⚙ Under the hood
- Fixed global grid CSS that caused orphaned columns (2+1) when panels resized.
- Add Goal date fields follow panel width, not full monitor width.

### 💾 Data Safety
- **Android APK**: versionName **3.4.1**, versionCode **13**. Same package id `com.mattedhairr.youdo` — install over **3.4.0** and **3.3.x** (versionCode must increase; this build is **13**).

---

## [v3.4.0] — 2026-08-16 ("Stable sync and honest calendar stats")

Cloud sync and stats were rebuilt so goal edits stay put, two phones stop fighting over completion flags, and the calendar stays the single honest stats view.

### 🚀 What you will notice
- **Goal edits stay put** — unmarking a step no longer flips back a few seconds later when signed in.
- **Calendar day stats only** — per-task and per-goal history sheets removed; Plan day stats remain the single stats view.
- **Clearer goal progress** — folder percent reflects actual leaf work, not just sibling count.

### ☁ Cloud
- Sync uses **document last-write-wins** for goals and daily tasks, **unions focus sittings by id**, and still honours **Recently Deleted**.
- Login and cloud backup no longer block on clock checks; the clock warning is advisory only.

### ⚙ Under the hood
- Batch schedule replans like single schedule; batch delete restores to the correct parent.
- Removed manual “stats rows” when checking a step without a focus session.

### 💾 Data Safety
- **Android APK**: versionName **3.4.0**, versionCode **12**. Same package id `com.mattedhairr.youdo` — install over **3.3.x**.

---

## [v3.4.0] — 2026-08-16 ("Stable sync and honest calendar stats")

Cloud sync and stats were rebuilt so goal edits stay put, two phones stop fighting over completion flags, and the calendar stays the single honest stats view.

### 🚀 What you will notice
- **Goal edits stay put** — unmarking a step no longer flips back a few seconds later when signed in.
- **Calendar day stats only** — per-task and per-goal history sheets removed; Plan day stats remain the single stats view.
- **Clearer goal progress** — folder percent reflects actual leaf work, not just sibling count.

### ☁ Cloud
- Sync now uses **document last-write-wins** for goals and daily tasks, **unions focus sittings by id**, and still honours **Recently Deleted**.
- Login and cloud backup no longer block on clock checks; the clock warning is advisory only.

### ⚙ Under the hood
- Batch schedule replans like single schedule; batch delete restores to the correct parent.
- Removed manual “stats rows” when checking a step without a focus session.

### 💾 Data Safety
- **Android APK**: versionName **3.4.0**, versionCode **12**. Same package id `com.mattedhairr.youdo` — install over 3.3.x.

---

## [v3.3.0] — 2026-08-16 ("Guide, feel, and honest trends")

The 3.2.1–3.2.3 ideas stay. This release rebuilds them so they match the rest of YouDO.

### 🚀 What you will notice
- **First run opens the real guide** — not a bounce-arrow overlay. Tap the YouDO mark any time to open it again. Sketches match Today / Goals / Plan cards.
- **Haptics on the APK** — short patterns for start, pause, ambient, tick, complete, and delete.
- **Undo after a goal delete** — sits above the command bar in YouDO chrome, not a generic toast library.
- **Focus this week** — tap a day in session stats for net focus; streaks no longer skip a missed day.
- **Trim old sittings** — Settings can drop focus history older than 90 days when a cloud backup grows too large.
- **Today empty state** — product language: schedule from Goals, or add a quick task.

### ⚙ Under the hood
- Help uses the same overlay stack as every other sheet (back gesture, blur, escape).
- Haptics setting lives with the other YouDO keys (old `youdo_haptics_enabled` still migrates).
- Restoring a deleted node falls back to the goal root (or as a new root) if the parent is gone.
- Week heatmap and streak math are tested; dates stay local, not UTC.

### 💾 Data Safety
- **Android APK**: versionName **3.3.0**, versionCode **11**. Same package id `com.mattedhairr.youdo` — install over **3.2.x**.

---

## [v3.2.0] — 2026-08-15 ("Honest sessions after lock, sleep, and forget")

Phone lock, a forgotten timer, and falling asleep are three different things — and stats now follow what you actually did.

### 🚀 What you will notice
- **Phone aside / screen off** — start a session, lock the phone, come back, stop. That sitting is still there; it is not thrown away or treated as a broken clock.
- **Forgot to stop** — after about five minutes away you get a clear choice: resume if you kept working, or drag a slider to about when you actually finished.
- **Fell asleep** — discard the sitting completely from that screen (and from the slider sheet). Nothing is saved.
- **Left running for hours** — a forgotten session cannot quietly add a whole night of focus. Stop without choosing still caps at four hours from the last time you said you were working.

### ☁ Cloud
- An empty device still will not overwrite your cloud backup by accident.
- Settings → **Clear cloud backup** (with confirm) is how you wipe the cloud copy on purpose.
- Two phones **combine** sittings, goals, and cards instead of the last open phone wiping the other. A delete on one phone still wins (Recently Deleted is honoured). Restore in Settings still replaces this phone with a chosen backup on purpose.

### ⚙ Under the hood
- Stopping right after unlock no longer looks like a date change and no longer drops lock time or pauses cloud.
- Heartbeats no longer stamp a future time when the clock sample failed.
- Screen-lock freeze is only trusted after the app was in the background.
- Goal tree edits no longer clone every ancestor when a leaf did not change.
- Removed dead UI and unused helpers; native builds skip leftover service workers so APK updates are not cached.
- Session heartbeat no longer re-renders Goals / Calendar on every tick.
- Also in this build (never shipped on 3.1.3): stats say “Whole task completed” when nothing is left; backlog badges count open items only; ambient clock fits the ring.

### 💾 Data Safety
- **Android APK**: versionName **3.2.0**, versionCode **10**. Same package id `com.mattedhairr.youdo` — install over **3.1.2**.

---

## [v3.1.2] — 2026-08-14 ("Header, layout and signed-in identity")

Polish for signed-in users, header layout, and narrow-phone screens.

### 🚀 What you will notice
- **Auth blur on open** — Sign in over Settings blurs immediately, not only after you tap Sign In.
- **Header lockup** — `[Y]ouDO` wordmark with a centered date and quoted ticker underneath.
- **Layouts adapt** — rows wrap and two-column grids drop a column on narrow phones instead of overlapping.
- **Signed-in account card** — same hero treatment as Guest mode: Sync now, Edit, Restore, Sign out.
- **New Task flow** — Target date and Hard deadline stack; Today / Tomorrow sit above the date field.
- **Step entry** — Enter on a sub-step or micro-progress step creates the next one and moves the cursor there.

### ⚙ Under the hood
- Nested overlays stack correctly when auth opens over Settings.

### 💾 Data Safety
- **Android APK**: versionName **3.1.2**, versionCode **9**. Same package id `com.mattedhairr.youdo` — install over **3.1.1**.

---

## [v3.1.1] — 2026-08-14 ("Auth blur and tab hover")

Small fixes to auth overlay stacking and command-bar hover on touch devices.

### 🚀 What you will notice
- **Auth over Settings** — Sign in / Create account blurs Settings behind the sheet.
- **Command bar** — only the current tab stays brass; idle tabs no longer keep a leftover hover fill after you switch on a phone.

### ⚙ Under the hood
- No other notable internal changes.

### 💾 Data Safety
- **Android APK**: versionName **3.1.1**, versionCode **8**. Same package id `com.mattedhairr.youdo` — install over **3.1.0**.

---

## [v3.1.0] — 2026-08-14 ("The 3.x public drop")

First **public 3.x APK**. Includes unreleased 3.0.x work plus execution, backlog, and onboarding. Install over **2.3.0** (same package id).

### 🚀 What you will notice
- **Visual identity** — brass-and-sage theme, new launcher icon, full-viewport overlay blur.
- **Goals stay the source of truth** — edits in Goals update every linked Today, Backlog, and Plan card; cards do not edit the goal backwards.
- **Backlog is honest** — starting a session no longer moves a missed task onto Today. Misses stay in Backlog; the calendar keeps Failed on the original day and Completed + Backlog on the day you clear it.
- **Focus lock** — only one session at a time. The running card pins to the top until you stop.
- **Sign-in clock** — login is not blocked just because the WebView hid the HTTP `Date` header. Only a proven skewed clock is blocked.
- **Navigation and Goals** — brass active tab, location chips, tap anywhere on a phase/goal card to open it, Recently Deleted as its own Settings screen.
- **First-run guides** — interactive tab explainer and step-by-step walkthrough with sketches that match real Today cards.
- **Honest session copy** — Net focus, Duration, Average efficiency; clearer remaining / failed / completed step language; Nimsdai quote restored in the header.

### ☁ Cloud
- Optional account sync plus JSON export/import remain available from Settings.

### ⚙ Under the hood
- Honest session time: no silent overwrite, drop sub-15s accidents, midnight split for calendar totals.
- Guest account card clarifies “this device only / sign in”.

### 💾 Data Safety
- **Android APK**: versionName **3.1.0**, versionCode **7**. Same package id `com.mattedhairr.youdo` — install over **2.x** or any unreleased 3.0 internal build.

---

## [v3.0.1] — 2026-08-14 ("Login clock check") *not published as a GitHub Release*

Fixes a false “clock wrong” error that blocked sign-in in some browsers.

### 🚀 What you will notice
- **Sign-in no longer blocked by a false clock error** — browsers hide the HTTP `Date` header, so the old check treated “could not read server time” as failure. Login now proceeds unless the device is **proven** skewed.

### ⚙ Under the hood
- Server time check only blocks login when skew is confirmed, not when the header is missing.

### 💾 Data Safety
- **Android APK**: versionName **3.0.1**, versionCode **6**. Same package id `com.mattedhairr.youdo` — internal build only; install over **3.0.0**.

---

## [v3.0.0] — 2026-08-14 ("Identity and reliability") *not published as a GitHub Release*

Foundation release: visual identity, honest sessions, ambient mode, and calendar analytics.

### 🚀 What you will notice
- **Full visual identity** — brass-and-sage theme, Figtree + IBM Plex Mono, launcher/PWA icon matching the in-app mark.
- **Full-viewport blur** — expanded cards and every sheet blur header and nav, not only the center column.
- **Honest session analytics** — no silent overwrite of unfinished sessions, sub-15s accidents dropped, overnight sessions split at local midnight, goal stats roll up descendants.
- **Ambient mode** — long-press the play control (~450ms) for full-screen desk mode; screen stays awake.
- **Step timestamps** — completed steps show wall-clock ranges on the expanded card.
- **Calendar day stats** — daily Net Focus, Duration, and efficiency on the Plan date sheet; overnight focus attributed to each local day.

### ☁ Cloud
- Optional account sync and JSON export/import (backup payload version **3.0.0**).

### ⚙ Under the hood
- Starting another session saves the previous one first instead of overwriting it.
- Resume vs Reconstruct: resume counts the gap if you kept working after a crash; reconstruct is for “I forgot to stop.”
- Task cards and goal tree layout cleanup; header quotes restored.

### 💾 Data Safety
- **Android APK**: versionName **3.0.0**, versionCode **5**. Same package id `com.mattedhairr.youdo` — install over **2.x** with no uninstall required.

---

## [v2.0.0] — 2026-08-12 ("The aspirant execution release")

First Android APK and cloud account release, built for competitive exam aspirants (UPSC, JEE, NEET, GATE, CAT).

### 🚀 What you will notice
- **Native Android APK** — standalone install via Capacitor 8; CI builds on GitHub Actions.
- **Account and cloud sign-up** — Supabase auth for optional backup and sync.
- **6-tier goal blueprint** — `Goal` → `Phase` → `Section` → `Task` → `Sub-task` → `Leaf Task`.
- **Step-slice dispatch** — push specific micro-steps from any goal node onto Today.
- **Focus timer and pause logs** — net focus vs elapsed time with break timestamps.
- **Ambient screen** — distraction-free desk clock with safe-area insets.
- **Calendar analytics** — daily planned count on dates; tap for net focus, duration, and efficiency.
- **In-app aspirant guide** — six-step workflow in Settings.

### ☁ Cloud
- Supabase authentication and optional cloud backup introduced.

### ⚙ Under the hood
- 30-second session heartbeat for crash recovery; resume or discard after ~5 minutes away.
- 4-hour auto-pause on continuous focus to limit accidental overnight stats.
- Web Share API backup export on Android; JSON import/export.

### 💾 Data Safety
- **Android APK**: versionName **2.0.0**, versionCode **4**. Same package id `com.mattedhairr.youdo` — first Capacitor release.

---

## [v1.0.0] — 2026-08-01 ("Initial PWA release")

Core web app: local tasks, basic goal tree, and PWA install.

### 🚀 What you will notice
- **Today list and tasks** — add, complete, and reorder daily work stored on device.
- **Basic goal tree** — simple hierarchy for syllabus-style planning.
- **PWA install** — add to home screen for a standalone web app.

### ⚙ Under the hood
- Local storage persistence; no account or cloud sync.

### 💾 Data Safety
- **Web/PWA only** — no Android APK in this release.

---
