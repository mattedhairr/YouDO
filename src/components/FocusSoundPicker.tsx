import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronRight, MoreHorizontal, Play, Plus, Volume1, Volume2 } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import Toggle from './Toggle';
import {
  FOCUS_SOUNDS_EVENT,
  allFocusSounds,
  readFocusSoundPrefs,
  saveFocusSoundPrefs,
  type FocusSound,
  type FocusSoundGroup,
  type FocusSoundId,
  type FocusSoundPrefs,
} from '../lib/focusSounds';
import { focusSoundPlayer, prepareOwnSound, type PreparedOwnSound } from '../lib/focusSoundPlayer';
import { OWN_SOUND_LIMIT, readOwnSounds, type OwnSound } from '../lib/ownSounds';
import './focusSounds.css';

const OwnSoundSheet = lazy(() => import('./OwnSoundSheet'));

interface Props {
  /** ambient: the dark panel on the ambient screen. settings: the Focus page card, which also previews. */
  variant: 'ambient' | 'settings';
}

const GROUPS: { id: Exclude<FocusSoundGroup, 'own'>; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'nature', label: 'Nature' },
  { id: 'noise', label: 'Noise' },
];

/** Searches, so they always lead somewhere real; the user picks or saves a playlist there. */
const PLAYLISTS = [
  { label: 'Spotify', url: 'https://open.spotify.com/search/anime%20study%20music/playlists' },
  { label: 'YouTube Music', url: 'https://music.youtube.com/search?q=anime+study+music+playlist' },
];

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac';

