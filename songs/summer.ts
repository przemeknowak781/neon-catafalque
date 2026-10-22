import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";
import {
  STEPS_PER_BAR, augmented, bar, buildPad, builder, chord, chordAt, harmonise, harmonyMap,
  lift, midiOf, phrase, type Bar, type Chord,
} from "./score";

/**
 * THE SUMMER WE NEVER HAD — the second built-in song, written by hand.
 *
 * Anemoia ended as something closer to chill: extended chords everywhere, a
 * blurred pluck, the energy held down. This one is aimed at nostalgia rather
 * than at calm, and the difference is mostly arousal and line. In Barrett et
 * al. (2010, Emotion 10(3), 390-403) arousal predicted music-evoked nostalgia
 * positively, so the song drives: 108 BPM, a sixteenth-note arpeggio, four on
 * the floor in the choruses, a sidechained pad that breathes with the kick.
 * And it sings: plain triads with the colour put in the melody, where
 * Sloboda (1991, Psychology of Music 19(2), 110-120) found the features that
 * listeners linked to tears and chills — appoggiaturas, and melodic sequences.
 *
 * What it keeps from Anemoia, because it worked: the lead as a polyphonic,
 * blurred instrument playing the melody in three-voice chords; a sign-on that
 * plays the chorus as a memory before anyone has heard it; a tape that is
 * worn at the edges and clear in the middle.
 *
 * The chorus harmony is the canon progression with a descending bass, D,
 * C-sharp, B, A, G, F-sharp: a major-key cousin of the descending minor
 * tetrachord that Rosand (1979, Musical Quarterly 65(3), 346-359) traced as
 * the emblem of lament, not that formula itself — and
 * instead of the expected G it turns to G minor over B-flat, the borrowed
 * minor iv, before the dominant. The melody is a two-bar idea stated three
 * times on the way down (a sequence) and each time its long note arrives as
 * an appoggiatura: D over A, B over F-sharp minor, E over D, each falling a
 * step into the chord. The second half climbs to the song's highest note,
 * the E, on the sixth bar.
 *
 * Form, 72 bars at 108 BPM, about two minutes forty:
 *   INTRO 8 · VERSE 1 8 · PRE 4 · CHORUS 1 8 · VERSE 2 8 · PRE 4 · CHORUS 2 8
 *   · BRIDGE 8 · CHORUS 3 8 (up a semitone) · OUTRO 8
 *
 * Key: D major, the verse leaning on its relative minor; the bridge goes to
 * the flat side (B-flat, C) and reaches E-flat through F and B-flat, so the
 * last chorus and the outro are a semitone up.
 */

export const SUMMER_BPM = 108;
const BARS = 72;
export const SUMMER_STEPS = BARS * STEPS_PER_BAR;

// --- the melody -----------------------------------------------------------

/**
 * The chorus. Bars 1-4 are the idea and its sequence a third lower; bars 5-6
 * the idea turned upward to the top of the song; bars 7-8 the borrowed iv
 * and the dominant. Every even bar opens on an appoggiatura.
 */
export const SUMMER_CHORUS: readonly Bar[] = [
  [[0, 'F#5', 2], [2, 'A5', 2], [4, 'D6', 8], [12, 'C#6', 2], [14, 'B5', 2]],
  [[0, 'D6', 6], [6, 'C#6', 10]],
  [[0, 'D5', 2], [2, 'F#5', 2], [4, 'B5', 8], [12, 'A5', 2], [14, 'G5', 2]],
  [[0, 'B5', 6], [6, 'A5', 10]],
  [[0, 'G5', 2], [2, 'B5', 2], [4, 'E6', 8], [12, 'D6', 2], [14, 'B5', 2]],
  [[0, 'E6', 6], [6, 'D6', 10]],
  [[0, 'D6', 4], [4, 'Bb5', 4], [8, 'G5', 4], [12, 'A5', 4]],
  [[0, 'A5', 8], [8, 'G5', 4], [12, 'E5', 4]],
];

