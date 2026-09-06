
import { InstrumentParams, GlobalFXParams, Track, TrackType } from "./types";

export const DEFAULT_BPM = 109;

export const SCALE_NOTES = [
  'C1', 'D1', 'D#1', 'F1', 'G1', 'G#1', 'A#1',
  'C2', 'D2', 'D#2', 'F2', 'G2', 'G#2', 'A#2',
  'C3', 'D3', 'D#3', 'F3', 'G3', 'G#3', 'A#3',
  'C4', 'D4', 'D#4', 'F4', 'G4', 'G#4', 'A#4',
  'C5'
];

export const DEFAULT_LEAD_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'square',
  detune: 14.5,
  subLevel: 0.73,
  noiseLevel: 0.1,
  cutoff: 4730,
  resonance: 4.2,
  filterEnvAmount: 0.5,
  attack: 0.012,
  decay: 0.45,
  sustain: 0.45,
  release: 0.9,
  filterAttack: 0.08,
  filterDecay: 0.6,
  filterSustain: 0.3,
  filterRelease: 1.2,
  glide: 40,
  vibratoRate: 1.9,
  vibratoDepth: 0.15,
  chorusMix: 0.07,
};

export const DEFAULT_BASS_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'sine',
  detune: 0.05,
  subLevel: 0.8,
  noiseLevel: 0.02,
  cutoff: 450,
  resonance: 2,
  filterEnvAmount: 0.1,
  attack: 0.01,
  decay: 0.2,
  sustain: 1,
  release: 0.3,
  filterAttack: 0.05,
  filterDecay: 0.2,
  filterSustain: 0.8,
  filterRelease: 0.2,
  glide: 0,
  vibratoRate: 0,
  vibratoDepth: 0,
  chorusMix: 0.2,
};

export const DEFAULT_PAD_PARAMS: InstrumentParams = {
  osc1Wave: 'triangle',
  osc2Wave: 'sine',
  detune: 0.25,
  subLevel: 0.3,
  noiseLevel: 0.1,
  cutoff: 1200,
  resonance: 1.5,
  filterEnvAmount: 0.2,
  attack: 2.2,
  decay: 1.5,
  sustain: 0.9,
  release: 2.5,
  filterAttack: 2.5,
  filterDecay: 1,
  filterSustain: 0.7,
  filterRelease: 2,
  glide: 0,
  vibratoRate: 1.2,
  vibratoDepth: 0.05,
  chorusMix: 0.85,
};

export const DEFAULT_PLUCK_PARAMS: InstrumentParams = {
  osc1Wave: 'square',
  osc2Wave: 'square',
  detune: 0.08,
  subLevel: 0.1,
  noiseLevel: 0.02,
  cutoff: 2610,
  resonance: 8,
  filterEnvAmount: 0.11,
  attack: 0.002,
  decay: 0.15,
  sustain: 0.1,
  release: 0.2,
  filterAttack: 0.001,
  filterDecay: 0.12,
  filterSustain: 0,
  filterRelease: 0.1,
  glide: 0,
  vibratoRate: 0,
  vibratoDepth: 0,
  chorusMix: 0.3,
};

export const DEFAULT_GLOBAL_FX: GlobalFXParams = {
  delayTime: 0,
  delayFeedback: 0,
  reverbMix: 0.3,
};

