import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";

/**
 * ANEMOIA — a built-in song, written by hand against the same specification
 * the generator is held to.
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
 *    in conflict. So: a driving 112 BPM under harmony that keeps turning
 *    minor — the borrowed iv at the end of every chorus, the flat-side bridge.
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
 *    2014). Here the tape is the narrator: worn through the intro, clearer in
 *    each chorus, most dissolved in the bridge, clearest in the last chorus,
 *    and gone to hiss by the end. A memory is not equally sharp all the way
 *    through, so neither is the tape.
 *
 * 4. A melody first heard as a memory. The sign-on plays the whole hook on a
 *    music box at half speed, an octave up, through the most worn tape in the
 *    song. When the chorus arrives the listener has heard it before without
 *    knowing where. The sign-off plays its opening again and stops one note
 *    short.
 *
 * Harmony. The chorus is IVmaj7 - V7sus4 - iii7 - vi7, the "royal road"
 * progression of Japanese pop (Ramage 2023, Music Theory Spectrum 45(2),
 * 238-256), which composers use to bring Aeolian colour into a major key and
 * which never touches the tonic. The answering half does reach it, for one
 * bar, and the next bar turns it minor: the borrowed iv (A-flat minor) under a
 * melody note that has not moved. Same note, darker floor. Producer Seiji
 * Kameda likens the V-to-iii move to heartbreak (NHK, 2014), and that is
 * where the hook peaks: an appoggiatura on the iii chord, the device Sloboda
 * (1991, Psychology of Music 19, 110-120) found associated with tears.
 *
 * Form, 72 bars at 112 BPM, about two and a half minutes:
 *   SIGN-ON 8 · VERSE 1 8 · CHORUS 1 8 · AFTERGLOW 4 · VERSE 2 8 · CHORUS 2 8
 *   · BRIDGE 8 · CHORUS 3 12 (up a whole tone) · SIGN-OFF 8
 *
 * Key: E-flat major, the verse leaning on its relative minor; the last chorus
 * and the sign-off in F, reached through D-flat and E-flat — the flat-VI and
 * flat-VII of the new key, so the lift is also a cadence.
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

// --- the hook -------------------------------------------------------------

/** One note of a phrase: step within its bar, pitch, length in steps. */
type Cell = readonly [step: number, pitch: string, length: number];
type Bar = readonly Cell[];

/**
 * The hook, phrase A, over IVmaj7 | V7sus4 | iii7 | vi7 in E-flat.
 *
 * One rhythmic cell — long, short, long, longest — in every bar, with the one
 * extra syncopation (earworm.md §3.3) in bar 3, where the peak is. The line
 * climbs for two bars, peaks on C6 over the iii chord as an appoggiatura, and
 * then takes its single uncommon gradient: a falling fourth into F5, the only
 * turning point in the phrase reached by a leap (§2.1B). It ends on G, the
 * third of the key, rising: a question rather than a full stop.
 *
 * Scored with the app's own scoreMotif: arch contour, one atypical turn,
 * range 12, 81% stepwise, mean IC 3.42 bits, two spikes. scripts/verifyEarworm
 * re-derives all of that on every run.
 */
export const HOOK_A: readonly Bar[] = [
  [[0, 'C5', 4], [4, 'D5', 2], [6, 'Eb5', 4], [10, 'G5', 6]],
  [[0, 'Ab5', 4], [4, 'G5', 2], [6, 'Ab5', 4], [10, 'Bb5', 6]],
  [[0, 'C6', 4], [4, 'Bb5', 2], [6, 'F5', 4], [10, 'G5', 4], [14, 'F5', 2]],
  [[0, 'Eb5', 4], [4, 'D5', 2], [6, 'Eb5', 4], [10, 'G5', 6]],
];

/**
 * A', the answer: the same rhythm, one note changed (§9). It opens with the
 * figure phrase A closed on — E-flat, D, E-flat, G — so the answer begins
 * where the question ended. Its second half is note for note phrase A's, and
 * what changes is the floor: the tonic arrives under bar 3 and turns minor
 * under bar 4, so the held G that was an open fifth over C minor becomes the
 * major seventh of A-flat minor.
 */
export const HOOK_A2: readonly Bar[] = [
  [[0, 'Eb5', 4], [4, 'D5', 2], [6, 'Eb5', 4], [10, 'G5', 6]],
  HOOK_A[1],
  HOOK_A[2],
  HOOK_A[3],
];

