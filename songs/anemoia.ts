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
 *    and a chorus that leaves its key and comes back strange.
 *
 * 2. Familiarity without a memory. Expectation research separates schematic
 *    expectations (knowledge of a style, absorbed passively) from veridical
 *    ones (knowledge of one particular piece) — Bharucha's distinction, as
 *    used by Huron (2006, Sweet Anticipation). The sound is as schematically
 *    familiar as an eighties record can be — chorused pads, gated snare,
 *    octave bass, a last-chorus key change — and the first half of every
 *    chorus is a progression the ear already knows: IVmaj7, III7, vi7,
 *    v7 - I7, the loop of Grover Washington Jr. and Bill Withers's "Just the
 *    Two of Us" (1980) in another key, here with ninths.
 *
 * 3. The familiar made strange. The second half of the chorus leaves through
 *    a chromatic mediant (C-flat major, then C-flat turned minor as B minor)
 *    and comes home from the tonic's hexatonic pole: B minor to E-flat major,
 *    every voice moving by a semitone. Cohn (2004, JAMS 57(2), 285-324)
 *    traced that pole relation to the uncanny in nineteenth-century music, in
 *    darker contexts than this one; Forrest (2017, Music Theory Online 23(4))
 *    found the related major-third progressions associated with the uncanny
 *    in pop across generations, while noting that not every instance evokes
 *    it. Freud's uncanny is the familiar made unfamiliar, which is the nearest
 *    thing music theory has to the brief. The bridge walks the same relation
 *    through major thirds — B, G, E-flat, the key centres of Coltrane's Giant
 *    Steps.
 *
 * 4. The audible medium. Mark Fisher's hauntology reads crackle and hiss as
 *    the medium making itself heard (Dancecult 5(2), 2013). Here the tape is
 *    the narrator: worn through the sign-on, clearer in each chorus, most
 *    dissolved in the bridge, clearest in the last chorus, hiss at the end.
 *
 * 5. A melody first heard as a memory. The sign-on plays the chorus's first
 *    three bars on a music box at half speed, through the most worn tape in
 *    the song, so the chorus arrives already half-known. The sign-off plays
 *    the strange half once more and stops a note short of home.
 *
 * This is the third version. The first met earworm.md's melodic targets and
 * was heard as busy and scalar; the second stood on plain triads with a
 * fifth-third-fifth-root motif and was heard as naive. This one keeps the
 * second's discipline — one rhythmic cell, a held note in every bar, nothing
 * left to chance in the harmony — and puts the held notes on the colours of
 * the chords: major sevenths, ninths, the sharp eleventh, the third of a chord
 * that should not be there.
 *
 * Form, 72 bars at 112 BPM, about two and a half minutes:
 *   SIGN-ON 8 · VERSE 1 8 · CHORUS 1 8 · AFTERGLOW 4 · VERSE 2 8 · CHORUS 2 8
 *   · BRIDGE 8 · CHORUS 3 12 (up a whole tone) · SIGN-OFF 8
 *
 * Key: E-flat major; the verse on a C pedal; the last chorus and the sign-off
 * in F, reached through D-flat and E-flat, so every pad voice rises by a
 * semitone or holds into the new key's first chord.
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

/** Pitch class of a spelled name without octave: 'Cb' is 11. */
const pcOf = (name: string) => ((midiOf(`${name}4`) % 12) + 12) % 12;

