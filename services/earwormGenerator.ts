import type { NoteEvent, Track, SequencerStep } from "../types";
import { MIX_LEVELS } from "../constants";
import {
  BARS_PER_PHRASE,
  STEPS_PER_BAR,
  arrangementByName,
  isSectionTail,
  layersFor,
  type PlacedSection,
  type ResolvedArrangement,
} from "./arrangement";
import {
  harmonyByName,
  voiceLeadingByName,
  type VoiceLeadingPreset,
} from "./harmonyPresets";
import {
  SeededRng,
  type ContourClass,
  type MotifNote,
  type ScoreBreakdown,
  degreeToMidi,
  intervalSurprisal,
  midiToNoteName,
  mod,
  pitchRange,
  scoreMotif,
  ATYPICAL_GRADIENT_BITS,
  TARGETS,
} from "./earwormAnalysis";

/**
 * The darkwave earworm engine.
 *
 * Structure follows earworm.md §1: an explicit generate -> score -> optimize
 * loop. The builder below is deliberately stochastic rather than perfect; the
 * scorer in earwormAnalysis.ts is what decides which candidate survives, and
 * the mutation pass is what turns a good phrase into the A/A' pair the spec
 * asks for. Every constraint the spec states numerically is either enforced
 * here or measured by the scorer — see scripts/verifyEarworm.ts for the proof.
 */

// --- MUSIC THEORY CORE ---

/**
 * Scales, as semitone offsets from the tonic.
 *
 * All seven-note, because everything downstream — the chord palettes, the
 * degree arithmetic in degreeToMidi, the cadence targets — is written in
 * seven-degree steps. A pentatonic or octatonic scale is not a change of
 * table here, it is a change of that arithmetic, so it is out of scope.
 *
 * The first three are the original set. The rest are the modes the genre
 * actually reaches for: Phrygian for the flat second that gives goth its
 * Spanish/Middle-Eastern edge, melodic minor for a raised 6th and 7th over a
 * minor third, and the two "gypsy" scales built on an augmented second, which
 * is the interval that makes a line sound Eastern rather than merely minor.
 * Two major-side modes are included because darkwave is not exclusively minor:
 * Mixolydian (major with a flat 7) and Lydian (major with a raised 4th).
 *
 * Hungarian minor was tried and dropped. It has two augmented seconds rather
 * than one, so routing a passing note around the first lands it on the second,
 * and it measured 76% stepwise motion against the 85% floor even after that
 * routing — it cannot meet the constraint this generator declares. Phrygian
 * dominant carries the same Eastern colour with one augmented second and
 * passes at 88%.
 */
const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],        // Natural minor
  ionian: [0, 2, 4, 5, 7, 9, 11],         // Natural major
  dorian: [0, 2, 3, 5, 7, 9, 10],         // Minor with major 6
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11], // Raised 7 (spec: cadences only)
  phrygian: [0, 1, 3, 5, 7, 8, 10],       // Minor with a flat 2
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],  // Ascending form: raised 6 and 7
  mixolydian: [0, 2, 4, 5, 7, 9, 10],     // Major with a flat 7
  lydian: [0, 2, 4, 6, 7, 9, 11],         // Major with a raised 4
  minor_pentatonic: [0, 2, 3, 5, 7, 8, 10],  // Aeolian; the melody uses five of it
  major_pentatonic: [0, 2, 4, 5, 7, 9, 11],  // Ionian; the melody uses five of it
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10], // Hijaz: flat 2 over a major 3
  double_harmonic: [0, 1, 4, 5, 7, 8, 11], // Flat 2, major 3, flat 6, major 7
} as const;

/**
 * Pentatonic modes, expressed as a parent scale plus the degrees the melody
 * favours, rather than as five-note scales.
 *
 * A real five-note scale would mean changing the degree arithmetic everywhere,
 * and it would break the harmony: the pad stacks scale thirds as
 * [d, d+2, d+4], which in a five-note scale is not a triad. More to the point,
 * a strictly pentatonic melody cannot satisfy §3.3 at all — minor pentatonic
 * runs 3-2-2-3-2 semitones, so two of its five adjacent moves are minor
 * thirds, and the stepwise band tops out around 0.6 against a 0.7 floor.
 *
 * Which is not how the scale is used anyway. A pentatonic melody in pop lands
 * on the five tones and passes through the others; the parent scale supplies
 * the passing notes and the chords. So these bias the anchors — the notes on
 * strong beats, where the ear places the scale — and leave the fill free.
 */
const PENTATONIC_DEGREES: Record<string, number[]> = {
  minor_pentatonic: [0, 2, 3, 4, 6], // 1 b3 4 5 b7
  major_pentatonic: [0, 1, 2, 4, 5], // 1 2 3 5 6
};

/**
 * Keys. The transposition is applied in semitones at the point where a degree
 * becomes a pitch, so nothing above it has to know about it.
 *
 * Always upward, never folded down. Folding the upper keys to negative offsets
 * looked tidier — it keeps every key within a tritone of C — but it puts the
 * bass tonic of F# at MIDI 18, about 23 Hz, underneath the 28 Hz subsonic
 * filter in the mastering chain. Those keys would have lost their fundamental
 * entirely. Transposing up instead puts the bass tonic between C1 (33 Hz) and
 * B1 (62 Hz), which is where a bass belongs, and takes the lead no higher than
 * roughly A5.
 */
export const KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;
export type GenKey = typeof KEYS[number];

export function keyOffset(key: GenKey): number {
  return Math.max(0, KEYS.indexOf(key));
}

const PHRASE_STEPS = STEPS_PER_BAR * BARS_PER_PHRASE;
/** One-bar cell, repeated 4x across the phrase (§3.3 "hook glue"). */
const CELL_LENGTH = STEPS_PER_BAR;
/** §5 default grid is 8th notes; 16ths are the exception, not the rule. */
const EIGHTHS_PER_BAR = 8;

/**
 * §3.2 canonical darkwave loops, in diatonic degrees.
 * 0=i 2=bIII 3=iv 4=v 5=bVI 6=bVII. Degree 1 (ii dim) is never used — the spec
 * does not sanction it and the old weight table admitted it by accident.
 */
const DARKWAVE_LOOPS: readonly (readonly number[])[] = [
  [0, 6, 5, 6], // i - bVII - bVI - bVII
  [0, 5, 6, 0], // i - bVI - bVII - i
  [0, 3, 6, 5], // i - iv - bVII - bVI
  [0, 6, 0, 5], // i - bVII - i - bVI
  [0, 5, 2, 6], // i - bVI - bIII - bVII
  [0, 6, 3, 0], // i - bVII - iv - i
];

/**
 * Chord palettes per mode.
 *
 * §3.2's loop templates are written for Aeolian, where bVI and bVII are major.
 * Applying them unchanged to the other modes produced chords that do not exist
 * there: in Dorian the triad on the natural 6th is diminished, which is why a
 * measurement across twelve songs found 716 tritones sounding between tracks
 * against Aeolian's 133. In harmonic minor the triad on the raised 7th is
 * diminished and the one on b3 is augmented.
 *
 * Each mode therefore gets the chords it actually has. Harmonic minor keeps
 * the palette it exists for: i - iv - V - bVI, where V is major because its
 * third is the leading tone.
 */
const CHORD_PALETTES: Record<string, number[]> = {
  aeolian: [0, 2, 3, 4, 5, 6],
  // Ionian: everything but the diminished triad on the seventh.
  ionian: [0, 1, 2, 3, 4, 5],
  // The pentatonics take their parent's palette; the scale restriction is a
  // melodic one, and restricting the chords too would leave two of them.
  minor_pentatonic: [0, 2, 3, 4, 5, 6],
  major_pentatonic: [0, 1, 2, 3, 4, 5],
  dorian: [0, 2, 3, 4, 6],          // IV is major here and is the mode's colour
  harmonic_minor: [0, 3, 4, 5],
  // Phrygian: the triad on b2 is major and is the whole point of the mode.
  // The one on the 5th is diminished here, so it is left out.
  phrygian: [0, 1, 2, 3, 5, 6],
  // Melodic minor: i is minor, IV and V are major, the triads on b3 and the
  // 6th are augmented and diminished respectively and are excluded.
  melodic_minor: [0, 3, 4],
  // Phrygian dominant: I is major, and the triads on b2 and iv are usable.
  // This is the fifth mode of harmonic minor, so it inherits that palette.
  phrygian_dominant: [0, 1, 3, 5],
  // Double harmonic: i is major, and so are the triads on b2 and b6. The rest
  // contain the augmented second and are not triads in any usable sense.
  double_harmonic: [0, 1, 5],
  // Mixolydian: I, IV and v are the usable triads, bVII is the mode's colour.
  mixolydian: [0, 3, 4, 6],
  // Lydian: I, II and V, with the raised 4th showing up as a major II.
  lydian: [0, 1, 4, 5],
};

