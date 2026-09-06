/**
 * Progressions and voice-leading styles, as named choices rather than dice.
 *
 * The progressions are the loops earworm.md §3.2 lists by name. Corpus work on
 * rock harmony is the spec's stated reason for them: bVII and bVI are the
 * common "flat-side" resources, which is why these read as idiomatic rather
 * than as borrowed.
 *
 * The voice-leading presets bias how a melody is built — how firmly it locks
 * to the chord, how much it leaps, how wide it ranges. They do not overrule
 * the conformance targets: the scorer still judges every candidate against
 * §3.3, §4.1 and §8, so a style that pushes past those simply scores worse
 * and the search pulls it back. Presets propose; the spec disposes.
 */

/** Degrees are 0-indexed: 0=i, 2=bIII, 3=iv, 4=v, 5=bVI, 6=bVII. */
export interface HarmonyPreset {
  name: string;
  /** Roman numerals, for the UI. */
  figures: string;
  note: string;
  /** null means "let the weighted walk choose", the previous behaviour. */
  loop: readonly number[] | null;
}

export const HARMONY_PRESETS: readonly HarmonyPreset[] = [
  {
    name: 'Auto',
    figures: '—',
    note: 'A weighted walk through the mode’s own palette, re-rolled each time.',
    loop: null,
  },
  {
    name: 'Descent',
    figures: 'i – ♭VII – ♭VI – ♭VII',
    note: '§3.2, first listed. The flat-side descent and back: the most idiomatic of the four.',
    loop: [0, 6, 5, 6],
  },
  {
    name: 'Lift',
    figures: 'i – ♭VI – ♭VII – i',
    note: '§3.2. Rises away from the tonic and returns, so each bar of the phrase lands home.',
    loop: [0, 5, 6, 0],
  },
  {
    name: 'Plagal Fall',
    figures: 'i – iv – ♭VII – ♭VI',
    note: '§3.2. The minor subdominant early gives the phrase somewhere darker to start.',
    loop: [0, 3, 6, 5],
  },
  {
    name: 'Rocking',
    figures: 'i – ♭VII – i – ♭VI',
    note: '§3.2. Returns to the tonic mid-phrase, which makes it the most static and the most hypnotic.',
    loop: [0, 6, 0, 5],
  },
  {
    name: 'Relative',
    figures: 'i – ♭VI – ♭III – ♭VII',
    note: '§2 (second listing). Passes through the relative major, so it is the brightest of the set.',
    loop: [0, 5, 2, 6],
  },
  {
    name: 'Turnaround',
    figures: 'i – ♭VII – iv – i',
    note: '§2 (second listing). Closes on the tonic, which suits a section that has to end rather than loop.',
    loop: [0, 6, 3, 0],
  },
];

export interface VoiceLeadingPreset {
  name: string;
  note: string;
  /** Probability a strong beat takes a chord tone (§6 suggests 0.65). */
  chordToneBias: number;
  /** Largest move allowed between anchors, in scale steps. */
  maxFillMove: number;
  /** Contour amplitude in scale steps, as [min, max]. */
  amplitude: readonly [number, number];
  /** Scales the twist's width. */
  twistScale: number;
}

export const VOICE_LEADING_PRESETS: readonly VoiceLeadingPreset[] = [
  {
    name: 'Cantabile',
    note: 'The spec’s own balance: mostly steps, one headline leap, a singable range.',
    chordToneBias: 0.82, maxFillMove: 2, amplitude: [3, 5], twistScale: 1,
  },
  {
    name: 'Chorale',
    note: 'Locks hard to the chord and moves by step almost throughout — the calmest setting.',
    chordToneBias: 0.95, maxFillMove: 1, amplitude: [3, 4], twistScale: 0.7,
  },
  {
    name: 'Angular',
    note: 'Looser on the chord and wider between anchors, still inside §3.3’s range window.',
    chordToneBias: 0.68, maxFillMove: 3, amplitude: [4, 6], twistScale: 1.35,
  },
  {
    name: 'Drone',
    note: 'A narrow band around the tonic: repetition carries it rather than motion.',
    chordToneBias: 0.9, maxFillMove: 1, amplitude: [2, 3], twistScale: 0.8,
  },
  {
    name: 'Soaring',
    note: 'A wide arch that spends the whole range, for a chorus meant to lift.',
    chordToneBias: 0.78, maxFillMove: 2, amplitude: [5, 7], twistScale: 1.15,
  },
];

export const harmonyByName = (name?: string): HarmonyPreset =>
  HARMONY_PRESETS.find((h) => h.name === name) ?? HARMONY_PRESETS[0];

export const voiceLeadingByName = (name?: string): VoiceLeadingPreset =>
  VOICE_LEADING_PRESETS.find((v) => v.name === name) ?? VOICE_LEADING_PRESETS[0];
