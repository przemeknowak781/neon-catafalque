import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";
import {
  STEPS_PER_BAR, bar, buildPad, builder, chord, chordAt, engineName, harmonise, harmonyMap,
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
 * Fourth version, after another note: the harmony had become complicated
 * and chaotic and, at the same time, dull. So the whole song now stands on
 * one eight-bar progression built around the secondary dominant that worked,
 * I - V/vi - vi - IV, I - V/vi - IV - V: F-sharp 7 in every second bar,
 * resolving to B minor the first time and deceptively to G the second. The
 * verse plays it low with two notes a bar, the chorus high with a pick-up and
 * one long note a bar, struck as four-voice chords; the bridge holds the
 * dominant for four bars; the last chorus and outro are a semitone up.
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
 * Fourth version: one progression for the whole song, built on the secondary
 * dominant that worked — I, V/vi, vi, IV; I, V/vi, IV, V. The F-sharp 7 in
 * every second bar is the song's one event, resolving to B minor the first
 * time and deceptively to G the second. Verse, pre-chorus, chorus and outro
 * all stand on it; the bridge holds it.
 */
export const SUMMER_CHORUS: readonly Bar[] = [
  [[0, 'A5', 2], [2, 'D6', 8]],
  [[0, 'D6', 4], [4, 'C#6', 8]],
  [[0, 'F#5', 2], [2, 'B5', 8]],
  [[0, 'C6', 4], [4, 'B5', 8]],
  [[0, 'A5', 2], [2, 'D6', 8]],
  [[0, 'B5', 4], [4, 'A#5', 8]],
  [[0, 'G5', 2], [2, 'B5', 8]],
  [[0, 'E6', 6], [6, 'C#6', 6]],
];

/**
 * The chorus carved: the same skeleton — pick-up, held note, appoggiatura —
 * with the rests filled by tails that lead into the next bar. Bars 1, 3 and
 * 5 keep one rhythm, so the sequence still reads; bar 5's tail climbs to E,
 * bar 7 climbs through D to E, and bar 8 falls from the peak to A. The first
 * chorus plays the skeleton, the second the skeleton with answers in the
 * rests, the third this.
 */
export const SUMMER_CHORUS_FULL: readonly Bar[] = [
  [[0, 'A5', 2], [2, 'D6', 6], [8, 'E6', 2], [10, 'D6', 2], [12, 'A5', 4]],
  [[0, 'D6', 4], [4, 'C#6', 8], [12, 'E6', 2], [14, 'C#6', 2]],
  [[0, 'F#5', 2], [2, 'B5', 6], [8, 'C#6', 2], [10, 'B5', 2], [12, 'F#5', 4]],
  [[0, 'C6', 4], [4, 'B5', 8], [12, 'A5', 2], [14, 'G5', 2]],
  [[0, 'A5', 2], [2, 'D6', 6], [8, 'C#6', 2], [10, 'D6', 2], [12, 'E6', 4]],
  [[0, 'B5', 4], [4, 'A#5', 6], [10, 'C#6', 2], [12, 'E6', 2], [14, 'C#6', 2]],
  [[0, 'G5', 2], [2, 'B5', 6], [8, 'D6', 4], [12, 'E6', 4]],
  [[0, 'E6', 6], [6, 'C#6', 4], [10, 'B5', 2], [12, 'A5', 4]],
];

/** The pre-chorus: the pick-up and long note a step higher each bar, then the suspension. */
const PRE: readonly Bar[] = [
  [[4, 'B4', 2], [6, 'E5', 8]],
  [[4, 'C#5', 2], [6, 'F#5', 8]],
  [[4, 'D5', 2], [6, 'G5', 8]],
  [[0, 'A5', 6], [8, 'C#6', 6]],
];

/**
 * The theme: the bridge's long notes over the held F-sharp 7, now the song's
 * verse. Six bars climb C-sharp, E, F-sharp, A-sharp, B, D over the dominant
 * into B minor and G; the last two turn home through E minor and A.
 */
const THEME: readonly Bar[] = [
  [[0, 'C#5', 12]],
  [[0, 'E5', 12]],
  [[0, 'F#5', 12]],
  [[0, 'A#5', 12]],
  [[0, 'B5', 12]],
  [[0, 'D6', 12]],
  [[0, 'B5', 8], [8, 'G5', 6]],
  [[0, 'E6', 8], [8, 'C#6', 6]],
];

/** The bridge: the theme, with its last two bars turning to F and B-flat, the way out to E-flat. */
const BRIDGE: readonly Bar[] = [
  ...THEME.slice(0, 6),
  [[0, 'C6', 8], [8, 'A5', 6]],
  [[0, 'Bb5', 12]],
];

/**
 * The lead, written over the chord layer rather than being it, and written
 * to earworm.md: an arch, 70-90% stepwise, one uncommon turning point per
 * four bars (the leap up to E at the end of bar 2, into the peak), a range
 * of ten semitones, twenty notes per four bars in one rhythmic cell, a
 * cadence on the third. Scored by the generator's own scoreMotif at 0.95.
 * A' keeps the rhythm and changes one note: the close rises to the fifth.
 */
const LEAD_A: readonly Bar[] = [
  [[0, 'F#5', 2], [2, 'G5', 2], [4, 'A5', 4], [8, 'A5', 2], [10, 'B5', 2], [12, 'A5', 4]],
  [[0, 'A#5', 4], [4, 'B5', 2], [6, 'C#6', 2], [8, 'C#6', 6], [14, 'E6', 2]],
  [[0, 'D6', 4], [4, 'B5', 2], [6, 'A5', 2], [8, 'B5', 6], [14, 'A5', 2]],
  [[0, 'G5', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'F#5', 8]],
];
const LEAD_A2: readonly Bar[] = [
  ...LEAD_A.slice(0, 3),
  [[0, 'G5', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'A5', 8]],
];
export const LEAD_CHORUS: readonly Bar[] = [...LEAD_A, ...LEAD_A2];
export const LEAD_HOOK = { a: LEAD_A, answer: LEAD_A2, tonic: 'D' };

/** The pre-chorus lead: one long note a bar, climbing with the bass. */
const LEAD_PRE: readonly Bar[] = [
  [[8, 'G5', 8]],
  [[8, 'A#5', 8]],
  [[8, 'B5', 8]],
  [[0, 'D6', 8], [8, 'E6', 8]],
];

// --- harmony --------------------------------------------------------------

// Chorus voicings spread across three octaves: root and fifth low, the
// triad in the middle, the colour (seventh, ninth) on top, kept under the
// melody so the lead's chords have room above.
const D = chord('Dmaj9', 'D2', ['D', 'F#', 'A', 'C#', 'E'], ['D2', 'A2', 'F#3', 'A3', 'E4', 'C#5']);
const Fs7 = chord('F#7', 'F#1', ['F#', 'A#', 'C#', 'E'], ['F#2', 'C#3', 'A#3', 'E4', 'C#5']);
const Bm = chord('Bm9', 'B1', ['B', 'D', 'F#', 'A', 'C#'], ['B2', 'F#3', 'D4', 'A4', 'C#5']);
const G = chord('Gmaj9', 'G1', ['G', 'B', 'D', 'F#', 'A'], ['G2', 'D3', 'B3', 'F#4', 'A4']);
const A = chord('Aadd9', 'A1', ['A', 'C#', 'E', 'B'], ['A2', 'E3', 'C#4', 'B4', 'E5']);

// Pre-chorus: ii, V/vi, IV, V sus into V7.
const pEm = chord('Em7', 'E1', ['E', 'G', 'B', 'D'], ['E3', 'B3', 'D4', 'G4']);
const pFs7 = chord('F#7', 'F#1', ['F#', 'A#', 'C#', 'E'], ['F#3', 'C#4', 'E4', 'A#4']);
const pG = chord('Gmaj7', 'G1', ['G', 'B', 'D', 'F#'], ['G3', 'D4', 'F#4', 'B4']);
const pAsus = chord('Asus4', 'A1', ['A', 'D', 'E'], ['A2', 'E3', 'A3', 'D4', 'E4']);
const pA7 = chord('A7', 'A1', ['A', 'C#', 'E', 'G'], ['A2', 'E3', 'A3', 'C#4', 'E4'], 8);

// Bridge: the dominant held for four bars, B minor and G, then F and B-flat
// into E-flat.
const bFs7 = chord('F#7', 'F#1', ['F#', 'A#', 'C#', 'E'], ['F#2', 'C#3', 'A#3', 'E4']);
const bBm = chord('Bm7', 'B1', ['B', 'D', 'F#', 'A'], ['B2', 'F#3', 'A3', 'D4', 'F#4']);
const bG = chord('Gmaj7', 'G1', ['G', 'B', 'D', 'F#'], ['G2', 'D3', 'B3', 'D4', 'F#4']);
const bF = chord('Fmaj7', 'F1', ['F', 'A', 'C', 'E'], ['F2', 'C3', 'A3', 'C4', 'E4']);
const bBb = chord('Bbmaj7', 'Bb1', ['Bb', 'D', 'F', 'A'], ['Bb2', 'F3', 'D4', 'F4', 'A4']);

/** The progression: I - V/vi - vi - IV, I - V/vi - IV - V. */
const CHORUS = [D, Fs7, Bm, G, D, Fs7, G, A];
/** The theme's harmony: the dominant held for four bars, vi, IV, ii, V. */
const THEME_CHORDS = [bFs7, bFs7, bFs7, bFs7, bBm, bG, pEm, pAsus];

function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);
  const loop = () => { for (const c of CHORUS) push(c); };
  const theme = () => { THEME_CHORDS.forEach((c, i) => (i === 7 ? push(c, pA7) : push(c))); };

  loop();           // INTRO: the loop, no lead
  theme();          // THEME 1
  loop(); loop();   // RIFF, twice
  theme();          // THEME 2 — the break
  loop(); loop();   // RIFF, twice
  for (const c of CHORUS.slice(0, 7)) push(c); push(D);   // OUTRO: the loop once more, ending on the tonic

  if (bars.length !== BARS) throw new Error(`Harmony has ${bars.length} bars, expected ${BARS}`);
  return bars;
}