/**
 * The scale degrees a melody reaches for as colour, per mode.
 *
 * This was `mode === 'dorian' ? [5] : [5, 6]` — the flat sixth and flat
 * seventh, which are the colours of Aeolian and of nothing else. Applied to
 * the major-side modes it asks the melody to lean on the sixth and the leading
 * tone, and the leading tone sits a semitone under the tonic, so on a I chord
 * it is a clash rather than a colour. Chord agreement on strong beats measured
 * 67% in Ionian against 88% overall.
 *
 * Each mode now names the degrees that actually carry its identity: the flat
 * second in Phrygian, the raised fourth in Lydian, the flat seventh in
 * Mixolydian, the second and sixth in Ionian — the added tones of pop major,
 * which colour a chord without fighting it.
 */
const COLOUR_TONES_BY_MODE: Record<string, number[]> = {
  aeolian: [5, 6],
  ionian: [1, 5],
  dorian: [5],
  harmonic_minor: [5, 6],
  phrygian: [1, 5],
  melodic_minor: [5, 6],
  mixolydian: [6],
  lydian: [3],
  minor_pentatonic: [5, 6],
  major_pentatonic: [1, 5],
  phrygian_dominant: [1, 5],
  double_harmonic: [1, 5],
};

/** Chords that can host the twist (§7: align surprise with bVI or bVII). */
const COLOUR_CHORDS_BY_MODE: Record<string, number[]> = {
  aeolian: [5, 6],
  ionian: [3, 5],              // IV and vi, the two every pop song turns to.
  minor_pentatonic: [5, 6],
  major_pentatonic: [3, 5],
  dorian: [6],
  harmonic_minor: [5],
  phrygian: [1, 6],       // The flat-second major triad is the mode's surprise.
  melodic_minor: [3, 4],  // The major IV and V over a minor third.
  phrygian_dominant: [1, 5],
  double_harmonic: [1, 5],
  mixolydian: [6],        // bVII, the flat seventh.
  lydian: [1],            // II, carrying the raised fourth.
};

/** Pad voicing register: degree 14 is C3, so the triad lands between C3 and A#3. */
const PAD_REGISTER_BASE = 14;

/** §3.3 phrase-ending targets: scale degrees 1, b3, 5 (0-indexed). */
const CADENCE_DEGREES = [0, 2, 4];

/**
 * §4 tempo bands per substyle, and the upward bias §2.1C requires.
 * `biasFloor` is the fraction of the band below which we never draw, which is
 * what makes "bias BPM upward" an actual property of the output rather than a
 * comment.
 */
const TEMPO_BANDS: Record<string, { lo: number; hi: number }> = {
  'four-floor': { lo: 118, hi: 146 }, // clubby / EBM-leaning
  breakbeat: { lo: 100, hi: 132 },
  tribal: { lo: 95, hi: 124 },        // cold darkwave
};
export const TEMPO_BIAS_FLOOR = 0.5;

/**
 * §5 rhythm cells, one bar of eighth notes each. The five-onset entries are the
 * spec's own examples ("X . X X . X . X" and "X X . X . X X ."); the sparser
 * ones let the density control select a smaller motif.
 *
 * §4.1 wants 6-10 notes per 1-2 bars. A 4-bar phrase is therefore 12-20 notes,
 * and since one bar carries the contrasting syncopation, these cells give
 * 13, 17 or 21. The previous cells produced 30-40 notes per phrase, which is
 * why every melody dissolved into wobble instead of reading as a motif.
 */
const CELL_TEMPLATES: readonly (readonly number[])[] = [
  [1, 0, 0, 1, 0, 0, 1, 0], // 3 — sparse motor
  [1, 0, 0, 1, 0, 1, 0, 0], // 3 — tresillo-ish
  [1, 0, 1, 0, 1, 0, 1, 0], // 4 — straight eighths
  [1, 0, 0, 1, 0, 1, 0, 1], // 4 — gallop
  [1, 0, 1, 1, 0, 1, 0, 1], // 5 — spec example
  [1, 1, 0, 1, 0, 1, 1, 0], // 5 — spec example
];

/** §3.3 contrasting syncopation lands on beat 2+ or 4+ (eighth 3 or 7). */
const SYNCOPATION_EIGHTHS = [3, 7];

/**
 * §4.1 leap budget. One headline leap per 2 bars, so a 4-bar phrase carries
 * 2-3 leaps including the twist. This is what holds the stepwise ratio inside
 * the 70-90% window from both directions.
 */
const LEAPS_PER_PHRASE = { min: 2, max: 3 };
/** A move of 1 scale step is a melodic step; 2+ is a leap. */
const MAX_STEP_MOVE = 1;
const MAX_LEAP_MOVE = 3;

// --- GENERATOR TYPES ---

export type GenMode = keyof typeof MODES;
export type GenContour = 'arch' | 'descent' | 'wave' | 'random';
export type GenHarmonicMotion = 'conjunct' | 'disjunct' | 'static';
export type GenBass = 'driving' | 'sustained' | 'acid' | 'walking';
export type GenDrums = 'four-floor' | 'breakbeat' | 'tribal';

export interface GeneratorSettings {
  totalSteps: number;
  mode: GenMode;
  harmonicMotion: GenHarmonicMotion;
  contour: GenContour;
  rhythmDensity: number; // 0.0 - 1.0
  entropy: number;       // 0.0 - 1.0, twist intensity
  bassMode: GenBass;
  drumMode: GenDrums;
  /** Optional seed; omit for a fresh random song, supply for reproducibility. */
  seed?: number;
  /** Form template by name; see ARRANGEMENT_PRESETS. */
  arrangement?: string;
  /** Chord loop by name; see HARMONY_PRESETS. */
  harmony?: string;
  /** Melodic conduct by name; see VOICE_LEADING_PRESETS. */
  voiceLeading?: string;
  /** Reuse a previous song's decisions instead of searching for new ones. */
  plan?: SongPlan;
  /** Rebuild only these tracks; the caller keeps the rest. Requires a plan. */
  only?: readonly string[];
  /** Tonic. Defaults to C, which is what every song was before this existed. */
  key?: GenKey;
  /**
   * Search for a new hook even though a plan was supplied. The plan's tempo
   * and chords are still reused, so a rebuilt lead sits in the same song.
   */
  rehook?: boolean;
}

export interface GenerationResult {
  tracks: Track[];
  /** §2.1C — the generator now chooses tempo instead of leaving it to the UI. */
  bpm: number;
  /** Why this hook won: the §8 score of the phrase that was selected. */
  analysis: ScoreBreakdown;
  /** Reproduces this exact song. */
  seed: number;
  /** The 4-bar hook that won the search, and the A' that answers it. */
  hook: MotifNote[];
  variation: MotifNote[];
  /** Onset grid of the hook, for anyone who wants to see the rhythmic cell. */
  hookOnsets: boolean[];
  /** Everything needed to rebuild this song without searching again. */
  plan: SongPlan;
}

/**
 * The decisions a song is made of, separated from the notes they produced.
 *
 * Handing this back lets a caller keep a melody it likes and rebuild the rest
 * around it — a different structure, a regenerated bass line — without the
 * search running again and returning a different hook. Without it, every
 * change means a new song.
 */
export interface SongPlan {
  bpm: number;
  chordLoop: number[];
  hook: MotifNote[];
  variation: MotifNote[];
  hookOnsets: boolean[];
  twistBar: number;
  mode: GenMode;
  arrangement: string;
  analysis: ScoreBreakdown;
  /** Optional so plans saved before keys existed still load, as C. */
  key?: GenKey;
  /**
   * The kick's bar pattern. The bass is written against it — which notes it
   * keeps depend on where the kick lands — so rebuilding the bass alone used
   * to lock it to a kick pattern that was never returned and is not the one
   * playing. Optional for plans written before this was stored.
   */
  kickPattern?: number[];
}

interface PhraseRhythm {
  onsets: boolean[];      // PHRASE_STEPS long
  twistBar: number;
}