/** The verse: lower, calmer, on the beat — the chorus has the syncopation. */
const VERSE_LINE: readonly Bar[] = [
  [[0, 'G4', 6], [6, 'Bb4', 2], [8, 'C5', 4], [12, 'Bb4', 4]],
  [[0, 'C5', 6], [6, 'Bb4', 2], [8, 'Ab4', 4], [12, 'G4', 4]],
  [[0, 'G4', 6], [6, 'Bb4', 2], [8, 'C5', 4], [12, 'D5', 4]],
  [[0, 'Eb5', 6], [6, 'D5', 2], [8, 'C5', 4], [12, 'Bb4', 4]],
  [[0, 'G4', 6], [6, 'Bb4', 2], [8, 'C5', 4], [12, 'Bb4', 4]],
  [[0, 'C5', 6], [6, 'Bb4', 2], [8, 'Ab4', 4], [12, 'G4', 4]],
  [[0, 'Ab4', 6], [6, 'Bb4', 2], [8, 'C5', 4], [12, 'Eb5', 4]],
  [[0, 'F5', 6], [6, 'Eb5', 2], [8, 'C5', 4], [12, 'Bb4', 4]],
];

/**
 * The bridge: the hook in augmentation, at half speed, moved onto the
 * borrowed chords. Its opening shape — up a tone, up a semitone, up a major
 * third — is kept exactly and set on C-flat major instead of A-flat: the
 * melody one knows, in a house it never lived in.
 */
const BRIDGE_LINE: readonly Cell[] = [
  // bars 1-2: C-flat maj7 | A-flat m6
  [0, 'Eb5', 8], [8, 'F5', 4], [12, 'Gb5', 8], [20, 'Bb5', 12],
  // bars 3-4: E-flat/B-flat | C m7
  [32, 'Ab5', 8], [40, 'G5', 4], [44, 'F5', 8], [52, 'Eb5', 12],
  // bars 5-6: C-flat maj7 | A-flat m6
  [64, 'Cb6', 8], [72, 'Bb5', 4], [76, 'Gb5', 8], [84, 'Ab5', 8], [92, 'Gb5', 4],
  // bars 7-8: D-flat add9 | E-flat sus4 -> E-flat
  [96, 'F5', 8], [104, 'Eb5', 4], [108, 'F5', 8], [116, 'Ab5', 4], [120, 'G5', 8],
];

// --- harmony --------------------------------------------------------------

/**
 * A chord for the pad: the voicing, and where in the bar it starts. Voicings
 * are rootless or close, kept under the melody, and voice-led so that common
 * tones are held across the change instead of struck again.
 */
interface Chord { at: number; root: string; pad: readonly string[] }
const chord = (root: string, pad: readonly string[], at = 0): Chord => ({ root, pad, at });

// E-flat major
const AbMaj9 = ['Bb3', 'C4', 'Eb4', 'G4'];
const Bb9sus = ['Bb3', 'C4', 'Eb4', 'Ab4'];
const Gm7 = ['Bb3', 'D4', 'F4', 'G4'];
const Cm7 = ['Bb3', 'C4', 'Eb4', 'G4'];
const EbAdd9 = ['G3', 'Bb3', 'Eb4', 'F4'];
const Abm6 = ['Ab3', 'Cb4', 'Eb4', 'F4'];
// the verse sits lower, so the melody has the octave above to itself
const vCm9 = ['Eb3', 'G3', 'Bb3', 'D4'];
const vAbMaj9 = ['Eb3', 'G3', 'Bb3', 'C4'];
const vEbAdd9 = ['Eb3', 'G3', 'Bb3', 'F4'];
const vBbSus = ['Eb3', 'F3', 'Bb3', 'F4'];
const vBb = ['D3', 'F3', 'Bb3', 'F4'];
const vFm7 = ['F3', 'Ab3', 'C4', 'Eb4'];
const vBb9sus = ['Eb3', 'F3', 'Ab3', 'C4'];
// the bridge, on the flat side
const CbMaj7 = ['Cb4', 'Eb4', 'Gb4', 'Bb4'];
const bAbm6 = ['Cb4', 'Eb4', 'F4', 'Ab4'];
const EbOverBb = ['Bb3', 'Eb4', 'G4', 'Bb4'];
const DbAdd9 = ['Db4', 'Eb4', 'F4', 'Ab4'];
const EbSus = ['Ab3', 'Eb4', 'Ab4', 'Bb4'];
const Eb = ['G3', 'Eb4', 'G4', 'Bb4'];

