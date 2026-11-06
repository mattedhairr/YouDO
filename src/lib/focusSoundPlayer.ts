import {
  FOCUS_SOUNDS_EVENT,
  MUSIC_FADE_S,
  findFocusSound,
  loopWindow,
  readFocusSoundPrefs,
  type FocusSound,
  type FocusSoundId,
} from './focusSounds';
import { OWN_SOUND_LIMIT, OWN_SOUND_MAX_BYTES, OWN_SOUND_MAX_SECONDS, readOwnSounds, type OwnSoundId } from './ownSounds';
import { fitLoop, loadOwnSoundFile, nameFromFile, type LoopFit } from './ownSoundFiles';

/**
 * The focus sound player: Web Audio playback, previews, and reading files
 * people add. Loaded only once a sound is needed, so it stays off the first
 * screen's JavaScript.
 */

/** The player's id while the add-a-sound preview plays; never saved as a choice. */
const PREVIEW_JOIN_ID: OwnSoundId = 'own-preview-join';

/**
 * Brown (deep, like a far waterfall) or pink (softer rain-like hiss) noise. The
 * last `blend` samples are mixed into the first ones so the loop has no seam.
 */
export function generateNoise(kind: 'brown' | 'pink', length: number, random: () => number = Math.random) {
  const blend = Math.min(Math.floor(length / 8), 4096);
  const raw = new Float32Array(length + blend);
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      raw[i] = last * 3.5;
    }
  } else {
    // Paul Kellet's economy pink filter.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    }
  }
  const out = raw.slice(0, length);
  for (let i = 0; i < blend; i++) {
    const t = i / blend;
    out[i] = out[i] * t + raw[length + i] * (1 - t);
  }
  return out;
}


const FADE_S = 1.5;
/** Settings plays this much of a sound when you pick it outside a session. */
const PREVIEW_MS = 5000;
/** The add-a-sound preview: this much of the end, blending into the start. */
const JOIN_TAIL_S = 8;

/**
 * Equal-power blend curves: the outgoing pass follows cos, the incoming sin, so
 * the overall loudness holds steady through the join instead of dipping.
 */
function blendCurve(rising: boolean, steps = 64): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (Math.PI / 2);
    curve[i] = rising ? Math.sin(t) : Math.cos(t);
  }
  return curve;
}

