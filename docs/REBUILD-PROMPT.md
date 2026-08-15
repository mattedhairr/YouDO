# YouDO — one-shot rebuild prompt

Copy everything below the line into a new coding agent chat. Do not paraphrase. The agent should treat this as the product spec, architecture, and acceptance criteria.

---

You are building **YouDO** from scratch: an **aspirant execution companion** (UPSC / JEE / NEET / GATE / CAT and similar). It is **not** a generic todo app, not a Pomodoro toy, and not a habit streak game. The product is a **syllabus blueprint** (nested goals) plus **daily execution** (Today / Backlog / Calendar) plus **one honest focus sitting** at a time.

I am the product owner. I do **not** live in the IDE. Write working code, keep the UI dark and calm, and **never invent sample syllabus data**. Empty on first launch is correct.

If a later message in this chat contradicts this prompt, **this prompt wins** unless I explicitly say a rule is changing.

## 1. Product in one paragraph

A student breaks a huge exam into a 6-kind tree (goal → phase → section → task → sub → leaf). Leaves can have micro-steps. They **slice** steps onto a calendar date as a daily card. They sit with **one** live timer. Stats must match reality after phone lock, a forgotten stop, falling asleep, or a device clock change. Optional cloud backup must **merge** two phones, never silently wipe either side with an empty device.

## 2. Stack (do not substitute)

- React 18 + TypeScript + Vite
- Tailwind CSS (custom theme, not default indigo)
- Capacitor 8 for Android (`appId` / `applicationId`: `com.mattedhairr.youdo`)
- lucide-react icons
- Vitest for domain tests
- vite-plugin-pwa for **web** only; **do not** register a service worker inside the Capacitor WebView (`capacitor://` / `file://`)
- Optional Supabase auth + JSON backup (URL and **anon** key via `VITE_SUPABASE_*`; Capacitor APK often has no env inject — document a public-anon fallback **plus RLS**, never a service-role key)
- `@capacitor-community/keep-awake` for Ambient mode
- Capacitor App / Filesystem / Share / StatusBar as needed

Package name in npm: `youdo`. App display name: **YouDO**.

## 3. Theme and chrome (non-negotiable)

- Dark default: page `#11100E`, brass primary `#c4a574`, sage `#86a588`
- Dusky light theme as a second mode, same brass/sage
- Fonts: **Figtree** (UI) + **IBM Plex Mono** (timers / numbers)
- Corner radius ~12px; no playful gradients, no gamification badges
- Wordmark style: `[Y]ouDO` with a centered local date and a short quoted ticker under the header
- Viewport: no user zoom; `viewport-fit=cover`; status bar translucent on Android
- First-run: **no demo goals, no demo tasks, no fake sessions**

## 4. Information architecture

Three main tabs:

1. **Today** — cards scheduled for local today (and completed catch-up that still belongs in backlog until midnight — see backlog rules).
2. **Goals** — the tree is the source of truth. Drill in, pin, duplicate, edit, plan slices onto dates.
3. **Calendar** — month grid of scheduled cards; jump to the linked goal; open stats for a card.

Plus: Settings sheet, Add Goal, Add / plan Task (step-slice), Step slice editor, Analytics for a card/goal, Ambient full-screen timer, session recovery dialog, reconstruct slider sheet, optional sign-in.

**One live session globally.** Starting another must stop or refuse — never two concurrent timers.

## 5. Data model (implement exactly)

### Task (daily card)

`id`, `title`, `description`, `priority` (`high|medium|low`), `targetDate` (local `yyyy-mm-dd` or null), `deadline`, `steps[]` (labels on **this card**), `progress` (0..steps.length), `createdAt`, `order`, optional `goalNodeId`, optional `stepSlice` (indices into the **master node’s** `steps`), optional `originalTargetDate`, optional `pastFailedNativeDates[]`, optional `pastFailedBacklogDates[]`.

### GoalNode

`kind`: `'goal' | 'phase' | 'section' | 'task' | 'sub' | 'leaf'`  
`id`, `title`, optional `description`, optional `startDate`/`endDate`, `children[]` (unlimited nesting; kinds are labels not a hard depth cap), optional `steps[]` + parallel `stepDone[]` (source of truth for leaf progress), `completed?`, `todayTaskId?`, `pinned?`, `createdAt`.

**Goal node is source of truth** for title, description, and micro-steps. Linked daily cards **mirror** from the node; checking steps on Today writes back to `stepDone`. Tree updates must use **structural sharing** (`updateNode` / `removeNode` return the same object if nothing changed) so heartbeat and unrelated screens do not clone the whole forest.