// --- track builders -------------------------------------------------------

function buildChordMelody(): NoteEvent[] {
  const m = builder('melody');
  for (const start of [16, 24, 40, 48]) phrase(m, start, SUMMER_CHORUS_FULL, 0.92);
  phrase(m, 56, SUMMER_CHORUS_FULL.slice(0, 4), 0.7);
  return m.notes;
}

function buildLead(): NoteEvent[] {
  const l = builder('lead');
  phrase(l, 8, THEME, 0.68);                // THEME 1
  for (const start of [16, 24]) phrase(l, start, LEAD_CHORUS, 0.9);   // the riff, twice
  phrase(l, 32, THEME, 0.7);                // THEME 2
  for (const start of [40, 48]) phrase(l, start, LEAD_CHORUS, 0.94);  // the riff, twice
  phrase(l, 56, LEAD_CHORUS.slice(0, 4), 0.66);                       // OUTRO: once more, quietly
  return l.notes;
}

/**
 * The pluck: a sixteenth-note arpeggio an octave above the pad, up and down
 * through the chord. A note that would sit a semitone from the lead, or above
 * the melody, drops an octave.
 */
function buildPluck(bars: Chord[][], lead: NoteEvent[], padNotes: NoteEvent[]): NoteEvent[] {
  const p = builder('pluck');
  const at = (ns: NoteEvent[], step: number) =>
    ns.filter((n) => n.startStep <= step && n.startStep + n.duration > step).map((n) => midiOf(n.note));
  const sounding = (step: number) => at(lead, step);
  const CEILING = midiOf('A6');
  // Up through the chord over two octaves and back: the arpeggio spans the
  // room between the pad and the lead.
  const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 2, 3];
  const arp = (from: number, to: number, velocity: (b: number) => number, every = 1, octave = 0) => {
    for (let b = from; b < to; b++) {
      for (let s = 0; s < STEPS_PER_BAR; s += every) {
        const step = bar(b) + s;
        const c = chordAt(bars, step);
        const pitches = c.pad.map(midiOf);
        const padNow = at(padNotes, step);
        const padTop = Math.max(...pitches, ...padNow);
        const now = sounding(step);
        const top = now.length ? Math.max(...now) : CEILING;
        const fits = (x: number) => x <= top && x > padTop && !now.some((y) => Math.abs(y - x) === 1) &&
          !pitches.some((y) => Math.abs(y - x) === 1) && !padNow.some((y) => Math.abs(y - x) === 1);
        const ladder = [...new Set([...pitches.map((x) => x + 12 + octave), ...pitches.map((x) => x + 24 + octave)])].sort((x, y) => x - y);
        const wanted = ladder[Math.min(ladder.length - 1, ORDER[(s / every) % ORDER.length])];
        const candidates = [wanted, wanted - 12, ...ladder];
        const clear = (x: number) => x > padTop && x <= CEILING && ![...pitches, ...padNow, ...now].some((y) => Math.abs(y - x) === 1);
        const m = candidates.find(fits) ?? candidates.find(clear);
        if (m === undefined) continue;
        const accent = s % 4 === 0 ? 1 : 0.78;
        p.add(step, m, 1, velocity(b) * accent);
      }
    }
  };
  arp(0, 4, () => 0.5, 2);            // INTRO: eighths, then sixteenths
  arp(4, 16, () => 0.66);
  arp(16, 32, () => 0.8);             // RIFF
  arp(32, 36, () => 0.44, 2);         // THEME 2: eighths, then sixteenths an octave up
  arp(36, 40, (b) => 0.56 + (b - 36) * 0.06, 1, 12);
  arp(40, 56, () => 0.84);            // RIFF
  arp(56, 64, (b) => 0.64 - (b - 56) * 0.06);  // OUTRO, thinning
  return p.notes;
}

