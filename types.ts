
export type Note = string;

export interface InstrumentParams {
  osc1Wave: OscillatorType;
  osc2Wave: OscillatorType;
  detune: number;
  subLevel: number;
  noiseLevel: number;
  cutoff: number;
  resonance: number;
  filterEnvAmount: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterAttack: number;
  filterDecay: number;
  filterSustain: number;
  filterRelease: number;
  glide: number; // in ms
  vibratoRate: number;
  vibratoDepth: number;
  chorusMix: number;

  // --- Sound design. Optional so existing presets keep working. ---
  /** Pre-VCA saturation, 0-1. earworm.md §4 asks for "mild chorus/saturation". */
  drive?: number;
  /** Static placement, -1 (left) to 1 (right). */
  pan?: number;
  /** Send to the plate, 0-1. §4: "reverb pre-delay", "long reverb tails". */
  reverbSend?: number;
  /** Send to the tempo-free echo, 0-1. */
  delaySend?: number;
  /** How far apart the chorus voices are placed, 0-1. */
  stereoWidth?: number;
  /** Detuned copies per oscillator, 1-7. Two perfectly tuned oscillators are
   *  one waveform; a stack of slightly detuned ones is an analogue synth. */
  unison?: number;
  /** Total detune spread across the unison stack, in cents. */
  unisonDetune?: number;
  /** Send to the phaser bus, 0-1. */
  phaserSend?: number;
  /** Send to the flanger bus, 0-1. */
  flangerSend?: number;
  /** LFO to filter cutoff, 0-1. The Juno-106's LFO reaches the VCF as well as
   *  the oscillators; this is that destination. */
  lfoToFilter?: number;
  /**
   * Seconds before the LFO reaches full depth, 0-3. The Juno-106 has this as
   * the LFO's DELAY TIME control, 0 to 3 s in Roland's own specification: a
   * note starts straight and the vibrato blooms into it, which is how a held
   * note is sung rather than how it is wobbled. Absent means no delay.
   */
  vibratoDelay?: number;
  /**
   * Voices this patch may sound at once, 1-8. Absent means the engine's
   * default of four. Ignored by the monophonic parts (lead, bass). A pad that
   * voice-leads four-note chords needs room for the previous chord's release
   * to overlap the next chord's attack; at four voices every change is a cut.
   */
  polyphony?: number;
}

export interface GlobalFXParams {
  delayTime: number;
  delayFeedback: number;
  reverbMix: number;

  // --- Mastering. Optional so older saved patches still load. ---
  /** Mid/side width. 1 = untouched, 0 = mono, >1 widens. */
  width?: number;
  /** Low shelf at 110 Hz, in dB. */
  lowShelf?: number;
  /** High shelf at 7 kHz, in dB — "air". */
  airShelf?: number;
  /** Bus compression amount, 0-1. */
  glue?: number;
  /** Master saturation, 0-1. */
  masterDrive?: number;

  // --- Effects. §4 asks for "modulation (chorus/flanger) as mood glue"; the
  // phaser is the treatment documented on the record the lead patch comes from.
  /** Phaser send, 0-1. */
  phaserMix?: number;
  /** Phaser sweep rate in Hz. */
  phaserRate?: number;
  /** Flanger send, 0-1. */
  flangerMix?: number;
  /** Flanger sweep rate in Hz. */
  flangerRate?: number;
  /** Flanger regeneration, 0-0.9. */
  flangerFeedback?: number;
  /** Echo division of a beat: 0.25 = sixteenth, 0.5 = eighth, 0.75 = dotted. */
  delayDivision?: number;
  /** Bounce the echo between the channels. */
  delayPingPong?: boolean;
  /** Reverb tail length in seconds, 0.6-5. */
  reverbSize?: number;
  /** How fast the tail loses its top end, 0-1. */
  reverbDamp?: number;
  /** How far the kick ducks everything else, 0-0.9. */
  sidechain?: number;
  /** How long the duck takes to recover, in seconds. */
  sidechainRelease?: number;

  // --- Return levels. Voices decide how much they send; these decide how
  // much comes back. Without them an effect is either on at unity or absent.
  /** Chorus return level, 0-1.5. */
  chorusMix?: number;
  /** Echo return level, 0-1.5. */
  delayMix?: number;
  /** Cutoff of the lowpass in the echo's feedback path, in Hz. */
  delayDamp?: number;
  /** Gap before the reverb tail arrives, in seconds. */
  reverbPreDelay?: number;
  /** How wide the phaser sweeps, 0-1. */
  phaserDepth?: number;

  // --- Tape. The whole mix printed to a cassette and played back on a
  // machine that has seen better days. All optional and all off by default,
  // so every existing patch renders exactly as it did.
  /** Wow: slow speed wander of the whole mix, peak deviation in cents, 0-40. */
  tapeWow?: number;
  /** Wow rate in Hz, 0.05-4. */
  tapeWowRate?: number;
  /** Flutter: fast capstan wobble, peak deviation in cents, 0-12. */
  tapeFlutter?: number;
  /** Tape hiss level, 0-1. */
  tapeHiss?: number;
  /** Bandwidth of the tape in Hz: a lowpass on the whole mix. 0 means off. */
  tapeTone?: number;
}

/**
 * The tape is the one effect a song is allowed to move while it plays: a
 * memory is not equally sharp all the way through. Each event glides the tape
 * towards new settings from its step onward. Values are the same units as the
 * GlobalFXParams fields of the same names.
 */
export interface TapeAutomation {
  step: number;
  wow?: number;
  flutter?: number;
  hiss?: number;
  tone?: number;
  /** Time constant of the glide, in seconds. */
  glide?: number;
}

export interface NoteEvent {
  id: string;
  note: string;
  startStep: number;
  duration: number;
  velocity: number;
}

export interface SequencerStep {
  active: boolean;
  velocity: number;
}

export type TrackType = 'kick' | 'snare' | 'hihat' | 'fx' | 'lead' | 'bass' | 'pad' | 'pluck';

export interface Track {
  id: TrackType;
  name: string;
  color: string;
  volume: number;
  isCollapsed: boolean;
  isMuted?: boolean;
  isSoloed?: boolean;
  steps?: SequencerStep[];
  notes?: NoteEvent[];
}