Rollup %: leaf with steps = fraction of `stepDone`; leaf without steps = 0 or 100 from `completed`; parent = fraction of **direct children** that are complete (child complete if `completed` or rollup 100). Cache rollups and clear the cache on tree mutation.

### Sessions

**ActiveSession** (exactly one, local-only, never uploaded as “live”): `taskId`, `startTime`, `pausedDuration`, `isPaused`, `pauseStart?`, `lastHeartbeat` (foreground tick ~30s), `pauses[]`, `wallClockStart`, optional `returnedAt` (when the user said they kept working after an interruption).

**TaskSession** (history): ids, start/end, pause totals, `netFocusMs`, wall-clock strings, `completed: boolean | 'partial'`, `completedStepIndices`, optional `goalNodeId`, optional `manual: true` for checkoffs **outside** a sitting.

Pauses: `{ start, end?, wallClockStart?, wallClockEnd?, durationMs? }`.

## 6. Today / Backlog / Calendar rules (easy to get wrong)

- Incomplete work with `targetDate < today` stays **Backlog** on that original date. **Starting a session does not move it to Today.**
- When overdue work is **finished**, stamp today as the clear date, keep the miss in `originalTargetDate` / `pastFailedNativeDates` so calendar/stats still show the miss. Completed catch-up remains backlog-shaped **until local midnight**, then drops.
- Badges and “N overdue” count **`isOpenBacklogTask`** (backlog AND not complete), not every backlog-shaped card.
- Step-slice: a card can target a subset of a node’s steps. Completing the card’s slice must sync `stepDone` on the node. Completing the **whole** node/task is a distinct analytics label (“Whole task completed”) vs partial steps.
- Checking a step with **no** live session still creates a **manual** history row (`netFocusMs` 0, `manual: true`) so analytics are honest.

## 7. Focus timer — honesty is the product

Constants:

- Drop accidental sittings under **15s** from countable stats (`MIN_COUNTABLE_MS`) unless they are manual step rows.
- Heartbeat stale after **5 minutes** (`STALE_HEARTBEAT_MS = 300_000`) → offer recovery.
- Forgotten continuous focus caps at **4 hours from last resume** (`MAX_CONTINUOUS_FOCUS_MS = 14_400_000`). `returnedAt` / last pause-end is “last resume”. **Resume (“I kept working”) only moves the 4h window; it does not remove the cap.**
- Absolute absurd span clamp: 7 days.

User-facing cases (implement all four):

1. **Phone aside / screen lock** — sitting must survive. Do not treat lock as a broken clock. While locked, WebView often **freezes `performance.now()`** while `Date.now()` keeps moving. That pattern is **sleep**, not a jump, **only if the app was actually backgrounded**. The same gap while the app is visible is a real clock change.
2. **Forgot to stop** — after ~5 min stale heartbeat: **Resume** / **reconstruct with a slider** / **Discard**. Discard saves **nothing**.
3. **Fell asleep** — discard is complete; reconstruct sheet also has discard.
4. **Forgotten overnight** — Stop without a chosen end uses `safetyCapEnd` (4h from last resume). Reconstruct slider **may go to Now** (user choice) with a warning if the span is over 4h.

Stop after unlock: **never** call a clock-jump guard that can fail the persist. Compute end with `resolvePersistEndAt(session, now, { userEnd?, clockIncident })`. If there is a clock incident, persist using last heartbeat (capped), do not drop the sitting. Heartbeat **must not** run when the clock sample failed, and a stale gap **must not** bump `lastHeartbeat` (or recovery never fires).

Foreground 4h: auto-pause at lastResume + 4h so the timer cannot run forever while the app is open.

Overnight split: when **displaying** stats by calendar day, split a sitting at **local midnight**. Do not rewrite already-saved history rows to “fix” old 8h nights.

**Live `activeSession` is device-local.** Cloud merge must not overwrite a running timer from another phone.

Split React context: session heartbeat must **not** re-render Goals/Calendar. `useStore` vs `useSessionStore` (or equivalent).

Ambient mode: long-press play; full-screen desk timer; keep screen awake; clock type must **fit inside the ring** (no overflow).

## 8. Device clock vs sleep (implement as a small module)

Compare `Date.now()` vs `performance.now()` deltas.

- Threshold ~3 minutes.
- If wall jumped a lot and monotonic barely moved **and** source is resume / recently backgrounded (~8s) → **sleep** (continue the sitting).
- If wall vs mono diverge beyond threshold otherwise → **jump** (clock incident): block cloud **writes**, do not treat lock-stop as discard, surface a clear warning.
- Do not fold sleep into jump. Do not trust “sleep” while the UI was in the foreground.

