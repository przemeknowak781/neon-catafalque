import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";
import {
  STEPS_PER_BAR, bar, buildPad, builder, chord, chordAt, harmonise, harmonyMap,
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
 * the floor in the choruses, a pad that ducks under the kick. And it sings:
 * the colour is in the melody, where Sloboda (1991, Psychology of Music
 * 19(2), 110-120) found the features listeners linked to tears and chills —
 * appoggiaturas, and melodic sequences.
 *
 * Second version, after a listening note: drop the intro, make the harmony
 * meatier and the progression more uplifting, lean harder on the bass, and
 * modernise the sounds. So the song starts on the verse; every chord is in
 * root position under five-voice open voicings; and the chorus no longer
 * falls — it climbs IV, V, vi from the subdominant, comes to rest on iii and
 * IV and the tonic, and ends on flat-VI and flat-VII, the rising major chords
 * borrowed from the minor that pull towards a tonic. Every chorus but the
 * last turns away from that tonic at the last moment; only the outro lands on
 * it.
 *
 * Third version, after another note: pull the arpeggio forward, a motorik
 * drive in the kit and the bass, a simpler melody with rests in it, more
 * harmony under it and less lead. So the kick runs four to the bar and the
 * bass in sixteenths from the first bar, the arpeggio plays sixteenths
 * throughout and louder, and the melody is now a pick-up and one long note
 * per bar, struck as a four-voice chord, with the rest of the bar left open.
 *
 * The second version's melody was the first's. Under the new chords its long notes
 * change colour — the first chorus bar's held D is now the fifth of G with a
 * major seventh and ninth under it — and the three appoggiaturas survive: D
 * over A, B over F-sharp minor, E over D, each falling a step into its chord.
 *
 * Form, 64 bars at 108 BPM, about two minutes twenty:
 *   VERSE 1 8 · PRE 4 · CHORUS 1 8 · VERSE 2 8 · PRE 4 · CHORUS 2 8
 *   · BRIDGE 8 · CHORUS 3 8 (up a semitone) · OUTRO 8
 *
 * Key: D major; the bridge goes to the flat side (B-flat, C) and reaches
 * E-flat through F and B-flat, so the last chorus and the outro are a
 * semitone up.
 */

export const SUMMER_BPM = 108;
const BARS = 64;
export const SUMMER_STEPS = BARS * STEPS_PER_BAR;

// --- the melody -----------------------------------------------------------

/**
 * The chorus, third version: simpler and with air in it. Each bar is a
 * pick-up and one long note, then a rest; the odd bars climb to their long
 * note, the even bars open on an appoggiatura and fall a step into the chord.
 * Bars 1-2, 3-4 and 5-6 are the same gesture in sequence, the third reaching
 * the top of the song; bars 7-8 come down over the borrowed flat-VI and
 * flat-VII.
 */
export const SUMMER_CHORUS: readonly Bar[] = [
  [[0, 'B5', 2], [2, 'D6', 8]],
  [[0, 'D6', 4], [4, 'C#6', 8]],
  [[0, 'F#5', 2], [2, 'B5', 8]],
  [[0, 'B5', 4], [4, 'A#5', 8]],
  [[0, 'B5', 2], [2, 'E6', 8]],
  [[0, 'E6', 4], [4, 'D6', 8]],
  [[0, 'D6', 4], [4, 'C6', 4], [8, 'Bb5', 6]],
  [[0, 'G5', 4], [4, 'E5', 8]],
];

/** The verse: two notes a bar, entering after the beat, the rest of the bar left open. */
const VERSE: readonly Bar[] = [
  [[4, 'F#4', 2], [6, 'B4', 6]],
  [[0, 'D5', 4], [4, 'B4', 6]],
  [[4, 'F#4', 2], [6, 'A4', 6]],
  [[0, 'C#5', 4], [4, 'A4', 8]],
  [[4, 'F#4', 2], [6, 'B4', 6]],
  [[0, 'D5', 4], [4, 'B4', 6]],
  [[4, 'A4', 2], [6, 'D5', 6]],
  [[0, 'E5', 4], [4, 'C#5', 8]],
];

/** The pre-chorus: the same pick-up and long note, a step higher each bar, then the suspension. */
const PRE: readonly Bar[] = [
  [[4, 'B4', 2], [6, 'E5', 8]],
  [[4, 'C#5', 2], [6, 'F#5', 8]],
  [[4, 'D5', 2], [6, 'G5', 8]],
  [[0, 'A5', 6], [8, 'C#6', 6]],
];

/** The bridge: four long notes and four rests. */
const BRIDGE: readonly Bar[] = [
  [[0, 'D5', 12]],
  [[0, 'E5', 12]],
  [[0, 'F#5', 8], [8, 'A5', 6]],
  [[0, 'B5', 12]],
  [[0, 'D6', 12]],
  [[0, 'C#6', 12]],
  [[0, 'C6', 8], [8, 'A5', 6]],
  [[0, 'Bb5', 12]],
];

// --- harmony --------------------------------------------------------------

// Chorus: root position throughout, the pad's lowest voice on the bass
// note, the fifth above it, and the colours — ninths, major sevenths — in the
// upper voices, kept an octave under the melody so the lead's chords have
// room. Secondary dominants carry the motion: F-sharp 7 (V of vi) in bar 4
// resolves deceptively onto G; E minor 9 (ii) leads into A7 and the tonic
// with its major seventh; then the borrowed flat-VI and flat-VII.
const cGmaj9 = chord('Gmaj9', 'G1', ['G', 'B', 'D', 'F#', 'A'], ['G2', 'D3', 'B3', 'F#4', 'A4']);
const cAadd9 = chord('Aadd9', 'A1', ['A', 'C#', 'E', 'B'], ['A2', 'E3', 'C#4', 'E4', 'B4']);
const cBm9 = chord('Bm9', 'B1', ['B', 'D', 'F#', 'A', 'C#'], ['B2', 'F#3', 'A3', 'C#4', 'D4']);
const cFs7 = chord('F#7', 'F#1', ['F#', 'A#', 'C#', 'E'], ['F#2', 'C#3', 'E3', 'A#3', 'C#4']);
const cG69 = chord('G6/9', 'G1', ['G', 'B', 'D', 'E', 'A'], ['G2', 'D3', 'B3', 'E4', 'A4']);
const cDmaj7 = chord('Dmaj7', 'D2', ['D', 'F#', 'A', 'C#'], ['D3', 'A3', 'F#4', 'C#5']);
const cBb = chord('Bbmaj7', 'Bb1', ['Bb', 'D', 'F', 'A'], ['Bb2', 'F3', 'D4', 'A4']);
const cC = chord('Cadd9', 'C2', ['C', 'E', 'G', 'D'], ['C3', 'G3', 'D4', 'E4']);

// Verse: B minor 9, E minor 9, G major 9 with the sixth, A sus into A7 — the
// same colours as the chorus, low and open.
const vBm = chord('Bm9', 'B1', ['B', 'D', 'F#', 'A', 'C#'], ['B2', 'F#3', 'A3', 'D4']);
const vG = chord('Em9', 'E1', ['E', 'G', 'B', 'D', 'F#'], ['E2', 'B2', 'G3', 'D4', 'F#4']);
const vD = chord('Gmaj9', 'G1', ['G', 'B', 'D', 'F#', 'A'], ['G2', 'D3', 'B3', 'F#4']);
const vA = chord('A7sus4', 'A1', ['A', 'D', 'E', 'G', 'C#'], ['A2', 'E3', 'G3', 'D4', 'E4']);

// Pre-chorus: the bass climbs E, F-sharp, G, A, with a dominant on F-sharp.
const pEm = chord('Em7', 'E1', ['E', 'G', 'B', 'D'], ['E3', 'B3', 'D4', 'G4']);
const pFsm = chord('F#7', 'F#1', ['F#', 'A#', 'C#', 'E'], ['F#3', 'C#4', 'E4', 'A#4']);
const pG = chord('Gmaj7', 'G1', ['G', 'B', 'D', 'F#'], ['G3', 'D4', 'F#4', 'B4']);
const pAsus = chord('Asus4', 'A1', ['A', 'D', 'E'], ['A2', 'E3', 'A3', 'D4', 'E4']);
const pA7 = chord('A7', 'A1', ['A', 'C#', 'E', 'G'], ['A2', 'E3', 'A3', 'C#4', 'E4'], 8);

// Bridge: the flat side, B-flat and C, then home, then through F and B-flat
// into E-flat.
const bBb = chord('Bbmaj7', 'Bb1', ['Bb', 'D', 'F', 'A'], ['Bb2', 'F3', 'D4', 'F4', 'A4']);
const bC = chord('Cadd9', 'C2', ['C', 'E', 'G', 'D'], ['C3', 'G3', 'D4', 'E4']);
const bD = chord('Dmaj7', 'D2', ['D', 'F#', 'A', 'C#'], ['D3', 'A3', 'C#4', 'F#4']);
const bBm = chord('Bm7', 'B1', ['B', 'D', 'F#', 'A'], ['B2', 'F#3', 'A3', 'D4', 'F#4']);
const bG = chord('Gmaj7', 'G1', ['G', 'B', 'D', 'F#'], ['G2', 'D3', 'F#3', 'B3', 'D4']);
const bA = chord('A7', 'A1', ['A', 'C#', 'E', 'G'], ['A2', 'E3', 'G3', 'C#4', 'E4']);
const bF = chord('Fmaj7', 'F1', ['F', 'A', 'C', 'E'], ['F2', 'C3', 'A3', 'C4', 'E4']);

const oEb = chord('Ebmaj9', 'Eb2', ['Eb', 'G', 'Bb', 'D', 'F'], ['Eb3', 'Bb3', 'D4', 'F4', 'G4']);

/** The chorus progression: IVmaj9 - Vadd9 - vi9 - V7/vi - IV6/9 - Imaj7 - flat-VImaj7 - flat-VIIadd9. */
const CHORUS = [cGmaj9, cAadd9, cBm9, cFs7, cG69, cDmaj7, cBb, cC];

function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);
  const chorus = (shift = 0) => { for (const c of CHORUS) push(lift(c, shift)); };
  const verse = () => { for (const c of [vBm, vG, vD, vA, vBm, vG, vD, vA]) push(c); };
  const pre = () => { push(pEm); push(pFsm); push(pG); push(pAsus, pA7); };

  verse();          // VERSE 1
  pre();            // PRE
  chorus();         // CHORUS 1
  verse();          // VERSE 2
  pre();            // PRE
  chorus();         // CHORUS 2
  for (const c of [bBb, bC, bD, bBm, bG, bA, bF, bBb]) push(c);  // BRIDGE
  chorus(1);        // CHORUS 3, in E-flat
  // OUTRO — the climb once more, then flat-VI, flat-VII, and at last the tonic.
  for (const c of [cGmaj9, cAadd9, cBm9, cFs7]) push(lift(c, 1));
  push(lift(cBb, 1)); push(lift(cC, 1)); push(oEb); push(oEb);

  if (bars.length !== BARS) throw new Error(`Harmony has ${bars.length} bars, expected ${BARS}`);
  return bars;
}

