# Changelog — YouDO

All notable changes to the **YouDO** project will be documented in this file.

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