/** The verse: low and spoken, over B minor, G, D, A. */
const VERSE: readonly Bar[] = [
  [[2, 'F#4', 2], [4, 'B4', 2], [6, 'C#5', 2], [8, 'D5', 6], [14, 'C#5', 2]],
  [[0, 'B4', 6], [6, 'A4', 2], [8, 'B4', 8]],
  [[2, 'F#4', 2], [4, 'A4', 2], [6, 'B4', 2], [8, 'A4', 6], [14, 'F#4', 2]],
  [[0, 'C#5', 6], [6, 'B4', 2], [8, 'A4', 8]],
  [[2, 'F#4', 2], [4, 'B4', 2], [6, 'C#5', 2], [8, 'D5', 6], [14, 'C#5', 2]],
  [[0, 'B4', 6], [6, 'A4', 2], [8, 'B4', 8]],
  [[2, 'F#4', 2], [4, 'A4', 2], [6, 'D5', 2], [8, 'E5', 6], [14, 'D5', 2]],
  [[0, 'C#5', 4], [4, 'E5', 4], [8, 'A4', 8]],
];

/** The pre-chorus: the same rising figure on E minor, F-sharp minor, G, then the suspension. */
const PRE: readonly Bar[] = [
  [[0, 'B4', 4], [4, 'E5', 4], [8, 'G5', 8]],
  [[0, 'C#5', 4], [4, 'F#5', 4], [8, 'A5', 8]],
  [[0, 'D5', 4], [4, 'G5', 4], [8, 'B5', 8]],
  [[0, 'D6', 8], [8, 'C#6', 4], [12, 'A5', 4]],
];

/** The bridge: long notes on the flat side, climbing. */
const BRIDGE: readonly Bar[] = [
  [[0, 'D5', 8], [8, 'F5', 8]],
  [[0, 'E5', 16]],
  [[0, 'F#5', 8], [8, 'A5', 8]],
  [[0, 'B5', 16]],
  [[0, 'B5', 8], [8, 'D6', 8]],
  [[0, 'C#6', 16]],
  [[0, 'C6', 8], [8, 'A5', 8]],
  [[0, 'D6', 8], [8, 'Bb5', 8]],
];

// --- harmony --------------------------------------------------------------

// Chorus and intro: the canon with a falling bass, voiced low so the lead has
// the octave and a half above to itself.
const D = chord('D', 'D2', ['D', 'F#', 'A'], ['A3', 'D4', 'F#4', 'A4']);
const AoverCs = chord('A/C#', 'C#2', ['A', 'C#', 'E'], ['A3', 'C#4', 'E4', 'A4']);
const Bm = chord('Bm', 'B1', ['B', 'D', 'F#'], ['F#3', 'B3', 'D4', 'F#4']);
const FsmOverA = chord('F#m/A', 'A1', ['F#', 'A', 'C#'], ['A3', 'C#4', 'F#4', 'A4']);
const Gadd6 = chord('G6', 'G1', ['G', 'B', 'D', 'E'], ['G3', 'B3', 'D4', 'G4']);
const DoverFs = chord('D/F#', 'F#1', ['D', 'F#', 'A'], ['A3', 'D4', 'F#4', 'A4']);
const GmOverBb = chord('Gm/Bb', 'Bb1', ['G', 'Bb', 'D'], ['G3', 'Bb3', 'D4', 'G4']);
const Asus = chord('Asus4', 'A1', ['A', 'D', 'E'], ['A3', 'D4', 'E4', 'A4']);
const A7 = chord('A7', 'A1', ['A', 'C#', 'E', 'G'], ['A3', 'C#4', 'E4', 'A4'], 8);

