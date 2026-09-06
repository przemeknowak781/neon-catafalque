
import { InstrumentParams, GlobalFXParams, Track, TrackType } from "./types";

export const DEFAULT_BPM = 109;

/**
 * Mixer levels, in one place.
 *
 * These used to be written twice: once in INITIAL_TRACKS and again, three to
 * four times louder, inside the generator. Generating a song therefore threw
 * away the calibrated mix and drove the master chain into clipping — a render
 * measured +3.2 dBFS with 3.3% of samples pinned at full scale. Both the
 * initial tracks and the generator now read these.
 *
 * Rebalanced against a render: the drum voices bypass the 0.5 instrument
 * multiplier that every synth note passes through, so a kick at 0.85 sat some
 * 19 dB above a lead at 0.2. Half the mix's energy was below 120 Hz and the
 * chorused, stereo parts — the ones that make the genre sound like itself —
 * were inaudible under it.
 */
export const MIX_LEVELS: Record<TrackType, number> = {
  lead: 0.42,
  pluck: 0.45,
  pad: 0.3,
  bass: 0.32,
  fx: 0.2,
  hihat: 0.62,
  snare: 0.78,
  kick: 0.5,
};

export const SCALE_NOTES = [
  'C1', 'D1', 'D#1', 'F1', 'G1', 'G#1', 'A#1',
  'C2', 'D2', 'D#2', 'F2', 'G2', 'G#2', 'A#2',
  'C3', 'D3', 'D#3', 'F3', 'G3', 'G#3', 'A#3',
  'C4', 'D4', 'D#4', 'F4', 'G4', 'G#4', 'A#4',
  'C5'
];

/**
 * Lead. Retuned against the actual note rate: the hook plays roughly five
 * notes a bar, so at 130 BPM a note lasts around 115 ms. The old envelope had
 * a 900 ms release and a 450 ms decay, so each note sustained across the next
 * six or seven and the line turned to porridge. subLevel was 0.73, putting a
 * strong octave-below under every lead note right on top of the bass, and a
 * 40 ms glide smeared the pitch of a part whose whole job is a memorable
 * contour.
 */
export const DEFAULT_LEAD_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'sawtooth',
  detune: 9,
  subLevel: 0.2,
  noiseLevel: 0.03,
  cutoff: 2100,
  resonance: 7.5,
  filterEnvAmount: 0.72,
  attack: 0.008,
  decay: 0.22,
  sustain: 0.32,
  release: 0.28,
  filterAttack: 0.02,
  filterDecay: 0.2,
  filterSustain: 0.3,
  filterRelease: 0.25,
  glide: 0,
  vibratoRate: 4.8,
  vibratoDepth: 9,
  // Chorus is the genre's signature: detuned saws smeared wide. The lead sits
  // slightly right of centre so it is not fighting the pad for the middle.
  chorusMix: 0.42,
  drive: 0.28,
  pan: 0.12,
  reverbSend: 0.34,
  delaySend: 0.22,
  // Five detuned saws. A square against a saw at a fixed interval reads as a
  // chip; a stack that beats against itself reads as an analogue lead.
  unison: 5,
  unisonDetune: 17,
};

export const DEFAULT_BASS_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'sine',
  detune: 0.05,
  subLevel: 0.8,
  noiseLevel: 0.02,
  cutoff: 420,
  resonance: 2,
  filterEnvAmount: 0.25,
  attack: 0.006,
  decay: 0.18,
  sustain: 0.75,
  release: 0.14,
  filterAttack: 0.05,
  filterDecay: 0.2,
  filterSustain: 0.8,
  filterRelease: 0.2,
  glide: 0,
  vibratoRate: 0,
  vibratoDepth: 0,
  // §4: "prominent, steady ostinato; mild chorus/saturation". Dry and centred
  // — the bass is the anchor, and anchors do not wander.
  chorusMix: 0.06,
  drive: 0.34,
  pan: 0,
  reverbSend: 0,
  delaySend: 0,
  unison: 2,
  unisonDetune: 7,
};

