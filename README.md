# YouDO — Aspirant Execution Companion

<p align="center">
  <img src="public/icon.svg" width="96" height="96" alt="YouDO Icon" />
</p>

<p align="center">
  <strong>The ultimate goal-driven execution system for students & competitive exam aspirants.</strong><br />
  Transform massive exam syllabi into daily micro-targets and execute relentlessly.
</p>

<p align="center">
  <a href="https://github.com/mattedhairr/YouDO/releases"><img src="https://img.shields.io/github/v/release/mattedhairr/YouDO?color=emerald&label=Release" alt="Latest Release" /></a>
  <a href="https://github.com/mattedhairr/YouDO/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/mattedhairr/YouDO/actions"><img src="https://img.shields.io/badge/Build-Android%20APK-7C3AED.svg" alt="Android Build" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/Framework-React%2018-61dafb.svg" alt="React 18" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/Language-TypeScript-3178c6.svg" alt="TypeScript" /></a>
</p>

---

## 🎯 Purpose & Architecture

Preparing for competitive exams like **UPSC, JEE, NEET, GATE, CAT, USMLE, or Bar Exam** requires conquering intimidating, multi-subject syllabi. 

Conventional to-do apps fail because flat lists become overwhelming and vague tasks like *"study physics"* create study paralysis. **YouDO** solves this with a **structured 6-tier Goal Blueprint** (`Goal` &rarr; `Phase` &rarr; `Section` &rarr; `Task` &rarr; `Sub-task` &rarr; `Leaf Task`) synced with a **real-time Daily Execution Engine**.

```text
Goal: "UPSC / JEE / NEET Exam 2026"
 └── Phase: "Phase 1: Core Physics & Chemistry"
      └── Section: "Mechanics Module"
           └── Task: "Rotational Motion"
                └── Sub-task: "Video Lectures"
                     └── Leaf Task: "Watch Lecture 1 & Take Notes"
```

---

## 📱 Download & Installation

### 🤖 Native Android App (APK)
Download the compiled `.apk` directly from [**GitHub Releases**](https://github.com/mattedhairr/YouDO/releases):
1. Go to [**Releases**](https://github.com/mattedhairr/YouDO/releases).
2. Download `YouDO.apk` from the latest release.
3. Tap the file on your Android device to install!

### 🌐 Web Application (PWA)
1. Open YouDO on any desktop or mobile browser.
2. Select **"Add to Home Screen"** to install as a standalone PWA.

---

## 🔥 Key Features

- **🎯 6-Tier Syllabus Blueprint Tree**: Break massive exam syllabi into granular, non-intimidating tiers (`Goal` &rarr; `Phase` &rarr; `Section` &rarr; `Task` &rarr; `Sub-task` &rarr; `Leaf Task`).
- **⚡ Step-Slice Scheduling**: Select specific micro-tasks or chapter step slices from any goal node and dispatch them directly to Today's execution list.
- **📋 Backlog & Bidirectional Sync**: Overdue tasks land in Backlog. Starting a Backlog session moves the task to Today while preserving its original tag, and progress syncs back to the Goal Blueprint automatically.
- **⏱️ Focus Sessions & Pause Timestamp Logs**: Track net focus time vs total duration with full pause timestamp logs e.g. `(6:30 PM - 7:10 PM) 40m`.
- **🌙 Ambient Focus Mode**: Screen-on distraction-free desk display with safe-area insets for camera notches and status bar compatibility.
- **🛡️ Analytics Reliability Safeguards**: 30-second silent heartbeat logging, 5-minute interrupted session crash recovery, and 4-hour continuous focus auto-pause safeguard to protect efficiency stats from accidental overnight timers.
- **💾 Web Share & Local JSON Backup**: Export/Import your study blueprints with native Web Share API prompts (`@capacitor/share`) or browser downloads.
- **📖 In-App Aspirant Execution Guide**: Comprehensive 6-step user onboarding and workflow guide built right into Settings.

---

## 💻 Tech Stack

- **Core Framework**: React 18, TypeScript, Vite
- **Mobile Platform**: Capacitor 8 (Android Platform Integration)
- **Styling**: Executive Dark Glassmorphism, Vanilla CSS, Tailwind CSS
- **Icons**: Lucide React
- **CI/CD**: GitHub Actions Automated Android APK Build Workflow

---

## 👨‍💻 Creator & Maintainer

Crafted with care by **Jatin Parmar** ([@mattedhairr](https://github.com/mattedhairr)).

- **GitHub**: [@mattedhairr](https://github.com/mattedhairr)
- **LinkedIn**: [Jatin Parmar](https://www.linkedin.com/in/jatin-parmar-9b1b962ba)
- **Instagram**: [@mattedhairr](https://instagram.com/mattedhairr)

License: [MIT License](LICENSE)
