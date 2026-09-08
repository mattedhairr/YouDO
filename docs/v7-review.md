# v7 hotfix review

Hotfix candidate: **7.0.2**, Android **versionCode 34**, prepared on **2026-09-08**. Package, lockfile, in-app version, and Android versionName agree. A commit/push is not itself a published GitHub Release or proof of a successful phone upgrade.

## Verified locally

- 195 automated tests pass, including confirmation and recovery redirect validation, offline-mode storage, audit descriptions, signed-in session parsing, switch semantics, unavailable update checks, haptic priorities/cancellation, reduced-effects preferences, Calendar midnight splitting/dial gestures, focus persistence, activity-value validation, and dialog Back routing. Release-update tests derive their fixtures from the current app version.
- TypeScript checking, ESLint, and the Vite production build pass.
- The briefing overlay was visually rechecked in the signed-in preview: its full-screen technical focus outline is gone. The Safety Log now presents entries directly without a duplicate titled card.
- Native Android now suppresses web safe-area top padding because the fitted WebView already begins below the status bar. Browser and installed-web builds retain their safe-area inset.
- 52 isolated PostgreSQL checks pass against the actual community and account-session SQL, including repeat installation, recipient-only delivery, read/unread retention, top-three eligibility, duplicate Kudos prevention, session ownership, the 24-hour trust boundary, exact revocation, permission denial, and admin account deletion that preserves moderation history. These use disposable local fixtures, not production accounts.
- The production build includes a separate `auth-confirm.html` entry; it does not import the workspace or Supabase client.
- First-launch offline entry, the offline Settings card, Forgot password, and the new-password callback were visually checked on an isolated browser origin. Offline mode does not unlock a workspace that is still bound to a signed-out account, and the guest Today screen does not advertise cloud restore.
- Safety Log now renders human-readable action/effect details. Existing indistinguishable legacy settings rows collapse into one honest summary; the updated SQL emits field-specific entries and ignores no-op saves.
- Capacitor asset/plugin sync into the Android project passes. Native compilation and the signed APK are delegated to the release/hotfix branch workflow.
- The final two-column admin panel was visually rechecked in the signed-in preview: no daily-percentage tile or progress bar remains.
- At the inspected 429px viewport: all three populated Board rows measure 114px; both appearance rows measure 74px; no document-level horizontal overflow.
- Board, Calendar, Admin Review/Controls, and the empty daily room were inspected visually in the signed-in preview during the preceding UI pass. The admin home now presents only **Active recently** and **Used today**; the redundant daily percentage and progress bar are removed. Both enabled switch thumbs remained inside their tracks, with 48 × 44px touch targets.
- The expired-link page was opened with synthetic callback parameters. It displays the error state and removes the fragment from the address bar.
- Current README/help copy and promotional artwork describe the universal tree. Legacy node-kind values and historical changelog entries remain for compatibility/history.
- The bulky quick-day tiles have been replaced with a compact swipeable date dial, arrow/keyboard fallbacks, and a Today shortcut. Earlier verification established matching 4h 32m in the compact summary and detailed statistics; full month and full statistics remain available.
- Matching Community and Admin controls open separate screens. Admin Controls was visually checked without toggling live moderation settings. Loading queues are distinguished from genuinely empty queues.
- Reduced effects was switched on and off through Settings, verified to remove backdrop blur, and restored to off. The Settings switches each retain a 48 × 44px hit area. No document-level horizontal overflow was observed.

No moderation actions, test messages, or account email changes were submitted against the owner's main account during this pass.

## Before publishing

1. Review Board, Calendar, Settings, the daily room, and admin views on the target phone, including larger text, keyboard-open, light-theme, and Reduced effects states. Check actual haptic feel on both capable and low-end hardware; browser/mocked tests cannot establish this.
2. Rerun the current saved community setup once to install field-specific audit actions and no-op suppression. The full query remains idempotent and does not delete, duplicate, promote, or demote accounts. Verify a control change produces the matching Safety Log entry; isolated PostgreSQL coverage is not a substitute for that live check.
3. Add `https://tu-do-psi.vercel.app/?auth=recovery` to Supabase **Redirect URLs** as documented in [the account-link setup](account-links.md). After Vercel deploys the merged build, test one real reset email, the new-password form, and a subsequent sign-in with an account you control. Keep the existing confirmation-page URL and test both inbox confirmations separately.
4. The owner successfully installed [the account-session functions](account-sessions.md) and verified a two-device listing. Remote revocation still needs a controlled test after the 24-hour trust boundary; it has the normal access-token expiry window.
5. Recheck the previously reported Android system-bar and keyboard-overlay bugs on affected hardware. A web preview cannot verify those native fixes.
6. The owner has chosen to proceed with release preparation while deferring the missing focus session and unresponsive v6.3.0 phone investigation. This is an accepted unresolved risk, not a verified compatibility fix. Follow [the anonymized incident evidence and safe next checks](focus-session-investigation.md); do not clear app data or invent a duration.
7. Obtain the signed v7.0.2 APK from the release-branch GitHub Actions build and verify install-over-v6.3.0 or v7.0.1 on a backed-up device. The workflow checks the permanent signing certificate and matching release versions, and runs typecheck, lint, and tests before building. Keep `main` and public release publication separate from a candidate-branch push.

Existing build warnings remain: the main app bundle exceeds Vite's 500kB advisory threshold, and Capacitor App has mixed static/dynamic imports. No warnings were suppressed.

The current poster is [the v7 asset](media/youdo-promo-poster-v7.png). The old fixed-layer poster is historical only; live Telegram posts have not been edited or published by this task.
