# Changelog — YouDO

All notable changes to the **YouDO** project will be documented in this file.

---

## [v2.0.0] — 2026-08-12 ("The Aspirant Execution Release")

### 🚀 Major Highlights
- **Native Android APK Integration**: Compiled standalone Android `.apk` via Capacitor 8 with automated GitHub Actions CI/CD workflows.
- **Targeted Aspirant Focus**: Tailored execution system specifically for competitive exam aspirants (UPSC, JEE, NEET, GATE, CAT) rather than generic todo lists.

---

### 🎯 Goal Blueprint & Scheduling
- **6-Tier Goal Hierarchy**: Structure syllabi into `Goal` → `Phase` → `Section` → `Task` → `Sub-task` → `Leaf Task`.
- **Step-Slice Dispatching**: Select specific micro-steps from any Goal node and push them directly to Today's execution list.
- **Backlog & Today Sync**: Starting a session on a Backlog task moves it to Today with a persistent `📋 Backlog` badge. Completing tasks in Today updates master Goal Blueprint progress in real-time.

---

### ⏱️ Live Sessions & Ambient Mode
- **Focus Timer & Pause Timestamp Logs**: Tracks Net Focus Time (NFT) vs Total Duration. Detailed log of every break taken e.g. `(6:30 PM - 7:10 PM) 40m`.
- **Ambient Screen-On Mode**: Distraction-free focus timer display with dynamic safe-area insets to prevent status bar/camera notch overlap.
- **Clickable Origin Path**: Tap the ancestor path in Ambient mode or cards to jump straight to the exact syllabus location in the Goal Blueprint.

---

### 📅 Calendar & Efficiency Analytics
- **$x^n$ Superscript Notation**: Month view calendar displays $x$ (date) and $n$ (planned task count, color-coded green when 100% completed).
- **Daily Focus Stats**: Tap or long-press any date to view daily Net Focus Time, Total Duration, and Daily Focus Efficiency % `(NFT ÷ Total Duration) × 100`.
- **Streamlined Analytics UI**: Single clean progress bar indicator, backdrop click-to-close modals, and clear "Total Duration" terminology.

---

### 💾 Data Safety & User Onboarding
- **Web Share API Backup**: Export JSON files with native System Save / Share prompts on Android or direct browser downloads.
- **In-App Aspirant Guide**: Comprehensive 6-step user onboarding and architecture breakdown built into Settings.

---

## [v1.0.0] — Initial Release
- Core PWA task manager with local storage support and basic goal tree views.