async function openExternalUrl(url: string): Promise<void> {
  try {
    await Browser.open({ url, toolbarColor: '#171612' });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function PlayingBars() {
  return (
    <span className="fs-bars" aria-hidden>
      <i /><i /><i />
    </span>
  );
}

/** Pick the focus sound, its volume, and whether it keeps playing when you leave the app. */
export default function FocusSoundPicker({ variant }: Props) {
  const [prefs, setPrefs] = useState(readFocusSoundPrefs);
  const [own, setOwn] = useState<OwnSound[]>(readOwnSounds);
  const [adding, setAdding] = useState<PreparedOwnSound | null>(null);
  const [editing, setEditing] = useState<OwnSound | null>(null);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const [playlists, setPlaylists] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onChange = () => {
      setPrefs(readFocusSoundPrefs());
      setOwn(readOwnSounds());
    };
    window.addEventListener(FOCUS_SOUNDS_EVENT, onChange);
    return () => window.removeEventListener(FOCUS_SOUNDS_EVENT, onChange);
  }, []);
  // Leaving the picker ends a preview.
  useEffect(() => () => focusSoundPlayer.endPreview(), []);

  const update = (patch: Partial<FocusSoundPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveFocusSoundPrefs(next);
  };

  const choose = (sound: FocusSoundId | null) => {
    update({ sound });
    if (variant !== 'settings') return;
    // Outside a session, hear a few seconds of the new pick.
    if (sound && focusSoundPlayer.canPreview) focusSoundPlayer.preview(sound);
    else if (!sound) focusSoundPlayer.endPreview();
  };

  const pickFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setNotice('');
    setReading(true);
    const result = await prepareOwnSound(file, file.name);
    setReading(false);
    if ('error' in result) setNotice(result.error);
    else setAdding(result);
  };

  const sounds = allFocusSounds(own);
  const isOn = (id: FocusSoundId | null) => prefs.sound === id;

  if (variant === 'ambient') {
    return (
      <div className="fs-picker is-ambient">
        <p className="fs-picker-title">Focus sound</p>
        <div className="fs-chips no-scrollbar" role="radiogroup" aria-label="Focus sound">
          {[null, ...sounds].map((sound) => (
            <button
              key={sound?.id ?? 'off'}
              type="button"
              role="radio"
              aria-checked={isOn(sound?.id ?? null)}
              className={`fs-chip ${isOn(sound?.id ?? null) ? 'is-on' : ''}`}
              onClick={() => choose(sound?.id ?? null)}
            >
              {sound && <span aria-hidden>{sound.icon}</span>}
              <span className="fs-chip-label">{sound?.label ?? 'Off'}</span>
            </button>
          ))}
        </div>
        <Volume value={prefs.volume} onChange={(volume) => update({ volume })} />
        <KeepPlaying on={prefs.keepPlaying} onToggle={() => update({ keepPlaying: !prefs.keepPlaying })} />
      </div>
    );
  }

  const tile = (sound: FocusSound) => (
    <div key={sound.id} className={`fs-tile ${isOn(sound.id) ? 'is-on' : ''}`}>
      <button
        type="button"
        role="radio"
        aria-checked={isOn(sound.id)}
        className="fs-tile-main"
        onClick={() => choose(sound.id)}
      >
        <span className={`fs-tile-art is-${sound.group}`} aria-hidden>{sound.icon}</span>
        <span className="fs-tile-name">{sound.label}</span>
        <span className="fs-tile-mood">{sound.mood}</span>
      </button>
      {sound.group === 'own' ? (
        <button
          type="button"
          className="fs-tile-corner"
          onClick={() => setEditing(own.find((o) => o.id === sound.id) ?? null)}
          aria-label={`Rename or remove ${sound.label}`}
        >
          {isOn(sound.id) ? <PlayingBars /> : <MoreHorizontal size={13} />}
        </button>
      ) : (
        <span className="fs-tile-corner" aria-hidden>
          {isOn(sound.id) ? <PlayingBars /> : <Play size={10} className="fill-current ml-px" />}
        </span>
      )}
    </div>
  );

  const ownTiles = sounds.filter((s) => s.group === 'own');

  return (
    <div className="fs-picker is-settings">
      <div className="fs-groups" role="radiogroup" aria-label="Focus sound">
        <button
          type="button"
          role="radio"
          aria-checked={isOn(null)}
          className={`fs-off ${isOn(null) ? 'is-on' : ''}`}
          onClick={() => choose(null)}
        >
          <span className="min-w-0">
            <span className="fs-off-label">Off</span>
            <span className="fs-off-hint">Silence, or your own music app</span>
          </span>
          <span className="fs-off-dot" aria-hidden />
        </button>

        {GROUPS.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <p className="fs-sec">{group.label}</p>
            <div className="fs-grid">{sounds.filter((s) => s.group === group.id).map(tile)}</div>
          </section>
        ))}

        <section aria-label="Your sounds">
          <p className="fs-sec">Your sounds</p>
          <div className="fs-grid">
            {ownTiles.map(tile)}
            {own.length < OWN_SOUND_LIMIT && (
              <button
                type="button"
                className="fs-tile fs-tile-add"
                disabled={reading}
                onClick={() => fileInput.current?.click()}
              >
                <span className="fs-tile-art is-add" aria-hidden><Plus size={18} /></span>
                <span className="fs-tile-name">{reading ? 'Reading the sound…' : 'Add your own sound'}</span>
                <span className="fs-tile-mood">MP3, M4A, OGG or WAV</span>
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          {notice && <p className="fs-notice" role="alert">{notice}</p>}
          <p className="fs-note">Your sounds stay on this phone. They are never uploaded or synced.</p>
        </section>
      </div>

      <p className="fs-sec">Playback</p>
      <div className="fs-card">
        <Volume value={prefs.volume} onChange={(volume) => update({ volume })} />
        <KeepPlaying on={prefs.keepPlaying} onToggle={() => update({ keepPlaying: !prefs.keepPlaying })} />
        <button type="button" className="fs-row" onClick={() => setPlaylists(!playlists)} aria-expanded={playlists}>
          <span className="min-w-0">
            <span className="fs-picker-keep-label block">Study playlist</span>
            <span className="fs-picker-keep-hint block">Real anime music in Spotify or YouTube Music</span>
          </span>
          <ChevronRight size={16} className={`fs-row-chev ${playlists ? 'is-open' : ''}`} aria-hidden />
        </button>
        {playlists && (
          <div className="fs-playlists">
            {PLAYLISTS.map((p) => (
              <button key={p.label} type="button" className="fs-playlist" onClick={() => void openExternalUrl(p.url)}>
                Open {p.label}
              </button>
            ))}
            <p className="fs-note">It plays in that app; set YouDO's sound to Off so they don't overlap.</p>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <Suspense fallback={null}>
          {adding ? (
            <OwnSoundSheet
              mode="add"
              prepared={adding}
              onClose={() => setAdding(null)}
              onDone={(added) => {
                setAdding(null);
                if (added) choose(added.id);
              }}
            />
          ) : editing ? (
            <OwnSoundSheet
              mode="edit"
              sound={editing}
              onClose={() => setEditing(null)}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </Suspense>
      )}
    </div>
  );
}

function Volume({ value, onChange }: { value: number; onChange: (volume: number) => void }) {
  return (
    <label className="fs-picker-volume">
      <Volume1 size={16} aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label="Focus sound volume"
      />
      <Volume2 size={16} aria-hidden />
    </label>
  );
}

function KeepPlaying({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="fs-picker-keep">
      <div className="min-w-0">
        <p className="fs-picker-keep-label">Keep playing when I leave the app</p>
        <p className="fs-picker-keep-hint">Sound carries on with the screen off</p>
      </div>
      <Toggle checked={on} onChange={onToggle} label="Keep playing the focus sound when I leave the app" />
    </div>
  );
}