/** One player for the whole app. Web Audio, so loops are gapless and fades are smooth. */
class FocusSoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<FocusSoundId, Promise<AudioBuffer>>();
  private current: { id: FocusSoundId; stop: () => void } | null = null;
  private volume = readFocusSoundPrefs().volume;
  private token = 0;
  private previewTimer = 0;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Decode a file the user picked, on the player's own audio clock. */
  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.context();
    if (!ctx) return Promise.reject(new Error('Audio is not available here'));
    return ctx.decodeAudioData(data);
  }

  private buffer(sound: FocusSound): Promise<AudioBuffer> {
    const ctx = this.context()!;
    let pending = this.buffers.get(sound.id);
    if (!pending) {
      const file = () => sound.group === 'own'
        ? loadOwnSoundFile(sound.id as OwnSoundId).then((blob) => {
          if (!blob) throw new Error('Sound unavailable');
          return blob.arrayBuffer();
        })
        : fetch(`${import.meta.env.BASE_URL}${sound.src}`).then((r) => {
          if (!r.ok) throw new Error('Sound unavailable');
          return r.arrayBuffer();
        });
      pending = sound.kind === 'noise'
        ? Promise.resolve((() => {
          const length = ctx.sampleRate * 8;
          const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
          buffer.copyToChannel(generateNoise(sound.id as 'brown' | 'pink', length), 0);
          return buffer;
        })())
        : file().then((data) => ctx.decodeAudioData(data));
      pending.catch(() => this.buffers.delete(sound.id));
      this.buffers.set(sound.id, pending);
    }
    return pending;
  }

  /** A removed sound: drop its decoded copy, and stop it if it is playing. */
  forget(id: FocusSoundId) {
    this.buffers.delete(id);
    if (this.current?.id === id) {
      this.clearPreview();
      this.token++;
      this.stopCurrent();
    }
  }

  private ramp(to: number, seconds: number) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  /** Start (or switch to) a sound for the session, fading in. Ends any preview. */
  play(id: FocusSoundId): Promise<void> {
    this.clearPreview();
    return this.start(id);
  }

  /** True while a Settings preview plays (no session owns the sound). */
  get previewing(): boolean {
    return this.previewTimer !== 0;
  }

  /** A preview may play only when no session is using the player. */
  get canPreview(): boolean {
    return this.current === null || this.previewing;
  }

  /** Play a few seconds of a sound, then fade it out. */
  preview(id: FocusSoundId) {
    this.clearPreview();
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = 0;
      void this.stop();
    }, PREVIEW_MS);
    void this.start(id);
  }

  /**
   * Hear how a picked file will repeat: its last seconds blending into its
   * start, as a session plays it. Only when no session is using the sound.
   */
  previewJoin(buffer: AudioBuffer, sound: Pick<FocusSound, 'start' | 'end' | 'gain'>): boolean {
    const ctx = this.context();
    if (!ctx || !this.master || !this.canPreview) return false;
    this.clearPreview();
    this.token++;
    this.stopCurrent();
    this.wake(ctx);
    const win = loopWindow({ ...sound, fade: MUSIC_FADE_S }, buffer.duration);
    const tail = Math.min(JOIN_TAIL_S, win.length / 2);
    const fade = Math.min(win.fade, tail);
    const out = this.passGain(sound.gain);
    const at = ctx.currentTime + 0.05;
    const join = at + tail - fade;
    const ending = ctx.createBufferSource();
    const endingGain = ctx.createGain();
    ending.buffer = buffer;
    ending.connect(endingGain).connect(out);
    endingGain.gain.setValueAtTime(1, at);
    endingGain.gain.setValueCurveAtTime(blendCurve(false), join, fade);
    ending.start(at, win.end - tail, tail);
    const opening = ctx.createBufferSource();
    const openingGain = ctx.createGain();
    opening.buffer = buffer;
    opening.connect(openingGain).connect(out);
    openingGain.gain.setValueAtTime(0, at);
    openingGain.gain.setValueCurveAtTime(blendCurve(true), join, fade);
    opening.start(join, win.start, win.length);
    this.current = {
      id: PREVIEW_JOIN_ID,
      stop: () => {
        for (const s of [ending, opening]) {
          try { s.stop(); } catch { /* already stopped */ }
          s.disconnect();
        }
        out.disconnect();
      },
    };
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = 0;
      void this.stop();
    }, (tail + 6) * 1000);
    this.ramp(this.volume, 0.3);
    return true;
  }

  endPreview() {
    if (!this.previewing) return;
    this.clearPreview();
    void this.stop();
  }

  private clearPreview() {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = 0;
  }

  private async start(id: FocusSoundId): Promise<void> {
    const sound = findFocusSound(id);
    const ctx = this.context();
    if (!sound || !ctx || !this.master) return;
    if (this.current?.id === id) {
      await this.resume();
      return;
    }
    const token = ++this.token;
    this.stopCurrent();
    const buffer = await this.buffer(sound).catch(() => null);
    if (!buffer || token !== this.token) return;
    this.wake(ctx);
    this.current = { id, stop: sound.kind === 'crossfade' ? this.startCrossfade(buffer, sound) : this.startLoop(buffer, sound) };
    this.ramp(this.volume, FADE_S);
  }

  /**
   * Start the audio clock. A browser may hold it until the next tap (for
   * example after a reload mid-session), so the first tap also wakes it.
   */
  private wake(ctx: AudioContext) {
    if (ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => undefined);
    window.addEventListener('pointerdown', () => {
      if (this.current && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    }, { once: true, capture: true });
  }

  /** A sound's own level, between its passes and the master volume. */
  private passGain(gain = 1): GainNode {
    const node = this.ctx!.createGain();
    node.gain.value = gain;
    node.connect(this.master!);
    return node;
  }

  private startLoop(buffer: AudioBuffer, sound: FocusSound): () => void {
    const win = loopWindow(sound, buffer.duration);
    const out = this.passGain(sound.gain);
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (win.start > 0 || win.end < buffer.duration) {
      source.loopStart = win.start;
      source.loopEnd = win.end;
    }
    source.connect(out);
    source.start(0, win.start);
    return () => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
      out.disconnect();
    };
  }

  /** A recording that isn't a loop: each pass blends into the next over a few seconds. */
  private startCrossfade(buffer: AudioBuffer, sound: FocusSound): () => void {
    const ctx = this.ctx!;
    const win = loopWindow(sound, buffer.duration);
    const { fade } = win;
    const out = this.passGain(sound.gain);
    const rise = blendCurve(true);
    const fall = blendCurve(false);
    const live: { source: AudioBufferSourceNode; gain: GainNode }[] = [];
    let stopped = false;
    const schedule = (at: number) => {
      if (stopped) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.connect(gain).connect(out);
      const end = at + win.length;
      gain.gain.setValueAtTime(0, at);
      gain.gain.setValueCurveAtTime(rise, at, fade);
      gain.gain.setValueCurveAtTime(fall, end - fade, fade);
      source.start(at, win.start, win.length);
      const entry = { source, gain };
      live.push(entry);
      source.onended = () => {
        live.splice(live.indexOf(entry), 1);
        source.disconnect();
        gain.disconnect();
      };
      // Queue the next pass as soon as this one starts, timed by the audio clock.
      const next = end - fade;
      window.setTimeout(() => schedule(next), Math.max(0, (at - ctx.currentTime) * 1000));
    };
    schedule(ctx.currentTime);
    return () => {
      stopped = true;
      for (const { source } of live.splice(0)) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      out.disconnect();
    };
  }

  private stopCurrent() {
    this.current?.stop();
    this.current = null;
  }

  /** Fade out and hold the audio clock (resume picks up where it was). */
  async pause(): Promise<void> {
    if (!this.ctx || !this.current || this.ctx.state !== 'running') return;
    const token = this.token;
    this.ramp(0, FADE_S / 2);
    await new Promise((r) => window.setTimeout(r, (FADE_S / 2) * 1000));
    if (token === this.token && this.master && this.master.gain.value < 0.01) await this.ctx.suspend().catch(() => undefined);
  }

  async resume(): Promise<void> {
    if (!this.ctx || !this.current) return;
    // A newer request: a pause or stop still fading out must not cut the sound.
    this.token++;
    this.wake(this.ctx);
    this.ramp(this.volume, FADE_S);
  }

  /** Fade out and let the sound go. */
  async stop(): Promise<void> {
    if (!this.current) return;
    const token = ++this.token;
    this.ramp(0, FADE_S);
    await new Promise((r) => window.setTimeout(r, FADE_S * 1000));
    if (token === this.token) this.stopCurrent();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.current && this.ctx?.state === 'running') this.ramp(this.volume, 0.15);
  }

  get playing(): FocusSoundId | null {
    return this.current?.id ?? null;
  }

  private analyser: AnalyserNode | null = null;
  private meterData: Float32Array<ArrayBuffer> | null = null;

  /**
   * How loud the sound is right now, about 0–1, for the ambient screen's
   * aurora. Measured after the fades, so it sinks when the sound pauses, and
   * against the chosen volume, so a quiet setting still moves it. 0 when silent.
   */
  meter(): number {
    if (!this.ctx || !this.master || !this.current || this.ctx.state !== 'running') return 0;
    if (!this.analyser || !this.meterData) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(this.analyser);
      this.meterData = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    }
    this.analyser.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (const v of this.meterData) sum += v * v;
    const rms = Math.sqrt(sum / this.meterData.length);
    return Math.min(1, (rms / Math.max(0.05, this.volume)) * 5);
  }
}