const up = (pitches: readonly string[], semitones: number) =>
  pitches.map((p) => engineName(midiOf(p) + semitones));

/** Harmony for every bar of the song: one or two chords each. */
function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);

  // SIGN-ON — the chorus's own chords, slowed: IV, V, iii, then IV - V.
  push(chord('Ab1', AbMaj9)); push(chord('Ab1', AbMaj9));
  push(chord('Bb1', Bb9sus)); push(chord('Bb1', Bb9sus));
  push(chord('G1', Gm7)); push(chord('G1', Gm7));
  push(chord('Ab1', AbMaj9)); push(chord('Bb1', Bb9sus));

  const verse = () => {
    push(chord('C2', vCm9)); push(chord('Ab1', vAbMaj9));
    push(chord('Eb2', vEbAdd9)); push(chord('Bb1', vBbSus), chord('Bb1', vBb, 6));
    push(chord('C2', vCm9)); push(chord('Ab1', vAbMaj9));
    push(chord('F1', vFm7)); push(chord('Bb1', vBb9sus));
  };
  const chorus = () => {
    push(chord('Ab1', AbMaj9)); push(chord('Bb1', Bb9sus));
    push(chord('G1', Gm7)); push(chord('C2', Cm7));
    push(chord('Ab1', AbMaj9)); push(chord('Bb1', Bb9sus));
    push(chord('Eb1', EbAdd9)); push(chord('Ab1', Abm6));
  };

  verse();   // VERSE 1
  chorus();  // CHORUS 1
  // AFTERGLOW — the answering half of the chorus, without the melody.
  push(chord('Ab1', AbMaj9)); push(chord('Bb1', Bb9sus));
  push(chord('Eb1', EbAdd9)); push(chord('Ab1', Abm6));
  verse();   // VERSE 2
  chorus();  // CHORUS 2

  // BRIDGE — flat-VI, iv, I6/4, vi; flat-VI, iv, then D-flat and E-flat,
  // which are flat-VI and flat-VII of F.
  push(chord('Cb2', CbMaj7)); push(chord('Ab1', bAbm6));
  push(chord('Bb1', EbOverBb)); push(chord('C2', Cm7));
  push(chord('Cb2', CbMaj7)); push(chord('Ab1', bAbm6));
  push(chord('Db2', DbAdd9)); push(chord('Eb1', EbSus), chord('Eb1', Eb, 8));

  // CHORUS 3 — the same chorus a whole tone up, and a four-bar tag that
  // ends on the minor iv again.
  const lift = (root: string, pad: readonly string[]) =>
    chord(engineName(midiOf(root) + 2), up(pad, 2));
  push(lift('Ab1', AbMaj9)); push(lift('Bb1', Bb9sus));
  push(lift('G1', Gm7)); push(lift('C2', Cm7));
  push(lift('Ab1', AbMaj9)); push(lift('Bb1', Bb9sus));
  push(lift('Eb1', EbAdd9)); push(lift('Ab1', Abm6));
  push(lift('Ab1', AbMaj9)); push(lift('Bb1', Bb9sus));
  push(lift('C2', Cm7)); push(lift('Ab1', Abm6));

  // SIGN-OFF in F — IV, iv, I6, vi9, IV, iv, then Imaj9 held to the end.
  push(chord('Bb1', ['A3', 'C4', 'D4', 'F4'])); push(chord('Bb1', ['Bb3', 'Db4', 'F4', 'G4']));
  push(chord('A1', ['A3', 'C4', 'F4', 'G4'])); push(chord('D2', ['A3', 'C4', 'E4', 'F4']));
  push(chord('Bb1', ['A3', 'C4', 'D4', 'F4'])); push(chord('Bb1', ['Bb3', 'Db4', 'F4', 'G4']));
  push(chord('F1', ['A3', 'C4', 'E4', 'G4'])); push(chord('F1', ['A3', 'C4', 'E4', 'G4']));

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
      // Long notes a touch louder than short ones: the held note is the one
      // a singer leans on.
      const v = velocity * (length >= 6 ? 1.04 : length <= 2 ? 0.92 : 1);
      target.add(bar(startBar + b) + step, midiOf(pitch) + transpose, struck ? 1 : length, Math.min(1, v));
    }
  });
}

