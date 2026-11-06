# Focus sounds

Calm sound that plays during a focus session. It starts with the timer, pauses
with it, fades out when the session ends, and pauses when you leave the app
unless **Keep playing** is on.

## Sources

Every recording is CC0 (public domain): no attribution is required, but we
credit the authors anyway. Files are in `public/sounds/`: trimmed, set to
about -21 LUFS so nothing jumps when you switch, and converted to Opus with
ffmpeg.

| In the app | File | Original | Author | Source |
| --- | --- | --- | --- | --- |
| Quiet violin | `violin-space-arp.ogg` | Space Arp, lowered 9 dB | Centurion_of_war | [OpenGameArt](https://opengameart.org/content/space-arp) |
| Bamboo night | `piano-yoiyami.ogg` | Yoiyami Core Theme, quiet opening and closing fade cut | Yoiyami | [OpenGameArt](https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano) |
| November snow | `piano-november-snow.ogg` | November Snow, silent ending cut | cynicmusic | [OpenGameArt](https://opengameart.org/content/november-snow) |
| Soft strings | `strings-at-home.ogg` | At Home (Orchestral), closing fade cut | Wolfgang_ | [OpenGameArt](https://opengameart.org/content/at-home-orchestral) |
| First light | `piano-first-light.ogg` | First Light Particles, closing fade cut | Yoiyami | [OpenGameArt](https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track) |
| Koto garden | `koto-oriental-somber.ogg` | Oriental Somber, raised 10 dB, silent ending cut | Tozan | [OpenGameArt](https://opengameart.org/content/oriental-somber) |
| Soft thunder | `thunder.ogg` | Rain and storm #2 (0740), trimmed to 120 s | Joseph Sardin | [BigSoundBank](https://bigsoundbank.com/rain-and-storm-2-s0740.html) |
| Forest stream | `forest.ogg` | Forest and stream #3 (2716), trimmed to 120 s | Joseph Sardin | [BigSoundBank](https://bigsoundbank.com/forest-and-stream-3-s2716.html) |

Brown and pink noise are generated in the app (`generateNoise` in
`src/lib/focusSounds.ts`), so they have no file.

## How it plays

- Web Audio. Quiet violin was made to loop, so it repeats with no gap. The
  other recordings are not loops: each pass blends into the next with an
  equal-power crossfade (the level holds steady through the join), over
  6 seconds for music and 4 for nature.
- Saved choices of the retired music (guitar and the two pianos) move to the
  closest new track (`RETIRED` in `focusSounds.ts`).

## Your sounds

People can add their own audio (MP3, M4A, OGG, WAV…) in Settings → Focus
sound → Add your own sound, or with "Open with YouDO" / Share on Android.

- The file stays on the phone, in IndexedDB (`youdo-own-sounds`); only the
  list of names and loop points is in localStorage (`youdo-own-sounds-v1`).
  Nothing is uploaded or synced, and focus sound choices are not synced.
- `fitLoop` (`src/lib/ownSoundFiles.ts`) cuts the silent lead-in and ending,
  then any slow fade-in or fade-out (where the level, averaged over a second,
  stays 4 dB under the usual level; at most 30 s per end), so a repeat never
  dips into silence or a fade. It also matches the loudness to the built-in
  music without clipping. It plays with the same 6-second blend as the music.
- Limits: 12 sounds, 60 MB per file, 10 seconds to 8 minutes long.
- Android: `IncomingSound.java` copies a file opened with or shared to YouDO
  into the app's cache; `IncomingSoundHost` then shows the same Add sheet.
- **Study playlist** opens a Spotify or YouTube Music search for anime study
  music. YouDO does not stream that music itself.
- **Keep playing** on Android: while a sound plays, the live session
  notification becomes a media-playback foreground service
  (`FocusSoundService`), so the phone keeps the app and the sound running with
  the screen off. Swiping the app away stops it.