export const focusSoundPlayer = new FocusSoundPlayer();
// The volume follows the saved choice, wherever it is changed.
if (typeof window !== 'undefined') {
  window.addEventListener(FOCUS_SOUNDS_EVENT, () => focusSoundPlayer.setVolume(readFocusSoundPrefs().volume));
}

export interface PreparedOwnSound {
  file: Blob;
  name: string;
  duration: number;
  fit: LoopFit;
  buffer: AudioBuffer;
}

/** Read a picked file and work out its loop, or say plainly why it cannot be used. */
export async function prepareOwnSound(file: Blob, fileName: string): Promise<PreparedOwnSound | { error: string }> {
  if (readOwnSounds().length >= OWN_SOUND_LIMIT) return { error: `You can keep up to ${OWN_SOUND_LIMIT} sounds. Remove one to add another.` };
  if (file.size > OWN_SOUND_MAX_BYTES) return { error: 'That file is too big. Pick one under 60 MB.' };
  if (file.type && !file.type.startsWith('audio/') && file.type !== 'application/ogg') return { error: 'That is not a sound file. Pick an MP3, M4A, OGG or WAV.' };
  let buffer: AudioBuffer;
  try {
    buffer = await focusSoundPlayer.decode(await file.arrayBuffer());
  } catch {
    return { error: 'This phone cannot play that file. Try an MP3 or M4A.' };
  }
  if (buffer.duration > OWN_SOUND_MAX_SECONDS) return { error: 'That sound is longer than 8 minutes. Pick a shorter one.' };
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const fit = fitLoop(channels, buffer.sampleRate);
  if (!fit) return { error: 'That sound is too short or too quiet to loop. Pick one of at least 10 seconds.' };
  return { file, name: nameFromFile(fileName), duration: buffer.duration, fit, buffer };
}