/** The same phrase at half speed, every onset and length doubled. */
function augmented(target: Builder, startStep: number, bars: readonly Bar[], velocity: number, transpose = 0, length = 1) {
  bars.forEach((cells, b) => {
    for (const [step, pitch] of cells) {
      target.add(startStep + (b * STEPS_PER_BAR + step) * 2, midiOf(pitch) + transpose, length, velocity);
    }
  });
}

function buildLead(): NoteEvent[] {
  const lead = builder('lead');
  phrase(lead, 8, VERSE_LINE, 0.62);              // VERSE 1
  phrase(lead, 16, HOOK_A, 0.8);                  // CHORUS 1
  phrase(lead, 20, HOOK_A2, 0.84);
  phrase(lead, 28, VERSE_LINE, 0.66);             // VERSE 2
  phrase(lead, 36, HOOK_A, 0.83);                 // CHORUS 2
  phrase(lead, 40, HOOK_A2, 0.86);
  for (const [step, pitch, length] of BRIDGE_LINE) {  // BRIDGE
    lead.add(bar(44) + step, pitch, length, 0.6);
  }
  phrase(lead, 52, HOOK_A, 0.88, 2);              // CHORUS 3, in F
  phrase(lead, 56, HOOK_A2, 0.9, 2);
  phrase(lead, 60, HOOK_A, 0.78, 2);              // tag: the question again,
  return lead.notes;                              // over a floor that turns minor
}

/**
 * The pluck is a music box: the sign-on's memory, the chorus's answers, the
 * mobile over the second verse, and, in the last chorus, a child's
 * instrument doubling the adult melody an octave up.
 */
