# Changelog — YouDO

All notable changes to the **YouDO** project will be documented in this file.

---

## [v3.1.2] — 2026-08-14 ("Header, layout & signed-in identity")

### 🚀 Major Highlights
- **Auth blur on open**: Sign in over Settings blurs immediately — not only after you tap Sign In.
- **Header lockup**: `[Y]ouDO` wordmark with a centered date, and a quoted ticker underneath.
- **Layouts adapt**: rows wrap and two-column grids drop a column on narrow phones instead of overlapping.
- **Signed-in account card**: same hero treatment as Guest mode — live on every device, Sync now, Edit / Restore / Sign out.

### ⚡ Flow
- New Task: Target date and Hard deadline stack; Today / Tomorrow sit above the date field.
- Enter on a sub-step or micro-progress step creates the next one and moves the cursor there.

### 💾 Data Safety
- **Android APK**: versionName **3.1.2**, versionCode **9**. Same package id `com.mattedhairr.youdo` — install over 3.1.1.

---

## [v3.1.1] — 2026-08-14 ("Auth blur & tab hover")

- **Auth over Settings**: Sign in / Create account now blurs Settings behind the sheet (nested overlays stack correctly).
- **Command bar**: only the current tab stays brass. Idle tabs no longer keep a leftover hover fill after you switch on a phone.

### 💾 Data Safety
- **Android APK**: versionName **3.1.1**, versionCode **8**. Same package id — install over 3.1.0.

---

## [v3.1.0] — 2026-08-14 ("The 3.x public drop")

First **public 3.x APK**. v3.0.0 and v3.0.1 were never published as GitHub Releases — this build includes that work plus execution, backlog, and onboarding. Install over **2.3.0** (same package id).

### 🚀 Major Highlights
- **Visual identity**: Brass-and-sage theme, new launcher icon, full-viewport overlay blur.
- **Goals stay the source of truth**: edits in Goals (title, description, steps, completion) update every linked Today, Backlog, and Plan card. Those cards do not edit the goal backwards.
- **Backlog is honest**: starting a session no longer moves a missed task onto Today. Misses stay in Backlog; the calendar keeps Failed on the original day and Completed + Backlog on the day you clear it.
- **Focus lock**: only one session at a time. The running card pins to the top; other Today/Backlog cards cannot be tapped until you stop.
- **Sign-in clock**: login is not blocked just because the WebView hid the HTTP `Date` header. Only a proven skewed clock is blocked.

### 🎨 Navigation & Goals
- Command bar: solid brass active tab, muted idle tabs, dark count chip that reads on brass.
- Goals: location chips instead of a sparse “All Goals” strip; tap anywhere on a phase/goal card to open it (actions still work).
- Recently Deleted is its own Settings screen (not a 20-item dropdown). Goal deletes only — not standalone Today tasks.

### 📘 First-run guides
- **The three tabs** and **Getting started** open as full screens: interactive tab explainer, step-by-step walkthrough, sketches that match real Today cards. Backlog is described as automatic.
- Guest account card is a clear “this device only / sign in” hero.

### 📊 Sessions & copy
- Honest session time (no silent overwrite, drop sub-15s accidents, midnight split).
- Stats labels: Net focus, Duration, Average efficiency; clearer remaining / failed / completed step language.
- Nimsdai quote restored in the header.

### 💾 Data Safety
- **Android APK**: versionName **3.1.0**, versionCode **7**. Same package id `com.mattedhairr.youdo` — install over 2.x / any unreleased 3.0 internal build.

---

## [v3.0.1] — 2026-08-14 ("Login clock check") *not published as a GitHub Release*

### 🚀 Major Highlights
- **Sign-in no longer blocked by a false clock error**: browsers hide the HTTP `Date` header, so the old check treated “could not read server time” as a failed clock. Login now proceeds unless the device is **proven** skewed.

---

## [v3.0.0] — 2026-08-14 ("The Identity & Reliability Release") *not published as a GitHub Release*

### 🚀 Major Highlights
- **Full Visual Identity**: Brass-and-sage theme (dark charcoal + dusky light), 12px corners, Figtree + IBM Plex Mono, and a new launcher/PWA icon that matches the in-app mark.
- **Overlay Architecture Rewrite**: Expanded cards and every sheet now blur the **full viewport** — header and nav included — instead of only the center column.
- **Honest Session Analytics**: Time you see is work you did: no silent overwrite of an unfinished session, no sub-15s accidents in totals, overnight sessions split at local midnight, goal stats roll up descendants.

---

### 🎨 Look, Icon & Quotes
- **App Icon**: Dark `#11100E` field, brass Y-stem, sage check — used for PWA, Apple touch, and Android adaptive launcher.
- **Task Cards & Goal Tree**: Backlog on the metadata row; Description beside the title; compact expanded step list (check, name, time); cleaned pinned goals and node cards.
- **Header Quotes**: Nimsdai’s line restored — *Giving up is not in the blood sir..... not in the blood* — plus additional hard-hitting student quotes.

