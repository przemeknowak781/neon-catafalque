
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
