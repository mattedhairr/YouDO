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

Large exams are difficult because the syllabus, practice, revision, and daily execution all compete for attention. A flat task such as "study this subject" does not show what to do next.

YouDO turns that workload into a **6-tier Goal Blueprint** (`Goal` → `Phase` → `Section` → `Task` → `Sub-task` → `Leaf Task`) tied to a daily execution list, timed focus sessions, streaks, and calendar stats that count completed work and net focus.

```text
Goal: "Prepare for my target exam"
 └── Phase: "Build the foundation"
      └── Section: "Core subject"
           └── Task: "Complete Topic 1"
                └── Sub-task: "Learn the concept"
                     └── Leaf Task: "Study Lesson 1"
```

---

## Download

### Android APK

1. Open [Releases](https://github.com/mattedhairr/YouDO/releases).
2. Download `YouDO.apk` from the latest release.
3. Install on the device (allow unknown sources if Android asks).

Current release: **v5.0.0**.

### Web (PWA)

Open YouDO in a browser and use **Add to Home Screen** for a standalone install.

---

## Features

- **Blueprint Studio** — create or edit a deep goal plan through one focused question at a time instead of facing the whole hierarchy at once.
- **Bulk blueprint building** — add named lists or numbered ranges, repeat the same structure under several branches, and leave unfinished branches as clean shells for later.
- **Cross-branch editing** — keep items selected while moving between phases or sections, then rename, extend, add shared steps, or remove them together.
- **Preview and undo** — review the complete tree change before applying it and undo the entire operation in one tap.
- **6-tier syllabus tree** — split an exam into goals, phases, sections, and micro-tasks.
- **Flexible planning** — schedule, replan, or unplan multiple leaf tasks and send only selected micro-steps to Today.
- **Backlog** — overdue work stays on its original date until you finish it. Starting a focus session does not move it to Today. Progress still writes back to the blueprint.
- **Focus sessions** — net focus versus elapsed time, pause logs, notification controls, and automatic return to the running task's Scheduled or Backlog location.
- **Ambient mode** — full-screen desk timer (long-press the play control). Screen stays awake.
- **Today at a Glance** — a daily briefing with unique progress metrics, focus time, streak context, backlog pressure, and time left today.
- **Public Board** — optional Today, Week, and Month rankings based on net focus, with private-by-default participation.
- **Honest analytics** — overnight sessions split at midnight and short accidental sessions are excluded.
- **Crash recovery** — resume after a close, or reconstruct a session you forgot to stop.
- **Cloud + local backup** — optional account sync, plus JSON export/import.
- **Fast navigation** — tap the current bottom destination again to return to its root in one step.
- **In-app guide** — an aspirant-focused walkthrough inside Settings.

---

## Blueprint Studio

Open **Goals → Blueprint Studio** and choose one of two paths:

- **Create** starts with the outcome, then asks only whether the current branch needs the next hierarchy level. Add real names or generate numbered sequences, choose which branches to develop now, and leave the rest for later.
- **Edit existing** lets you browse the current tree, preserve selections across different branches, and apply one safe bulk operation to all selected items.

The manual Goal editor remains available. Blueprint Studio is an additional planning tool, not a replacement for existing workflows.

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