interface Candidate {
  notes: MotifNote[];
  rhythm: PhraseRhythm;
  score: ScoreBreakdown;
}

export class EarwormGenerator {

  generate(config: GeneratorSettings): GenerationResult {
    const seed = config.seed ?? Math.floor(Math.random() * 0xffffffff);
    const rng = new SeededRng(seed);

    const scaleIntervals = MODES[config.mode];
    // Applied where a degree becomes a pitch, so nothing above this line has
    // to know which key the song is in: the scoring, the contour analysis and
    // the interval rules are all transposition-invariant by construction.
    // An explicit key wins over the plan's. The plan's is a fallback, for a
    // plan loaded from a file by a caller that does not know what key it was
    // in; letting it win meant a held hook pinned the key selector, and moving
    // a melody to another key is a transposition, not a different melody.
    // Every part of one song is generated with the same setting, so a track
    // rebuilt on its own still lands in the key the rest is in.
    const transpose = keyOffset(config.key ?? config.plan?.key ?? 'C');

    // §2.1C tempo bias, chosen before the hook so §5's density compensation
    // can react to a slow tempo.
    const plan = config.plan;
    const bpm = plan ? plan.bpm : this.chooseTempo(rng, config.drumMode);
    const band = TEMPO_BANDS[config.drumMode] ?? TEMPO_BANDS['four-floor'];
    const tempoPosition = (bpm - band.lo) / (band.hi - band.lo);
    // §5: "if your darkwave is very slow, compensate with rhythmic repetition
    // and density in the hook".
    const ornament = clamp01(config.rhythmDensity + (1 - tempoPosition) * 0.15);
    // The motif's own density is deliberately a narrower reading of the knob.
    const hookDensity = clamp01(config.rhythmDensity);

    const arrangement = arrangementByName(config.arrangement);
    const harmony = harmonyByName(config.harmony);
    const voicing = voiceLeadingByName(config.voiceLeading);

    // A named progression is used as given; 'Auto' keeps the weighted walk.
    const chordLoop = plan
      ? [...plan.chordLoop]
      : harmony.loop
        ? this.fitLoopToMode([...harmony.loop], rng, config.mode)
        : this.generateProgression(rng, config.harmonicMotion, config.mode);
    const totalSteps = Math.max(PHRASE_STEPS, config.totalSteps || arrangement.steps);
    const chords = this.expandChords(chordLoop, totalSteps, arrangement);

    // §1 / §8 — generate N, score, keep top K, mutate, take the best.
    const ctx: BuildContext = {
      scaleIntervals,
      chordLoop,
      contour: config.contour,
      density: hookDensity,
      twist: config.entropy,
      modeName: config.mode,
      voicing,
      pentatonic: PENTATONIC_DEGREES[config.mode],
    };

    // A supplied plan replaces the search entirely: the melody that was liked
    // is the melody that plays, whatever else changes around it.
    let best: Candidate;
    let variation: Candidate;
    // A plan supplies the tempo and the chords whether or not the hook is
    // being kept. `rehook` is what lets a lead be rebuilt: without it the
    // melody comes from the plan and is identical every time, which is why the
    // lead's rebuild button did nothing at all.
    if (plan && !config.rehook) {
      const rhythm: PhraseRhythm = { onsets: [...plan.hookOnsets], twistBar: plan.twistBar };
      best = {
        notes: plan.hook.map((n) => ({ ...n })),
        rhythm,
        score: plan.analysis,
      };
      variation = {
        notes: plan.variation.map((n) => ({ ...n })),
        rhythm,
        score: plan.analysis,
      };
    } else {
      best = this.searchHook(rng, ctx);
      variation = this.mutate(rng, best, ctx);
    }

    const wanted = config.only ? new Set(config.only) : null;
    const build = (id: string) => !wanted || wanted.has(id);

    // Rebuilding the kick itself is the one case that must be free to choose a
    // new pattern; everything else inherits the one the plan carries.
    const rebuildingKick = config.only?.length === 1 && config.only[0] === 'kick';
    const inheritKick = plan?.kickPattern && !rebuildingKick;
    const { drumTracks, kickPattern } = this.generateDrums(
      rng, totalSteps, config.drumMode, best, ornament, arrangement,
      inheritKick ? plan!.kickPattern : undefined,
      rebuildingKick ? plan?.kickPattern : undefined);
    const tracks: Track[] = [];

    if (build('lead')) tracks.push(this.renderLead(transpose, totalSteps, best, variation, scaleIntervals, arrangement));
    if (build('pluck')) tracks.push(this.generateCounterMelody(rng, transpose, totalSteps, chords, best, scaleIntervals, ornament, arrangement));
    if (build('pad')) tracks.push(this.generateAtmosphere(rng, transpose, totalSteps, chords, scaleIntervals, arrangement));
    if (build('bass')) tracks.push(this.generateBass(rng, transpose, totalSteps, chords, kickPattern, config.bassMode, scaleIntervals, arrangement));
    for (const drum of drumTracks) if (build(drum.id)) tracks.push(drum);

    return {
      tracks,
      bpm,
      analysis: best.score,
      seed,
      hook: best.notes,
      variation: variation.notes,
      hookOnsets: best.rhythm.onsets,
      plan: {
        bpm,
        chordLoop,
        hook: best.notes.map((n) => ({ ...n })),
        variation: variation.notes.map((n) => ({ ...n })),
        hookOnsets: [...best.rhythm.onsets],
        twistBar: best.rhythm.twistBar,
        mode: config.mode,
        arrangement: arrangement.name,
        analysis: best.score,
        key: config.key ?? 'C',
        kickPattern: [...kickPattern],
      },
    };
  }

  // --- §2.1C TEMPO ---------------------------------------------------------

  private chooseTempo(rng: SeededRng, drumMode: GenDrums): number {
    const band = TEMPO_BANDS[drumMode] ?? TEMPO_BANDS['four-floor'];
    // Draw only from the upper part of the stylistic band.
    const position = TEMPO_BIAS_FLOOR + rng.next() * (1 - TEMPO_BIAS_FLOOR);
    return Math.round(band.lo + position * (band.hi - band.lo));
  }

  // --- §3.2 HARMONY --------------------------------------------------------

  /**
   * A named progression may name a chord the chosen mode does not have — the
   * §3.2 loops are Aeolian, and Dorian's triad on the natural 6th is
   * diminished while harmonic minor's on b3 is augmented. Substitute the
   * nearest chord the mode does have rather than sounding one it does not.
   */
  private fitLoopToMode(loop: number[], rng: SeededRng, mode: GenMode): number[] {
    const palette = CHORD_PALETTES[mode] ?? CHORD_PALETTES.aeolian;
    return loop.map((degree) => {
      if (palette.includes(degree)) return degree;
      let best = palette[0];
      let bestDistance = Infinity;
      for (const candidate of palette) {
        const diff = Math.min(mod(candidate - degree, 7), mod(degree - candidate, 7));
        if (diff < bestDistance) { bestDistance = diff; best = candidate; }
      }
      void rng;
      return best;
    });
  }

  private generateProgression(
    rng: SeededRng,
    motion: GenHarmonicMotion,
    mode: GenMode,
  ): number[] {
    const palette = CHORD_PALETTES[mode] ?? CHORD_PALETTES.aeolian;
    const colours = COLOUR_CHORDS_BY_MODE[mode] ?? COLOUR_CHORDS_BY_MODE.aeolian;
    let loop: number[];

    if (motion === 'static') {
      // Drone: hold the tonic, move only to a colour chord.
      loop = [0, 0, rng.pick(colours), 0];
    } else {
      // Only use a spec template if this mode actually has all of its chords.
      const usable = DARKWAVE_LOOPS.filter((l) => l.every((d) => palette.includes(d)));
      loop = usable.length && rng.chance(0.6)
        ? [...rng.pick(usable)]
        : this.walkProgression(rng, motion, palette);
    }

    // §7 needs a colour chord to hang the twist on. Guarantee one exists.
    if (!loop.some((d) => colours.includes(d))) {
      loop[2] = rng.pick(colours);
    }
    return loop;
  }