export const INSTRUMENT_PRESETS: Partial<Record<TrackType, Record<string, InstrumentParams>>> = {
  lead: {
    'Nocturnal Ritual': { ...DEFAULT_LEAD_PARAMS },
    'Cyber Staccato': { 
      ...DEFAULT_LEAD_PARAMS, 
      osc1Wave: 'square', osc2Wave: 'square', detune: 5,
      attack: 0.001, decay: 0.1, sustain: 0, release: 0.15, 
      filterEnvAmount: 0.9, cutoff: 600, resonance: 6,
      chorusMix: 0.2, vibratoDepth: 0
    },
    'Liquid Chrome': { 
      ...DEFAULT_LEAD_PARAMS, 
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 12,
      glide: 180, attack: 0.15, decay: 0.5, sustain: 0.8, release: 0.8, 
      chorusMix: 0.85, vibratoDepth: 35, vibratoRate: 4.5
    },
    'Riot Gear': { 
      ...DEFAULT_LEAD_PARAMS, 
      osc1Wave: 'sawtooth', osc2Wave: 'square', detune: 25, 
      noiseLevel: 0.2, cutoff: 4000, resonance: 14, 
      filterEnvAmount: 0.6, attack: 0.01, decay: 0.3, sustain: 0.4
    },
    'Staccato Shadow': { 
      ...DEFAULT_LEAD_PARAMS, 
      attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.15, 
      filterEnvAmount: 0.85, filterAttack: 0.002, filterDecay: 0.1, 
      cutoff: 1200, resonance: 14 
    },
    'Ethereal Glide': { 
      ...DEFAULT_LEAD_PARAMS, 
      glide: 280, attack: 0.15, release: 1.2, 
      vibratoDepth: 35, vibratoRate: 4.2, 
      chorusMix: 0.85, detune: 18 
    }
  },
  bass: {
    'Nocturnal Ritual': { ...DEFAULT_BASS_PARAMS },
    'Acid Rain': { 
      ...DEFAULT_BASS_PARAMS, 
      osc1Wave: 'sawtooth', osc2Wave: 'square', 
      cutoff: 300, resonance: 16, filterEnvAmount: 0.95, 
      decay: 0.2, release: 0.1, filterDecay: 0.2, subLevel: 0.5
    },
    'Rolling Thunder': { 
      ...DEFAULT_BASS_PARAMS, 
      osc1Wave: 'triangle', osc2Wave: 'sine', 
      attack: 0.001, decay: 0.4, sustain: 0.1, 
      subLevel: 0.9, noiseLevel: 0.05, cutoff: 200, resonance: 1
    },
    'Pulse Grinder': { 
      ...DEFAULT_BASS_PARAMS, 
      osc1Wave: 'sawtooth', osc2Wave: 'square', 
      detune: 12, cutoff: 1200, resonance: 8, 
      filterEnvAmount: 0.9, decay: 0.08 
    },
    'Sub-Zero': { 
      ...DEFAULT_BASS_PARAMS, 
      osc1Wave: 'sine', osc2Wave: 'sine', 
      subLevel: 0.95, noiseLevel: 0.08, cutoff: 140, resonance: 1 
    }
  },
  pad: {
    'Nocturnal Ritual': { ...DEFAULT_PAD_PARAMS },
    'Blade Runner': { 
      ...DEFAULT_PAD_PARAMS, 
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 15,
      attack: 1.5, decay: 2.0, sustain: 1.0, release: 4.0,
      cutoff: 2000, resonance: 4, filterEnvAmount: 0.3,
      chorusMix: 0.9, vibratoDepth: 40
    },
    'Void Choir': { 
      ...DEFAULT_PAD_PARAMS, 
      osc2Wave: 'sawtooth', detune: 45, 
      cutoff: 650, resonance: 12, chorusMix: 0.95, 
      attack: 3.5, release: 3.5 
    },
    'Event Horizon': { 
      ...DEFAULT_PAD_PARAMS, 
      osc1Wave: 'square', detune: 22, 
      noiseLevel: 0.2, cutoff: 3200, 
      vibratoDepth: 80, vibratoRate: 1.5 
    }
  },
  pluck: {
    'Nocturnal Ritual': { ...DEFAULT_PLUCK_PARAMS },
    'Glass Works': { 
      ...DEFAULT_PLUCK_PARAMS, 
      osc1Wave: 'sine', osc2Wave: 'triangle', detune: 50,
      cutoff: 2000, resonance: 2, filterEnvAmount: 0.1,
      attack: 0.001, decay: 0.5, sustain: 0, release: 1.0,
      chorusMix: 0.2
    },
    'Ghost Echoes': { 
      ...DEFAULT_PLUCK_PARAMS, 
      osc1Wave: 'sine', detune: 15, 
      cutoff: 850, resonance: 18, 
      decay: 0.4, release: 1.5, filterEnvAmount: 0.1 
    },
    'Bit-Crush': { 
      ...DEFAULT_PLUCK_PARAMS, 
      osc1Wave: 'square', osc2Wave: 'square', 
      noiseLevel: 0.15, resonance: 20, 
      decay: 0.05, filterEnvAmount: 0.95 
    }
  }
};

export const INITIAL_TRACKS: Track[] = [
  { id: 'lead', name: 'NOCTURNAL LEAD', color: 'bg-neon-purple', volume: 0.2, isCollapsed: false, notes: [] },
  { id: 'pluck', name: 'NOCTURNAL PLUCK', color: 'bg-teal-500', volume: 0.15, isCollapsed: false, notes: [] },
  { id: 'pad', name: 'NOCTURNAL PAD', color: 'bg-blue-800', volume: 0.12, isCollapsed: true, notes: [] },
  { id: 'bass', name: 'NOCTURNAL BASS', color: 'bg-indigo-600', volume: 0.35, isCollapsed: false, notes: [] },
  { id: 'fx', name: 'FX', color: 'bg-neon-pink', volume: 0.15, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.7 })) },
  { id: 'hihat', name: 'HH', color: 'bg-yellow-400', volume: 0.5, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.6 })) },
  { id: 'snare', name: 'SD', color: 'bg-cyan-400', volume: 0.65, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.9 })) },
  { id: 'kick', name: 'BD', color: 'bg-red-500', volume: 0.85, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 1.0 })) },
];