// --- track builders -------------------------------------------------------

function buildMelody(): NoteEvent[] {
  const m = builder('melody');
  phrase(m, 0, VERSE, 0.72);                // VERSE 1
  phrase(m, 8, PRE, 0.8);                   // PRE
  phrase(m, 12, SUMMER_CHORUS, 0.92);       // CHORUS 1
  phrase(m, 20, VERSE, 0.74);               // VERSE 2
  phrase(m, 28, PRE, 0.84);                 // PRE
  phrase(m, 32, SUMMER_CHORUS, 0.94);       // CHORUS 2
  phrase(m, 40, BRIDGE, 0.7);               // BRIDGE
  phrase(m, 48, SUMMER_CHORUS, 0.97, 1);    // CHORUS 3, in E-flat
  // OUTRO: the first idea, then the flat-VI and flat-VII bars, quietly.
  phrase(m, 56, SUMMER_CHORUS.slice(0, 2), 0.66, 1);
  phrase(m, 60, SUMMER_CHORUS.slice(6, 8), 0.6, 1);
  return m.notes;
}

/**
 * The pluck: a sixteenth-note arpeggio an octave above the pad, up and down
 * through the chord. A note that would sit a semitone from the lead, or above
 * the melody, drops an octave.
 */
function buildPluck(bars: Chord[][], lead: NoteEvent[]): NoteEvent[] {
  const p = builder('pluck');
  const sounding = (step: number) =>
    lead.filter((n) => n.startStep <= step && n.startStep + n.duration > step).map((n) => midiOf(n.note));
  const ORDER = [1, 2, 3, 4, 3, 2, 3, 4];
  const arp = (from: number, to: number, velocity: (b: number) => number, every = 1) => {
    for (let b = from; b < to; b++) {
      for (let s = 0; s < STEPS_PER_BAR; s += every) {
        const step = bar(b) + s;
        const c = chordAt(bars, step);
        const pitches = c.pad.map(midiOf);
        const padTop = Math.max(...pitches);
        const now = sounding(step);
        const top = now.length ? Math.max(...now) : Infinity;
        const fits = (x: number) => x <= top && x > padTop && !now.some((y) => Math.abs(y - x) === 1) &&
          !pitches.some((y) => Math.abs(y - x) === 1);
        const wanted = pitches[Math.min(pitches.length - 1, ORDER[(s / every) % ORDER.length])] + 12;
        const candidates = [wanted, wanted - 12, ...pitches.map((x) => x + 12), ...pitches.map((x) => x + 24)];
        const m = candidates.find(fits) ?? wanted;
        const accent = s % 4 === 0 ? 1 : 0.78;
        p.add(step, m, 1, velocity(b) * accent);
      }
    }
  };
  arp(0, 8, () => 0.56);              // VERSE 1: sixteenths from the start
  arp(8, 12, (b) => 0.6 + (b - 8) * 0.03);
  arp(12, 20, () => 0.74);            // CHORUS 1
  arp(20, 28, () => 0.6);             // VERSE 2
  arp(28, 32, (b) => 0.62 + (b - 28) * 0.03);
  arp(32, 40, () => 0.76);            // CHORUS 2
  arp(40, 48, () => 0.5, 2);          // BRIDGE: eighths
  arp(48, 56, () => 0.8);             // CHORUS 3
  arp(56, 64, (b) => 0.6 - (b - 56) * 0.05);  // OUTRO, thinning
  return p.notes;
}