/**
 * The second chorus answers every held note in the rest after it: two chord
 * tones falling into the next bar, quieter — a call-and-response the first
 * chorus, heard once, does not have, and the third carves into the line.
 */
function answers(bars: Chord[][]): NoteEvent[] {
  const a = builder('answer');
  for (const [start, shift] of [[48, 0]] as const) {
    for (let b = 0; b < 8; b++) {
      if (start + b >= 62) break;
      const cells = SUMMER_CHORUS[b];
      const held = midiOf(cells[cells.length - 1][1]) + shift;
      const c = chordAt(bars, bar(start + b));
      const top = Math.max(...c.pad.map(midiOf));
      const tones = c.tones.flatMap((t) => [midiOf(`${t}5`), midiOf(`${t}6`)])
        .filter((m) => m < held - 1 && m > top + 2).sort((x, y) => y - x);
      if (tones.length < 2) continue;
      a.add(bar(start + b) + 12, tones[0], 2, 0.5);
      a.add(bar(start + b) + 14, tones[1], 2, 0.46);
    }
  }
  return a.notes;
}

const padEnergy = (b: number) =>
  b < 8 ? 0.22 : b < 16 ? 0.26 : b < 32 ? 0.34 : b < 40 ? 0.26 : b < 56 ? 0.36 : 0.3 - (b - 56) * 0.025;

