import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";

/**
 * ANEMOIA — a built-in song, written by hand.
 *
 * The brief was a nostalgic neon track that makes a listener long for
 * something they have no memory of. "Anemoia" is John Koenig's 2012 coinage
 * for exactly that (The Dictionary of Obscure Sorrows): a neologism, not a
 * psychological construct, so nothing here pretends it is measurable. What is
 * measurable is the set of ingredients the research does support, and each
 * one is used on purpose:
 *
 * 1. Mixed affect. Nostalgia is bittersweet: in Barrett et al. (2010, Emotion
 *    10(3), 390-403) songs that evoked both positive and negative emotions
 *    were rated more nostalgic, and arousal predicted nostalgia positively.
 *    Hunter, Schellenberg & Schimmack (2008, Cognition and Emotion 22(2),
 *    327-352) produced mixed happy-sad feelings by putting tempo and mode cues
 *    in conflict. So: a driving 112 BPM under a verse in the relative minor,
 *    and a chorus whose own motif turns minor in its seventh bar before it
 *    comes home.
 *
 * 2. Familiarity without a memory. Expectation research separates schematic
 *    expectations (knowledge of a style, absorbed passively) from veridical
 *    ones (knowledge of one particular piece) — Bharucha's distinction, as
 *    used by Huron (2006, Sweet Anticipation). Everything here is as
 *    schematically familiar as an eighties pop record can be — chorused pads,
 *    gated snare, octave bass, a final-chorus key change — while the melody is
 *    new. Krumhansl & Zupnick (2013, Psychological Science 24(10)) found
 *    young listeners' memory and emotion peaking for their parents' music,
 *    released before they were born: a measured version of missing an era one
 *    did not live through. Prototypical, fluent material is also simply liked
 *    more (Reber, Schwarz & Winkielman 2004, PSPR 8(4), 364-382).
 *
 * 3. The audible medium. Mark Fisher's hauntology reads crackle and hiss as
 *    the medium making itself heard (Dancecult 5(2), 2013; Ghosts of My Life,
 *    2014). Here the tape is the narrator: worn through the sign-on, clearer
 *    in each chorus, most dissolved in the bridge, clearest in the last
 *    chorus, and going back to hiss at the end.
 *
 * 4. A melody first heard as a memory. The sign-on plays the hook's rising
 *    half on a music box at half speed, through the most worn tape in the
 *    song, so the chorus arrives already half-known. The sign-off plays its
 *    motif twice more and stops short both times.
 *
 * The melody, second version. The first was written to earworm.md's
 * melodic targets — 70-90% stepwise motion, exactly one uncommon turning
 * point per four bars — and passed them, and was heard as busy and scalar:
 * a line that walked the scale instead of standing on the chords.
 * This one is built the other way round. One motif — fifth, third, fifth,
 * then up to the root and held — set on each chord in turn, so the motif
 * rises by step as the harmony does (IV, V, vi), repeats exactly, turns
 * minor on the borrowed iv, and closes 3-2-1 on the tonic. Every note of the
 * motif is a chord tone, and every held note of the chorus is harmonised a
 * sixth below by the pad's top voice. It sits outside the generator's
 * stepwise band on purpose; scripts/verifyEarworm checks what it does
 * instead.
 *
 * Harmony is plain triads with a seventh where the harmonising voice makes
 * one: verse i - i - bVI - bVII; chorus IV - V - vi - vi, IV - V - iv - I.
 * The minor-plagal close (iv - I) puts the minor colour on the last chord
 * before home.
 *
 * Form, 72 bars at 112 BPM, about two and a half minutes:
 *   SIGN-ON 8 · VERSE 1 8 · CHORUS 1 8 · AFTERGLOW 4 · VERSE 2 8 · CHORUS 2 8
 *   · BRIDGE 8 · CHORUS 3 12 (up a whole tone) · SIGN-OFF 8
 *
 * Key: E-flat major, the verse in its relative minor; the last chorus and the
 * sign-off in F. The bridge ends on D-flat and E-flat, which are the flat-VI
 * and flat-VII of F: the old tonic is the pivot, and the new key arrives on
 * its IV, the chorus's first chord, a whole tone up.
 */