// Verse: low triads.
const vBm = chord('Bm', 'B1', ['B', 'D', 'F#'], ['B2', 'F#3', 'B3', 'D4']);
const vG = chord('G', 'G1', ['G', 'B', 'D'], ['G2', 'D3', 'G3', 'B3']);
const vD = chord('D', 'D2', ['D', 'F#', 'A'], ['A2', 'D3', 'F#3', 'A3']);
const vA = chord('A', 'A1', ['A', 'C#', 'E'], ['A2', 'E3', 'A3', 'C#4']);

// Pre-chorus: the bass climbs E, F-sharp, G, A.
const pEm = chord('Em', 'E2', ['E', 'G', 'B'], ['E3', 'B3', 'E4', 'G4']);
const pFsm = chord('F#m', 'F#2', ['F#', 'A', 'C#'], ['F#3', 'C#4', 'F#4', 'A4']);
const pG = chord('G', 'G2', ['G', 'B', 'D'], ['G3', 'D4', 'G4', 'B4']);

// Bridge: the flat side, B-flat and C, then home, then through F and B-flat
// into E-flat.
const bBb = chord('Bb', 'Bb1', ['Bb', 'D', 'F'], ['F3', 'Bb3', 'D4', 'F4']);
const bC = chord('C', 'C2', ['C', 'E', 'G'], ['E3', 'G3', 'C4', 'E4']);
const bD = chord('D', 'D2', ['D', 'F#', 'A'], ['F#3', 'A3', 'D4', 'F#4']);
const bBm = chord('Bm', 'B1', ['B', 'D', 'F#'], ['F#3', 'B3', 'D4', 'F#4']);
const bG = chord('G', 'G1', ['G', 'B', 'D'], ['G3', 'B3', 'D4', 'G4']);
const bA = chord('A', 'A1', ['A', 'C#', 'E'], ['E3', 'A3', 'C#4', 'E4']);
const bF = chord('F', 'F1', ['F', 'A', 'C'], ['F3', 'A3', 'C4', 'F4']);

// Outro in E-flat: the canon once more, its last turn the minor iv.
const oAbm = chord('Abm', 'Ab1', ['Ab', 'Cb', 'Eb'], ['Ab3', 'Cb4', 'Eb4', 'Ab4']);
const oEb = chord('Eb', 'Eb2', ['Eb', 'G', 'Bb'], ['Bb3', 'Eb4', 'G4', 'Bb4']);

const CANON = [D, AoverCs, Bm, FsmOverA, Gadd6, DoverFs, GmOverBb];

function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);
  const chorus = (shift = 0) => {
    for (const c of CANON) push(lift(c, shift));
    push(lift(Asus, shift), lift(A7, shift));
  };
  const verse = () => {
    for (const c of [vBm, vG, vD, vA, vBm, vG, vD, vA]) push(c);
  };
  const pre = () => {
    push(pEm); push(pFsm); push(pG); push(Asus, A7);
  };

  chorus();         // INTRO — the chorus's harmony, the chorus's melody as a memory
  verse();          // VERSE 1
  pre();            // PRE
  chorus();         // CHORUS 1
  verse();          // VERSE 2
  pre();            // PRE
  chorus();         // CHORUS 2
  for (const c of [bBb, bC, bD, bBm, bG, bA, bF, bBb]) push(c);  // BRIDGE
  chorus(1);        // CHORUS 3, in E-flat
  // OUTRO — the canon in E-flat, ending on the minor iv and home.
  for (const c of CANON.slice(0, 6)) push(lift(c, 1));
  push(oAbm); push(oEb);

  if (bars.length !== BARS) throw new Error(`Harmony has ${bars.length} bars, expected ${BARS}`);
  return bars;
}

// --- track builders -------------------------------------------------------

