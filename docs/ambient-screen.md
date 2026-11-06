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

- **Star map:** each day's map comes from the date (`skySeed`), so it is the
  same all day and different every day. Stars mostly stay off the timer.
- **Stars:** the sky holds 240, spread across the daily bar (`skyProgress`):
  with a 4h bar each star is a minute, with an 8h bar two. Today's focus is
  the finished sittings (`streakByDate`) plus the running one. Paused time adds
  none. New stars fade in over 2 seconds.
- **Constellation:** at the bar, the 10 brightest lit stars beside the timer
  (its real box, measured on screen) are joined to nearest neighbours, left and
  right separately. Links that are long or would cross the timer are dropped.
  Every 15 minutes past the bar adds one more star (up to 30). The lines draw
  over 3.5 seconds the first time.
- **Aurora:** while a focus sound plays, a soft ribbon along the bottom follows
  its loudness (`focusSoundPlayer.meter()`, an AnalyserNode after the fades) and
  sits higher as the day nears the bar. It is drawn at 1/8 size and stretched,
  which softens it cheaply, about 20 times a second, and only once a second
  while silent. Everything above it stays true black.
- **Reduce motion:** stars appear without fading, lines without drawing, and
  the aurora holds still.
- **Cost:** it loads with the ambient screen, not the first screen.