export const DEFAULT_PAD_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'triangle',
  detune: 11,
  subLevel: 0.12,
  noiseLevel: 0.02,
  cutoff: 900,
  resonance: 1.2,
  filterEnvAmount: 0.2,
  attack: 0.7,
  decay: 1.0,
  sustain: 0.75,
  release: 1.2,
  filterAttack: 0.9,
  filterDecay: 0.8,
  filterSustain: 0.7,
  filterRelease: 1.0,
  glide: 0,
  vibratoRate: 3.6,
  vibratoDepth: 7,
  // §4 "space: long reverb tails + modulation as mood glue". The pad is the
  // widest thing in the mix and carries most of the plate.
  chorusMix: 0.85,
  drive: 0.12,
  pan: -0.1,
  reverbSend: 0.62,
  delaySend: 0.1,
  unison: 4,
  unisonDetune: 22,
};

export const DEFAULT_PLUCK_PARAMS: InstrumentParams = {
  osc1Wave: 'sawtooth',
  osc2Wave: 'square',
  // 0.08 cents is not a detune. Two square waves that far apart beat once
  // every twenty seconds, so the patch was a single square wave — which is
  // exactly what a chiptune is.
  detune: 13,
  subLevel: 0.08,
  noiseLevel: 0.015,
  cutoff: 900,
  resonance: 11,
  filterEnvAmount: 0.75,
  attack: 0.002,
  decay: 0.22,
  sustain: 0.06,
  release: 0.28,
  filterAttack: 0.004,
  filterDecay: 0.16,
  filterSustain: 0.08,
  filterRelease: 0.14,
  glide: 0,
  vibratoRate: 0,
  vibratoDepth: 0,
  // Answers the hook from the opposite side, wet enough to sit behind it.
  chorusMix: 0.35,
  drive: 0.22,
  pan: -0.42,
  reverbSend: 0.5,
  delaySend: 0.34,
  unison: 3,
  unisonDetune: 15,
};

export const DEFAULT_GLOBAL_FX: GlobalFXParams = {
  delayTime: 0.34,
  delayFeedback: 0.38,
  reverbMix: 0.42,
  // Mastering. Width above 1 pushes the chorus and the plate out past the
  // speakers while leaving the kick and bass where they are; the shelves take
  // a little weight off the bottom and put some air back on top, which is
  // where a render measured this mix as thin.
  width: 1.35,
  lowShelf: -1.5,
  airShelf: 3.0,
  glue: 0.4,
  masterDrive: 0.22,
};

/**
 * Preset banks, built from documented sounds rather than invented names.
 *
 * Sources for the three that are actually cited:
 *  - Polymoog 280A "Vox Humana": the factory preset Gary Numan bought the
 *    instrument for, and the high string part on "Cars" (1979). Numan's own
 *    account, plus a phaser and studio plate reverb on the record.
 *  - Moog Source: the melody and the bassline on New Order's "Blue Monday"
 *    (1982), driven by Sumner's sequencer, over an Oberheim DMX.
 *  - Roland Juno-106: one DCO per voice, and a built-in chorus that is the
 *    defining part of its sound rather than an effect on top of it.
 *
 * Honesty about the rest: these are reconstructions from the documented
 * character of each instrument, made with the oscillators, filter and effects
 * this engine actually has. They are not sampled, measured or A/B'd against
 * the originals. Where a name refers to a band rather than a machine it
 * describes a genre convention, not a verified patch — searching did not
 * confirm which synths Clan of Xymox or the Sisters of Mercy used on record,
 * so no preset here claims to be theirs.
 */
