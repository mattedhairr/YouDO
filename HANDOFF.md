# Where We Left Off

Last updated **2026-11-05**, after **v8.3.4** was released. Read this file first when coming back, then [AGENTS.md](AGENTS.md) (how we work) and [RELEASE_PROCEDURE.md](RELEASE_PROCEDURE.md) (how we ship).

---

## Current state

- **Latest release:** v8.3.4, versionCode 88, published 2026-11-04. Before it: v8.3.3, versionCode 87, also 2026-11-04.
  - It is on GitHub Releases with `YouDO.apk`.
  - The website https://youdo-app.vercel.app serves 8.3.4.
- **Git:** `fixes` holds unreleased Room widget fixes, committed locally and not pushed.
- **Server (Supabase `iyrnywfaxakvjkmddmqv`):**
  - every SQL file in `supabase/` and the `send-push` function were applied to production by v8.3.0 (checked 2026-10-29);
  - v8.3.1 had no server changes;
  - v8.3.2 added `support_settings.sql`, run in production on 2026-10-31 (checked: it returns the default settings);
  - v8.3.4 added `cloud_backup_limits.sql`, run in production on 2026-11-04 (the owner reported success).
- **What v8.3.2 contained:** Admin Hub → Controls → Support settings (UPI ID, QR code on/off, badge claims on/off, Support on/off). The QR is drawn from the UPI ID.
- **What v8.3.1 contained:**
  - widgets that move on to a new day without the app;
  - the widget's "left today" counting to midnight;
  - a clearer update pop-up and installer;
  - the ambient screen's status bar hiding again after the notification shade.

## Still to check from v8.3.3 (released without these phone tests, by the owner's choice)

- Create real rooms of 2 and 3, and check the invite limit. The Room widget's 2 and 3 person layouts have never been seen on a phone.
- Pause support, check the paused screen, then turn it off. Scan the QR.
- Light mode and the Classic Look on the phone.
- Small known flaw: an icon overlaps the title in Blueprint Studio's top bar at phone width.
- Stage 4 of the signature style (Today, Goals, Calendar, Studio) was mocked up and set aside. Five Dependabot pull requests (#72 to #76) wait for one combined branch and a test APK.

## Still to check from v8.3.4 (the sync rework, released without phone tests by the owner's choice)

It was tested with a two-device simulation and in the real app against a fake cloud, never on real phones or the real server. Use a test account, not your main one:
- Change something on the phone with the website open: it should appear within a few seconds. The instant signal has never run against the real server.
- Edit on the phone and close the app at once, then look on the website.
- Run a sitting on the phone while changing another card on the website; both should stay.
- Combine copies on a real device pair, then check Cloud Restore Points.
- Sign out on a device: its saved sync copy should be gone.

## Check on the next test build: Room widget fixes (on `fixes`)

The Android code has not been compiled yet; the CI build is its first compile.

- When a room-mate pauses, with YouDO closed, their time on your widget should freeze in grey as "Paused 43:33" within a few seconds, and stay the same after you tap the widget and come back. If it keeps counting until the app opens, the paused signal is being missed: that is a separate fix.
- The middle should say "1 focusing", not "both focusing", and the paused person's line should stop glowing.
- Each person's `x / 4h`, ring and "hit the bar" should use their own bar, while the top still shows the room's.
- Open question: `set_focus_status` updates `updated_at` even when nothing changed. If a paused time jumps forward in the app too, keep `updated_at` for unchanged rows.

## Check these on a real phone first

These shipped without a device test, because the owner chose a direct release.

1. **Widgets after midnight, with the app closed.**
   - Open YouDO once after installing 8.3.1, so the widgets learn the date.
   - The next morning, Dashboard should show that day's cards, with yesterday's unfinished cards under overdue and focus at 0m.
2. **Widget "left today" between 00:00 and 06:00.** It should read the real time to midnight (about 22½h at 01:15), with the needle full.
3. **Ambient screen.** Pull down the notification shade, close it and come back. The status bar should hide again.
4. **The new update pop-up and installer.** You'll check these: the glass card, titled "what's new" lines, Full notes, the ring with "2.4 of 11.1 MB", and an upright ✓. They first appear when a phone on 8.3.1 updates to the *next* version.

5. **Support settings (v8.3.2).** Signed in as admin, open Admin Hub → Controls → Support settings. Change a switch and Save, then check the Support screen follows it. Scan the QR with a UPI app and check it opens "Pay to" the saved UPI ID. Turn claims back on afterwards if you turned them off.

If something is wrong, fix it on a `fixes` branch and ship a patch (v8.3.3).

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
