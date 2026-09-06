
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
  /** LFO to filter cutoff, 0-1. The Juno-106's LFO reaches the VCF as well as
   *  the oscillators; this is that destination. */
  lfoToFilter?: number;
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