/** The engine's spelling: sharps only. */
const engineName = (midi: number): string =>
  `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// --- the melody -----------------------------------------------------------

/** One note of a phrase: step within its bar, pitch, length in steps. */
type Cell = readonly [step: number, pitch: string, length: number];
type Bar = readonly Cell[];

/**
 * The chorus. One rhythmic cell — two dotted eighths and a note held from the
 * "and" of beat two, so the long note always lands off the beat — in six of
 * its eight bars, and in every one of those the held note is a colour:
 *
 *   1 A-flat maj9    B-flat C, held G        the major seventh
 *   2 G7(b9)         A-flat B, held F        the seventh, the cell a step down
 *   3 C minor 9      E-flat G, held D        the ninth, the cell turned upward
 *   4 B-flat m9, E-flat 9                    a descent onto E-flat's third
 *   5 A-flat maj9    bar 1 again
 *   6 C-flat maj9#11 B-flat D-flat, held F   the sharp eleventh
 *   7 B minor        F-sharp B, held D       the third of the hexatonic pole
 *   8 E-flat         E-flat held, at the top of the chorus
 *
 * Bar 7's D rises a semitone to bar 8's E-flat while every voice of the pad
 * moves a semitone too: the tonic, reached from the chord furthest from it.
 */
export const HOOK: readonly Bar[] = [
  [[0, 'Bb5', 3], [3, 'C6', 3], [6, 'G5', 10]],
  [[0, 'Ab5', 3], [3, 'B5', 3], [6, 'F5', 10]],
  [[0, 'Eb5', 3], [3, 'G5', 3], [6, 'D6', 10]],
  [[0, 'Db6', 3], [3, 'C6', 3], [6, 'Ab5', 2], [8, 'G5', 6], [14, 'Ab5', 2]],
  [[0, 'Bb5', 3], [3, 'C6', 3], [6, 'G5', 10]],
  [[0, 'Bb5', 3], [3, 'Db6', 3], [6, 'F5', 10]],
  [[0, 'F#5', 3], [3, 'B5', 3], [6, 'D6', 10]],
  [[0, 'Eb6', 6], [6, 'Bb5', 4], [10, 'G5', 6]],
];

/** The last chorus ends on a tag: its strange half once more. */
const TAG: readonly Bar[] = HOOK.slice(4);

/**
 * The verse: lower, entering after the beat each bar, over a C pedal. A cell
 * of two sixteenth pairs and a held note, set on each chord: C minor 9, then
 * D-flat over C — the Phrygian second, the darkest colour in the song — then
 * A-flat over C and B-flat over C; and on the way out, F minor and a G that
 * hangs on its suspension before it turns dominant, and then does not resolve
 * where a dominant should: the chorus starts on A-flat.
 */
const VERSE_LINE: readonly Bar[] = [
  [[2, 'G4', 2], [4, 'Bb4', 2], [6, 'D5', 6], [12, 'C5', 4]],
  [[2, 'Ab4', 2], [4, 'C5', 2], [6, 'F5', 6], [12, 'Eb5', 4]],
  [[2, 'G4', 2], [4, 'C5', 2], [6, 'Eb5', 10]],
  [[2, 'F4', 2], [4, 'Bb4', 2], [6, 'D5', 8], [14, 'C5', 2]],
  [[2, 'G4', 2], [4, 'Bb4', 2], [6, 'D5', 6], [12, 'C5', 4]],
  [[2, 'Ab4', 2], [4, 'C5', 2], [6, 'F5', 6], [12, 'Eb5', 4]],
  [[2, 'Ab4', 2], [4, 'C5', 2], [6, 'G5', 6], [12, 'F5', 4]],
  [[0, 'D5', 4], [4, 'C5', 4], [8, 'B4', 4], [12, 'D5', 2], [14, 'F5', 2]],
];

/**
 * The bridge: long notes that hold while the chord moves a major third under
 * them, so the same note changes meaning — B as the root of B major, then the
 * third of G; E-flat as the tonic, then D-sharp, the third of B. It ends on
 * D-flat and E-flat, the flat-VI and flat-VII of F.
 */
const BRIDGE_LINE: readonly Cell[] = [
  [4, 'F#5', 4], [8, 'A#5', 8],
  [16, 'B5', 12], [28, 'A5', 4],
  [32, 'G5', 16],
  [48, 'Bb5', 6], [54, 'D6', 10],
  [64, 'D#6', 12], [76, 'C#6', 4],
  [80, 'B5', 8], [88, 'C#6', 8],
  [96, 'C6', 8], [104, 'Ab5', 8],
  [112, 'Db6', 8], [120, 'Bb5', 8],
];

// --- harmony --------------------------------------------------------------

/**
 * A chord: its symbol, its root (for the bass), every tone the symbol names
 * (the pad voices four of them; the melody carries the rest), the voicing,
 * and where in the bar it starts. Common tones are held across a change
 * rather than struck again (see buildPad).
 */
interface Chord { at: number; name: string; root: string; tones: readonly string[]; pad: readonly string[] }
const chord = (name: string, root: string, tones: readonly string[], pad: readonly string[], at = 0): Chord =>
  ({ name, root, tones, pad, at });

// Chorus. The pad is voiced in four close parts below the melody, and moves
// as little as it can: from A-flat to G7 every voice falls a step, from C
// minor to B-flat minor again, and from C-flat to B minor to E-flat only by
// semitones.
const cAbmaj9 = chord('Abmaj9', 'Ab1', ['Ab', 'C', 'Eb', 'G', 'Bb'], ['C4', 'Eb4', 'G4', 'Bb4']);
const cG7b9 = chord('G7b9', 'G1', ['G', 'B', 'D', 'F', 'Ab'], ['B3', 'D4', 'F4', 'Ab4']);
const cCm9 = chord('Cm9', 'C2', ['C', 'Eb', 'G', 'Bb', 'D'], ['Bb3', 'D4', 'Eb4', 'G4']);
const cBbm9 = chord('Bbm9', 'Bb1', ['Bb', 'Db', 'F', 'Ab', 'C'], ['Ab3', 'C4', 'Db4', 'F4']);
const cEb9 = (at: number) => chord('Eb9', 'Eb2', ['Eb', 'G', 'Bb', 'Db', 'F'], ['G3', 'Bb3', 'Db4', 'F4'], at);
const cAbmaj9b = chord('Abmaj9', 'Ab1', ['Ab', 'C', 'Eb', 'G', 'Bb'], ['Bb3', 'C4', 'Eb4', 'G4']);
const cCbmaj9s11 = chord('Cbmaj9#11', 'Cb2', ['Cb', 'Eb', 'Gb', 'Bb', 'Db', 'F'], ['Bb3', 'Db4', 'Eb4', 'Gb4']);
const cBm = chord('Bm', 'B1', ['B', 'D', 'F#'], ['B3', 'D4', 'F#4', 'B4']);
const cEb = chord('Eb', 'Eb2', ['Eb', 'G', 'Bb'], ['Bb3', 'Eb4', 'G4', 'Bb4']);

// Verse: a C pedal under four upper chords, low enough to leave the melody
// the octave above.
const vCm9 = chord('Cm9', 'C2', ['C', 'Eb', 'G', 'Bb', 'D'], ['C3', 'G3', 'Bb3', 'D4']);
const vDbOverC = chord('Dbmaj7/C', 'C2', ['C', 'Db', 'F', 'Ab', 'Eb'], ['Db3', 'F3', 'Ab3', 'C4']);
const vAbOverC = chord('Abmaj7/C', 'C2', ['C', 'Eb', 'G', 'Ab'], ['Eb3', 'G3', 'Ab3', 'C4']);
const vBbOverC = chord('Bb/C', 'C2', ['C', 'D', 'F', 'Bb'], ['D3', 'F3', 'Bb3', 'D4']);
const vFm9 = chord('Fm9', 'F1', ['F', 'Ab', 'C', 'Eb', 'G'], ['F3', 'Ab3', 'C4', 'Eb4']);
const vGsus = chord('Gsus4', 'G1', ['G', 'C', 'D', 'F'], ['F3', 'C4', 'D4', 'G4']);
const vG7b13 = chord('G7b13', 'G1', ['G', 'B', 'D', 'F', 'Eb'], ['F3', 'B3', 'Eb4', 'G4'], 8);

// Bridge: major thirds down, B - G - E-flat, each move a pair of semitones in
// contrary motion with the other voices held.
const bBmaj9 = chord('Bmaj9', 'B1', ['B', 'D#', 'F#', 'A#', 'C#'], ['B3', 'D#4', 'F#4', 'C#5']);
const bGmaj9s11 = chord('Gmaj9#11', 'G1', ['G', 'B', 'D', 'F#', 'A', 'C#'], ['B3', 'D4', 'F#4', 'C#5']);
const bEbmaj9 = chord('Ebmaj9', 'Eb2', ['Eb', 'G', 'Bb', 'D', 'F'], ['Bb3', 'D4', 'F4', 'G4']);
const bDbmaj9s11 = chord('Dbmaj7#11', 'Db2', ['Db', 'F', 'Ab', 'C', 'Eb', 'G'], ['C4', 'F4', 'G4', 'Db5']);
const bEb13sus = chord('Eb13sus4', 'Eb2', ['Eb', 'Ab', 'Bb', 'Db', 'F', 'C'], ['Db4', 'F4', 'Ab4', 'C5']);

// Sign-off in F.
const fFadd9 = chord('Fadd9', 'F1', ['F', 'A', 'C', 'G'], ['F3', 'A3', 'C4', 'G4']);

const NAMES_SHARP = SHARP_NAMES;
/** A chord a number of semitones up: root, voicing and tones, respelled with sharps. */
const lift = (c: Chord, semitones: number): Chord => ({
  ...c,
  name: `${c.name}+${semitones}`,
  root: engineName(midiOf(c.root) + semitones),
  tones: c.tones.map((t) => NAMES_SHARP[(pcOf(t) + semitones) % 12]),
  pad: c.pad.map((p) => engineName(midiOf(p) + semitones)),
});

/** Harmony for every bar of the song: one or two chords each. */
function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);
  const chorusHalfA = () => {
    push(cAbmaj9); push(cG7b9); push(cCm9); push(cBbm9, cEb9(8));
  };
  const chorusHalfB = (shift = 0) => {
    for (const c of [cAbmaj9b, cCbmaj9s11, cBm, cEb]) push(lift(c, shift));
  };

  // SIGN-ON — the chorus's first half at half speed.
  push(cAbmaj9); push(cAbmaj9); push(cG7b9); push(cG7b9);
  push(cCm9); push(cCm9); push(cBbm9); push(cEb9(0));

  const verse = () => {
    push(vCm9); push(vDbOverC); push(vAbOverC); push(vBbOverC);
    push(vCm9); push(vDbOverC); push(vFm9); push(vGsus, vG7b13);
  };

  verse();                      // VERSE 1
  chorusHalfA(); chorusHalfB(); // CHORUS 1
  chorusHalfB();                // AFTERGLOW — the strange half, on the music box
  verse();                      // VERSE 2
  chorusHalfA(); chorusHalfB(); // CHORUS 2

  // BRIDGE
  push(bBmaj9); push(bGmaj9s11); push(bEbmaj9); push(bEbmaj9);
  push(bBmaj9); push(bGmaj9s11); push(bDbmaj9s11); push(bEb13sus);

  // CHORUS 3 — the same chorus a whole tone up, and the tag.
  push(lift(cAbmaj9, 2)); push(lift(cG7b9, 2)); push(lift(cCm9, 2));
  push(lift(cBbm9, 2), lift(cEb9(8), 2));
  chorusHalfB(2);
  chorusHalfB(2);

  // SIGN-OFF in F — the strange half, then B-flat, D-flat and home by the
  // major-third step, the last chord with its ninth.
  chorusHalfB(2);
  push(lift(cAbmaj9b, 2)); push(lift(cCbmaj9s11, 2)); push(fFadd9); push(fFadd9);

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

  // SIGN-ON: the chorus's first three bars at half speed, each answered in
  // its second bar by one note of its chord; then B-flat minor and E-flat.
  augmented(box, bar(0), [HOOK[0]], 0.56);
  box.add(bar(1) + 8, 'Eb6', 1, 0.4);
  augmented(box, bar(2), [HOOK[1]], 0.54);
  box.add(bar(3) + 8, 'D6', 1, 0.4);
  augmented(box, bar(4), [HOOK[2]], 0.54);
  box.add(bar(5) + 8, 'Bb5', 1, 0.4);
  box.add(bar(6), 'Db6', 1, 0.42); box.add(bar(6) + 8, 'C6', 1, 0.38);
  box.add(bar(7), 'G5', 1, 0.42); box.add(bar(7) + 8, 'F5', 1, 0.38);

  // AFTERGLOW: the chorus's strange half, alone.
  phrase(box, 24, HOOK.slice(4), 0.46, 0, true);

  // VERSE 2: a mobile, one chord tone per beat, an octave above everything.
  const mobile: string[][] = [
    ['C6', 'G6', 'D6', 'Eb6'],
    ['C6', 'Ab6', 'F6', 'Db6'],
    ['C6', 'G6', 'Eb6', 'Ab6'],
    ['D6', 'F6', 'Bb6', 'C6'],
    ['C6', 'G6', 'D6', 'Eb6'],
    ['C6', 'Ab6', 'F6', 'Db6'],
    ['C6', 'Ab6', 'G6', 'Eb6'],
    ['D6', 'G6', 'B5', 'F6'],
  ];
  mobile.forEach((pitches, b) =>
    pitches.forEach((pitch, beat) =>
      box.add(bar(28 + b) + beat * 4, pitch, 1, beat === 0 ? 0.36 : 0.3)));

  // CHORUS 3: the music box sings along with the strange half and the tag.
  phrase(box, 56, HOOK.slice(4), 0.34, 14, true);
  phrase(box, 60, TAG, 0.32, 14, true);

  // SIGN-OFF in F: the strange half once more, then its first two bars again,
  // the second without its held note, and "3, 2" over the last chord — the
  // descent the chorus never finishes, left for the listener.
  phrase(box, 64, HOOK.slice(4), 0.42, 2, true);
  for (const [b, step, pitch, v] of [
    [68, 0, 'C6', 0.36], [68, 3, 'D6', 0.34], [68, 6, 'A5', 0.36],
    [69, 0, 'C6', 0.32], [69, 3, 'Eb6', 0.3],
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

  // Verse: eighth-note pulse on the root, the downbeats leaned on. Over the
  // pedal it is the one thing that does not move.
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
 * one cent of wow; the sign-on is ten.
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
 * (in E-flat; the last chorus is the same a tone up), where it is stated, and
 * the section boundaries the structure checks look at.
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

/** Chords per bar, as MIDI and pitch classes, for the checks in verifyEarworm. */
export function anemoiaHarmony(): { bar: number; at: number; name: string; root: number; tones: number[]; pad: number[] }[] {
  return harmony().flatMap((chords, b) =>
    chords.map((c) => ({
      bar: b, at: c.at, name: c.name, root: midiOf(c.root),
      tones: c.tones.map(pcOf), pad: c.pad.map(midiOf),
    })));
}
