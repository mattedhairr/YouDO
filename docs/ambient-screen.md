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

## Planet of the day

The body the weekday is named after, in many languages (`src/lib/planet.ts`,
`src/components/PlanetOfTheDay.tsx`, drawn by `src/lib/planetArt.ts`): Sunday
the Sun, Monday the Moon (in its phase that day), Tuesday Mars, Wednesday
Mercury, Thursday Jupiter, Friday Venus, Saturday Saturn. Shown with the Focus
Sky; Settings → Focus and streak → Planet of the day turns it off.

- **Place:** it crosses the sky once a day, left to right, on an arc above the
  timer, clear of the top line and the label above the digits
  (`planetPosition`), like a planet rising and setting. Where the crossing
  starts depends on the date, so it is somewhere else at the same hour each
  day. It moves a step each minute and glides there over that minute (about
  14 px an hour); at the right edge it fades out and comes back in at the
  left, without sliding across. It never stands still.
- **In front of the stars:** its disc is solid and drawn above the sky, so a
  constellation line passing behind it is covered by it.
- **Tap:** a short telescope moment, about 4 seconds: a thin ring with
  viewfinder ticks focuses in, the planet's real moons come out (Jupiter's
  four large moons, Saturn's Titan, Mars's two; placed differently each day,
  as they really move), and its name appears beside it with "Friday's
  planet", "Sunday's star" or, for the Moon, the day's phase. Then it all fades
  away. The tap does not bring up the clock's buttons. Screen readers hear the
  name; with reduce motion nothing zooms or glides.
- **A new day** (a sitting past midnight) brings its own planet, fading in.
- **Later:** a nebula behind the stars was mocked (a GPU shader of glowing,
  slowly changing gas) and set aside for a later release.