function buildMelody(): NoteEvent[] {
  const m = builder('melody');
  phrase(m, 8, VERSE, 0.72);                // VERSE 1
  phrase(m, 16, PRE, 0.8);                  // PRE
  phrase(m, 20, SUMMER_CHORUS, 0.92);       // CHORUS 1
  phrase(m, 28, VERSE, 0.74);               // VERSE 2
  phrase(m, 36, PRE, 0.84);                 // PRE
  phrase(m, 40, SUMMER_CHORUS, 0.94);       // CHORUS 2
  phrase(m, 48, BRIDGE, 0.7);               // BRIDGE
  phrase(m, 56, SUMMER_CHORUS, 0.97, 1);    // CHORUS 3, in E-flat
  // OUTRO: the first idea and the climb, once each, quietly.
  phrase(m, 64, SUMMER_CHORUS.slice(0, 2), 0.66, 1);
  phrase(m, 68, SUMMER_CHORUS.slice(4, 6), 0.58, 1);
  return m.notes;
}

/**
 * The pluck: in the intro, the chorus's first four bars at half speed — the
 * memory — and from the verse on, a sixteenth-note arpeggio an octave above
 * the pad, up and down through the chord. A note of the arpeggio that would
 * sit a semitone from the lead, or above the melody, drops an octave.
 */
function buildPluck(bars: Chord[][], lead: NoteEvent[]): NoteEvent[] {
  const p = builder('pluck');
  augmented(p, bar(0), SUMMER_CHORUS.slice(0, 4), 0.5);

  const sounding = (step: number) =>
    lead.filter((n) => n.startStep <= step && n.startStep + n.duration > step).map((n) => midiOf(n.note));
  const ORDER = [0, 1, 2, 3, 2, 1, 2, 3];
  const arp = (from: number, to: number, velocity: (b: number) => number, every = 1) => {
    for (let b = from; b < to; b++) {
      for (let s = 0; s < STEPS_PER_BAR; s += every) {
        const step = bar(b) + s;
        const c = chordAt(bars, step);
        let m = midiOf(c.pad[ORDER[(s / every) % ORDER.length]]) + 12;
        const now = sounding(step);
        const top = now.length ? Math.max(...now) : Infinity;
        if (m > top || now.some((x) => Math.abs(x - m) === 1)) m -= 12;
        const accent = s % 4 === 0 ? 1 : 0.78;
        p.add(step, m, 1, velocity(b) * accent);
      }
    }
  };
  arp(8, 16, () => 0.28, 2);          // VERSE 1: eighths
  arp(16, 20, (b) => 0.34 + (b - 16) * 0.02);
  arp(20, 28, () => 0.5);            // CHORUS 1
  arp(28, 36, () => 0.3);             // VERSE 2
  arp(36, 40, (b) => 0.36 + (b - 36) * 0.02);  // PRE
  arp(40, 48, () => 0.52);            // CHORUS 2
  arp(48, 56, () => 0.34, 2);         // BRIDGE: eighths again
  arp(56, 64, () => 0.55);            // CHORUS 3
  arp(64, 72, (b) => 0.4 - (b - 64) * 0.035, 2);  // OUTRO, thinning
  return p.notes;
}

const padEnergy = (b: number) =>
  b < 8 ? 0.24 : b < 16 ? 0.26 : b < 20 ? 0.29 : b < 28 ? 0.32 : b < 36 ? 0.27
    : b < 40 ? 0.3 : b < 48 ? 0.33 : b < 56 ? 0.34 : b < 64 ? 0.34 : 0.3 - (b - 64) * 0.02;

