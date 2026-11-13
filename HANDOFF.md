# Where We Left Off

Last updated **2026-11-13**, while releasing **v8.5.5**. Read this file first when coming back, then [AGENTS.md](AGENTS.md) (how we work) and [RELEASE_PROCEDURE.md](RELEASE_PROCEDURE.md) (how we ship).

---

## Current state

- **Latest release:** v8.5.5, versionCode 96 (released 2026-11-13). Before it: v8.5.4, versionCode 95, the same day.
  - It is on GitHub Releases with `YouDO.apk`.
  - The website https://youdo-app.vercel.app deploys from `main`.
- **Git:** only the `main` branch should remain once `fixes` is merged and deleted.
- **Server (Supabase `iyrnywfaxakvjkmddmqv`):**
  - every SQL file in `supabase/` and the `send-push` function were applied to production by v8.3.0 (checked 2026-10-29);
  - v8.3.1 had no server changes;
  - v8.3.2 added `support_settings.sql`, run in production on 2026-10-31 (checked: it returns the default settings);
  - v8.3.4 added `cloud_backup_limits.sql`, run in production on 2026-11-04 (the owner reported success);
  - v8.3.5, v8.4.0, v8.5.0, v8.5.1 and v8.5.2 had no server changes;
  - v8.5.3 changed `hub_focus_status.sql` and `hub_widget_push.sql`, both run in production on 2026-11-12 before the release (the owner reported success);
  - v8.5.4 and v8.5.5 had no server changes.
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

## Still to check from v8.3.5 (released without phone tests, by the owner's choice)

The Reset broadcast button was tried against a fake server, in dark mode only; check it on the real server, in light mode and in the Classic Look.

- When a room-mate pauses, with YouDO closed, their time on your widget should freeze in grey as "Paused 43:33" within a few seconds, and stay the same after you tap the widget and come back. If it keeps counting until the app opens, the paused signal is being missed: that is a separate fix.
- The middle should say "1 focusing", not "both focusing", and the paused person's line should stop glowing.
- Each person's `x / 4h`, ring and "hit the bar" should use their own bar, while the top still shows the room's.
- Settled in v8.5.3: an unchanged status keeps its `updated_at`.

## Still to check from v8.5.5 (released without a phone test, by the owner's choice)