const padEnergy = (b: number) =>
  b < 8 ? 0.25 : b < 12 ? 0.29 : b < 20 ? 0.33 : b < 28 ? 0.27
    : b < 32 ? 0.3 : b < 40 ? 0.34 : b < 48 ? 0.33 : b < 56 ? 0.35 : 0.32 - (b - 56) * 0.02;

/**
 * Bass: the root an octave above where the chords are written, so its body
 * sits where a phone speaker can play it, with the patch's sub an octave
 * below carrying the weight. A motorik sixteenth-note line — root, root,
 * octave, root on every beat — that never stops except in the bridge.
 */
function buildBass(bars: Chord[][]): NoteEvent[] {
  const bass = builder('bass');
  const root = (b: number, s = 0) => midiOf(chordAt(bars, bar(b) + s).root) + 12;
  const ACCENT = [1, 0.62, 0.84, 0.62];
  const roll = (b: number, v: number) => {
    for (let s = 0; s < 16; s++) {
      // Root, root, octave, root on every beat; the last sixteenth of the bar
      // jumps to the fifth, a push into the next downbeat.
      const up = s === 15 ? 7 : s % 4 === 2 ? 12 : 0;
      bass.add(bar(b) + s, root(b, s) + up, 0.85, v * ACCENT[s % 4] * (s === 0 ? 1.06 : s === 15 ? 1.2 : 1));
    }
  };
  for (let b = 0; b < 8; b++) roll(b, 0.66);
  for (let b = 8; b < 12; b++) roll(b, 0.72 + (b - 8) * 0.03);
  for (let b = 12; b < 20; b++) roll(b, 0.9);
  for (let b = 20; b < 28; b++) roll(b, 0.7);
  for (let b = 28; b < 32; b++) roll(b, 0.75 + (b - 28) * 0.03);
  for (let b = 32; b < 40; b++) roll(b, 0.92);
  for (let b = 40; b < 46; b++) bass.add(bar(b), root(b), 16, 0.6);   // BRIDGE: held
  for (let b = 46; b < 48; b++) roll(b, 0.7);
  for (let b = 48; b < 56; b++) roll(b, 0.95);
  for (let b = 56; b < 60; b++) roll(b, 0.74 - (b - 56) * 0.05);
  for (let b = 60; b < 63; b++) bass.add(bar(b), root(b), 16, 0.5 - (b - 60) * 0.06);
  bass.add(bar(63), root(63), 16, 0.32);
  return bass.notes;
}