  /** Weighted walk restricted to the darkwave palette (no ii dim). */
  private walkProgression(
    rng: SeededRng,
    motion: GenHarmonicMotion,
    palette: number[],
  ): number[] {
    const loop = [0];
    let current = 0;

    for (let i = 1; i < BARS_PER_PHRASE; i++) {
      const weights = palette.map((degree) => {
        if (degree === current) return 0.4; // discourage, don't forbid, repeats
        if (motion === 'conjunct') {
          // Flat-side stepwise flow: the goth sound.
          if (current === 0) return degree === 5 ? 8 : degree === 6 ? 6 : 1.5;
          if (current === 5) return degree === 6 ? 8 : degree === 0 ? 4 : 1.5;
          if (current === 6) return degree === 0 ? 8 : degree === 5 ? 5 : 1.5;
          if (current === 4) return degree === 5 ? 5 : degree === 0 ? 3 : 1.5;
          if (current === 3) return degree === 4 ? 5 : degree === 2 ? 3 : 1.5;
          return 1.5;
        }
        // disjunct: angular, more dramatic
        if (current === 0) return degree === 3 ? 8 : degree === 4 ? 6 : degree === 2 ? 4 : 1;
        if (current === 3) return degree === 6 ? 6 : degree === 0 ? 4 : 1;
        if (current === 2) return degree === 5 ? 8 : degree === 0 ? 2 : 1;
        if (current === 4) return degree === 0 ? 10 : 1;
        if (current === 5) return degree === 0 ? 5 : degree === 2 ? 3 : 1;
        return 1;
      });
      current = rng.weighted(palette, weights);
      loop.push(current);
    }
    return loop;
  }

  /**
   * Chords are indexed by the bar's position *within its section*, not by the
   * absolute bar. Sections are two or four bars long, so an absolute index
   * would slide the loop out of phase: VERSE 1 starts on bar 2, and the hook
   * written for chord 1 of the loop would have landed on chord 3. Restarting
   * the progression with each section is also what a section is.
   */
  private expandChords(
    loop: number[],
    totalSteps: number,
    arrangement: ResolvedArrangement,
  ): number[] {
    const chords: number[] = [];
    for (let step = 0; step < totalSteps; step++) {
      const section = arrangement.sectionAtBar(Math.floor(step / STEPS_PER_BAR));
      chords.push(loop[section.barInSection % loop.length]);
    }
    return chords;
  }

  // --- §1/§8 GENERATE -> SCORE -> OPTIMIZE ---------------------------------

  private searchHook(rng: SeededRng, ctx: BuildContext): Candidate {
    const CANDIDATES = 48;
    const SURVIVORS = 6;
    const MUTATIONS = 6;

    const pool: Candidate[] = [];
    for (let i = 0; i < CANDIDATES; i++) {
      pool.push(this.buildCandidate(rng, ctx));
    }
    pool.sort((a, b) => b.score.total - a.score.total);

    // Refine the survivors: a one-note change is cheap and often repairs the
    // exact term that was costing the candidate its score.
    const refined: Candidate[] = [];
    for (const survivor of pool.slice(0, SURVIVORS)) {
      refined.push(survivor);
      for (let m = 0; m < MUTATIONS; m++) {
        refined.push(this.mutateCandidate(rng, survivor, ctx));
      }
    }
    refined.sort((a, b) => b.score.total - a.score.total);
    return refined[0];
  }

  private buildCandidate(rng: SeededRng, ctx: BuildContext): Candidate {
    const rhythm = this.buildRhythm(rng, ctx);
    const notes = this.buildMelody(rng, rhythm, ctx);
    return { notes, rhythm, score: this.score(notes, rhythm, ctx) };
  }

  private score(notes: MotifNote[], rhythm: PhraseRhythm, ctx: BuildContext): ScoreBreakdown {
    return scoreMotif({
      notes,
      scaleIntervals: ctx.scaleIntervals,
      modeName: ctx.modeName,
      onsets: rhythm.onsets,
      cellLength: CELL_LENGTH,
      barsInPhrase: BARS_PER_PHRASE,
      targetContours: this.targetContours(ctx.contour),
    });
  }

  /** §2.1A "common global contour" — the classes we accept as typical. */
  private targetContours(contour: GenContour): ContourClass[] {
    if (contour === 'arch') return ['arch'];
    if (contour === 'descent') return ['descent'];
    if (contour === 'wave') return ['wave', 'valley'];
    return ['arch', 'descent']; // 'random' still restricts to common shapes
  }

  // --- §3.3/§5 RHYTHM ------------------------------------------------------

  private buildRhythm(rng: SeededRng, ctx: BuildContext): PhraseRhythm {
    // Density moves the motif between four and five onsets a bar, and no
    // further. Letting it swing from three to five rewrote the hook wholesale
    // every time the knob moved, which is what made the control feel like it
    // was destabilising the song rather than varying it. The rest of the knob
    // goes to ornament — fills, answers, hats — which decorate the structure
    // instead of replacing it.
    const wantedOnsets = 4 + Math.round(clamp01(ctx.density));
    const sized = CELL_TEMPLATES.filter(
      (t) => t.reduce((a: number, b) => a + b, 0) === wantedOnsets,
    );
    const template = rng.pick(sized.length ? sized : CELL_TEMPLATES);
    const eighths = template.map(Boolean);

    const twistBar = rng.pick([1, 2]); // interior bar, so the turn has neighbours

    // One cell, generated once and reused verbatim: the repetition is the hook
    // glue, so it must not be re-rolled per bar.
    const cell = this.expandCell(eighths, rng, ctx.density);

    // §3.3 one contrasting syncopation, on beat 2+ or 4+.
    const contrastEighths = [...eighths];
    contrastEighths[rng.pick(SYNCOPATION_EIGHTHS)] = true;
    const contrast = this.expandCell(contrastEighths, rng, ctx.density);

    const onsets: boolean[] = [];
    for (let bar = 0; bar < BARS_PER_PHRASE; bar++) {
      onsets.push(...(bar === twistBar ? contrast : cell));
    }
    return { onsets, twistBar };
  }

  /**
   * Eighth-note cell -> 16th-note grid.
   *
   * §5 allows 16ths "sparingly", so a 16th here *displaces* an eighth rather
   * than adding to it. That keeps the onset count exactly what the template
   * chose while still letting the cell push against the grid.
   */
  private expandCell(eighths: boolean[], rng: SeededRng, density: number): boolean[] {
    const steps: boolean[] = new Array(STEPS_PER_BAR).fill(false);
    for (let e = 0; e < EIGHTHS_PER_BAR; e++) {
      if (!eighths[e]) continue;
      const displaced = e > 0 && rng.chance(density * 0.1);
      steps[e * 2 + (displaced ? 1 : 0)] = true;
    }
    steps[0] = true; // anchor on beat 1 (§5)
    return steps;
  }

  // --- §3.3/§4/§7 MELODY ---------------------------------------------------

  /**
   * Build the hook against the harmony, not merely alongside it.
   *
   * The previous order of operations generated a contour, smoothed it into a
   * stepwise line, and only then tried to nudge strong beats onto chord tones
   * by at most one scale step — a nudge it declined whenever that would break
   * the stepwise rule. Measured across twelve songs, the lead landed on a
   * chord tone on beats 1 and 3 barely half the time, so the melody drifted
   * against its own accompaniment.
   *
   * Now the strong beats are chosen first, from the chord (§6), at whatever
   * register the contour skeleton asks for. The notes in between are filled by
   * stepwise motion from one anchor to the next, which is how the constraint
   * in §3.3 and the one in §6 stop fighting each other: the harmony owns the
   * skeleton, the voice-leading owns the spaces.
   */
  private buildMelody(rng: SeededRng, rhythm: PhraseRhythm, ctx: BuildContext): MotifNote[] {
    const positions: number[] = [];
    rhythm.onsets.forEach((on, step) => { if (on) positions.push(step); });
    if (positions.length < 4) return [];

    const contour = this.pickContour(rng, ctx.contour);
    const amplitude = rng.range(ctx.voicing.amplitude[0], ctx.voicing.amplitude[1]);
    const skeleton = this.contourSkeleton(contour, positions.length, amplitude);

    // Degree 21 is C4. Picking the base from the cadence degrees also makes
    // the phrase land on 1, b3 or 5 by construction. Range and contour are
    // transposition-invariant, so this does not disturb the measurements.
    const base = 21 + rng.pick(CADENCE_DEGREES);
    const degrees = skeleton.map((offset) => base + offset);

    // --- 1. anchor beats 1 and 3 on the bar's chord (§6) -------------------
    //
    // Anchor whatever is *sounding* on the beat, not only a note that starts
    // exactly on it. The rhythm cells are syncopated — "X . X X . X . X" has
    // no onset on beat 3 at all — so insisting on an exact hit left the strong
    // beats covered by unanchored filler, and the melody drifted off the chord
    // exactly where the ear checks it.
    const anchors: number[] = [];
    for (let bar = 0; bar < BARS_PER_PHRASE; bar++) {
      const chord = ctx.chordLoop[bar % ctx.chordLoop.length];
      for (const beatStep of [0, 8]) {
        const target = bar * STEPS_PER_BAR + beatStep;
        const index = this.soundingAt(positions, target, bar);
        if (index < 0 || anchors.includes(index)) continue;
        degrees[index] = this.chooseAnchorDegree(rng, degrees[index], chord, ctx);
        anchors.push(index);
      }
    }
    anchors.sort((a, b) => a - b);

    // Treat the phrase ends as anchors so no span is left dangling.
    if (anchors[0] !== 0) anchors.unshift(0);
    const last = degrees.length - 1;
    if (anchors[anchors.length - 1] !== last) anchors.push(last);

    // --- 2. fill the spaces with stepwise voice leading --------------------
    for (let a = 0; a < anchors.length - 1; a++) {
      this.fillSpan(rng, degrees, skeleton, anchors[a], anchors[a + 1], ctx.voicing.maxFillMove, ctx.scaleIntervals);
    }

    // --- 3. the one uncommon gradient (§2.1B / §7) -------------------------
    this.applyTwist(rng, degrees, positions, rhythm.twistBar, new Set(anchors), ctx);

    // --- 4. cadence (§3.3) -------------------------------------------------
    this.applyCadence(degrees);

    return degrees.map((degree, i) => ({ step: positions[i], degree, alteration: 0 }));
  }