export const INSTRUMENT_PRESETS: Partial<Record<TrackType, Record<string, InstrumentParams>>> = {
  lead: {
    // Polymoog 280A. A preset-based, fully polyphonic instrument: the patch is
    // a chorused string-voice, not a filter sweep, so the filter barely moves
    // and the character lives in the detuned stack and the modulation.
    'Vox Humana': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'triangle', detune: 16,
      unison: 6, unisonDetune: 26,
      subLevel: 0.1, noiseLevel: 0.01,
      cutoff: 3400, resonance: 1.6, filterEnvAmount: 0.12,
      attack: 0.12, decay: 0.6, sustain: 0.85, release: 0.7,
      filterAttack: 0.3, filterDecay: 0.6, filterSustain: 0.8, filterRelease: 0.6,
      vibratoRate: 5.2, vibratoDepth: 24, lfoToFilter: 0.05,
      chorusMix: 0.95, drive: 0.1, pan: 0.05,
      reverbSend: 0.62, delaySend: 0.18,
    },
    // Moog Source: monophonic, one filter, and a sequencer hammering it. Short,
    // resonant, and the same every time — which is the point of a sequence.
    'Source Sequence': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'square', detune: 7,
      unison: 2, unisonDetune: 9,
      subLevel: 0.35, noiseLevel: 0.02,
      cutoff: 1100, resonance: 12, filterEnvAmount: 0.85,
      attack: 0.004, decay: 0.14, sustain: 0.18, release: 0.14,
      filterAttack: 0.006, filterDecay: 0.11, filterSustain: 0.12, filterRelease: 0.12,
      glide: 0, vibratoDepth: 0,
      chorusMix: 0.15, drive: 0.45, pan: 0.1,
      reverbSend: 0.2, delaySend: 0.3,
    },
    // Juno-106 archetype: a single DCO per voice, kept deliberately plain, with
    // the chorus doing the work. Minimal filter movement is the whole idea.
    'Juno Cold': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 5,
      unison: 3, unisonDetune: 12,
      subLevel: 0.25, noiseLevel: 0,
      cutoff: 2600, resonance: 2.5, filterEnvAmount: 0.2,
      attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.45,
      filterAttack: 0.05, filterDecay: 0.4, filterSustain: 0.6, filterRelease: 0.4,
      vibratoRate: 4.2, vibratoDepth: 11, lfoToFilter: 0.12,
      chorusMix: 0.98, drive: 0.08, pan: -0.06,
      reverbSend: 0.45, delaySend: 0.2,
    },
    'Ice Pick': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'square', osc2Wave: 'sawtooth', detune: 22,
      unison: 4, unisonDetune: 20,
      subLevel: 0.12, noiseLevel: 0.05,
      cutoff: 700, resonance: 16, filterEnvAmount: 0.95,
      attack: 0.002, decay: 0.16, sustain: 0.05, release: 0.2,
      filterAttack: 0.003, filterDecay: 0.13, filterSustain: 0.05, filterRelease: 0.15,
      chorusMix: 0.3, drive: 0.4, pan: 0.18,
      reverbSend: 0.4, delaySend: 0.4,
    },
    'Blade Chorus': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 14,
      unison: 7, unisonDetune: 32,
      subLevel: 0.18, noiseLevel: 0.02,
      cutoff: 1900, resonance: 6, filterEnvAmount: 0.6,
      attack: 0.03, decay: 0.35, sustain: 0.45, release: 0.5,
      filterAttack: 0.05, filterDecay: 0.35, filterSustain: 0.4, filterRelease: 0.4,
      chorusMix: 0.9, drive: 0.35, pan: 0,
      reverbSend: 0.5, delaySend: 0.28,
    },
    'Ether Glide': {
      ...DEFAULT_LEAD_PARAMS,
      osc1Wave: 'triangle', osc2Wave: 'sawtooth', detune: 19,
      unison: 5, unisonDetune: 24,
      subLevel: 0.14, noiseLevel: 0.01,
      cutoff: 2200, resonance: 4, filterEnvAmount: 0.35,
      attack: 0.2, decay: 0.7, sustain: 0.8, release: 1.1,
      filterAttack: 0.35, filterDecay: 0.7, filterSustain: 0.7, filterRelease: 0.9,
      glide: 190, vibratoRate: 4.6, vibratoDepth: 34,
      chorusMix: 0.92, drive: 0.06, pan: -0.14,
      reverbSend: 0.75, delaySend: 0.34,
    },
  },

  bass: {
    // The Blue Monday bassline: a Moog Source, monophonic, short and hard.
    'Source Bass': {
      ...DEFAULT_BASS_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'square', detune: 6,
      unison: 2, unisonDetune: 6,
      subLevel: 0.7, noiseLevel: 0.01,
      cutoff: 480, resonance: 7, filterEnvAmount: 0.5,
      attack: 0.004, decay: 0.14, sustain: 0.5, release: 0.1,
      filterAttack: 0.005, filterDecay: 0.12, filterSustain: 0.3, filterRelease: 0.1,
      chorusMix: 0.04, drive: 0.42, pan: 0, reverbSend: 0, delaySend: 0,
    },
    // TB-303 behaviour: a steep resonant filter with a fast envelope, which is
    // what makes an acid line move rather than the notes themselves.
    'Acid Cell': {
      ...DEFAULT_BASS_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 3,
      unison: 1, unisonDetune: 0,
      subLevel: 0.4, noiseLevel: 0,
      cutoff: 260, resonance: 19, filterEnvAmount: 0.95,
      attack: 0.002, decay: 0.16, sustain: 0.15, release: 0.08,
      filterAttack: 0.004, filterDecay: 0.2, filterSustain: 0.05, filterRelease: 0.1,
      glide: 55,
      chorusMix: 0, drive: 0.55, pan: 0, reverbSend: 0.05, delaySend: 0.1,
    },
    'Sub Anchor': {
      ...DEFAULT_BASS_PARAMS,
      osc1Wave: 'sine', osc2Wave: 'sine', detune: 2,
      unison: 1, unisonDetune: 0,
      subLevel: 0.95, noiseLevel: 0.02,
      cutoff: 190, resonance: 1, filterEnvAmount: 0.1,
      attack: 0.008, decay: 0.25, sustain: 0.85, release: 0.16,
      chorusMix: 0, drive: 0.2, pan: 0, reverbSend: 0, delaySend: 0,
    },
    'Ghost Train': {
      ...DEFAULT_BASS_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'triangle', detune: 11,
      unison: 3, unisonDetune: 10,
      subLevel: 0.55, noiseLevel: 0.04,
      cutoff: 620, resonance: 4, filterEnvAmount: 0.4,
      attack: 0.006, decay: 0.3, sustain: 0.7, release: 0.2,
      chorusMix: 0.12, drive: 0.5, pan: 0, reverbSend: 0.08, delaySend: 0,
    },
    'Juno Bass': {
      ...DEFAULT_BASS_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'square', detune: 4,
      unison: 2, unisonDetune: 8,
      subLevel: 0.6, noiseLevel: 0,
      cutoff: 540, resonance: 3, filterEnvAmount: 0.3,
      attack: 0.01, decay: 0.22, sustain: 0.75, release: 0.18,
      vibratoRate: 3.1, vibratoDepth: 4, lfoToFilter: 0.1,
      chorusMix: 0.35, drive: 0.25, pan: 0, reverbSend: 0.06, delaySend: 0,
    },
  },

  pad: {
    // The same Polymoog voice with the envelope opened out — the sound Numan
    // described as the reason he bought the instrument.
    'Vox Humana Wide': {
      ...DEFAULT_PAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'triangle', detune: 18,
      unison: 6, unisonDetune: 30,
      subLevel: 0.1, noiseLevel: 0.01,
      cutoff: 1500, resonance: 1.4, filterEnvAmount: 0.15,
      attack: 0.5, decay: 1.2, sustain: 0.9, release: 1.6,
      filterAttack: 0.6, filterDecay: 1.0, filterSustain: 0.85, filterRelease: 1.4,
      vibratoRate: 5.0, vibratoDepth: 21, lfoToFilter: 0.05,
      chorusMix: 0.98, drive: 0.08, pan: -0.08,
      reverbSend: 0.8, delaySend: 0.12,
    },
    // Juno-106 pad practice for the genre: slow attack, long release, and the
    // filter left almost still so the chorus is what moves.
    'Juno Fog': {
      ...DEFAULT_PAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 8,
      unison: 4, unisonDetune: 18,
      subLevel: 0.14, noiseLevel: 0.01,
      cutoff: 850, resonance: 1.2, filterEnvAmount: 0.1,
      attack: 0.9, decay: 1.4, sustain: 0.9, release: 1.8,
      filterAttack: 1.0, filterDecay: 1.2, filterSustain: 0.85, filterRelease: 1.5,
      vibratoRate: 2.4, vibratoDepth: 6, lfoToFilter: 0.14,
      chorusMix: 1.0, drive: 0.05, pan: -0.12,
      reverbSend: 0.7, delaySend: 0.08,
    },
    'Solina Veil': {
      ...DEFAULT_PAD_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', detune: 26,
      unison: 7, unisonDetune: 36,
      subLevel: 0.06, noiseLevel: 0.02,
      cutoff: 2100, resonance: 1, filterEnvAmount: 0.08,
      attack: 0.35, decay: 1.0, sustain: 0.95, release: 1.4,
      vibratoRate: 6.2, vibratoDepth: 15,
      chorusMix: 1.0, drive: 0.04, pan: 0.1,
      reverbSend: 0.72, delaySend: 0.1,
    },
    'Cathedral': {
      ...DEFAULT_PAD_PARAMS,
      osc1Wave: 'triangle', osc2Wave: 'sine', detune: 14,
      unison: 5, unisonDetune: 20,
      subLevel: 0.2, noiseLevel: 0.03,
      cutoff: 620, resonance: 2, filterEnvAmount: 0.25,
      attack: 1.4, decay: 1.8, sustain: 0.95, release: 2.4,
      filterAttack: 1.5, filterDecay: 1.5, filterSustain: 0.9, filterRelease: 2.0,
      chorusMix: 0.8, drive: 0.06, pan: 0,
      reverbSend: 0.95, delaySend: 0.2,
    },
    'Event Horizon': {
      ...DEFAULT_PAD_PARAMS,
      osc1Wave: 'square', osc2Wave: 'sawtooth', detune: 30,
      unison: 5, unisonDetune: 28,
      noiseLevel: 0.09, cutoff: 1800, resonance: 5, filterEnvAmount: 0.4,
      attack: 0.7, decay: 1.6, sustain: 0.8, release: 2.0,
      vibratoRate: 1.4, vibratoDepth: 46, lfoToFilter: 0.3,
      chorusMix: 0.9, drive: 0.16, pan: 0.14,
      reverbSend: 0.85, delaySend: 0.3,
    },
  },

  pluck: {
    // Sparse, metallic and short — the counter-figure, not a second lead.
    'Glass Rosary': {
      ...DEFAULT_PLUCK_PARAMS,
      osc1Wave: 'triangle', osc2Wave: 'sine', detune: 24,
      unison: 3, unisonDetune: 18,
      subLevel: 0.04, noiseLevel: 0.01,
      cutoff: 2400, resonance: 3, filterEnvAmount: 0.5,
      attack: 0.001, decay: 0.35, sustain: 0.02, release: 0.6,
      filterAttack: 0.002, filterDecay: 0.3, filterSustain: 0.05, filterRelease: 0.4,
      chorusMix: 0.5, drive: 0.1, pan: -0.4,
      reverbSend: 0.7, delaySend: 0.42,
    },
    'Cold Arp': {
      ...DEFAULT_PLUCK_PARAMS,
      osc1Wave: 'sawtooth', osc2Wave: 'square', detune: 13,
      unison: 3, unisonDetune: 15,
      subLevel: 0.08, noiseLevel: 0.015,
      cutoff: 900, resonance: 11, filterEnvAmount: 0.75,
      attack: 0.002, decay: 0.22, sustain: 0.06, release: 0.28,
      chorusMix: 0.35, drive: 0.22, pan: -0.42,
      reverbSend: 0.5, delaySend: 0.34,
    },
    'Ghost Echoes': {
      ...DEFAULT_PLUCK_PARAMS,
      osc1Wave: 'sine', osc2Wave: 'triangle', detune: 20,
      unison: 4, unisonDetune: 22,
      subLevel: 0.05, noiseLevel: 0,
      cutoff: 1300, resonance: 6, filterEnvAmount: 0.3,
      attack: 0.003, decay: 0.5, sustain: 0.04, release: 1.1,
      chorusMix: 0.7, drive: 0.06, pan: -0.5,
      reverbSend: 0.85, delaySend: 0.55,
    },
    'Bit Mercy': {
      ...DEFAULT_PLUCK_PARAMS,
      osc1Wave: 'square', osc2Wave: 'square', detune: 26,
      unison: 2, unisonDetune: 24,
      noiseLevel: 0.06, cutoff: 1600, resonance: 15, filterEnvAmount: 0.9,
      attack: 0.001, decay: 0.1, sustain: 0, release: 0.14,
      chorusMix: 0.25, drive: 0.45, pan: -0.3,
      reverbSend: 0.35, delaySend: 0.5,
    },
  },
};