function buildDrums(): Record<'kick' | 'snare' | 'hihat' | 'fx', SequencerStep[]> {
  const blank = (): SequencerStep[] =>
    Array.from({ length: SUMMER_STEPS }, () => ({ active: false, velocity: 0 }));
  const kick = blank(), snare = blank(), hihat = blank(), fx = blank();
  const hit = (lane: SequencerStep[], step: number, velocity: number) => {
    lane[step] = { active: true, velocity: Math.round(velocity * 1000) / 1000 };
  };
  // Motorik: the kick on every beat from the first bar, the hats on every
  // sixteenth with the off-beat eighths leaned on.
  const verseBar = (b: number, v: number, sixteenths: boolean) => {
    for (let s = 0; s < 16; s += 2) hit(kick, bar(b) + s, (s % 4 === 0 ? 0.86 : 0.36) * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.8 * v);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.5 : 0.24) * v);
    if (sixteenths) for (let s = 1; s < 16; s += 2) hit(hihat, bar(b) + s, 0.16 * v);
  };
  const chorusBar = (b: number, v: number) => {
    // Motorik proper: the kick on every eighth, the off-beats lighter.
    for (let s = 0; s < 16; s += 2) hit(kick, bar(b) + s, (s % 4 === 0 ? 1 : 0.5) * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.97 * v);
    hit(snare, bar(b) + 15, 0.3 * v);
    for (let s = 0; s < 16; s++) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.62 : s % 2 === 0 ? 0.3 : 0.2) * v);
  };
  /** The last bar of a build: snare on every eighth, then every sixteenth. */
  const build = (b: number) => {
    for (let s = 0; s < 8; s += 2) hit(snare, bar(b) + s, 0.4 + s * 0.03);
    for (let s = 8; s < 16; s++) hit(snare, bar(b) + s, 0.55 + (s - 8) * 0.05);
  };
  const pre = (from: number) => {
    for (let b = from; b < from + 4; b++) {
      for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.9);
      if (b < from + 3) for (const s of [4, 12]) hit(snare, bar(b) + s, 0.8);
      for (let s = 0; s < 16; s++) hit(hihat, bar(b) + s, s % 4 === 2 ? 0.52 : 0.2);
    }
    build(from + 3);
  };

  for (let b = 0; b < 8; b++) verseBar(b, 0.9, true);
  pre(8);
  for (let b = 12; b < 20; b++) chorusBar(b, 1);
  for (let b = 20; b < 28; b++) verseBar(b, 0.94, true);
  pre(28);
  for (let b = 32; b < 40; b++) chorusBar(b, 1.03);
  // BRIDGE: the kit drops out; hats come back for the last two bars, then a build.
  for (let b = 45; b < 47; b++) for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.3);
  build(47);
  for (let b = 48; b < 56; b++) chorusBar(b, 1.07);
  for (let b = 56; b < 60; b++) {                                     // OUTRO: the kick fades
    for (const s of [0, 8]) hit(kick, bar(b) + s, 0.6 - (b - 56) * 0.08);
    for (const s of [2, 6, 10, 14]) hit(hihat, bar(b) + s, 0.26 - (b - 56) * 0.04);
  }
  for (const [b, v] of [[12, 0.85], [32, 0.88], [40, 0.6], [48, 1], [56, 0.45]] as const) {
    hit(fx, bar(b), v);
  }
  return { kick, snare, hihat, fx };
}

