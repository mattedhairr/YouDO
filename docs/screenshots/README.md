# Screenshots

All of them use made-up people and data.

| Folder | What | Used by |
|---|---|---|
| `store/` | The store set: a banner (`00-banner.jpg`, 1600 × 1280) and ten captioned pictures (1080 × 1920) in four chapters: Plan (01–03), Focus (04–05), Together (06–09), Yours (10). | README, Orion Store (addresses pinned to a commit) |
| `app/` | Plain screens of the app in a phone frame (720 px wide), the material the store set is made from. | Reference, and any store that wants plain screenshots |
| `v7-classic/` | The Classic Look from v7. | README (Classic Look link) |

Each store picture says one benefit in a large headline and shows it on real screens. Their backgrounds are painted with the app's own sky (`src/lib/skySim.ts`) over the scene landscapes, one continuous landscape per chapter, so swiping through a chapter pans across it.

To retake plain screens, frame a capture with `node scripts/frame-screenshots.mjs docs/screenshots/app <name>=<capture>`. The capture and layout pages that build the store set are local only (`docs/mocks/`, never committed).
