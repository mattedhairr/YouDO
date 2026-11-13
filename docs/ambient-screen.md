# Ambient screen

A calm, full-screen session timer on true black. It opens when the phone turns
sideways during a session (Settings → Focus and streak → Ambient clock when
sideways), or with the Ambient button on the running card. The screen stays on.

- **Tap** shows the controls (pause or resume, stop, focus sound, minimise) and
  this sitting's pauses; they fade after 4 seconds.
- **The music note** opens the focus sound panel (`FocusSoundPicker`, variant
  `ambient`): frosted glass over the dimmed clock, the sound that is on, the
  sounds as tiles in groups, and volume with a "Plays with screen off" pill.
- **Burn-in:** the face drifts a little every minute, the digits on their own
  wider path, and they dim after 3 minutes without a tap.

## Focus Sky

A night sky behind the timer (`src/components/FocusSky.tsx`, logic in
`src/lib/focusSky.ts`). On by default; Settings → Focus and streak → Focus Sky
turns it off.

- **Every day its own sky:** the date (`skySeed`, then a well-mixed generator,
  `skyRandom`) sets where the stars are and the order they light in. It is the
  same all day and differs every day (tested over 120 days).
- **Few stars, spread evenly:** 36 earned stars (`starMap`), placed by
  best-candidate sampling, so there are no clumps and no empty halves, over the
  whole screen except a thin margin and the top line. The timer gets fewer
  (candidates there count as crowded), but it is not fenced off, so stars never
  pile up at the edges. They light in a shuffled order, so the first ones land
  anywhere. A few are bright with a soft halo; most are dim; bluish, white or
  warm. A faint dust of 45 distant stars (`dustMap`) is there from the start.
- **Filled by focus:** one star per 1/36 of the daily bar (`skyProgress`): every
  13⅓ minutes with an 8h bar. Today's focus is the finished sittings
  (`streakByDate`) plus the running one. Paused time adds none. New stars fade
  in over 2 seconds.
- **Constellation:** at the bar, the 7 brightest lit stars clear of the timer
  (its real box, measured on screen), of the top line and of the controls'
  area (`constellationArea`: the side columns in landscape, the sides and the
  band above the timer in portrait) are joined to nearest neighbours. Links
  that are long or would cross the timer are dropped; across the timer it
  starts a second group. Every 15 minutes past the bar adds one star (up to
  12). The lines draw over 3.5 seconds the first time.
- **Burn-in:** besides the face's drift, the whole sky sways about a point
  above the screen (`skySway`, ±1.5° over three hours): every star moves a few
  dozen pixels back and forth. It is redrawn every 20 seconds (well under a
  pixel each time), with no animation in between. Stars are small and dim on
  true black.
- **Reduce motion:** stars appear without fading, lines without drawing, and
  the sky does not sway.
- **Cost:** it loads with the ambient screen, not the first screen, and draws
  three times a minute.

## Graha of the day

The planet the weekday is named after (`src/lib/graha.ts`,
`src/components/GrahaOfTheDay.tsx`, drawn by `src/lib/grahaArt.ts`):
Ravivāra the Sun, Somavāra the Moon (in its phase that day), Maṅgalavāra
Mars, Budhavāra Mercury, Guruvāra Jupiter, Śukravāra Venus, Śanivāra Saturn.
Shown with the Focus Sky; Settings → Focus and streak → Graha of the day
turns it off.

- **Place:** small, near the top right in portrait and up the right side in
  landscape, clear of the top line and the timer (`grahaPosition`). It moves
  slowly from 6:00 to midnight, updated every minute with a one-minute glide,
  so it never sits on one spot.
- **Tap:** a card with its name (Devanagari and IAST), the weekday, one story
  or fact and its source, and "Another". It closes after 10 seconds without a
  tap, or with a tap anywhere else, and hides the buttons while open. Each week
  the same weekday opens with the next fact (`firstFact`).
- **Facts:** short and sourced: stories from named texts (Ṛgveda, Mahābhārata,
  Purāṇas), each graha's verse of the Navagraha Stotra (attributed to Vyāsa;
  our own translations), Jyotiṣa where it explains the calendar, and
  astronomy. No predictions or remedies.
- **Later:** a nebula behind the stars was mocked (a GPU shader of glowing,
  slowly changing gas) and set aside for a later release.