- **A stuck status clears itself.** After installing v8.5.4 the room still showed a session stopped earlier (under v8.5.3) as focusing: v8.5.4 stops new races but did not repair a status already stuck, because the app believed its "idle" had been sent. Now, with no session on the device, the app checks your status when it opens or comes back, and when a newly synced sitting arrives: if the room shows a session already in your history (ended, on any device), it says "idle" (`isEndedOwnStatus` in `src/lib/focusStatus.ts`). A session still running elsewhere has no sitting yet, so it is left alone. It looks once more 15 s after a stop, because a pause or resume tapped on the notification is posted by Android itself (outside the app's in-order queue) and can land just after the stop. A session discarded on the device counts as ended there too (its local discard record); only another device, which never hears of a discard, would leave it to expire (12 h). Phone check: a stuck "You · focusing" clears within seconds of opening YouDO; a session running on the website stays.

## Still to check from v8.5.4 (released at once, by the owner's choice: the stuck "focusing" was serious)

- **One card per Goal step.** A step planned on two devices before they synced (or one that lost its link) left two unfinished cards, such as Chapter - 4 on both 11 and 12 Nov in Backlog. Now any extra card is folded into one (the step's current card, or the newest), keeping its missed date and focus sittings, after every sync and whenever cards change; planning also reuses an unlinked unfinished card. Phone check: after updating, the two Chapter - 4 cards become one (12 Nov), and its timeline still shows 11 Nov as missed.
- **A stop can't be overtaken.** Seen 2026-11-13: after a stop the room (and your Room widget) kept showing you focusing. Since v8.5.2 the app re-sends "focusing" when it comes back to the front; a Stop tapped right then sent "idle" while that write was still on its way, and when "focusing" landed last the server kept it, with nothing left to correct it. Now a device's status writes go one at a time, newest last (`createFocusShareQueue` in `src/lib/focusStatus.ts`), which also makes a stop right after a start say "idle". The sending code now loads after the first screen (`src/lib/focusShare.ts` keeps the small part it needs). Phone check: open YouDO from the background mid-session and stop at once; within seconds both your widget and Anjali's show you away.

## Still to check from v8.5.3: your seat on your own widget

Found on 2026-11-12 with USB debugging: a session on the website never reached the phone's own Room widget. The server pushed focus changes to room-mates only, and the phone wrote "away" into your seat at startup (stamped with its own clock, so it outlived the server's "focusing"). Now your own phones get the push too; the phone speaks only for its own session (a session there always wins; its own writes are provisional and any server update replaces them; entries from older versions give way to the first fresh fetch). Also: an unchanged status keeps its time (paused clocks no longer jump), and widgets keep a session live for 12 hours, as the app (was 4). Confirmed on the phone on 2026-11-12 over USB: a website session showed **You · focusing** on the widget with YouDO closed, Paused froze, and stopping went back to away.
- With YouDO closed on the phone, start a session on the website: within seconds the widget should show **You · focusing**. Stop it: back to away.
- Start on the phone, then open the website: both keep you focusing.
- Pause on one device: room-mates see "Paused" with a time that stays put, also after reopening the app.
- A sitting longer than 4 hours still shows as live on widgets.

## Still to check from v8.5.2: room status from any device

Found on 2026-11-12: a session on the website showed as "away" in the room, because opening YouDO on the phone (with no session of its own) told the server "idle". Now a device speaks only for its own session (`shouldShareFocus` in `src/lib/focusStatus.ts`): it says "idle" only when a session it announced ends (remembered across restarts), and re-announces "focusing" when the app or tab comes back. The rule is unit-tested; the two-device flow was not tried (it needs a signed-in account on two devices).
- Start on the website, then open the phone: the room (on both) should keep "You · focusing".
- Stop on the website: the room shows you away within seconds.
- Start on the phone, stop it, close the app at once: the room still ends up showing you away (on the next open at the latest).
- Pausing still shows "Paused" with a frozen time on room-mates' screens and widgets.
- Known limit: two sessions on two devices at once, then one stops: the room shows you away until the other device's app or tab is opened again.

## Still to check from v8.5.1: the Milky Way

The cloud along the bottom looked fake on the phone, so it became a faint Milky Way (tried in the browser only).
- It should look natural, not like a smudge, in Graphite and in a colour accent, and change shape the next day.
- The drift should be smooth and too slow to notice; brightness should rise a little with music and fade on pause.
- Stars: with an 8h bar, one star per 2 focused minutes, each clearly visible.

## Still to check from v8.5.0: Focus Sky (released without phone tests, by the owner's choice)

Built and released while the owner was away. Tried in the browser (landscape and portrait, sound playing, a reached bar); never on a phone. How it works: [docs/ambient-screen.md](docs/ambient-screen.md).
- Open the ambient screen sideways and upright: stars around the timer, never a line across the digits, the pause log or the buttons.
- With a focus sound playing, the glow along the bottom should move with the music and fade when you pause. Check it doesn't feel distracting; if it does, it can be made dimmer.
- Reach the daily bar (or set a short bar on a test account): the constellation should draw slowly once.
- Look at the screen in a dark room: everything above the glow should stay truly black.
- Watch the battery over a long sitting with the sky on; Settings → Focus and streak → Focus Sky turns it off.
- The divider between minutes and seconds should look centred and as tall as the digits.
- Settings → Focus and streak → "How the ambient screen works" opens and reads well in light, dark and the Classic Look.

## Still to check from v8.4.0: new focus sounds (released without phone tests, by the owner's choice)

Six new CC0 music tracks replace the guitar and two pianos; a picker in tiles (Music, Nature, Noise, Your sounds); "Add your own sound", kept on the phone only; "Open with YouDO" and Share for audio files; a Study playlist link. Sources and how loops work: [docs/focus-sounds.md](docs/focus-sounds.md). Tried in the browser (dark, light, Classic Look, ambient chips, add/rename/remove). Own sounds also cut a slow fade-in or fade-out (4 dB under the usual level), checked against real songs.

Check on the phone:
- Play each new track in a session for a few minutes: the repeat should be hard to notice. Quiet violin loops with no blend; the others blend over 6 s.
- Add your own sound from Settings: Android's picker opens, the name sheet appears, "Hear the repeat" plays its end blending into its start, and it then plays in a session at about the same loudness as the built-in music.
- In a file manager or music app, "Open with" or Share an audio file to YouDO: the same Add sheet should appear, with the app closed and with it open.
- Rename and remove an own sound; removing the one that is chosen should switch the sound to Off.
- If you had chosen guitar or a piano before, the choice should now be Soft strings or First light.
- Study playlist opens Spotify or YouTube Music.

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
| Focus sounds and ambient | `src/lib/focusSounds.ts`, `src/components/AmbientScreen.tsx`, `src/components/FocusSky.tsx` and `src/lib/focusSky.ts` (Focus Sky), `FocusSoundService.java`, `docs/focus-sounds.md`, `docs/ambient-screen.md` |
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
