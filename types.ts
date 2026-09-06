
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
}

export interface GlobalFXParams {
  delayTime: number;
  delayFeedback: number;
  reverbMix: number;
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