Capacitor: listen to app pause/resume and `visibilitychange`; mark hidden so the next sample can be classified as resume.

## 9. Overlays (WebView landmine)

All sheets/modals portal into `#overlay-root` (sibling of `#root`), not inside the scrolling app tree.

Blur: `backdrop-filter: blur(20px) saturate(1.2)` on the **full-viewport overlay layer itself** (fixed, 100dvh). **Never animate opacity on `.overlay-layer` / `.overlay-scrim`.** Opacity animation on that node **kills** `backdrop-filter` in Chromium/Android WebView.

On open, re-kick the filter next animation frame (set filter none, then remove the property) because the first portal paint often skips blur until a later compositor tick.

Stacked overlays increment z-index. Escape and body scroll lock. Click scrim to close unless it is a blocking recovery.

## 10. Cloud and backup

- Local persistence: localStorage (and Capacitor filesystem export/share JSON).
- Signed-in: periodic backup of workspace JSON.
- **Empty local must never overwrite a non-empty cloud snapshot.** If the user wants the cloud empty, Settings → **Clear cloud backup** with an explicit confirm.
- Default sync: **merge** tasks, goals, session history, and recently-deleted (union ids, OR of `stepDone`, deletes win via trash of last 20). Same-id sessions merge by identity; do not last-write-wins the whole arrays.
- Settings **Restore** a chosen snapshot: **replace** this device on purpose (user confirmed).
- Clock incident: **no cloud writes**.
- Auth UI over Settings must blur **immediately** on open, not only after tapping Sign In.

SQL: user-scoped backup tables; RLS so the anon key cannot read another user.

## 11. Analytics

- Countable focus = `netFocusMs >= 15s`.
- Manual rows listed as Manual, not as focus time.
- Goal stats roll up **descendant** sittings, not only the node’s own id.
- Overnight sittings split at local midnight for the day chart.
- Copy: “Whole task completed” when the card/node is fully done; otherwise partial/step language. No shame copy. **Never** use the line “Keep pushing. Keep executing. The slate is clean.” in GitHub releases or in-app.

## 12. Android shipping

- Same package id forever: `com.mattedhairr.youdo` so updates install over old APKs.
- Bump **both** `package.json` version, Android `versionName`, and `versionCode` (integer, always +1) for every public APK.
- GitHub Actions builds a **debug APK**. Do not tell users to reuse an old APK.
- Release process: **branch → PR → merge on GitHub → wait for Actions → GitHub Release with that new APK**. Do not push straight to `main` as the shipping method. Do not use GitHub CLI or stored git passwords to open PRs unless I ask.
- Conventional commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
- Changelog is user-facing first, then a short under-the-hood list.

## 13. Quality bar

- Domain logic (tree, dates, session finalize/cap/recovery, merge, clock classify) lives in `src/lib/*` with **Vitest** covering: lock ≠ jump, stale heartbeat recovery, 4h cap vs resume window, reconstruct vs discard, backlog open vs completed, structural sharing, merge empty-protect, midnight split, 15s drop.
- Typecheck + tests must pass.
- No unused components, unused npm deps, duplicate date helpers, or leftover aliases (`countLeaves` wrapping `countDirectChildren`, etc.).
- Do not rewrite Zustand “because it’s cleaner” unless asked. A React context store is fine if split so session ticks stay cheap.
- Crash boundary: reload vs wipe local keys.

## 14. Suggested build order

1. Types + dates + ids + goal tree + tests (empty seeds).
2. Store: tasks/goals persist, plan slice, mirror, backlog helpers.
3. Shell + Today/Goals/Calendar UI + overlays (blur rules first).
4. Session engine + clock module + recovery UI + reconstruct slider + ambient.
5. Analytics.
6. Settings, JSON backup, then Supabase merge/restore/clear-cloud.
7. Capacitor Android + keep-awake + PWA for web only.
8. Polish copy, versioning, changelog.

## 15. Explicitly do not

- Do not animate overlay-layer opacity.
- Do not last-write-wins cloud.
- Do not upload live `activeSession` as the other phone’s timer.
- Do not treat screen-lock freeze as a clock jump.
- Do not bump heartbeat across a 5-minute gap.
- Do not move backlog to Today on session start.
- Do not ship sample data.
- Do not put a service-role key in the client.
- Do not force-push `main`.
- Do not “fix” historical saved sessions by rewriting 8h nights.

Build YouDO to this spec. When a detail is missing, choose the option that **protects honest time** and **does not destroy user data**.