/**
 * Song presets: a whole instrument set plus the effects that go with it.
 *
 * Per-instrument patches are useful for building a sound; these are for
 * arriving at one. Each names its provenance, and each is honest about
 * whether that provenance is a documented instrument or a genre convention.
 */
export interface SongPreset {
  name: string;
  /** Where the sound comes from, and how firmly. */
  note: string;
  lead: string;
  bass: string;
  pad: string;
  pluck: string;
  fx: Partial<GlobalFXParams>;
}

export const SONG_PRESETS: readonly SongPreset[] = [
  {
    name: 'Machine 1979',
    note: 'Polymoog 280A "Vox Humana" — the preset Numan bought the instrument for, with the phaser-and-plate treatment the record used.',
    lead: 'Vox Humana', bass: 'Source Bass', pad: 'Vox Humana Wide', pluck: 'Glass Rosary',
    fx: { reverbMix: 0.55, delayTime: 0.28, delayFeedback: 0.3, width: 1.5, airShelf: 4, lowShelf: -2, glue: 0.35, masterDrive: 0.18 },
  },
  {
    name: 'Blue Sequence',
    note: 'Moog Source over an Oberheim DMX: monophonic lead and bass, both driven by a sequencer. Dry, hard and narrow by design.',
    lead: 'Source Sequence', bass: 'Source Bass', pad: 'Juno Fog', pluck: 'Cold Arp',
    fx: { reverbMix: 0.26, delayTime: 0.38, delayFeedback: 0.42, width: 1.15, airShelf: 2, lowShelf: 0, glue: 0.5, masterDrive: 0.3 },
  },
  {
    name: 'Juno Winter',
    note: 'Roland Juno-106 practice: one oscillator per voice, the filter left almost still, and the built-in chorus doing the work.',
    lead: 'Juno Cold', bass: 'Juno Bass', pad: 'Juno Fog', pluck: 'Ghost Echoes',
    fx: { reverbMix: 0.48, delayTime: 0.3, delayFeedback: 0.34, width: 1.55, airShelf: 2.5, lowShelf: -1, glue: 0.3, masterDrive: 0.15 },
  },
  {
    name: 'Cold Cathedral',
    note: 'Genre convention rather than a specific instrument: slow attacks, long releases, everything soaked in the plate.',
    lead: 'Ether Glide', bass: 'Sub Anchor', pad: 'Cathedral', pluck: 'Ghost Echoes',
    fx: { reverbMix: 0.72, delayTime: 0.45, delayFeedback: 0.46, width: 1.6, airShelf: 1.5, lowShelf: -2.5, glue: 0.25, masterDrive: 0.12 },
  },
  {
    name: 'Acid Procession',
    note: 'Genre convention: a resonant sequenced bass line under a hard lead, closer to EBM than to coldwave.',
    lead: 'Ice Pick', bass: 'Acid Cell', pad: 'Event Horizon', pluck: 'Bit Mercy',
    fx: { reverbMix: 0.3, delayTime: 0.24, delayFeedback: 0.5, width: 1.25, airShelf: 3.5, lowShelf: 0.5, glue: 0.55, masterDrive: 0.42 },
  },
  {
    name: 'Velvet Ruin',
    note: 'Genre convention: a wide chorused lead over a driven bass, the loudest and most forward of these.',
    lead: 'Blade Chorus', bass: 'Ghost Train', pad: 'Solina Veil', pluck: 'Cold Arp',
    fx: { reverbMix: 0.44, delayTime: 0.33, delayFeedback: 0.38, width: 1.45, airShelf: 3, lowShelf: -1.5, glue: 0.42, masterDrive: 0.26 },
  },
];