function buildBass(bars: Chord[][]): NoteEvent[] {
  const bass = builder('bass');
  const root = (b: number, s = 0) => midiOf(chordAt(bars, bar(b) + s).root);
  const eighths = (b: number, v: number, octave: boolean) => {
    for (let s = 0; s < 16; s += 2) {
      bass.add(bar(b) + s, root(b, s) + (octave && s % 4 === 2 ? 12 : 0), 1.6, v * (s % 4 === 0 ? 1 : 0.76));
    }
  };
  bass.add(bar(4), root(4), 16, 0.42);       // INTRO: in at the fifth bar, held
  bass.add(bar(5), root(5), 16, 0.44);
  bass.add(bar(6), root(6), 16, 0.46);
  bass.add(bar(7), root(7), 16, 0.5);
  for (let b = 8; b < 16; b++) eighths(b, 0.62, false);
  for (let b = 16; b < 20; b++) eighths(b, 0.8, b === 19);
  for (let b = 20; b < 28; b++) eighths(b, 0.88, true);
  for (let b = 28; b < 36; b++) eighths(b, 0.66, false);
  for (let b = 36; b < 40; b++) eighths(b, 0.82, b === 39);
  for (let b = 40; b < 48; b++) eighths(b, 0.9, true);
  for (let b = 48; b < 54; b++) bass.add(bar(b), root(b), 16, 0.55);   // BRIDGE: held
  for (let b = 54; b < 56; b++) eighths(b, 0.7, false);
  for (let b = 56; b < 64; b++) eighths(b, 0.93, true);
  for (let b = 64; b < 68; b++) eighths(b, 0.7 - (b - 64) * 0.06, false);
  for (let b = 68; b < 71; b++) bass.add(bar(b), root(b), 16, 0.42 - (b - 68) * 0.05);
  bass.add(bar(71), root(71), 16, 0.28);
  return bass.notes;
}

function buildDrums(): Record<'kick' | 'snare' | 'hihat' | 'fx', SequencerStep[]> {
  const blank = (): SequencerStep[] =>
    Array.from({ length: SUMMER_STEPS }, () => ({ active: false, velocity: 0 }));
  const kick = blank(), snare = blank(), hihat = blank(), fx = blank();
  const hit = (lane: SequencerStep[], step: number, velocity: number) => {
    lane[step] = { active: true, velocity: Math.round(velocity * 1000) / 1000 };
  };
  const verseBar = (b: number, v: number, sixteenths: boolean) => {
    for (const s of [0, 6, 8]) hit(kick, bar(b) + s, (s === 6 ? 0.6 : 0.84) * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.78 * v);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.44 : 0.24) * v);
    if (sixteenths) for (let s = 1; s < 16; s += 2) hit(hihat, bar(b) + s, 0.13 * v);
  };
  const chorusBar = (b: number, v: number) => {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.92 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.95 * v);
    for (let s = 0; s < 16; s++) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.52 : s % 2 === 0 ? 0.28 : 0.16) * v);
  };
  /** The last bar of a build: snare on every eighth, then every sixteenth. */
  const build = (b: number) => {
    for (let s = 0; s < 8; s += 2) hit(snare, bar(b) + s, 0.4 + s * 0.03);
    for (let s = 8; s < 16; s++) hit(snare, bar(b) + s, 0.55 + (s - 8) * 0.05);
  };

  hit(kick, bar(7), 0.45); hit(kick, bar(7) + 8, 0.5);               // INTRO: a heartbeat
  for (let b = 8; b < 16; b++) verseBar(b, 0.78, false);
  for (let b = 16; b < 20; b++) {                                     // PRE: four on the floor, no hats
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.78);
    if (b < 19) for (const s of [4, 12]) hit(snare, bar(b) + s, 0.7);
  }
  build(19);
  for (let b = 20; b < 28; b++) chorusBar(b, 1);
  for (let b = 28; b < 36; b++) verseBar(b, 0.86, true);
  for (let b = 36; b < 40; b++) {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.8);
    if (b < 39) for (const s of [4, 12]) hit(snare, bar(b) + s, 0.72);
  }
  build(39);
  for (let b = 40; b < 48; b++) chorusBar(b, 1.03);
  // BRIDGE: the kit drops out; hats come back for the last two bars, then a build.
  for (let b = 53; b < 55; b++) for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.3);
  build(55);
  for (let b = 56; b < 64; b++) chorusBar(b, 1.07);
  for (let b = 64; b < 68; b++) {                                     // OUTRO: the kick fades
    for (const s of [0, 8]) hit(kick, bar(b) + s, 0.6 - (b - 64) * 0.08);
    for (const s of [2, 6, 10, 14]) hit(hihat, bar(b) + s, 0.26 - (b - 64) * 0.04);
  }
  for (const [b, v] of [[8, 0.45], [20, 0.8], [28, 0.45], [40, 0.82], [48, 0.6], [56, 1], [64, 0.45]] as const) {
    hit(fx, bar(b), v);
  }
  return { kick, snare, hihat, fx };
}

