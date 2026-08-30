<div align="center">

<img src="public/icon-512.png" width="96" height="96" alt="YouDO logo" />

# YouDO

### Your syllabus is huge. Your next step should not be.

**A goal-driven execution system and Android app for competitive-exam aspirants.**<br />
Turn a long syllabus into a clear blueprint, bring the right work into Today, focus without padding the clock, and see progress return to the goal it came from.

UPSC, JEE, NEET, GATE, CAT, government exams, university entrances, and every serious preparation journey in between.

[**Download the latest Android APK**](https://github.com/mattedhairr/YouDO/releases) &nbsp; | &nbsp; [**Updates**](https://t.me/YouDO_Updates) &nbsp; | &nbsp; [**Join the discussion**](https://t.me/+-manVNAPhThkMzRl)

<br />

[![Latest release](https://img.shields.io/github/v/release/mattedhairr/YouDO?style=flat-square&color=C4A574&label=release)](https://github.com/mattedhairr/YouDO/releases)
[![Android](https://img.shields.io/badge/platform-Android-86A588?style=flat-square&logo=android&logoColor=white)](https://github.com/mattedhairr/YouDO/releases)
[![License](https://img.shields.io/badge/license-MIT-C4A574?style=flat-square)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-community-26A5E4?style=flat-square&logo=telegram&logoColor=white)](https://t.me/+-manVNAPhThkMzRl)

</div>

---

<p align="center">
  <img src="docs/media/youdo-promo-poster.png" width="680" alt="YouDO helps aspirants turn a large syllabus into clear daily work and honest focus statistics" />
</p>

---

## Preparation fails between the plan and the day

Most aspirants already know the destination. The difficulty is turning hundreds of chapters, lectures, practice sets, revisions, and tests into work that can be finished today.

A normal to-do list flattens that structure. A normal timer rewards keeping the clock running. YouDO connects the two:

- every daily task remembers where it belongs in the larger goal;
- every completed step updates the original blueprint;
- every paused minute stays out of net focus;
- every unfinished task remains visible as backlog instead of disappearing;
- every day ends with evidence, not a vague feeling of being busy.

> YouDO is not another place to write what you should do. It is a system for deciding what matters now, doing it, and carrying the result forward.

## One preparation system, four clear stages

| 1. Build | 2. Schedule | 3. Focus | 4. Review |
|---|---|---|---|
| Map the complete syllabus without forcing every branch to be finished immediately. | Send a full task or only selected steps to the day they belong. | Run pause-aware sessions that separate elapsed time from real focus. | See execution, net focus, backlog movement, streaks, and goal progress together. |

## What makes YouDO different

### A blueprint deep enough for a real syllabus

YouDO keeps preparation organised through six connected levels:

```text
Goal
└── Phase
    └── Section
        └── Task
            └── Sub-task
                └── Leaf Task
```

Use only the depth your plan needs. A goal can remain simple, or grow into a detailed blueprint covering subjects, chapters, lessons, practice, notes, and revision.

### Blueprint Studio: structure without repetitive entry

Blueprint Studio helps create or reshape large plans without showing the whole hierarchy at once.

- Build a new goal through one useful question at a time.
- Add named items or numbered ranges in bulk.
- Fully develop one phase while leaving later phases as clean shells.
- Select nodes across different branches and update them together.
- Preview the complete result before applying it.
- Undo the entire bulk operation in one tap.

The regular goal editor remains available whenever direct manual control is faster.

### Step-slice scheduling

A task does not have to move into Today as one oversized block. Schedule only the steps you intend to finish, then return for the next slice later.

You can schedule, replan, or unplan multiple eligible tasks together. Their daily progress continues to write back to the original goal tree.

### Today and Backlog stay honest

Today contains the work chosen for the current date. Work left unfinished keeps its original planning context and appears in Backlog until it is resolved.

Starting a session does not silently move overdue work to Today, and completing a scheduled slice does not hide the unfinished remainder of its parent task.

### Focus measured as work, not presence

YouDO records both total session duration and net focus.

- Pause and resume from the app or Android notification.
- Keep the session accessible from the lock screen.
- Return directly to the running task after reopening the app.
- Use Ambient mode as a full-screen desk timer.
- Recover an interrupted or forgotten session safely.
- Split overnight sessions correctly at midnight.

### A daily briefing that changes with the day

**Today at a Glance** starts as a morning briefing and becomes a progress view once work begins. Its cards avoid repeating the same statistic and can show planning load, backlog pressure, focus, streak context, and time left before midnight.

**Daily Focus Stats** separates task execution from focus quality, so completed work, failed work, net focus, elapsed duration, efficiency, momentum, and individual sessions remain understandable.

### Motivation without forced publicity

- Set a personal daily focus threshold for your streak.
- Recover a recently broken streak through the required real work.
- Join the public Board only if you choose.
- Compare Today, Week, or Month using net focus as the ranking measure.
- Turn Board participation off to remove your public row.

The Board is private by default and runs on an honour system. Padded hours only cheat the person who still has to sit the exam.

## Your data remains yours

YouDO works locally without requiring an account.

- **Guest mode:** goals, plans, and sessions stay on the device.
- **Optional account sync:** carry the same workspace between devices.
- **Local backup:** export and import a JSON snapshot at any time.
- **Private by default:** public Board participation is a separate opt-in.
- **No paid tier or advertising:** the current project is free and open source.

## Get YouDO

### Install the Android APK

1. Open the [latest GitHub Release](https://github.com/mattedhairr/YouDO/releases).
2. Download `YouDO.apk` from the release assets.
3. Allow installation from the browser or file manager if Android asks.
4. Install the APK.

New releases use the same package id and a higher Android `versionCode`. They can install over compatible previous builds when both APKs use the same signing certificate. If Android rejects an older build signed with a different key, uninstall that build once and install the latest release cleanly.

## Community

- [Telegram updates channel](https://t.me/YouDO_Updates) - releases, improvements, known issues, and upcoming work.
- [Telegram discussion group](https://t.me/+-manVNAPhThkMzRl) - questions, feedback, bug reports, and feature ideas.
- [GitHub Issues](https://github.com/mattedhairr/YouDO/issues) - reproducible bugs and technical requests.

Thoughtful feedback from real preparation routines is especially valuable. Explain what you were trying to do, where the workflow slowed you down, and what outcome you expected.

<details>
<summary><strong>Development and technical details</strong></summary>

### Stack

- React 18 and TypeScript
- Vite and Tailwind CSS
- Capacitor 8 for Android
- Supabase for optional authentication, sync, and Board data
- Vitest and ESLint
- GitHub Actions for Android APK builds

### Run locally

Requirements: a current Node.js installation and npm.

```bash
git clone https://github.com/mattedhairr/YouDO.git
cd YouDO
npm install
cp .env.example .env
npm run dev
```

For your own Supabase project, add its URL and anonymous key to `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Validate a change

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

### Android project

After building the web app, sync it into the native project:

```bash
npx cap sync android
```

Open the `android` directory in Android Studio or use the repository's GitHub Actions workflow to produce the APK.

</details>

## Maintainer

Built and maintained by **Jatin Parmar** ([@mattedhairr](https://github.com/mattedhairr)).

[GitHub](https://github.com/mattedhairr) &nbsp; | &nbsp; [LinkedIn](https://www.linkedin.com/in/jatin-parmar-9b1b962ba) &nbsp; | &nbsp; [Instagram](https://instagram.com/mattedhairr)

## License

YouDO is released under the [MIT License](LICENSE).