  /** Index of the note sounding at `target`: the last onset at or before it. */
  private soundingAt(positions: readonly number[], target: number, bar: number): number {
    const barStart = bar * STEPS_PER_BAR;
    let best = -1;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] < barStart) continue;
      if (positions[i] > target) break;
      best = i;
    }
    // Nothing before the beat in this bar: take the first note after it.
    if (best < 0) {
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] >= target && positions[i] < barStart + STEPS_PER_BAR) return i;
      }
    }
    return best;
  }

  /**
   * §6 weighted choice on a strong beat: chord tone, modal colour, or skeleton.
   *
   * The modal colour option is filtered against the chord actually sounding.
   * §6 offers it as "a scale tone that defines the mode", but the pad holds a
   * full triad for the whole bar, so an unfiltered b6 over a chord containing
   * the fifth is a held minor second, not colour. That single case accounted
   * for most of the clashes a render turned up: lead G# against pad G,
   * sustained.
   */
  private chooseAnchorDegree(
    rng: SeededRng,
    target: number,
    chord: number,
    ctx: BuildContext,
  ): number {
    // In a pentatonic mode the anchors are held to the five tones and the fill
    // between them is left alone. That is where the ear places a scale: on the
    // notes that land on the beat, not on the ones passed through.
    const allowed = (candidates: number[]): number[] => {
      if (!ctx.pentatonic) return candidates;
      const kept = candidates.filter((d) => ctx.pentatonic!.includes(mod(d, 7)));
      return kept.length ? kept : candidates;
    };
    const tones = allowed([chord, chord + 2, chord + 4].map((d) => mod(d, 7)));
    const roll = rng.next();
    // The style decides how firmly a strong beat locks to the chord; §6's own
    // figure is 0.65, and every preset here sits at or above it.
    const lock = ctx.voicing.chordToneBias;
    const colourUntil = lock + (1 - lock) * 0.72;

    if (roll >= lock && roll < colourUntil) {
      const wanted = allowed(COLOUR_TONES_BY_MODE[ctx.modeName] ?? [5, 6]);
      const safe = wanted.filter((d) => !this.clashesWithChord(d, tones, ctx.scaleIntervals));
      if (safe.length) return this.nearestDegree(target, safe);
      // No safe colour tone against this chord: take a chord tone instead.
    } else if (roll >= colourUntil) {
      // The one branch that takes whatever the contour asked for. It still has
      // to be one of the five when the mode is pentatonic.
      return ctx.pentatonic ? this.nearestDegree(target, ctx.pentatonic) : target;
    }
    return this.nearestDegree(target, tones);
  }

  /** True when `degree` sits a semitone from any tone of the sounding chord. */
  private clashesWithChord(
    degree: number,
    chordTones: number[],
    scaleIntervals: readonly number[],
  ): boolean {
    const pitch = scaleIntervals[mod(degree, 7)];
    return chordTones.some((tone) => {
      const diff = mod(pitch - scaleIntervals[mod(tone, 7)], 12);
      return Math.min(diff, 12 - diff) === 1;
    });
  }

  /**
   * Walk from one anchor to the next in steps, borrowing the skeleton's local
   * shape so a span that starts and ends on the same pitch still moves.
   */
  private fillSpan(
    rng: SeededRng,
    degrees: number[],
    skeleton: readonly number[],
    a: number,
    b: number,
    maxMove: number,
    scaleIntervals: readonly number[],
  ): void {
    const gap = b - a;
    if (gap < 2) return;

    const startDegree = degrees[a];
    const delta = degrees[b] - startDegree;
    // One neighbour direction per span, so the filler reads as a gesture
    // rather than as noise.
    const arcDirection = delta === 0 ? (rng.chance(0.5) ? 1 : -1) : Math.sign(delta);
    const skeletonSpan = skeleton[b] - skeleton[a];

    for (let k = 1; k < gap; k++) {
      const fraction = k / gap;
      let value = startDegree + delta * fraction;

      // Local deviation of the contour skeleton from a straight line.
      const shape = skeleton[a + k] - (skeleton[a] + skeletonSpan * fraction);
      value += shape;

      if (Math.abs(delta) < gap - 1) {
        value += Math.sin(fraction * Math.PI) * arcDirection * 0.8;
      }
      degrees[a + k] = Math.round(value);
    }

    // Keep every move inside the span a step or a small leap; the anchors
    // themselves supply the wider intervals.
    for (let k = 1; k < gap; k++) {
      const i = a + k;
      const move = degrees[i] - degrees[i - 1];
      if (Math.abs(move) > maxMove) degrees[i] = degrees[i - 1] + Math.sign(move) * maxMove;
    }

    /**
     * Route the passing notes around an augmented second.
     *
     * Hungarian minor and the double harmonic scale put three semitones
     * between two adjacent degrees. Everything above this line counts moves in
     * degrees, so a "step" there is a minor third — and the §3.3 stepwise
     * measure, which counts semitones, read those scales at 75% and 80%
     * against an 85% floor.
     *
     * That interval is the whole character of these scales, so it is not
     * smoothed away: this only touches notes filled between anchors, and only
     * when a neighbouring degree gets the move under three semitones. The
     * anchors, the cadence and the twist still cross it, which is where the
     * sound actually lives — running it up and down in passing motion is not
     * how anyone plays these scales anyway.
     */
    const semitones = (d: number) => degreeToMidi(d, scaleIntervals);
    for (let k = 1; k < gap; k++) {
      const i = a + k;
      const previous = degrees[i - 1];
      if (Math.abs(degrees[i] - previous) > 1) continue; // an intended leap
      if (Math.abs(semitones(degrees[i]) - semitones(previous)) <= 2) continue;
      for (const alternative of [degrees[i] + 1, degrees[i] - 1]) {
        if (Math.abs(alternative - previous) > maxMove) continue;
        if (Math.abs(semitones(alternative) - semitones(previous)) <= 2) {
          degrees[i] = alternative;
          break;
        }
      }
    }
  }

  /**
   * §2.1B / §7 — exactly one uncommon turning-point gradient, on the colour
   * chord, immediately forgiven by stepwise motion the other way. It is placed
   * between anchors so it colours the line without contradicting the harmony.
   */
  private applyTwist(
    rng: SeededRng,
    degrees: number[],
    positions: number[],
    twistBar: number,
    anchors: Set<number>,
    ctx: BuildContext,
  ): void {
    const candidates: number[] = [];
    for (let i = 1; i < degrees.length - 2; i++) {
      if (anchors.has(i) || anchors.has(i + 1)) continue;
      if (Math.floor(positions[i] / STEPS_PER_BAR) === twistBar) candidates.push(i);
    }
    if (candidates.length === 0) return;

    const index = candidates[Math.floor(candidates.length / 2)];
    const previous = degrees[index - 1];
    const direction = degrees[index] >= previous ? 1 : -1;

    // The twist widens only near the top of the knob. Reaching three scale
    // steps at the halfway point made the default setting feel unsettled: the
    // one deliberate leap in the phrase was landing as a jump rather than as
    // a lift.
    let size = 2 + Math.round(clamp01(ctx.twist) * 0.55 * ctx.voicing.twistScale);
    let target = previous + direction * Math.min(size, MAX_LEAP_MOVE);
    const semitones =
      degreeToMidi(target, ctx.scaleIntervals) - degreeToMidi(previous, ctx.scaleIntervals);
    if (intervalSurprisal(semitones) <= ATYPICAL_GRADIENT_BITS) {
      target = previous + direction * Math.min(size + 1, MAX_LEAP_MOVE);
    }

    degrees[index] = target;
    // §4.1 resolve the leap by step in the opposite direction.
    if (!anchors.has(index + 1)) degrees[index + 1] = target - direction;
  }

  private pickContour(rng: SeededRng, setting: GenContour): ContourClass {
    if (setting === 'random') return rng.pick(['arch', 'descent'] as const);
    if (setting === 'wave') return 'wave';
    return setting;
  }

  /** A shape that *is* the contour class, rather than one that hopes to be. */
  private contourSkeleton(contour: ContourClass, count: number, amplitude: number): number[] {
    const out: number[] = [];
    if (contour === 'arch') {
      // Peak past the middle: the fall is the memorable half.
      const peak = Math.max(1, Math.min(count - 2, Math.round(count * 0.58)));
      for (let i = 0; i < count; i++) {
        const t = i <= peak ? i / peak : 1 - (i - peak) / (count - 1 - peak);
        out.push(Math.round(amplitude * t));
      }
    } else if (contour === 'descent') {
      for (let i = 0; i < count; i++) {
        out.push(Math.round(amplitude * (1 - i / (count - 1))));
      }
    } else {
      // 'wave': two gentle lobes.
      for (let i = 0; i < count; i++) {
        out.push(Math.round((amplitude / 2) * (1 + Math.sin((i / (count - 1)) * Math.PI * 2))));
      }
    }
    return out;
  }

  /**
   * Nearest absolute degree whose pitch class is one of `pitchClasses`.
   *
   * This searches the neighbouring octaves rather than snapping inside a fixed
   * one. Snapping within a single octave can move a note six scale steps to
   * "correct" it, which wrecks the contour, the range and the stepwise ratio
   * all at once — it was the single largest source of unmusical output.
   */
  private nearestDegree(target: number, pitchClasses: number[]): number {
    const baseOctave = Math.floor(target / 7);
    let best = target;
    let bestDistance = Infinity;
    for (const pc of pitchClasses) {
      const normalised = mod(pc, 7);
      for (const octave of [baseOctave - 1, baseOctave, baseOctave + 1]) {
        const candidate = octave * 7 + normalised;
        const distance = Math.abs(candidate - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  }

  /**
   * §3.3 land the phrase on scale degree 1, b3 or 5.
   *
   * The base pitch already makes this the natural landing, so this is a safety
   * net: it nudges the final note at most one scale step, and declines rather
   * than jumping. A corrective leap at the cadence would buy the constraint at
   * the cost of the stepwise ratio and an extra turning point.
   */
  private applyCadence(degrees: number[]): void {
    const last = degrees.length - 1;
    if (last < 1) return;
    if (CADENCE_DEGREES.includes(mod(degrees[last], 7))) return;

    const target = this.nearestDegree(degrees[last], CADENCE_DEGREES);
    if (Math.abs(target - degrees[last]) > MAX_STEP_MOVE) return;
    if (Math.abs(target - degrees[last - 1]) > MAX_LEAP_MOVE) return;
    degrees[last] = target;
  }

  // --- MUTATION (§2.1D / §9 "one-note change") -----------------------------

  private mutateCandidate(
    rng: SeededRng,
    source: Candidate,
    ctx: BuildContext,
    avoid?: Set<number>,
  ): Candidate {
    const notes = source.notes.map((n) => ({ ...n }));
    if (notes.length < 3) return source;

    // Bias the edit toward whatever the score is weakest on.
    const midi = notes.map((n) => degreeToMidi(n.degree, ctx.scaleIntervals));
    const range = pitchRange(midi);

    let index: number;
    if (range > TARGETS.rangeMax) {
      // Pull the outlier in rather than nudging a random note.
      const highest = midi.indexOf(Math.max(...midi));
      const lowest = midi.indexOf(Math.min(...midi));
      index = rng.chance(0.5) ? highest : lowest;
      notes[index].degree += midi[index] === Math.max(...midi) ? -1 : 1;
    } else {
      // Keep the rhythm identical and change one interior pitch (§9). Skip
      // notes an earlier edit already touched: two edits landing on the same
      // note can cancel out, leaving A' identical to A.
      index = 1 + rng.int(notes.length - 2);
      for (let attempt = 0; attempt < 12 && avoid?.has(index); attempt++) {
        index = 1 + rng.int(notes.length - 2);
      }
      notes[index].degree += rng.pick([-2, -1, 1, 2]);
    }
    avoid?.add(index);

    return { notes, rhythm: source.rhythm, score: this.score(notes, source.rhythm, ctx) };
  }

  /**
   * The A' half of the hook: identical rhythm, one or two notes different.
   *
   * Entropy sets how far the answer departs, and is bounded to two edits.
   * §9 asks for "one-note change"; a second is still a variation of the same
   * phrase, while a free hand here would produce a different melody and the
   * repetition §2.1D depends on would be gone.
   */
  private mutate(rng: SeededRng, source: Candidate, ctx: BuildContext): Candidate {
    // Likewise the second edit: it is the top of the knob's travel, not its
    // middle. A' is meant to answer A, and two changes at half entropy made it
    // read as a different phrase.
    const edits = 1 + Math.round(clamp01(ctx.twist) * 0.55);
    const touched = new Set<number>();
    let best = source;

    for (let e = 0; e < edits; e++) {
      const candidateTouched = new Set(touched);
      let attempt = this.mutateCandidate(rng, best, ctx, candidateTouched);
      for (let i = 0; i < 4; i++) {
        const alternativeTouched = new Set(touched);
        const other = this.mutateCandidate(rng, best, ctx, alternativeTouched);
        if (other.score.total > attempt.score.total) {
          attempt = other;
          candidateTouched.clear();
          alternativeTouched.forEach((v) => candidateTouched.add(v));
        }
      }
      candidateTouched.forEach((v) => touched.add(v));
      best = attempt;
    }

    // A' must actually differ from A, or the answer is just a repeat.
    const differs = best.notes.some((n, i) => n.degree !== source.notes[i]?.degree);
    if (!differs && source.notes.length > 2) {
      return this.mutateCandidate(rng, source, ctx, new Set());
    }
    return best;
  }

  // --- RENDERING -----------------------------------------------------------

  /**
   * The hook, placed into the arrangement rather than repeated every four
   * bars. The layer rules come from arrangement.ts: no lead through the intro,
   * a thinned statement in the verses, the whole thing in the choruses, and
   * the A' variation from the second statement onward.
   */
  private renderLead(
    transpose: number,
    totalSteps: number,
    hook: Candidate,
    variation: Candidate,
    scaleIntervals: readonly number[],
    arrangement: ResolvedArrangement,
  ): Track {
    const notes: NoteEvent[] = [];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    for (let bar = 0; bar < totalBars; bar++) {
      const section = arrangement.sectionAtBar(bar);
      const layers = layersFor(section);
      if (!layers.lead) continue;

      const source = layers.useVariation ? variation : hook;
      const phraseBar = section.barInSection % BARS_PER_PHRASE;
      const offset = bar * STEPS_PER_BAR;

      source.notes.forEach((note, i) => {
        if (Math.floor(note.step / STEPS_PER_BAR) !== phraseBar) return;
        // A verse states the hook with its second half of each bar removed,
        // which leaves the motif recognisable and the chorus somewhere to go.
        if (layers.sparseLead && note.step % STEPS_PER_BAR >= 8 && i % 2 === 1) return;

        const nextStep = source.notes[i + 1]?.step ?? note.step + 4;
        notes.push({
          id: `lead-${bar}-${i}`,
          note: midiToNoteName(degreeToMidi(note.degree, scaleIntervals, note.alteration) + transpose),
          startStep: offset + (note.step % STEPS_PER_BAR),
          duration: Math.max(1, Math.min(4, nextStep - note.step)),
          velocity: layers.energy,
        });
      });
    }

    return {
      id: 'lead', name: 'LEAD', color: 'bg-neon-purple',
      volume: MIX_LEVELS.lead, isCollapsed: false, notes: this.cleanupOverlaps(notes),
    };
  }

  /**
   * §3.4 compound hook. Locking this to the hook's own onsets, as it did,
   * put a second melodic line on exactly the same rhythm in a neighbouring
   * register — two parts saying different notes at the same instant, which
   * reads as clutter rather than as a stacked hook. It now answers the hook
   * in its gaps instead of doubling it, and only once the chorus arrives.
   */
  private generateCounterMelody(
    rng: SeededRng,
    transpose: number,
    totalSteps: number,
    chords: number[],
    hook: Candidate,
    scaleIntervals: readonly number[],
    density: number,
    arrangement: ResolvedArrangement,
  ): Track {
    const notes: NoteEvent[] = [];
    const arpPattern = [0, 2, 4];
    const hookOnsets = hook.rhythm.onsets;
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);
    const answerPattern = Array.from(
      { length: PHRASE_STEPS },
      () => rng.chance(0.35 + density * 0.25),
    );

    for (let bar = 0; bar < totalBars; bar++) {
      const section = arrangement.sectionAtBar(bar);
      const layers = layersFor(section);
      if (!layers.pluck) continue;

      for (let inBar = 0; inBar < STEPS_PER_BAR; inBar += 2) {
        const step = bar * STEPS_PER_BAR + inBar;
        const phraseStep = step % PHRASE_STEPS;

        // Answer the hook's silences, never its onsets — on a pattern fixed
        // once for the whole phrase rather than re-rolled at every step.
        if (hookOnsets[phraseStep]) continue;
        if (!answerPattern[phraseStep]) continue;

        const chord = chords[step];
        const arpIndex = Math.floor(inBar / 2) % arpPattern.length;
        const degree = chord + arpPattern[arpIndex] + 28;

        notes.push({
          id: `pluck-${step}`,
          note: midiToNoteName(degreeToMidi(degree, scaleIntervals) + transpose),
          startStep: step,
          duration: 1,
          velocity: 0.5 * layers.energy,
        });
      }
    }
    return { id: 'pluck', name: 'PLUCK', color: 'bg-teal-500', volume: MIX_LEVELS.pluck, isCollapsed: true, notes };
  }

  /**
   * §4 "space / mood glue". This used to emit a single note fourteen scale
   * degrees above the chord root — one high tone, not a pad, and nothing that
   * supported the harmony. It now voices an actual triad in a mid register,
   * below the lead so the two do not compete for the same octave.
   */
  private generateAtmosphere(
    rng: SeededRng,
    transpose: number,
    totalSteps: number,
    chords: number[],
    scaleIntervals: readonly number[],
    arrangement: ResolvedArrangement,
  ): Track {
    const notes: NoteEvent[] = [];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    // The pad took no random input at all, so it was the same three notes per
    // chord in every song and rebuilding it was a no-op. These three choices
    // are made once and held for the whole song — a pad that re-voices itself
    // every bar is not a bed, it is a texture.
    //
    // Which chord tone sits at the bottom. All three stay inside the register
    // below the lead, so no rotation can put the pad above the melody.
    const rotation = rng.int(3);
    // An open voicing drops the fifth and doubles the root an octave down,
    // which is what a string patch does when it wants to leave room.
    const open = rng.chance(0.3);
    // Whether the chord is held for the bar or breathed in two halves.
    const breathe = rng.chance(0.35);

    for (let bar = 0; bar < totalBars; bar++) {
      const section = arrangement.sectionAtBar(bar);
      const layers = layersFor(section);
      const step = bar * STEPS_PER_BAR;
      if (!layers.pad) continue;

      const chord = chords[step];
      // Root, third and fifth inverted into a fixed register (C3 to A#3),
      // rather than transposed with the chord root. Transposing meant the
      // bVII chord climbed to F4 while the hook's lowest note is C4, putting
      // the pad above the melody and producing sustained minor seconds
      // against it. Keeping the voicing in one octave is also what a pad is
      // for: a steady bed the melody sits on top of.
      const tones = open ? [chord, chord + 2] : [chord, chord + 2, chord + 4];
      const rotated = tones.map((_, i) => tones[(i + rotation) % tones.length]);
      const voicing = rotated.map((d) => PAD_REGISTER_BASE + mod(d, 7));
      if (open) voicing.push(PAD_REGISTER_BASE - 7 + mod(chord, 7));
      const velocity = 0.42 * layers.energy;

      const spans: [number, number][] = breathe
        ? [[step, STEPS_PER_BAR / 2], [step + STEPS_PER_BAR / 2, STEPS_PER_BAR / 2]]
        : [[step, STEPS_PER_BAR]];

      spans.forEach(([start, length], sp) => {
        voicing.forEach((degree, v) => {
          notes.push({
            id: `pad-${bar}-${sp}-${v}`,
            note: midiToNoteName(degreeToMidi(degree, scaleIntervals) + transpose),
            startStep: start,
            duration: length,
            velocity,
          });
        });
      });
    }
    return { id: 'pad', name: 'PAD', color: 'bg-blue-800', volume: MIX_LEVELS.pad, isCollapsed: true, notes };
  }

  private generateBass(
    rng: SeededRng,
    transpose: number,
    totalSteps: number,
    chords: number[],
    kickPattern: number[],
    mode: GenBass,
    scaleIntervals: readonly number[],
    arrangement: ResolvedArrangement,
  ): Track {
    const notes: NoteEvent[] = [];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    /**
     * One bar-length pattern, decided once and repeated. The driving bass used
     * to drop a fifth of its off-kick notes at random on every single step, so
     * the bass line was different in every bar of the song and the pulse never
     * settled.
     *
     * Each style now has a bank rather than one figure. With a single figure
     * plus a dropout roll, rebuilding the bass produced four distinguishable
     * lines in twenty attempts, which reads as a button that mostly does
     * nothing. Every entry is still one bar repeated unchanged, so the
     * periodicity the harness checks is unaffected.
     */
    const BASS_BANK: Record<string, number[][]> = {
      driving: [
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
        [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
        [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0],
        [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
      ],
      acid: [
        [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1],
        [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0],
        [1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1],
        [1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      ],
      sustained: [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ],
      walking: [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
        [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
      ],
    };
    const bank = BASS_BANK[mode] ?? BASS_BANK.driving;
    const base = bank[rng.int(bank.length)];
    const rhythm = base.map((active, i) => {
      if (!active) return 0;
      if (mode !== 'driving') return 1;
      return kickPattern.includes(i) || !rng.chance(0.2) ? 1 : 0;
    });

    // Where the line leaves the root, and for what. Held for the song, so the
    // bass still states one figure rather than wandering.
    const LIFTS: { at: number; by: number }[][] = [
      [],
      [{ at: 12, by: 4 }],                      // up a fifth in the second half
      [{ at: 14, by: 7 }],                      // octave pickup into the bar
      [{ at: 8, by: 4 }, { at: 14, by: 7 }],
      [{ at: 10, by: 2 }],                      // up to the third
      [{ at: 6, by: -3 }],                      // down to the fifth below
    ];
    const lifts = LIFTS[rng.int(LIFTS.length)];

    for (let bar = 0; bar < totalBars; bar++) {
      const section = arrangement.sectionAtBar(bar);
      const layers = layersFor(section);
      if (!layers.bass) continue;

      rhythm.forEach((active, inBar) => {
        if (!active) return;
        const step = bar * STEPS_PER_BAR + inBar;
        const chord = chords[step];

        let degree = chord;
        if ((mode === 'driving' || mode === 'acid') && inBar % 8 === 4) degree += 7;
        if (mode === 'walking' && inBar >= 12) degree = chord + 1;
        for (const lift of lifts) if (inBar === lift.at) degree = chord + lift.by;

        notes.push({
          id: `bass-${step}`,
          note: midiToNoteName(degreeToMidi(degree, scaleIntervals) + transpose),
          startStep: step,
          duration: mode === 'sustained' ? STEPS_PER_BAR : 1,
          velocity: 0.9 * layers.energy,
        });
      });
    }
    return { id: 'bass', name: 'BASS', color: 'bg-indigo-600', volume: MIX_LEVELS.bass, isCollapsed: false, notes };
  }

  private generateDrums(
    rng: SeededRng,
    totalSteps: number,
    mode: GenDrums,
    hook: Candidate,
    ornament: number,
    arrangement: ResolvedArrangement,
    planKick?: number[],
    excludeKick?: number[],
  ): { drumTracks: Track[]; kickSteps: SequencerStep[]; kickPattern: number[] } {
    // Build with a factory, not Array.fill: fill() shares one object across
    // every index, which is a live aliasing hazard the moment anything mutates.
    const blank = (): SequencerStep[] =>
      Array.from({ length: totalSteps }, () => ({ active: false, velocity: 0 }));

    const kickSteps = blank();
    const snareSteps = blank();
    const hihatSteps = blank();
    const fxSteps = blank();

    // A bank per style rather than one fixed figure. Every entry is a whole-bar
    // pattern repeated unchanged for the song, so the groove-periodicity check
    // still holds; what varies is which pattern this song uses. Before this,
    // rebuilding the kick could only ever produce the pattern it already had.
    const KICK_BANK: Record<string, number[][]> = {
      'four-floor': [
        [0, 4, 8, 12], [0, 4, 8, 12, 14], [0, 4, 8, 11, 12], [0, 4, 6, 8, 12],
        [0, 4, 8, 12, 15], [0, 3, 4, 8, 12], [0, 4, 8, 10, 12],
      ],
      breakbeat: [
        [0, 3, 8, 11], [0, 3, 8, 10], [0, 6, 8, 11], [0, 3, 7, 8, 11],
        [0, 3, 8, 11, 14], [0, 2, 8, 11], [0, 3, 6, 8, 11],
      ],
      tribal: [
        [0, 6, 8, 14], [0, 6, 8, 12], [0, 5, 8, 14], [0, 3, 6, 8, 14],
        [0, 6, 10, 14], [0, 6, 8, 14, 15], [0, 4, 6, 8, 14],
      ],
    };
    const wholeBank = KICK_BANK[mode] ?? KICK_BANK['four-floor'];
    // When the kick itself is being rebuilt, the pattern it already has is
    // dropped from the bank. Drawing freely meant one press in seven produced
    // the pattern that was already playing, which reads as a button that
    // sometimes does nothing — and a button that works six times in seven is
    // reported as broken, correctly.
    const avoid = excludeKick ? JSON.stringify(excludeKick) : null;
    const kickBank = avoid
      ? wholeBank.filter((p) => JSON.stringify(p) !== avoid)
      : wholeBank;
    const kickPattern = planKick
      ?? (kickBank.length ? kickBank : wholeBank)[rng.int(Math.max(1, kickBank.length))];

    // Ghost notes on the snare, chosen once and repeated, for the same reason.
    const GHOSTS: number[][] = [[], [], [7], [14], [7, 14], [3], [10]];
    const ghostSteps = GHOSTS[rng.int(GHOSTS.length)];
    // Where the backbeat sits. The second entry is the half-time feel.
    const BACKBEATS: number[][] = [[4, 12], [4, 12], [4, 12], [12], [4, 12, 15]];
    const backbeat = BACKBEATS[rng.int(BACKBEATS.length)];

    // Decide the 16th-note hat fills once, then repeat them every bar. Rolling
    // the dice per step, as this used to, meant the pattern never repeated —
    // and a groove that never repeats is not a groove.
    const sixteenthFills = Array.from(
      { length: STEPS_PER_BAR },
      (_, i) => i % 2 === 1 && rng.chance(0.15 + ornament * 0.45),
    );

    for (let step = 0; step < totalSteps; step++) {
      const bar = Math.floor(step / STEPS_PER_BAR);
      const section = arrangement.sectionAtBar(bar);
      const layers = layersFor(section);
      const inBar = step % STEPS_PER_BAR;
      if (!layers.drums) continue;

      if (kickPattern.includes(inBar)) {
        kickSteps[step] = { active: true, velocity: layers.energy };
      }

      if (section.kind !== 'intro') {
        if (backbeat.includes(inBar)) {
          snareSteps[step] = { active: true, velocity: 0.9 * layers.energy };
        } else if (ghostSteps.includes(inBar)) {
          snareSteps[step] = { active: true, velocity: 0.28 * layers.energy };
        }
        if (inBar % 2 === 0) {
          hihatSteps[step] = {
            active: true,
            velocity: (inBar % 4 === 0 ? 0.7 : 0.5) * layers.energy,
          };
        }
        if ((mode === 'breakbeat' || section.kind === 'chorus') && sixteenthFills[inBar]) {
          hihatSteps[step] = { active: true, velocity: 0.4 * layers.energy };
        }
      }

      // A snare roll across the last bar of a section is the transition that
      // makes the next one land — composerAgent's "craving and release".
      if (isSectionTail(section) && inBar >= 8 && inBar % 2 === 0) {
        snareSteps[step] = { active: true, velocity: (0.4 + (inBar - 8) * 0.07) * layers.energy };
      }
    }

    // §3.4 timbral hook: put the FX gesture on the twist, so the ear is
    // pointed at the one uncommon gradient in the phrase.
    const twistStep = hook.notes.find(
      (n) => Math.floor(n.step / STEPS_PER_BAR) === hook.rhythm.twistBar,
    )?.step ?? 0;
    // Every phrase carried the gesture, always in the same place, which made
    // the FX lane the one track a rebuild could never alter. It still lands on
    // the twist — that is the point of it — but how often, and whether a
    // section boundary gets its own hit, now varies.
    const fxEvery = [1, 2, 4][rng.int(3)];
    const fxOnTails = rng.chance(0.6);
    const tailAt = [8, 12, 14][rng.int(3)];
    const echoHit = rng.chance(0.4) ? [4, 6, 8][rng.int(3)] : 0;
    let phrase = 0;
    for (let bar = 0; bar < Math.floor(totalSteps / STEPS_PER_BAR); bar += BARS_PER_PHRASE) {
      const section = arrangement.sectionAtBar(bar);
      if (section.kind === 'intro') continue;
      if (phrase++ % fxEvery === 0) {
        const step = bar * STEPS_PER_BAR + twistStep;
        if (step < totalSteps) fxSteps[step] = { active: true, velocity: 0.8 };
        if (echoHit && step + echoHit < totalSteps) {
          fxSteps[step + echoHit] = { active: true, velocity: 0.45 };
        }
      }
    }
    if (fxOnTails) {
      for (let bar = 0; bar < Math.floor(totalSteps / STEPS_PER_BAR); bar++) {
        if (!isSectionTail(arrangement.sectionAtBar(bar))) continue;
        const step = bar * STEPS_PER_BAR + tailAt;
        if (step < totalSteps) fxSteps[step] = { active: true, velocity: 0.6 };
      }
    }

    const drumTracks: Track[] = [
      { id: 'fx', name: 'FX', color: 'bg-neon-pink', volume: MIX_LEVELS.fx, isCollapsed: false, steps: fxSteps },
      { id: 'hihat', name: 'HH', color: 'bg-yellow-400', volume: MIX_LEVELS.hihat, isCollapsed: false, steps: hihatSteps },
      { id: 'snare', name: 'SD', color: 'bg-cyan-400', volume: MIX_LEVELS.snare, isCollapsed: false, steps: snareSteps },
      { id: 'kick', name: 'BD', color: 'bg-red-500', volume: MIX_LEVELS.kick, isCollapsed: false, steps: kickSteps },
    ];
    return { drumTracks, kickSteps, kickPattern };
  }

  private cleanupOverlaps(notes: NoteEvent[]): NoteEvent[] {
    notes.sort((a, b) => a.startStep - b.startStep);
    for (let i = 0; i < notes.length - 1; i++) {
      const current = notes[i];
      const next = notes[i + 1];
      if (current.startStep + current.duration > next.startStep) {
        current.duration = Math.max(0.25, next.startStep - current.startStep);
      }
    }
    return notes;
  }
}

interface BuildContext {
  scaleIntervals: readonly number[];
  /** Set for the pentatonic modes: the degrees the anchors are held to. */
  pentatonic?: number[];
  chordLoop: number[];
  contour: GenContour;
  /** Motif size only, deliberately a narrow band. */
  density: number;
  /** Melodic conduct: how firmly the line locks to the chord, and how far it moves. */
  voicing: VoiceLeadingPreset;
  /** How far the A' variation departs, and how wide the twist leaps. */
  twist: number;
  modeName: GenMode;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const generatorService = new EarwormGenerator();