/** The tape: worn at both ends, clear in the choruses, lighter than Anemoia's throughout. */
export const SUMMER_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 8, flutter: 2, hiss: 0.5, tone: 7500, glide: 0.05 },
  { step: bar(8), wow: 3.5, flutter: 1.1, hiss: 0.32, tone: 12000, glide: 1.5 },
  { step: bar(20), wow: 1.8, flutter: 0.6, hiss: 0.22, tone: 17000, glide: 0.6 },
  { step: bar(28), wow: 3, flutter: 1, hiss: 0.3, tone: 12500, glide: 1.2 },
  { step: bar(40), wow: 1.8, flutter: 0.6, hiss: 0.22, tone: 17000, glide: 0.6 },
  { step: bar(48), wow: 5, flutter: 1.4, hiss: 0.42, tone: 8000, glide: 1.6 },
  { step: bar(56), wow: 1.5, flutter: 0.5, hiss: 0.2, tone: 18000, glide: 0.3 },
  { step: bar(64), wow: 6, flutter: 1.6, hiss: 0.42, tone: 9000, glide: 2.5 },
  { step: bar(69), wow: 11, flutter: 2.6, hiss: 0.62, tone: 5500, glide: 3 },
];

const TRACK_META: Record<TrackType, { name: string; color: string }> = {
  lead: { name: 'LONG EXPOSURE', color: 'bg-neon-purple' },
  pluck: { name: 'NIGHT BUS', color: 'bg-teal-500' },
  pad: { name: 'CASSETTE STRINGS', color: 'bg-blue-800' },
  bass: { name: 'OVERPASS', color: 'bg-indigo-600' },
  fx: { name: 'FX', color: 'bg-neon-pink' },
  hihat: { name: 'HH', color: 'bg-yellow-400' },
  snare: { name: 'SD', color: 'bg-cyan-400' },
  kick: { name: 'BD', color: 'bg-red-500' },
};

export function buildSummerTracks(): Track[] {
  const bars = harmony();
  const pad = buildPad(bars, padEnergy);
  const lead = harmonise(buildMelody(), bars, pad);
  const notes: Partial<Record<TrackType, NoteEvent[]>> = {
    lead, pluck: buildPluck(bars, lead), pad, bass: buildBass(bars),
  };
  const drums = buildDrums();
  const order: TrackType[] = ['lead', 'pluck', 'pad', 'bass', 'fx', 'hihat', 'snare', 'kick'];
  return order.map((id) => ({
    id,
    ...TRACK_META[id],
    volume: MIX_LEVELS[id],
    isCollapsed: id === 'pad',
    isMuted: false,
    isSoloed: false,
    ...(id in notes ? { notes: notes[id] } : { steps: drums[id as keyof typeof drums] }),
  }));
}

export const SUMMER_SECTIONS: Record<string, [number, number]> = {
  intro: [0, 8], verse1: [8, 16], pre1: [16, 20], chorus1: [20, 28], verse2: [28, 36],
  pre2: [36, 40], chorus2: [40, 48], bridge: [48, 56], chorus3: [56, 64], outro: [64, 72],
};
export const SUMMER_CHORUS_STARTS: [number, number][] = [[20, 0], [40, 0], [56, 1]];
export const summerHarmony = () => harmonyMap(harmony());