function buildPluck(): NoteEvent[] {
  const box = builder('pluck');

  // SIGN-ON: the whole hook at half speed, an octave up.
  augmented(box, bar(0), HOOK_A, 0.56, 12);

  // CHORUS answers, in the long note at the end of each bar. Chord tones
  // only, an octave above the melody, so nothing sits a semitone from it.
  const answers: Record<number, [number, string][]> = {
    0: [[10, 'G6'], [12, 'Eb6'], [14, 'C6']],
    1: [[10, 'F6'], [12, 'Eb6'], [14, 'C6']],
    2: [[12, 'D6']],
    3: [[10, 'Eb6'], [12, 'G6'], [14, 'Bb6']],
    4: [[10, 'G6'], [12, 'Eb6'], [14, 'C6']],
    5: [[10, 'F6'], [12, 'Eb6'], [14, 'C6']],
    6: [[12, 'Bb6']],
    7: [[10, 'Cb6'], [12, 'Eb6'], [14, 'F6']],
  };
  for (const start of [16, 36]) {
    for (let b = 0; b < 8; b++) {
      for (const [step, pitch] of answers[b]) box.add(bar(start + b) + step, pitch, 1, 0.42);
    }
  }

  // AFTERGLOW: the hook's first two bars at their own speed, then an echo.
  phrase(box, 24, HOOK_A.slice(0, 2), 0.44, 12, true);
  for (const [b, step, pitch] of [
    [26, 0, 'Bb6'], [26, 6, 'G6'], [26, 8, 'F6'], [26, 12, 'Eb6'],
    [27, 0, 'Eb6'], [27, 6, 'Cb6'], [27, 8, 'Ab5'],
  ] as const) box.add(bar(b) + step, pitch, 1, 0.38);

  // VERSE 2: a mobile turning over the crib, one chord tone per beat.
  const mobile = [
    ['C6', 'D6', 'Eb6', 'G6'], ['C6', 'Eb6', 'G6', 'Eb6'],
    ['Bb5', 'Eb6', 'F6', 'G6'], ['Bb5', 'Eb6', 'D6', 'F6'],
    ['C6', 'D6', 'Eb6', 'G6'], ['C6', 'Eb6', 'G6', 'Eb6'],
    ['C6', 'Eb6', 'F6', 'Ab6'], ['Bb5', 'C6', 'Eb6', 'F6'],
  ];
  mobile.forEach((tones, b) => tones.forEach((pitch, beat) =>
    box.add(bar(28 + b) + beat * 4, pitch, 1, beat === 0 ? 0.4 : 0.32)));

  // CHORUS 2 gets the same answers as chorus 1 (above).

  // BRIDGE: small answers at the end of each two-bar fragment.
  for (const [b, step, pitch] of [
    [45, 12, 'Eb6'], [45, 14, 'F6'],
    [47, 12, 'G6'], [47, 14, 'Bb6'],
    [49, 12, 'Eb6'], [49, 14, 'Gb6'],
  ] as const) box.add(bar(b) + step, pitch, 1, 0.36);

  // CHORUS 3: the music box sings along with the second half and the tag.
  phrase(box, 56, HOOK_A2, 0.36, 14, true);
  phrase(box, 60, HOOK_A, 0.34, 14, true);

  // SIGN-OFF in F. The opening figure once, whole, over IV; then the one
  // note that changed when IV turned minor (D-flat); then the figure again,
  // which stops a note short of its peak; and last, "la, ti", ending on the
  // leading tone over the tonic's major ninth. The listener supplies the rest.
  for (const [b, step, pitch, v] of [
    [64, 0, 'D6', 0.42], [64, 4, 'E6', 0.38], [64, 6, 'F6', 0.4], [64, 10, 'A6', 0.4],
    [65, 0, 'Db6', 0.32],
    [66, 0, 'C6', 0.34], [66, 8, 'A5', 0.32], [67, 0, 'E6', 0.32],
    [68, 0, 'D6', 0.36], [68, 4, 'E6', 0.33], [68, 6, 'F6', 0.34],
    [70, 0, 'D6', 0.3], [70, 8, 'E6', 0.28],
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
  // Velocity per bar, following the sections. The pad is the widest and
  // longest-held thing in the mix, and at first it was also the loudest:
  // rendered alone it measured -13 dBFS through the sign-on and sat 1.2 dB
  // under the lead in the chorus, masking it. These levels put it 5-6 dB
  // down, and let the sign-off fade rather than stop.
  const energy = (b: number) =>
    b < 8 ? 0.2 : b < 16 ? 0.22 : b < 24 ? 0.26 : b < 28 ? 0.22 : b < 36 ? 0.24
      : b < 44 ? 0.27 : b < 52 ? 0.3 : b < 64 ? 0.28 : 0.26 - (b - 64) * 0.016;

  // Flatten to spans: [start, end, pitches].
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
 * one cent of wow; the sign-on is fourteen.
 */
export const ANEMOIA_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 14, flutter: 3, hiss: 0.7, tone: 6500, glide: 0.05 },
  { step: bar(8), wow: 8, flutter: 2, hiss: 0.45, tone: 10000, glide: 1.2 },
  { step: bar(16), wow: 4, flutter: 1.2, hiss: 0.3, tone: 15000, glide: 0.8 },
  { step: bar(24), wow: 9, flutter: 2, hiss: 0.45, tone: 9000, glide: 1.2 },
  { step: bar(28), wow: 7, flutter: 1.8, hiss: 0.4, tone: 11000, glide: 1.2 },
  { step: bar(36), wow: 4, flutter: 1.2, hiss: 0.3, tone: 15000, glide: 0.8 },
  { step: bar(44), wow: 18, flutter: 4, hiss: 0.6, tone: 5500, glide: 1.6 },
  { step: bar(52), wow: 3, flutter: 1, hiss: 0.25, tone: 18000, glide: 0.3 },
  { step: bar(64), wow: 12, flutter: 3, hiss: 0.55, tone: 7000, glide: 2.5 },
  { step: bar(68), wow: 20, flutter: 4, hiss: 0.8, tone: 4500, glide: 3.5 },
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
 * The phrases the specification applies to, for scripts/verifyEarworm: the
 * hook and its answer, in E-flat (the last chorus is the same phrases a tone
 * up, and every measure involved is transposition-invariant).
 */
export const ANEMOIA_HOOK = {
  tonic: 'Eb',
  mode: 'ionian' as const,
  a: HOOK_A,
  answer: HOOK_A2,
  /** Where the sections that the structure checks look at begin and end, in bars. */
  sections: {
    signOn: [0, 8], chorus1: [16, 24], bridge: [44, 52], chorus3: [52, 64],
  } as Record<string, [number, number]>,
};

/** Chord roots and pad voicings per bar, for the checks in verifyEarworm. */
export function anemoiaHarmony(): { bar: number; at: number; root: number; pad: number[] }[] {
  return harmony().flatMap((chords, b) =>
    chords.map((c) => ({ bar: b, at: c.at, root: midiOf(c.root), pad: c.pad.map(midiOf) })));
}