/**
 * Bass: a pulse. The root on every beat, held, the octave on every "and",
 * short, and a ghost sixteenth before each beat, so the line breathes with
 * the sidechain rather than filling every slot. Written an octave above the
 * chord roots; the patch's sub an octave below carries the weight.
 */
function buildBass(bars: Chord[][]): NoteEvent[] {
  const bass = builder('bass');
  const root = (b: number, s = 0) => midiOf(chordAt(bars, bar(b) + s).root) + 12;
  const pulse = (b: number, v: number, ghosts = true) => {
    for (let s = 0; s < 16; s += 4) {
      bass.add(bar(b) + s, root(b, s), 2.6, v * (s === 0 ? 1.06 : 0.96));
      bass.add(bar(b) + s + 2, root(b, s) + 12, 0.9, v * 0.7);
      if (ghosts) bass.add(bar(b) + s + 3, root(b, s + 3) + (s === 12 ? 7 : 0), 0.7, v * (s === 12 ? 0.9 : 0.5));
    }
  };
  // The pulse from bar 5 to the end, like a record that never stops: held
  // through the first theme, out for the break's first bar, fading at the end.
  for (let b = 4; b < 8; b++) pulse(b, 0.7, false);
  for (let b = 8; b < 16; b++) bass.add(bar(b), root(b), 16, 0.56);    // THEME 1: held
  for (let b = 16; b < 32; b++) pulse(b, 0.94);
  for (let b = 32; b < 36; b++) bass.add(bar(b), root(b), 16, 0.54);   // THEME 2: held
  for (let b = 36; b < 40; b++) pulse(b, 0.72 + (b - 36) * 0.05);
  for (let b = 40; b < 56; b++) pulse(b, 0.97);
  for (let b = 56; b < 60; b++) pulse(b, 0.76 - (b - 56) * 0.06, false);
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
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.88 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.8 * v);
    // The off-beat eighth is the open hat, the pulse against the kick.
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.62 : 0.2) * v);
    if (sixteenths) for (let s = 1; s < 16; s += 2) hit(hihat, bar(b) + s, 0.14 * v);
  };
  const chorusBar = (b: number, v: number) => {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 1 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.97 * v);
    hit(snare, bar(b) + 15, 0.3 * v);
    for (let s = 0; s < 16; s++) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.7 : s % 2 === 0 ? 0.26 : 0.18) * v);
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

  // INTRO: the kick arrives in bar 5 with the off-beat hat; the snare only
  // with the riff. THEME: kick and hats, no snare. One bar of build before
  // each riff.
  for (let b = 4; b < 8; b++) {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.84);
    for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.5);
  }
  for (let b = 8; b < 15; b++) {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.86);
    for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.52);
  }
  build(15);
  for (let b = 16; b < 32; b++) chorusBar(b, 1);
  for (let b = 36; b < 39; b++) {                                     // THEME 2: the break, then the kick back
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.86);
    for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.5);
  }
  build(39);
  for (let b = 40; b < 56; b++) chorusBar(b, 1.04);
  for (let b = 56; b < 60; b++) chorusBar(b, 0.9 - (b - 56) * 0.1);
  for (let b = 60; b < 64; b++) {
    hit(kick, bar(b), 0.5 - (b - 60) * 0.1);
    for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.3 - (b - 60) * 0.06);
  }
  for (const [b, v] of [[16, 0.9], [32, 0.5], [40, 1], [56, 0.45]] as const) {
    hit(fx, bar(b), v);
  }
  return { kick, snare, hihat, fx };
}

