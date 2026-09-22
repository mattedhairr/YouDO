# v7.5.0 release review

Release candidate: **v7.5.0 / versionCode 41**, based on the published
**v7.3.0 / versionCode 39** release. v7.4.0 was prepared as a fallback but was
never tagged or published, so its exam-chat work is included in this candidate.
Package metadata, lockfile metadata, the in-app version, Android versionName,
and the changelog agree. The package ID and permanent signing identity remain
unchanged.

## Verified for this candidate

- 308 automated tests, TypeScript checking, ESLint, and the Vite production
  build pass.
- The isolated Community Chat, hashtag, and baseline Community SQL suites pass.
- The hosted additive exam-hashtag migration completed successfully before the
  dependent client was prepared.
- The AI planning flow is local-only. Pasted output is restricted to one clean
  goal tree and cannot set IDs, completion, schedules, pins, history, settings,
  or account data.
- The full form, generated prompt, pasted-plan validation, preview, append,
  undo, and existing-goal preservation flows were checked in the browser.
- At 360 × 640 and 320 × 640, the form remains scrollable, the footer stays
  reachable, and the All Goals toolbar remains compact.

## Before publishing

1. Push the complete `codex/ai-plan-prompt` candidate and build it with the
   permanent Android signing identity.
2. Confirm the workflow reports versionName **7.5.0**, versionCode **41**, and
   the pinned certificate.
3. Install that exact artifact over published v7.3.0 without uninstalling or
   clearing data. Confirm existing goals, history, settings, Community Chat,
   and exam hashtags remain present.
4. On the physical phone, generate and copy a prompt, return to YouDO, paste a
   representative JSON plan, preview it, add it to the draft, undo it, then add
   and save it once. Confirm existing goals are unchanged.
5. Merge only after the candidate passes. Build once more from the merged
   commit, then publish tag and GitHub Release **v7.5.0** with that verified APK.

No additional Supabase run is required if `community_hashtags.sql` is already
live. Existing non-blocking build advisories remain: the main Vite bundle
exceeds 500 kB and Capacitor App is imported both statically and dynamically.
CI action-runtime deprecation notices should be handled in a separate
maintenance batch.