export const INITIAL_TRACKS: Track[] = [
  { id: 'lead', name: 'NOCTURNAL LEAD', color: 'bg-neon-purple', volume: MIX_LEVELS.lead, isCollapsed: false, notes: [] },
  { id: 'pluck', name: 'NOCTURNAL PLUCK', color: 'bg-teal-500', volume: MIX_LEVELS.pluck, isCollapsed: false, notes: [] },
  { id: 'pad', name: 'NOCTURNAL PAD', color: 'bg-blue-800', volume: MIX_LEVELS.pad, isCollapsed: true, notes: [] },
  { id: 'bass', name: 'NOCTURNAL BASS', color: 'bg-indigo-600', volume: MIX_LEVELS.bass, isCollapsed: false, notes: [] },
  { id: 'fx', name: 'FX', color: 'bg-neon-pink', volume: MIX_LEVELS.fx, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.7 })) },
  { id: 'hihat', name: 'HH', color: 'bg-yellow-400', volume: MIX_LEVELS.hihat, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.6 })) },
  { id: 'snare', name: 'SD', color: 'bg-cyan-400', volume: MIX_LEVELS.snare, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 0.9 })) },
  { id: 'kick', name: 'BD', color: 'bg-red-500', volume: MIX_LEVELS.kick, isCollapsed: false, steps: Array(128).fill(null).map(() => ({ active: false, velocity: 1.0 })) },
];