/** The tape: a modern record with a little age on it, not a worn cassette. */
/**
 * The tape as the song's dynamic arc: the verses dark and faintly hissy, the
 * two bars before each drop a hiss that rises like a riser, the choruses
 * wide open and clean, the bridge dark again.
 */
export const SUMMER_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 2, flutter: 0.6, hiss: 0.2, tone: 8000, glide: 0.05 },
  { step: bar(8), hiss: 0.18, tone: 11000, glide: 1.5 },
  { step: bar(14), hiss: 0.7, tone: 20000, glide: 1.6 },
  { step: bar(16), wow: 0.8, flutter: 0.3, hiss: 0.06, tone: 20000, glide: 0.05 },
  { step: bar(32), wow: 2.5, flutter: 0.8, hiss: 0.25, tone: 6000, glide: 1.6 },
  { step: bar(38), hiss: 0.75, tone: 20000, glide: 1.6 },
  { step: bar(40), wow: 0.6, flutter: 0.3, hiss: 0.05, tone: 20000, glide: 0.05 },
  { step: bar(56), wow: 3, flutter: 1, hiss: 0.25, tone: 11000, glide: 2.5 },
  { step: bar(61), wow: 7, flutter: 2, hiss: 0.45, tone: 6500, glide: 3 },
];

const TRACK_META: Record<TrackType, { name: string; color: string }> = {
  lead: { name: 'SIGNAL FLARE', color: 'bg-neon-purple' },
  pluck: { name: 'NIGHT BUS', color: 'bg-teal-500' },
  pad: { name: 'LONG EXPOSURE', color: 'bg-blue-800' },
  bass: { name: 'OVERPASS', color: 'bg-indigo-600' },
  fx: { name: 'FX', color: 'bg-neon-pink' },
  hihat: { name: 'HH', color: 'bg-yellow-400' },
  snare: { name: 'SD', color: 'bg-cyan-400' },
  kick: { name: 'BD', color: 'bg-red-500' },
};

export function buildSummerTracks(): Track[] {
  const bars = harmony();
  // The pad is the chord layer: the chord melody, an octave down and
  // harmonised in four voices, the answers of the second chorus, and the
  // sustained voicings where the chord melody is silent (the bridge).
  const down = (ns: NoteEvent[]) => ns.map((n) => ({ ...n, note: engineName(midiOf(n.note) - 12) }));
  const sustainedIn = (n: NoteEvent) => [[0, 16], [32, 40], [60, 64]].some(([a, b]) => n.startStep >= bar(a) && n.startStep < bar(b));
  const sustained = buildPad(bars, padEnergy).filter(sustainedIn);
  const pad = [
    ...harmonise(down(buildChordMelody()), bars, [], 3, 0.6, 'pad'),
    ...harmonise(down(answers(bars)), bars, [], 2, 0.6, 'answer'),
    ...sustained,
  ];
  const lead = buildLead();
  const notes: Partial<Record<TrackType, NoteEvent[]>> = {
    lead, pluck: buildPluck(bars, lead, pad), pad, bass: buildBass(bars),
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
  intro: [0, 8], theme1: [8, 16], riff1: [16, 32], theme2: [32, 40], riff2: [40, 56], outro: [56, 64],
  /** The break: the first bars of the second theme, where the kit is out. */
  bridge: [32, 36],
};
export const SUMMER_CHORUS_STARTS: [number, number][] = [[16, 0], [24, 0], [40, 0], [48, 0]];
export const summerHarmony = () => harmonyMap(harmony());