export const ANEMOIA_BPM = 112;
const STEPS_PER_BAR = 16;
const BARS = 72;
export const ANEMOIA_STEPS = BARS * STEPS_PER_BAR;

// --- pitch spelling -------------------------------------------------------

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * 'Eb5', 'Cb4', 'F#3' to MIDI. Spelled as a musician writes them, so the score
 * reads in the key it is in; C-flat 4 is B3, which is what it sounds as.
 */
export function midiOf(name: string): number {
  const match = name.match(/^([A-G])(bb|b|#)?(-?\d)$/);
  if (!match) throw new Error(`Unreadable pitch ${name}`);
  const accidental = match[2] === 'b' ? -1 : match[2] === 'bb' ? -2 : match[2] === '#' ? 1 : 0;
  return (parseInt(match[3], 10) + 1) * 12 + LETTER[match[1]] + accidental;
}

/** The engine's spelling: sharps only. */
const engineName = (midi: number): string =>
  `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// --- the melody -----------------------------------------------------------

/** One note of a phrase: step within its bar, pitch, length in steps. */
type Cell = readonly [step: number, pitch: string, length: number];
type Bar = readonly Cell[];

/**
 * The motif: fifth, third, fifth, then up to the root and held. Three-three-
 * two and a long note — "da-da-da-daaa" — the same rhythm every time it
 * appears, so the ear has one shape to keep.
 */
const motif = (fifth: string, third: string, root: string): Bar => [
  [0, fifth, 3], [3, third, 3], [6, fifth, 2], [8, root, 8],
];

/**
 * The chorus, eight bars over IV - V - vi - vi, IV - V - iv - I in E-flat.
 * The motif climbs a step with each chord, so the held notes rise A-flat,
 * B-flat, C; bar 4 falls back down the C minor seventh; bars 5 and 6 repeat
 * 1 and 2 exactly; bar 7 is the motif with its third lowered — the same
 * shape on A-flat minor, C-flat for C — and bar 8 closes 3-2-1.
 */
export const HOOK: readonly Bar[] = [
  motif('Eb5', 'C5', 'Ab5'),
  motif('F5', 'D5', 'Bb5'),
  motif('G5', 'Eb5', 'C6'),
  [[0, 'Bb5', 3], [3, 'G5', 3], [6, 'Eb5', 2], [8, 'G5', 8]],
  motif('Eb5', 'C5', 'Ab5'),
  motif('F5', 'D5', 'Bb5'),
  motif('Eb5', 'Cb5', 'Ab5'),
  [[0, 'G5', 3], [3, 'F5', 3], [6, 'Eb5', 10]],
];

/** The last chorus ends on a tag: the motif's first two bars, then its minor turn and the close. */
const TAG: readonly Bar[] = [HOOK[0], HOOK[1], HOOK[6], HOOK[7]];

/**
 * The verse: lower and slower, three notes a bar — a long note, a passing
 * note, a long note — over i - i - bVI - bVII in C minor. Bar 2 answers bar
 * 1 with 3-2-1; bar 3 is bar 2 a third lower on A-flat.
 */
const VERSE_LINE: readonly Bar[] = [
  [[0, 'G4', 6], [6, 'Bb4', 2], [8, 'C5', 8]],
  [[0, 'Eb5', 6], [6, 'D5', 2], [8, 'C5', 8]],
  [[0, 'C5', 6], [6, 'Bb4', 2], [8, 'Ab4', 8]],
  [[0, 'Bb4', 6], [6, 'C5', 2], [8, 'D5', 8]],
  [[0, 'G4', 6], [6, 'Bb4', 2], [8, 'C5', 8]],
  [[0, 'Eb5', 6], [6, 'D5', 2], [8, 'C5', 8]],
  [[0, 'C5', 6], [6, 'Bb4', 2], [8, 'Ab4', 8]],
  [[0, 'F5', 6], [6, 'Eb5', 2], [8, 'D5', 6], [14, 'Bb4', 2]],
];

/**
 * The bridge: the motif at half speed on the borrowed chords. It outlines
 * C-flat major and holds its root into A-flat minor, where the same note is
 * the third; again on E-flat, an octave down, into C minor; again on C-flat;
 * and last on D-flat, which is the flat-VI of the key the last chorus is in,
 * where for once the held note stays on its own chord.
 */
const BRIDGE_LINE: readonly Cell[] = [
  [0, 'Gb5', 6], [6, 'Eb5', 6], [12, 'Gb5', 4], [16, 'Cb6', 16],
  [32, 'Bb4', 6], [38, 'G4', 6], [44, 'Bb4', 4], [48, 'Eb5', 16],
  [64, 'Gb5', 6], [70, 'Eb5', 6], [76, 'Gb5', 4], [80, 'Cb6', 16],
  [96, 'Ab5', 6], [102, 'F5', 6], [108, 'Ab5', 4], [112, 'Db6', 8],
];

// --- harmony --------------------------------------------------------------

/**
 * A chord for the pad: its root (for the bass), the voicing, and where in the
 * bar it starts. Common tones are held across a change rather than struck
 * again (see buildPad).
 */
interface Chord { at: number; root: string; pad: readonly string[] }
const chord = (root: string, pad: readonly string[], at = 0): Chord => ({ root, pad, at });

// Sign-on and verse: low triads, topped at E-flat 4, so the melody has the
// octave above to itself.
const lowAb = ['Eb3', 'Ab3', 'C4', 'Eb4'];
const lowBb = ['D3', 'F3', 'Bb3', 'D4'];
const lowCm = ['C3', 'G3', 'C4', 'Eb4'];
// Chorus: the top voice sits a sixth under the melody's held note in that
// bar — C under A-flat, D under B-flat, E-flat under C, B-flat under G — so
// the long notes are harmonised in parallel sixths, the imperfect consonance
// counterpoint lets move in parallel, and the C minor of bar 4 picks up its
// seventh from it.
const chAb = ['Ab3', 'Eb4', 'Ab4', 'C5'];
const chBb = ['Bb3', 'F4', 'Bb4', 'D5'];
const chCm = ['C4', 'G4', 'C5', 'Eb5'];
const chCm7 = ['C4', 'Eb4', 'G4', 'Bb4'];
const chAbm = ['Ab3', 'Eb4', 'Ab4', 'Cb5'];
const chEb = ['Eb3', 'Bb3', 'Eb4', 'G4'];
// Bridge: the flat side, plain triads. When the melody drops an octave in
// bars 3 and 4, the pad drops with it, so the tune stays on top.
const brCb = ['Gb3', 'Cb4', 'Eb4', 'Gb4'];
const brAbm = ['Ab3', 'Cb4', 'Eb4', 'Ab4'];
const brEbOverBb = ['Bb2', 'G3', 'Bb3', 'Eb4'];
const brCm = ['C3', 'G3', 'C4', 'Eb4'];
const brDb = ['Ab3', 'Db4', 'F4', 'Ab4'];
const brEb = ['G3', 'Eb4', 'G4', 'Bb4'];
// Sign-off in F: IV, iv, I — only the third of the IV chord moves.
const fBb = ['F3', 'Bb3', 'D4', 'F4'];
const fBbm = ['F3', 'Bb3', 'Db4', 'F4'];
const fF = ['F3', 'A3', 'C4', 'F4'];
const fFadd9 = ['F3', 'A3', 'C4', 'G4'];

const up = (pitches: readonly string[], semitones: number) =>
  pitches.map((p) => engineName(midiOf(p) + semitones));

/** Harmony for every bar of the song: one or two chords each. */
function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);

  // SIGN-ON — IV, V, vi: the chords the hook will climb.
  push(chord('Ab1', lowAb)); push(chord('Ab1', lowAb));
  push(chord('Bb1', lowBb)); push(chord('Bb1', lowBb));
  push(chord('C2', lowCm)); push(chord('C2', lowCm));
  push(chord('Ab1', lowAb)); push(chord('Bb1', lowBb));

  const verse = () => {
    push(chord('C2', lowCm)); push(chord('C2', lowCm));
    push(chord('Ab1', lowAb)); push(chord('Bb1', lowBb));
    push(chord('C2', lowCm)); push(chord('C2', lowCm));
    push(chord('Ab1', lowAb)); push(chord('Bb1', lowBb));
  };
  const chorus = () => {
    push(chord('Ab1', chAb)); push(chord('Bb1', chBb));
    push(chord('C2', chCm)); push(chord('C2', chCm7));
    push(chord('Ab1', chAb)); push(chord('Bb1', chBb));
    push(chord('Ab1', chAbm)); push(chord('Eb1', chEb));
  };

  verse();   // VERSE 1
  chorus();  // CHORUS 1
  // AFTERGLOW — the chorus's answering half, carried by the music box.
  push(chord('Ab1', chAb)); push(chord('Bb1', chBb));
  push(chord('Ab1', chAbm)); push(chord('Eb1', chEb));
  verse();   // VERSE 2
  chorus();  // CHORUS 2

  // BRIDGE — flat-VI, iv, I6/4, vi; flat-VI, iv; then D-flat for a bar and
  // a half and E-flat for the last two beats. E-flat is the old tonic and
  // the flat-VII of F, so it is the pivot; every pad voice rises out of it
  // into the first chord of the last chorus.
  push(chord('Cb2', brCb)); push(chord('Ab1', brAbm));
  push(chord('Bb1', brEbOverBb)); push(chord('C2', brCm));
  push(chord('Cb2', brCb)); push(chord('Ab1', brAbm));
  push(chord('Db2', brDb)); push(chord('Db2', brDb), chord('Eb2', brEb, 8));

  // CHORUS 3 — the same chorus a whole tone up, and a four-bar tag.
  const lift = (root: string, pad: readonly string[]) =>
    chord(engineName(midiOf(root) + 2), up(pad, 2));
  push(lift('Ab1', chAb)); push(lift('Bb1', chBb));
  push(lift('C2', chCm)); push(lift('C2', chCm7));
  push(lift('Ab1', chAb)); push(lift('Bb1', chBb));
  push(lift('Ab1', chAbm)); push(lift('Eb1', chEb));
  push(lift('Ab1', chAb)); push(lift('Bb1', chBb));
  push(lift('Ab1', chAbm)); push(lift('Eb1', chEb));

  // SIGN-OFF in F — IV, iv, I, twice, the last tonic with its ninth.
  push(chord('Bb1', fBb)); push(chord('Bb1', fBbm));
  push(chord('F1', fF)); push(chord('F1', fF));
  push(chord('Bb1', fBb)); push(chord('Bb1', fBbm));
  push(chord('F1', fFadd9)); push(chord('F1', fFadd9));

  if (bars.length !== BARS) throw new Error(`Harmony has ${bars.length} bars, expected ${BARS}`);
  return bars;
}

// --- track builders -------------------------------------------------------

interface Builder { notes: NoteEvent[]; add: (step: number, pitch: string | number, length: number, velocity: number) => void }

function builder(id: string): Builder {
  const notes: NoteEvent[] = [];
  return {
    notes,
    add(step, pitch, length, velocity) {
      const midi = typeof pitch === 'number' ? pitch : midiOf(pitch);
      notes.push({
        id: `${id}-${notes.length}`,
        note: engineName(midi),
        startStep: step,
        duration: length,
        velocity: Math.round(velocity * 1000) / 1000,
      });
    },
  };
}

const bar = (n: number) => n * STEPS_PER_BAR;

/**
 * Lay a phrase of bars down starting at a bar, optionally transposed. A music
 * box gets `struck` set: every note one step long, because a struck tine
 * rings on its own release and the written length means nothing to it.
 */
function phrase(target: Builder, startBar: number, bars: readonly Bar[], velocity: number, transpose = 0, struck = false) {
  bars.forEach((cells, b) => {
    for (const [step, pitch, length] of cells) {
      // The held note a touch louder than the pick-up notes: it is the one
      // the phrase leans on.
      const v = velocity * (length >= 6 ? 1.04 : length <= 2 ? 0.9 : 0.95);
      target.add(bar(startBar + b) + step, midiOf(pitch) + transpose, struck ? 1 : length, Math.min(1, v));
    }
  });
}

/** The same phrase at half speed, every onset doubled, struck. */
function augmented(target: Builder, startStep: number, bars: readonly Bar[], velocity: number, transpose = 0) {
  bars.forEach((cells, b) => {
    for (const [step, pitch] of cells) {
      target.add(startStep + (b * STEPS_PER_BAR + step) * 2, midiOf(pitch) + transpose, 1, velocity);
    }
  });
}

function buildLead(): NoteEvent[] {
  const lead = builder('lead');
  phrase(lead, 8, VERSE_LINE, 0.72);              // VERSE 1
  phrase(lead, 16, HOOK, 0.92);                   // CHORUS 1
  phrase(lead, 28, VERSE_LINE, 0.74);             // VERSE 2
  phrase(lead, 36, HOOK, 0.94);                   // CHORUS 2
  for (const [step, pitch, length] of BRIDGE_LINE) {  // BRIDGE
    lead.add(bar(44) + step, pitch, length, 0.64);
  }
  phrase(lead, 52, HOOK, 0.96, 2);                // CHORUS 3, in F
  phrase(lead, 60, TAG, 0.88, 2);                 // tag
  return lead.notes;
}

/**
 * The pluck is a music box: the sign-on's memory, the afterglow, a mobile
 * turning over the second verse, and in the last chorus a child's
 * instrument doubling the adult melody an octave up. It stays out of the
 * first two choruses — the melody has the room to itself.
 */
function buildPluck(): NoteEvent[] {
  const box = builder('pluck');

  // SIGN-ON: the hook's rising half at half speed, in the register the lead
  // will later play it in, then the two held notes it climbs towards.
  augmented(box, bar(0), HOOK.slice(0, 3), 0.56);
  box.add(bar(6), 'Ab5', 1, 0.4);
  box.add(bar(7), 'Bb5', 1, 0.42);

  // AFTERGLOW: the chorus's answering half, motif, repeat, minor turn, home.
  phrase(box, 24, HOOK.slice(4), 0.46, 0, true);

  // VERSE 2: a mobile, one chord tone per beat, an octave above everything.
  const mobile: Record<string, string[]> = {
    Cm: ['C6', 'Eb6', 'G6', 'Eb6'],
    Ab: ['C6', 'Eb6', 'Ab6', 'Eb6'],
    Bb: ['D6', 'F6', 'Bb6', 'F6'],
  };
  ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Bb'].forEach((name, b) =>
    mobile[name].forEach((pitch, beat) =>
      box.add(bar(28 + b) + beat * 4, pitch, 1, beat === 0 ? 0.36 : 0.3)));

  // CHORUS 3: the music box sings along with the second half and the tag.
  phrase(box, 56, HOOK.slice(4), 0.34, 14, true);
  phrase(box, 60, TAG, 0.32, 14, true);

  // SIGN-OFF in F: the motif on IV, whole; on iv, without its last note; a
  // tonic; the motif again without its last note; and finally "3, 2" over
  // the tonic's ninth — the close the chorus made every time, left one note
  // short. The listener supplies it.
  for (const [b, step, pitch, v] of [
    [64, 0, 'F5', 0.42], [64, 3, 'D5', 0.38], [64, 6, 'F5', 0.38], [64, 8, 'Bb5', 0.42],
    [65, 0, 'F5', 0.38], [65, 3, 'Db5', 0.36], [65, 6, 'F5', 0.36],
    [66, 0, 'A5', 0.34],
    [68, 0, 'F5', 0.34], [68, 3, 'D5', 0.32], [68, 6, 'F5', 0.32],
    [70, 0, 'A5', 0.3], [70, 8, 'G5', 0.28],
  ] as const) box.add(bar(b) + step, pitch, 1, v);

  return box.notes;
}

/**
 * Pad: the harmony above, with common tones held across the barline rather
 * than struck again. A pad that re-attacks every note on every chord is a
 * keyboard player hitting the chord; one that only moves the voices that
 * change is a string section.
 */
function buildPad(bars: Chord[][]): NoteEvent[] {
  const pad = builder('pad');
  // Velocity per bar, following the sections, with the sign-off fading.
  const energy = (b: number) =>
    b < 8 ? 0.24 : b < 16 ? 0.26 : b < 24 ? 0.3 : b < 28 ? 0.27 : b < 36 ? 0.27
      : b < 44 ? 0.31 : b < 52 ? 0.33 : b < 64 ? 0.32 : 0.3 - (b - 64) * 0.018;

  const spans: { start: number; end: number; pitches: number[]; velocity: number }[] = [];
  bars.forEach((chords, b) => {
    chords.forEach((c, i) => {
      const start = bar(b) + c.at;
      const end = i + 1 < chords.length ? bar(b) + chords[i + 1].at : bar(b + 1);
      spans.push({ start, end, pitches: c.pad.map(midiOf), velocity: energy(b) });
    });
  });

  // Hold any pitch that continues into the next span.
  const open = new Map<number, { start: number; velocity: number }>();
  spans.forEach((span, i) => {
    const next = spans[i + 1];
    for (const p of span.pitches) {
      if (!open.has(p)) open.set(p, { start: span.start, velocity: span.velocity });
    }
    for (const [p, from] of [...open]) {
      const continues = next && next.pitches.includes(p) && next.start === span.end;
      if (!continues) {
        pad.add(from.start, p, span.end - from.start, from.velocity);
        open.delete(p);
      }
    }
  });
  return pad.notes;
}

function buildBass(bars: Chord[][]): NoteEvent[] {
  const bass = builder('bass');
  const root = (b: number, at = 0) => {
    const chords = bars[b];
    const c = [...chords].reverse().find((x) => x.at <= at) ?? chords[0];
    return midiOf(c.root);
  };

  // SIGN-ON: the bass arrives at bar 5 and only holds.
  for (const b of [4, 6, 7]) bass.add(bar(b), root(b), b === 4 ? 32 : 16, 0.5);

  // Verse: eighth-note pulse on the root, the downbeats leaned on.
  const pulse = (b: number, velocity: number, pickup: boolean) => {
    for (let s = 0; s < 16; s += 2) {
      const lift = pickup && s === 14 ? 12 : 0;
      bass.add(bar(b) + s, root(b, s) + lift, 1.6, velocity * (s % 8 === 0 ? 1 : s % 4 === 0 ? 0.86 : 0.72));
    }
  };
  // Chorus: the octave bounce, root and octave on alternate eighths.
  const bounce = (b: number, velocity: number) => {
    for (let s = 0; s < 16; s += 2) {
      bass.add(bar(b) + s, root(b, s) + (s % 4 === 2 ? 12 : 0), 1.6, velocity * (s % 4 === 0 ? 1 : 0.76));
    }
  };

  for (let b = 8; b < 16; b++) pulse(b, 0.78, b === 11 || b === 15);       // VERSE 1
  for (let b = 16; b < 24; b++) bounce(b, 0.86);                            // CHORUS 1
  for (let b = 24; b < 28; b++) pulse(b, 0.64, false);                      // AFTERGLOW
  for (let b = 28; b < 36; b++) pulse(b, 0.8, b === 31 || b === 35);       // VERSE 2
  for (let b = 36; b < 44; b++) bounce(b, 0.88);                            // CHORUS 2

  // BRIDGE: silent for two bars, then held roots, then the build.
  for (let b = 46; b < 50; b++) bass.add(bar(b), root(b), 16, 0.52);
  for (let s = 0; s < 16; s += 2) bass.add(bar(50) + s, root(50), 1.6, 0.5 + s * 0.015);
  for (let s = 0; s < 16; s++) bass.add(bar(51) + s, root(51, s), 0.8, 0.55 + s * 0.025);

  for (let b = 52; b < 60; b++) bounce(b, 0.92);                            // CHORUS 3
  for (let b = 60; b < 64; b++) {                                           // tag, half time
    for (const s of [0, 4, 8, 12]) bass.add(bar(b) + s, root(b), 3, s === 0 ? 0.82 : 0.66);
  }
  // SIGN-OFF: quarters for four bars, then held notes into the last chord.
  for (let b = 64; b < 68; b++) {
    for (const s of [0, 4, 8, 12]) bass.add(bar(b) + s, root(b), 3, s === 0 ? 0.6 : 0.48);
  }
  bass.add(bar(68), root(68), 16, 0.42);
  bass.add(bar(69), root(69), 16, 0.36);
  bass.add(bar(70), root(70), 32, 0.3);
  return bass.notes;
}

function buildDrums(): Record<'kick' | 'snare' | 'hihat' | 'fx', SequencerStep[]> {
  const blank = (): SequencerStep[] =>
    Array.from({ length: ANEMOIA_STEPS }, () => ({ active: false, velocity: 0 }));
  const kick = blank(), snare = blank(), hihat = blank(), fx = blank();
  const hit = (lane: SequencerStep[], step: number, velocity: number) => {
    lane[step] = { active: true, velocity: Math.round(velocity * 1000) / 1000 };
  };

  const verseBar = (b: number, v: number, sixteenths: boolean) => {
    for (const s of [0, 8]) hit(kick, bar(b) + s, 0.82 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.74 * v);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.46 : 0.24) * v);
    if (sixteenths) for (let s = 1; s < 16; s += 2) hit(hihat, bar(b) + s, 0.14 * v);
  };
  const chorusBar = (b: number, v: number) => {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.9 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.92 * v);
    for (let s = 0; s < 16; s++) {
      hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.5 : s % 2 === 0 ? 0.3 : 0.17) * v);
    }
  };
  /** Four sixteenths of snare into the next section. */
  const fill = (b: number, v: number) => {
    [0.45, 0.52, 0.62, 0.74].forEach((x, i) => hit(snare, bar(b) + 12 + i, x * v));
    for (let s = 12; s < 16; s++) hihat[bar(b) + s] = { active: false, velocity: 0 };
  };

  // SIGN-ON: a heartbeat in the last two bars, nothing else.
  hit(kick, bar(6), 0.42);
  hit(kick, bar(7), 0.48); hit(kick, bar(7) + 8, 0.52);

  for (let b = 8; b < 16; b++) verseBar(b, 1, false);
  fill(15, 1);
  for (let b = 16; b < 24; b++) chorusBar(b, 1);
  for (let b = 24; b < 28; b++) {                        // AFTERGLOW: four on the floor, no backbeat
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.64);
    for (let s = 2; s < 16; s += 4) hit(hihat, bar(b) + s, 0.36);
  }
  hit(snare, bar(27) + 12, 0.5);
  for (let b = 28; b < 36; b++) verseBar(b, 1.04, true);
  fill(35, 1.05);
  for (let b = 36; b < 44; b++) chorusBar(b, 1.03);

  // BRIDGE: the kit drops out (earworm structure rule), then one bar of
  // snare roll climbing into the last chorus.
  for (let s = 0; s < 16; s++) hit(snare, bar(51) + s, 0.16 + s * 0.05);

  for (let b = 52; b < 60; b++) chorusBar(b, 1.06);
  for (let b = 60; b < 64; b++) {                        // tag: half time
    for (const s of [0, 10]) hit(kick, bar(b) + s, 0.82);
    hit(snare, bar(b) + 8, 0.9);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.38 : 0.2));
  }
  for (let b = 64; b < 68; b++) {                        // SIGN-OFF: the pulse thins out
    hit(kick, bar(b), 0.56 - (b - 64) * 0.06);
    for (const s of [2, 6, 10, 14]) hit(hihat, bar(b) + s, 0.24 - (b - 64) * 0.03);
  }

  // The tape-whoosh on the downbeat of each new section.
  for (const [b, v] of [[8, 0.5], [16, 0.75], [28, 0.5], [36, 0.78], [44, 0.62], [52, 0.95], [64, 0.45]] as const) {
    hit(fx, bar(b), v);
  }
  return { kick, snare, hihat, fx };
}

/**
 * The tape, section by section. Units as GlobalFXParams: wow and flutter in
 * cents, hiss 0-1, tone as a lowpass in Hz. A decent cassette deck is under
 * one cent of wow; the sign-on is ten. Halved from the first version, whose
 * fourteen to twenty cents read as a wobble rather than as age.
 */
export const ANEMOIA_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 10, flutter: 2.5, hiss: 0.6, tone: 7000, glide: 0.05 },
  { step: bar(8), wow: 5, flutter: 1.5, hiss: 0.4, tone: 11000, glide: 1.2 },
  { step: bar(16), wow: 2.5, flutter: 0.8, hiss: 0.28, tone: 16000, glide: 0.8 },
  { step: bar(24), wow: 6, flutter: 1.5, hiss: 0.4, tone: 10000, glide: 1.2 },
  { step: bar(28), wow: 4.5, flutter: 1.2, hiss: 0.36, tone: 12000, glide: 1.2 },
  { step: bar(36), wow: 2.5, flutter: 0.8, hiss: 0.28, tone: 16000, glide: 0.8 },
  // The bridge dissolves through the top end and the hiss rather than the
  // pitch: the lead plays its longest notes here.
  { step: bar(44), wow: 7, flutter: 1.6, hiss: 0.55, tone: 6000, glide: 1.6 },
  { step: bar(52), wow: 2, flutter: 0.6, hiss: 0.22, tone: 18000, glide: 0.3 },
  { step: bar(64), wow: 8, flutter: 2, hiss: 0.5, tone: 8000, glide: 2.5 },
  { step: bar(68), wow: 14, flutter: 3, hiss: 0.7, tone: 5000, glide: 3.5 },
];

const TRACK_META: Record<TrackType, { name: string; color: string }> = {
  lead: { name: 'AFTERIMAGE', color: 'bg-neon-purple' },
  pluck: { name: 'MUSIC BOX MOBILE', color: 'bg-teal-500' },
  pad: { name: 'FADED SLIDE', color: 'bg-blue-800' },
  bass: { name: 'TAIL LIGHTS', color: 'bg-indigo-600' },
  fx: { name: 'FX', color: 'bg-neon-pink' },
  hihat: { name: 'HH', color: 'bg-yellow-400' },
  snare: { name: 'SD', color: 'bg-cyan-400' },
  kick: { name: 'BD', color: 'bg-red-500' },
};

/** Every track of the song, in the order the app lists them. */
export function buildAnemoiaTracks(): Track[] {
  const bars = harmony();
  const notes: Partial<Record<TrackType, NoteEvent[]>> = {
    lead: buildLead(), pluck: buildPluck(), pad: buildPad(bars), bass: buildBass(bars),
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

/**
 * What scripts/verifyEarworm checks the song against: the chorus as written
 * (in E-flat; the last chorus is the same a tone up), the bars it occupies,
 * and the section boundaries the structure checks look at.
 */
export const ANEMOIA_HOOK = {
  tonic: 'Eb',
  chorus: HOOK,
  /** First bar of each statement of the chorus, and its transposition. */
  chorusStarts: [[16, 0], [36, 0], [52, 2]] as [number, number][],
  sections: {
    signOn: [0, 8], verse1: [8, 16], chorus1: [16, 24], afterglow: [24, 28],
    verse2: [28, 36], chorus2: [36, 44], bridge: [44, 52], chorus3: [52, 64],
    signOff: [64, 72],
  } as Record<string, [number, number]>,
};

/** Chord roots and pad voicings per bar, for the checks in verifyEarworm. */
export function anemoiaHarmony(): { bar: number; at: number; root: number; pad: number[] }[] {
  return harmony().flatMap((chords, b) =>
    chords.map((c) => ({ bar: b, at: c.at, root: midiOf(c.root), pad: c.pad.map(midiOf) })));
}
