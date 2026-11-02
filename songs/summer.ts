import type { NoteEvent, SequencerStep, TapeAutomation, Track, TrackType } from "../types";
import { MIX_LEVELS } from "../constants";
import {
  STEPS_PER_BAR, bar, buildPad, builder, chord, chordAt, harmonise, harmonyMap,
  midiOf, pcOf, phrase, type Bar, type Chord,
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
 * The major-key versions (D, a loop on the secondary dominant F-sharp 7)
 * are in the history. After the note that no banger would come out of that
 * melody and harmony, and that it could be darker and sadder, the song moved
 * to F-sharp minor: a loop of i - VI - iv - VII and i - VI - iv - V7, an
 * Andalusian descent under the theme, a lament for a hook. The drums, the
 * bass pulse, the patches and the arc stayed.
 *
 * Form, 56 bars at 108 BPM, all in F-sharp minor:
 *   THEME 8 (the hook's first bar on the pluck) · HOOK x2 · THEME 8 (the
 *   break) · HOOK x2 · OUTRO 8 (a deceptive cadence, then home)
 */

export const SUMMER_BPM = 108;
/** The song as written, and the one bar of rise put in front of it. */
const CORE_BARS = 56;
const INTRO_BARS = 1;
const BARS = CORE_BARS + INTRO_BARS;
export const SUMMER_STEPS = BARS * STEPS_PER_BAR;

// --- the melody -----------------------------------------------------------

/**
 * The hook, sixth version, after the note that the breaking moments were the
 * best of it and that there should be more. A break here is a suspension: a
 * note struck as a consonance at the end of a bar and held over the barline
 * while the harmony moves under it, so that it becomes a dissonance, and then
 * falling a step to a chord tone. Every bar of the hook ends that way. The
 * E over F-sharp minor is held into D major as its ninth and falls to D; the
 * C-sharp over D becomes the ninth of B minor and falls to B; the A over B
 * minor becomes the fourth of E (and, in A', the flat thirteenth of C-sharp 7)
 * and falls to G-sharp. Between them the line climbs the tonic triad to the
 * top E, circles D, falls through B minor to F-sharp and rises again. The
 * last note is struck at the end of the phrase and held into the next one:
 * C-sharp into A', and in A' the A, the dominant's flat thirteenth, held into
 * the tonic chord where it becomes the third.
 * Scored by scoreMotif at 1.00 / 0.95 against the spec bands: arch, one
 * uncommon turning point (the minor-third fall to F-sharp), 82% stepwise,
 * range 10, twenty notes in one rhythmic cell (rest, two eighths, a quarter,
 * an eighth, a note held over the bar), D and E on six of them, a cadence on
 * the fifth (A) and the third (A').
 */
const CELL: readonly (readonly [number, number])[] = [[4, 2], [6, 2], [8, 4], [12, 2], [14, 6]];
const END: readonly (readonly [number, number])[] = [[0, 6], [6, 2], [8, 8]];
const cells = (pitches: string[], rhythm: readonly (readonly [number, number])[]): Bar =>
  pitches.map((p, k) => [rhythm[k][0], p, rhythm[k][1]] as const);
const LEAD_A: readonly Bar[] = [
  cells(['F#5', 'A5', 'C#6', 'D6', 'E6'], CELL),
  cells(['D6', 'E6', 'D6', 'D6', 'C#6'], CELL),
  cells(['B5', 'A5', 'F#5', 'G#5', 'A5'], CELL),
  cells(['G#5', 'A5', 'B5', 'B5', 'C#6'], CELL),
];
const LEAD_A2: readonly Bar[] = [
  ...LEAD_A.slice(0, 3),
  cells(['G#5', 'A5', 'B5', 'B5', 'A5'], CELL),
];
export const LEAD_CHORUS: readonly Bar[] = [...LEAD_A, ...LEAD_A2];
export const LEAD_HOOK = { a: LEAD_A, answer: LEAD_A2, tonic: 'F#', mode: 'aeolian' as const };
/** The note the hook is entered with, a bar's last eighth before it: A' ends on it. */
export const HOOK_PICKUP = 'A5';

/**
 * The theme, for the verse and the break, second version, after the note
 * that the verse melody was too chaotic. It no longer leaps: each bar is one
 * note, its upper neighbour and the note again, held, and each bar is a step
 * lower than the last, so the line walks down in tenths over the descending
 * bass, A over F-sharp, G-sharp over E, F-sharp over D, E-sharp over
 * C-sharp. Four bars, the same four again; the second time the last bar
 * turns through the suspension, G-sharp and F-sharp over C-sharp sus4, to
 * E-sharp, the leading tone, the one note outside the mode, pointing at the
 * hook. A melody this plain leaves the colour to the harmony under it.
 */
export const THEME: readonly Bar[] = [
  cells(['A4', 'B4', 'A4'], END),
  cells(['G#4', 'A4', 'G#4'], END),
  cells(['F#4', 'G#4', 'F#4'], END),
  cells(['E#4', 'F#4', 'E#4'], END),
  cells(['A4', 'B4', 'A4'], END),
  cells(['G#4', 'A4', 'G#4'], END),
  cells(['F#4', 'G#4', 'F#4'], END),
  cells(['G#4', 'F#4', 'E#4'], END),
];

// --- harmony --------------------------------------------------------------

// The loop, voiced across three octaves: root and fifth low, the colour
// (ninth, eleventh, sixth) on top, all under the lead's chords. Halfway
// through each of the first three bars the bass steps down, F-sharp, E, D,
// C-sharp, B, A: the descending tetrachord that has stood for lament since
// the seventeenth century (Rosand 1979). Over the D the pad's top and bottom
// trade C-sharp and D, over the B minor A and B, so the inner voices move
// against the melody instead of holding still under it.
const Fsm = chord('F#m9', 'F#1', ['F#', 'A', 'C#', 'E', 'G#'], ['F#2', 'C#3', 'A3', 'E4', 'G#4']);
const FsmE = chord('F#m9/E', 'E1', ['F#', 'A', 'C#', 'E', 'G#'], ['E2', 'C#3', 'A3', 'E4', 'G#4'], 8);
const D = chord('Dmaj9', 'D1', ['D', 'F#', 'A', 'C#', 'E'], ['D2', 'A2', 'F#3', 'C#4', 'E4']);
const DCs = chord('D/C#', 'C#1', ['D', 'F#', 'A', 'C#', 'E'], ['C#2', 'A2', 'F#3', 'D4', 'E4'], 8);
const Bm = chord('Bm11', 'B0', ['B', 'D', 'F#', 'A', 'C#', 'E'], ['B2', 'F#3', 'A3', 'D4', 'E4']);
const BmA = chord('Bm11/A', 'A0', ['B', 'D', 'F#', 'A', 'C#', 'E'], ['A2', 'F#3', 'B3', 'D4', 'E4'], 8);
const E = chord('E6/9', 'E1', ['E', 'G#', 'B', 'C#', 'F#'], ['E2', 'B2', 'G#3', 'C#4', 'F#4']);
// The harmonic-minor dominant with its two tensions, the flat ninth and the
// flat thirteenth, which the hook leans on.
const Cs7 = chord('C#7b9b13', 'C#1', ['C#', 'E#', 'G#', 'B', 'D', 'A'], ['C#3', 'G#3', 'B3', 'E#4']);
/** Where the last loop goes instead of home: D for F-sharp minor, the deceptive cadence. */
const Dec = chord('Dmaj9', 'D1', ['D', 'F#', 'A', 'C#', 'E'], ['D2', 'A2', 'F#3', 'C#4', 'E4']);

// The theme: the same chords voiced low, so the lead an octave down still
// sits above them.
const tFsm = chord('F#m', 'F#1', ['F#', 'A', 'C#', 'E'], ['F#2', 'C#3', 'A3']);
const tE = chord('E6', 'E1', ['E', 'G#', 'B', 'C#'], ['E2', 'B2', 'G#3']);
const tD = chord('Dmaj7', 'D1', ['D', 'F#', 'A', 'C#'], ['D2', 'A2', 'F#3']);
const tCs7 = chord('C#7b13', 'C#1', ['C#', 'E#', 'G#', 'B', 'A'], ['C#2', 'G#2', 'B2', 'E#3']);
const tCsus = chord('C#sus4', 'C#1', ['C#', 'F#', 'G#'], ['C#2', 'G#2', 'C#3', 'F#3']);
const tCs7b = chord('C#7b13', 'C#1', ['C#', 'E#', 'G#', 'B', 'A'], ['C#2', 'G#2', 'B2', 'E#3'], 8);

/**
 * The loop: i - VI - iv - VII, i - VI - iv - V7, over the falling bass. Once
 * through the natural minor, its flat seventh, E, falling back to the tonic
 * like a shrug; the second time the same bar turns to the harmonic minor's
 * dominant, C-sharp 7 with its leading tone, and the pull home is the
 * strongest in the key.
 */
const LOOP: Chord[][] = [[Fsm, FsmE], [D, DCs], [Bm, BmA], [E], [Fsm, FsmE], [D, DCs], [Bm, BmA], [Cs7]];
/** The theme's harmony: the Andalusian descent, i - VII - VI - V, twice. */
const THEME_CHORDS = [tFsm, tE, tD, tCs7, tFsm, tE, tD, tCsus];

function harmony(): Chord[][] {
  const bars: Chord[][] = [];
  const push = (...chords: Chord[]) => bars.push(chords);
  const loop = () => { for (const c of LOOP) push(...c); };
  const theme = () => { THEME_CHORDS.forEach((c, i) => (i === 7 ? push(c, tCs7b) : push(c))); };

  theme();          // THEME 1
  loop(); loop();   // RIFF, twice
  theme();          // THEME 2 — the break
  loop(); loop();   // RIFF, twice
  // OUTRO: the last dominant does not come home. The loop restarts on D, the
  // deceptive cadence, and reaches F-sharp minor only in the last bar, from
  // B minor, iv to i.
  push(Dec, DCs);
  for (const c of LOOP.slice(1, 7)) push(...c);
  push(Fsm);

  if (bars.length !== CORE_BARS) throw new Error(`Harmony has ${bars.length} bars, expected ${CORE_BARS}`);
  return bars;
}

// --- track builders -------------------------------------------------------

function buildLead(bars: Chord[][], pad: NoteEvent[]): NoteEvent[] {
  const l = builder('melody');
  phrase(l, 0, THEME, 0.7);                 // THEME 1
  // The hook is entered on its pick-up, held over the barline like every
  // other bar's last note.
  for (const start of [8, 32]) l.add(bar(start) - 2, HOOK_PICKUP, 6, 0.86);
  for (const start of [8, 16]) phrase(l, start, LEAD_CHORUS, 0.92);  // the hook, twice
  phrase(l, 24, THEME, 0.72);               // THEME 2
  for (const start of [32, 40]) phrase(l, start, LEAD_CHORUS, 0.95);  // the hook, twice
  phrase(l, 48, LEAD_CHORUS.slice(0, 4), 0.68);                       // OUTRO: once more, quietly
  // Polyphonic: every melody note struck as a chord of three, the two
  // voices under it chord tones above the pad, never a semitone from it.
  return harmonise(l.notes, bars, pad, 2, 0.62);
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
  const arp = (from: number, to: number, velocity: (b: number) => number, every = 1, octave = 0, over = false) => {
    for (let b = from; b < to; b++) {
      for (let s = 0; s < STEPS_PER_BAR; s += every) {
        const step = bar(b) + s;
        const c = chordAt(bars, step);
        const pitches = c.pad.map(midiOf);
        const padNow = at(padNotes, step);
        const padTop = Math.max(...pitches, ...padNow);
        const now = sounding(step);
        // Over a low theme the arpeggio may run above the lead.
        const top = over || !now.length ? CEILING : Math.max(...now);
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
  // F-sharp aeolian; over the dominant, the harmonic minor, so the second
  // voice takes E-sharp there and never sounds E against the leading tone.
  const AEOLIAN = [0, 2, 3, 5, 7, 8, 10].map((x) => (x + 6) % 12);
  const HARMONIC = [0, 2, 3, 5, 7, 8, 11].map((x) => (x + 6) % 12);
  const below = (m: number, degrees: number, scale: number[]) => {
    let x = m; let k = 0;
    while (k < degrees) { x--; if (scale.includes(((x % 12) + 12) % 12)) k++; }
    return x;
  };
  const twin = (start: number, velocity: number) => {
    LEAD_CHORUS.forEach((cellsOfBar, b) => cellsOfBar.forEach(([st, pitch, len]) => {
      const step = bar(start + b) + st;
      const m = midiOf(pitch);
      const c = chordAt(bars, step);
      const tones = new Set(c.tones.map((t) => midiOf(`${t}4`) % 12));
      const strongBeat = st === 4 || st === 8;
      const scale = c.tones.includes('E#') ? HARMONIC : AEOLIAN;
      const third = below(m, 2, scale), sixth = below(m, 5, scale);
      const clashes = (x: number, s0: number) => [...sounding(s0), ...at(padNotes, s0)].some((y) => Math.abs(y - x) === 1);
      const pick = [third, sixth].find((x) => (!strongBeat || tones.has(x % 12)) && !clashes(x, step));
      if (pick === undefined) return;
      // Held over the barline, the second voice is checked again under the
      // new chord and drops out of any sixteenth where it would rub.
      for (let k = 0; k < len; k++) if (!clashes(pick, step + k)) p.add(step + k, pick, 1, velocity * (k === 0 ? 1 : 0.62));
    }));
  };
  // THEME 1: the arpeggio above the low lead, and twice, on the F-sharp
  // minor bars, the hook's first bar struck quietly in its place, so the
  // tune is heard before the lead plays it.
  const head = (b: number) => phrase(p, b, LEAD_CHORUS.slice(0, 1), 0.4, 0, true);
  head(0); arp(1, 4, () => 0.46, 1, 0, true);
  head(4); arp(5, 8, () => 0.5, 1, 0, true);
  // HOOK: the pluck becomes the second lead, a third under the melody
  // (a sixth where the third would not be a chord tone where it lands),
  // pulsing in sixteenths through each melody note.
  for (const start of [8, 16, 32, 40]) twin(start, 0.62);
  arp(24, 28, () => 0.44, 2);         // THEME 2: eighths, then sixteenths above the lead
  arp(28, 32, (b) => 0.5 + (b - 28) * 0.06, 1, 0, true);
  arp(48, 56, (b) => 0.64 - (b - 48) * 0.06);  // OUTRO, thinning
  return p.notes;
}

const padEnergy = (b: number) =>
  b < 8 ? 0.26 : b < 24 ? 0.34 : b < 32 ? 0.26 : b < 48 ? 0.36 : 0.3 - (b - 48) * 0.025;

/**
 * Bass: a sequencer's line. Straight eighths on the root, every one the same
 * length and short, the beat a little louder than the off-beat, and the last
 * eighth of the bar an octave up, the one figure in it. The root follows the
 * chord under each eighth, so the line walks down with the falling bass.
 * Written an octave above the chord roots; the patch's sub sits an octave
 * below.
 */
function buildBass(bars: Chord[][]): NoteEvent[] {
  const bass = builder('bass');
  const root = (b: number, s = 0) => midiOf(chordAt(bars, bar(b) + s).root) + 12;
  const pulse = (b: number, v: number, lift = true) => {
    for (let s = 0; s < 16; s += 2) {
      const up = lift && s === 14 ? 12 : 0;
      bass.add(bar(b) + s, root(b, s) + up, 1.7, v * (s % 4 === 0 ? 1 : 0.82));
    }
  };
  // THEME 1: held while only the hats play, then the eighths, rising; the
  // riffs at full tilt; held again for the break, back for its second half;
  // fading at the end.
  for (let b = 0; b < 4; b++) bass.add(bar(b), root(b), 16, 0.5);
  for (let b = 4; b < 8; b++) pulse(b, 0.66 + (b - 4) * 0.05, false);
  for (let b = 8; b < 24; b++) pulse(b, 0.92);
  for (let b = 24; b < 28; b++) bass.add(bar(b), root(b), 16, 0.5);
  for (let b = 28; b < 32; b++) pulse(b, 0.7 + (b - 28) * 0.05, false);
  for (let b = 32; b < 48; b++) pulse(b, 0.95);
  for (let b = 48; b < 52; b++) pulse(b, 0.78 - (b - 48) * 0.06, false);
  for (let b = 52; b < 55; b++) { bass.add(bar(b), root(b), 8, 0.5 - (b - 52) * 0.06); bass.add(bar(b) + 8, root(b, 8), 8, 0.46 - (b - 52) * 0.06); }
  bass.add(bar(55), root(55), 16, 0.32);
  return bass.notes;
}

function buildDrums(): Record<'kick' | 'snare' | 'hihat' | 'fx', SequencerStep[]> {
  const blank = (): SequencerStep[] =>
    Array.from({ length: CORE_BARS * STEPS_PER_BAR }, () => ({ active: false, velocity: 0 }));
  const kick = blank(), snare = blank(), hihat = blank(), fx = blank();
  const hit = (lane: SequencerStep[], step: number, velocity: number) => {
    lane[step] = { active: true, velocity: Math.round(velocity * 1000) / 1000 };
  };
  // Motorik, the same bar over and over: the kick on every beat, the snare
  // on two and four into its gated room with the clap under it, and closed
  // hats on every eighth, the off-beat leaned on. No sixteenths and no fills
  // inside a section: the drive is that nothing changes.
  const verseBar = (b: number, v: number) => {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 0.86 * v);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.6 : 0.3) * v);
  };
  const chorusBar = (b: number, v: number) => {
    for (const s of [0, 4, 8, 12]) hit(kick, bar(b) + s, 1 * v);
    for (const s of [4, 12]) hit(snare, bar(b) + s, 0.95 * v);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.72 : 0.38) * v);
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

  // THEME 1: the off-beat hat alone, the kick from its fifth bar, one bar
  // of build before the riff. THEME 2: the kit out for four bars, then back.
  for (let b = 0; b < 4; b++) for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.44 : 0.2) + b * 0.03);
  for (let b = 4; b < 7; b++) verseBar(b, 1);
  build(7);
  for (let b = 8; b < 24; b++) chorusBar(b, 1);
  for (let b = 28; b < 31; b++) verseBar(b, 1);
  build(31);
  for (let b = 32; b < 48; b++) chorusBar(b, 1.04);
  for (let b = 48; b < 52; b++) chorusBar(b, 0.9 - (b - 48) * 0.1);
  for (let b = 52; b < 56; b++) {
    hit(kick, bar(b), 0.5 - (b - 52) * 0.1);
    for (let s = 0; s < 16; s += 2) hit(hihat, bar(b) + s, (s % 4 === 2 ? 0.3 : 0.14) - (b - 52) * 0.05);
  }
  for (const [b, v] of [[8, 0.9], [24, 0.5], [32, 1], [48, 0.45]] as const) {
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
const CORE_TAPE: readonly TapeAutomation[] = [
  { step: bar(0), wow: 2, flutter: 0.6, hiss: 0.18, tone: 11000, glide: 0.05 },
  { step: bar(6), hiss: 0.7, tone: 20000, glide: 1.6 },
  { step: bar(8), wow: 0.8, flutter: 0.3, hiss: 0.06, tone: 20000, glide: 0.05 },
  { step: bar(24), wow: 2.5, flutter: 0.8, hiss: 0.25, tone: 6000, glide: 1.6 },
  { step: bar(30), hiss: 0.75, tone: 20000, glide: 1.6 },
  { step: bar(32), wow: 0.6, flutter: 0.3, hiss: 0.05, tone: 20000, glide: 0.05 },
  { step: bar(48), wow: 3, flutter: 1, hiss: 0.25, tone: 11000, glide: 2.5 },
  { step: bar(53), wow: 7, flutter: 2, hiss: 0.45, tone: 6500, glide: 3 },
];

const TRACK_META: Record<TrackType, { name: string; color: string }> = {
  lead: { name: 'PRISM BRASS', color: 'bg-neon-purple' },
  pluck: { name: 'NIGHT BUS', color: 'bg-teal-500' },
  pad: { name: 'CASSETTE STRINGS', color: 'bg-blue-800' },
  bass: { name: 'OVERPASS', color: 'bg-indigo-600' },
  fx: { name: 'FX', color: 'bg-neon-pink' },
  hihat: { name: 'HH', color: 'bg-yellow-400' },
  snare: { name: 'SD', color: 'bg-cyan-400' },
  kick: { name: 'BD', color: 'bg-red-500' },
};

// --- the rise ---------------------------------------------------------------

/**
 * One bar in front of the song, rising out of silence: the dominant of the
 * key, C-sharp sus4, its voices entering one by one on the pad, the sus4
 * falling to the leading tone on the last beat; the arpeggio coming in in
 * eighths and doubling to sixteenths, from almost nothing; a snare roll over
 * the second half; and the whole mix opening from a 900 Hz lowpass with the
 * tape hiss swelling under it, cut off at the barline where the theme begins.
 */
const RISE_SUS = chord('C#sus4', 'C#1', ['C#', 'F#', 'G#'], ['C#2', 'G#2', 'C#3', 'F#3']);
const RISE_DOM = chord('C#7', 'C#1', ['C#', 'E#', 'G#', 'B'], ['C#2', 'G#2', 'C#3', 'E#3'], 12);

function buildRise(): { notes: Partial<Record<TrackType, NoteEvent[]>>; snare: SequencerStep[] } {
  const pad = builder('pad-rise');
  pad.add(0, 'C#2', 16, 0.16);
  pad.add(4, 'G#2', 12, 0.18);
  pad.add(8, 'C#3', 8, 0.2);
  pad.add(10, 'F#3', 2, 0.21);
  pad.add(12, 'E#3', 4, 0.22);
  const pluck = builder('pluck-rise');
  const SUS = ['C#4', 'F#4', 'G#4', 'C#5', 'F#5', 'G#5', 'C#6', 'G#5'];
  const DOM = ['C#4', 'E#4', 'G#4', 'B4'];
  for (let s = 0; s < 8; s += 2) pluck.add(s, SUS[s / 2], 1, 0.06 + s * 0.02);
  for (let s = 8; s < 16; s++) pluck.add(s, s < 12 ? SUS[s - 4] : DOM[s - 12] .replace('4', '5'), 1, 0.2 + (s - 8) * 0.03);
  const snare: SequencerStep[] = Array.from({ length: STEPS_PER_BAR }, () => ({ active: false, velocity: 0 }));
  for (let s = 8; s < 16; s++) snare[s] = { active: true, velocity: Math.round((0.1 + (s - 8) * 0.035) * 1000) / 1000 };
  return { notes: { pad: pad.notes, pluck: pluck.notes }, snare };
}

const RISE_TAPE: readonly TapeAutomation[] = [
  { step: 0, wow: 2, flutter: 0.6, hiss: 0, tone: 900, glide: 0.05 },
  { step: 1, hiss: 0.34, tone: 15000, glide: 0.75 },
];

/** The tape: the rise, then the song's own moves a bar later. */
export const SUMMER_TAPE: readonly TapeAutomation[] = [
  ...RISE_TAPE,
  ...CORE_TAPE.map((t) => ({ ...t, step: t.step + bar(INTRO_BARS) })),
];

export function buildSummerTracks(): Track[] {
  const bars = harmony();
  // The pad sustains the progression, low, under the lead's chords.
  const pad = buildPad(bars, padEnergy);
  const lead = buildLead(bars, pad);
  const core: Partial<Record<TrackType, NoteEvent[]>> = {
    lead, pluck: buildPluck(bars, lead, pad), pad, bass: buildBass(bars),
  };
  const drums = buildDrums();
  const rise = buildRise();
  const shift = bar(INTRO_BARS);
  const notes: Partial<Record<TrackType, NoteEvent[]>> = {};
  for (const id of Object.keys(core) as TrackType[]) {
    notes[id] = [...(rise.notes[id] ?? []), ...core[id]!.map((n) => ({ ...n, startStep: n.startStep + shift }))];
  }
  const silent = (): SequencerStep[] => Array.from({ length: shift }, () => ({ active: false, velocity: 0 }));
  const steps: Record<'kick' | 'snare' | 'hihat' | 'fx', SequencerStep[]> = {
    kick: [...silent(), ...drums.kick],
    snare: [...rise.snare, ...drums.snare],
    hihat: [...silent(), ...drums.hihat],
    fx: [...silent(), ...drums.fx],
  };
  const order: TrackType[] = ['lead', 'pluck', 'pad', 'bass', 'fx', 'hihat', 'snare', 'kick'];
  return order.map((id) => ({
    id,
    ...TRACK_META[id],
    volume: MIX_LEVELS[id],
    isCollapsed: id === 'pad',
    isMuted: false,
    isSoloed: false,
    ...(id in notes ? { notes: notes[id] } : { steps: steps[id as keyof typeof steps] }),
  }));
}

const shifted = (r: [number, number]): [number, number] => [r[0] + INTRO_BARS, r[1] + INTRO_BARS];
export const SUMMER_SECTIONS: Record<string, [number, number]> = {
  /** One bar of rise. */
  intro: [0, INTRO_BARS],
  theme1: shifted([0, 8]), riff1: shifted([8, 24]), theme2: shifted([24, 32]), riff2: shifted([32, 48]), outro: shifted([48, 56]),
  /** The break: the first bars of the second theme, where the kit is out. */
  bridge: shifted([24, 28]),
};
export const SUMMER_CHORUS_STARTS: [number, number][] = [8, 16, 32, 40].map((b) => [b + INTRO_BARS, 0]);
export const summerHarmony = () => harmonyMap([[RISE_SUS, RISE_DOM], ...harmony()]);