/** The tape: a modern record with a little age on it, not a worn cassette. */
export const SUMMER_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 2, flutter: 0.6, hiss: 0.16, tone: 15000, glide: 0.05 },
  { step: bar(12), wow: 1, flutter: 0.4, hiss: 0.1, tone: 19000, glide: 0.6 },
  { step: bar(20), wow: 1.8, flutter: 0.6, hiss: 0.14, tone: 15000, glide: 1.2 },
  { step: bar(32), wow: 1, flutter: 0.4, hiss: 0.1, tone: 19000, glide: 0.6 },
  { step: bar(40), wow: 3, flutter: 0.9, hiss: 0.22, tone: 10000, glide: 1.6 },
  { step: bar(48), wow: 0.8, flutter: 0.3, hiss: 0.08, tone: 20000, glide: 0.3 },
  { step: bar(56), wow: 3, flutter: 1, hiss: 0.25, tone: 11000, glide: 2.5 },
  { step: bar(61), wow: 7, flutter: 2, hiss: 0.45, tone: 6500, glide: 3 },
];

const TRACK_META: Record<TrackType, { name: string; color: string }> = {
  lead: { name: 'BLADE CHORDS', color: 'bg-neon-purple' },
  pluck: { name: 'COLD ARP', color: 'bg-teal-500' },
  pad: { name: 'SOLINA VEIL', color: 'bg-blue-800' },
  bass: { name: 'SOURCE BASS', color: 'bg-indigo-600' },
  fx: { name: 'FX', color: 'bg-neon-pink' },
  hihat: { name: 'HH', color: 'bg-yellow-400' },
  snare: { name: 'SD', color: 'bg-cyan-400' },
  kick: { name: 'BD', color: 'bg-red-500' },
};

export function buildSummerTracks(): Track[] {
  const bars = harmony();
  const pad = buildPad(bars, padEnergy);
  const lead = harmonise(buildMelody(), bars, pad, 3, 0.55);
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
  intro: [0, 0], verse1: [0, 8], pre1: [8, 12], chorus1: [12, 20], verse2: [20, 28],
  pre2: [28, 32], chorus2: [32, 40], bridge: [40, 48], chorus3: [48, 56], outro: [56, 64],
};
export const SUMMER_CHORUS_STARTS: [number, number][] = [[12, 0], [32, 0], [48, 1]];
export const summerHarmony = () => harmonyMap(harmony());
