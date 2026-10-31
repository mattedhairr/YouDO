# Where We Left Off

Last updated **2026-10-31**, right after **v8.3.1** was released. Work pauses here for about four months. Read this file first when coming back, then [AGENTS.md](AGENTS.md) (how we work) and [RELEASE_PROCEDURE.md](RELEASE_PROCEDURE.md) (how we ship).

---

## Current state

- **Latest release:** v8.3.1, versionCode 85, published 2026-10-31.
  - It is on GitHub Releases with `YouDO.apk`.
  - The website https://youdo-app.vercel.app serves 8.3.1.
  - It was announced on Telegram.
- **Git:** only the `main` branch exists. Nothing is unreleased or half-done.
- **Server (Supabase `iyrnywfaxakvjkmddmqv`):**
  - every SQL file in `supabase/` and the `send-push` function were applied to production by v8.3.0 (checked 2026-10-29);
  - v8.3.1 had no server changes.
- **What v8.3.1 contained:**
  - widgets that move on to a new day without the app;
  - the widget's "left today" counting to midnight;
  - a clearer update pop-up and installer;
  - the ambient screen's status bar hiding again after the notification shade.

## Check these on a real phone first

These shipped without a device test, because the owner chose a direct release.

1. **Widgets after midnight, with the app closed.**
   - Open YouDO once after installing 8.3.1, so the widgets learn the date.
   - The next morning, Dashboard should show that day's cards, with yesterday's unfinished cards under overdue and focus at 0m.
2. **Widget "left today" between 00:00 and 06:00.** It should read the real time to midnight (about 22½h at 01:15), with the needle full.
3. **Ambient screen.** Pull down the notification shade, close it and come back. The status bar should hide again.
4. **The new update pop-up and installer.** You'll check these: the glass card, titled "what's new" lines, Full notes, the ring with "2.4 of 11.1 MB", and an upright ✓. They first appear when a phone on 8.3.1 updates to the *next* version.

If something is wrong, fix it on a `fixes` branch and ship a patch (v8.3.2).

## Known limits and ideas for later

- **Edits made elsewhere.** The widgets cannot see changes made on another device (such as the website) while the phone app is closed. Fixing it would mean fetching from Supabase in the background (for example WorkManager plus the stored widget key). That is a bigger piece of work, so it was left for later.
- **Average and streak.** The widget's 30-day average and the streak count refresh only when the app opens.
- **No local Android build.** The Android code cannot be compiled on the Windows PC; the CI build is its first compile. Run a test APK from Actions when Java changes are risky.
- **Bundle budget.** The first-load JavaScript is close to its gzip budget (`npm run verify:build`), so new first-screen code should be lazy-loaded.

## How to resume

```bash
git checkout main
git pull --ff-only
npm ci
```

Then:
1. Copy `.env.example` to `.env` and fill it in from the Supabase dashboard → Project Settings → API (URL and anon key).
2. Start the app with `npm run dev`; it runs at http://localhost:5173.
3. Start new work on a branch made from `main`: `git checkout -b fixes`.

## Map of the project

| Area | Where |
|---|---|
| Web app | React + Vite + Tailwind in `src/`. `src/App.tsx` wires the screens; `src/store.tsx` holds goals and tasks |
| Logic | `src/lib/*.ts`: pure functions, each with a `*.test.ts` beside it |
| Screens | `src/components/` (Classic Look lives in `src/legacy/`) |
| Android shell | Capacitor in `android/`; native code in `android/app/src/main/java/com/mattedhairr/youdo/` |
| Home-screen widgets | Snapshot: `src/lib/homeWidgets.ts` and `src/hooks/useHomeWidgets.ts`. Native: `HomeWidgets.java` (drawing), `HomeWidgetStore.java` (snapshot, new-day roll-over), `UpNextWidget.java` (Dashboard), `RoomWidget.java`, `ArcPainter.java` |
| In-app updater | `src/lib/appUpdate.ts`, `src/components/UpdateNotice.tsx`, `src/components/UpdateInstaller.tsx`, `YouDoAppUpdatePlugin.java`, `docs/update-delivery.md` |
| Guide | `src/components/HelpCenterSheet.tsx` and `helpCenter.css` |
| Focus sounds and ambient | `src/lib/focusSounds.ts`, `src/components/AmbientScreen.tsx`, `FocusSoundService.java`, `docs/focus-sounds.md` |
| Server | `supabase/*.sql` (each safe to re-run), `supabase/functions/send-push` and `delete-account` |
| CI | `.github/workflows/pr-checks.yml` (checks on pull requests), `build-apk.yml` (signed APK on `main`) |
| Store text | `fastlane/metadata/android/en-US/` (one changelog file per versionCode) |

## Accounts you will need

- **GitHub** `mattedhairr`: sign in through the browser. The `gh` CLI is not used.
- **Vercel:** the YouDO project, which deploys the website from `main`.
- **Supabase:** project `iyrnywfaxakvjkmddmqv`, for SQL, edge functions and secrets.
- **Firebase:** sends the push notifications. Its service account is stored as the Supabase secret `FIREBASE_SERVICE_ACCOUNT`.
- **Telegram:** the YouDO channel and its discussion group.
- **Android signing key:** stored in the GitHub secrets `YOUDO_SIGNING_KEYSTORE_BASE64` and `YOUDO_SIGNING_PASSWORD`. Keep an offline backup of the keystore and its password. If it is lost, every user has to reinstall, as happened before v6.