---

### 🛡️ Analytics Reliability & Session Safeguards
- **Session Persistence**: Starting another session saves the previous one first instead of overwriting it.
- **Countable Focus**: Sessions under 15 seconds of net focus are dropped from save and summaries.
- **Midnight Split**: Overnight timers are split at local midnight so calendar daily totals stay honest.
- **Goal Roll-up**: Goal analytics include descendant nodes, not only the node you opened.
- **Live Timers**: Net focus (not raw wall-clock); durations show seconds when needed; running sessions display `start – ∞`.
- **Resume vs Reconstruct**: Resume still counts the gap if you kept working after a crash; Reconstruct is for “I forgot to stop.”

---

### ⏱️ Live Sessions & Ambient Mode
- **Long-press Ambient**: Hold the play control ~450ms to enter full-screen desk mode (screen stays awake).
- **Step Timestamps**: Completed steps show wall-clock ranges on the expanded card.

---

### 📅 Calendar & Efficiency Analytics
- **Daily Stats Info**: Same analytics affordance as task/goal stats on the calendar day sheet.
- **Overnight Attribution**: Focus spanning two dates is attributed to each local day correctly.

---

### 💾 Data Safety & Onboarding
- **Android APK**: versionName **3.0.0**, versionCode **5**. Same package id — no uninstall required to update from 2.x.
- **Cloud + Local Backup**: Optional account sync plus JSON export/import (backup payload version **3.0.0**).

---

## [v2.0.0] — 2026-08-12 ("The Aspirant Execution Release")

### 🚀 Major Highlights
- **Native Android APK Integration**: Compiled standalone Android `.apk` via Capacitor 8 with automated GitHub Actions CI/CD workflows.
- **Account & Cloud Sign Up**: Supabase Authentication integration for account-backed session state.
- **Targeted Aspirant Architecture**: Tailored execution companion specifically engineered for competitive exam aspirants (UPSC, JEE, NEET, GATE, CAT).

---

### 🎯 Goal Blueprint & Scheduling
- **6-Tier Goal Hierarchy**: Structure syllabi into `Goal` → `Phase` → `Section` → `Task` → `Sub-task` → `Leaf Task`.
- **Step-Slice Dispatching**: Select specific micro-steps from any Goal node and push them directly to Today's execution list.
- **Backlog & Today Sync**: Starting a session on a Backlog task moves it to Today with a persistent `📋 Backlog` badge. Completing tasks in Today updates master Goal Blueprint progress in real-time.

---

### 🛡️ Analytics Reliability & Session Safeguards
- **30-Second Silent Heartbeat**: Continuous background timer pulse recording session state every 30 seconds.
- **Interrupted Session Recovery**: Auto-detects app crashes, phone shutdowns, or closures >5 minutes and prompts to **Resume** or **Discard** on launch.
- **4-Hour Auto-Pause Safeguard**: Automatically pauses continuous focus timers running >4 hours without interaction, protecting Net Focus Efficiency stats from accidental overnight running timers.

---

### ⏱️ Live Sessions & Ambient Mode
- **Focus Timer & Pause Timestamp Logs**: Tracks Net Focus Time (NFT) vs Total Duration. Detailed log of every break taken e.g. `(6:30 PM - 7:10 PM) 40m`.
- **Ambient Screen-On Mode**: Distraction-free desk clock with dynamic safe-area insets to prevent status bar/camera notch overlap.
- **Clickable Origin Path**: Tap the ancestor path in Ambient mode or cards to jump straight to the exact syllabus location in the Goal Blueprint.

---

### 📅 Calendar & Efficiency Analytics
- **$x^n$ Superscript Notation**: Month view calendar displays $x$ (date) and $n$ (planned task count, color-coded green when 100% completed).
- **Single-Tap `[📊 Stats]` Chip**: Single-tap date header stats chip to view daily Net Focus Time, Total Duration, and Daily Focus Efficiency % `(NFT ÷ Total Duration) × 100`.
- **Streamlined Analytics UI**: Single clean progress bar indicator, backdrop click-to-close on all modals, and clear "Total Duration" terminology.

---

### 💾 Data Safety & User Onboarding
- **Web Share API Backup**: Export JSON files with native System Save / Share prompts on Android (`@capacitor/share`) or direct browser downloads.
- **In-App Aspirant Guide & Collapsible Architecture**: Comprehensive 6-step user onboarding and collapsible architecture tabs built into Settings.

---

## [v1.0.0] — Initial Release
- Core PWA task manager with local storage support and basic goal tree views.
