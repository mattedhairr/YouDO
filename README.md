# YouDO — Aspirant Execution Companion

<p align="center">
  <img src="public/icon-512.png" width="112" height="112" alt="YouDO" />
</p>

<p align="center">
  <strong>Break a huge syllabus into today's work. Then actually do it.</strong><br />
  Built for students and competitive exam aspirants who need structure, focus time, and honest stats.
</p>

<p align="center">
  <a href="https://github.com/mattedhairr/YouDO/releases"><img src="https://img.shields.io/github/v/release/mattedhairr/YouDO?color=C4A574&label=Release" alt="Latest Release" /></a>
  <a href="https://github.com/mattedhairr/YouDO/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-86A588.svg" alt="MIT License" /></a>
  <a href="https://github.com/mattedhairr/YouDO/actions"><img src="https://img.shields.io/badge/Build-Android%20APK-11100E.svg" alt="Android Build" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-61dafb.svg" alt="React 18" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178c6.svg" alt="TypeScript" /></a>
</p>

---

## Purpose

Competitive exams (UPSC, JEE, NEET, GATE, CAT, and similar) fail people on volume, not intelligence. A flat to-do list of "study physics" is how days disappear.

YouDO is a **6-tier Goal Blueprint** (`Goal` → `Phase` → `Section` → `Task` → `Sub-task` → `Leaf Task`) tied to a **daily execution list**, timed focus sessions, and calendar stats that count only real work.

```text
Goal: "UPSC / JEE / NEET Exam 2026"
 └── Phase: "Phase 1: Core Physics & Chemistry"
      └── Section: "Mechanics Module"
           └── Task: "Rotational Motion"
                └── Sub-task: "Video Lectures"
                     └── Leaf Task: "Watch Lecture 1 & Take Notes"
```

---

## Download

### Android APK

1. Open [Releases](https://github.com/mattedhairr/YouDO/releases).
2. Download `YouDO.apk` from the latest release.
3. Install on the device (allow unknown sources if Android asks).

Current release: **v3.7.1**.

### Web (PWA)

Open YouDO in a browser and use **Add to Home Screen** for a standalone install.

---

## Features

- **6-tier syllabus tree** — split an exam into goals, phases, sections, and micro-tasks.
- **Step-slice scheduling** — send specific steps from any goal node onto Today.
- **Backlog** — overdue work stays on its original date until you finish it. Starting a focus session does not move it to Today. Progress still writes back to the blueprint.
- **Focus sessions** — net focus vs elapsed time, pause logs, live `start – ∞` while running.
- **Ambient mode** — full-screen desk timer (long-press the play control). Screen stays awake.
- **Honest analytics** — overnight sessions split at midnight, short accidental sessions dropped, goal stats roll up descendants.
- **Crash recovery** — resume after a close, or reconstruct a session you forgot to stop.
- **Cloud + local backup** — optional account sync, plus JSON export/import.
- **In-app guide** — six-step workflow inside Settings.

---

## Stack

- React 18, TypeScript, Vite
- Capacitor 8 (Android)
- Tailwind CSS with a brass / sage theme (dark + dusky light)
- Figtree + IBM Plex Mono
- GitHub Actions → debug APK artifact

---

## Maintainer

**Jatin Parmar** ([@mattedhairr](https://github.com/mattedhairr))

- GitHub: [@mattedhairr](https://github.com/mattedhairr)
- LinkedIn: [Jatin Parmar](https://www.linkedin.com/in/jatin-parmar-9b1b962ba)
- Instagram: [@mattedhairr](https://instagram.com/mattedhairr)

License: [MIT](LICENSE)
