import type { NoteEvent, Track, SequencerStep } from "../types";
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

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],        // Natural minor
  dorian: [0, 2, 3, 5, 7, 9, 10],         // Minor with major 6
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11], // Raised 7 (spec: cadences only)
} as const;

const STEPS_PER_BAR = 16;
const BARS_PER_PHRASE = 4;
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

/** Chords that can host the twist (§7: align surprise with bVI or bVII). */
const COLOUR_CHORDS = [5, 6];

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

export type GenMode = 'aeolian' | 'dorian' | 'harmonic_minor';
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
}

type Section = 'intro' | 'verse' | 'chorus' | 'variation';

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

    // §2.1C tempo bias, chosen before the hook so §5's density compensation
    // can react to a slow tempo.
    const bpm = this.chooseTempo(rng, config.drumMode);
    const band = TEMPO_BANDS[config.drumMode] ?? TEMPO_BANDS['four-floor'];
    const tempoPosition = (bpm - band.lo) / (band.hi - band.lo);
    // §5: "if your darkwave is very slow, compensate with rhythmic repetition
    // and density in the hook".
    const hookDensity = clamp01(config.rhythmDensity + (1 - tempoPosition) * 0.15);

    const chordLoop = this.generateProgression(rng, config.harmonicMotion);
    const totalSteps = Math.max(PHRASE_STEPS, config.totalSteps);
    const chords = this.expandChords(chordLoop, totalSteps);

    // §1 / §8 — generate N, score, keep top K, mutate, take the best.
    const ctx: BuildContext = {
      scaleIntervals,
      chordLoop,
      contour: config.contour,
      density: hookDensity,
      twist: config.entropy,
      modeName: config.mode,
    };

    const best = this.searchHook(rng, ctx);
    const variation = this.mutate(rng, best, ctx);

    const { drumTracks, kickSteps } = this.generateDrums(rng, totalSteps, config.drumMode, best);
    const bassTrack = this.generateBass(rng, totalSteps, chords, kickSteps, config.bassMode, scaleIntervals);
    const leadTrack = this.renderLead(totalSteps, best, variation, scaleIntervals, config.mode);
    const pluckTrack = this.generateCounterMelody(rng, totalSteps, chords, best, scaleIntervals, hookDensity);
    const padTrack = this.generateAtmosphere(totalSteps, chords, scaleIntervals);

    return {
      tracks: [leadTrack, pluckTrack, padTrack, bassTrack, ...drumTracks],
      bpm,
      analysis: best.score,
      seed,
      hook: best.notes,
      variation: variation.notes,
      hookOnsets: best.rhythm.onsets,
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

  private generateProgression(rng: SeededRng, motion: GenHarmonicMotion): number[] {
    let loop: number[];

    if (motion === 'static') {
      // Drone: hold the tonic, move only to a colour chord.
      loop = [0, 0, rng.pick(COLOUR_CHORDS), 0];
    } else if (rng.chance(0.6)) {
      // Corpus-idiomatic templates the spec lists explicitly.
      loop = [...rng.pick(DARKWAVE_LOOPS)];
    } else {
      loop = this.walkProgression(rng, motion);
    }

    // §7 needs a bVI or bVII to hang the twist on. Guarantee one exists.
    if (!loop.some((d) => COLOUR_CHORDS.includes(d))) {
      loop[2] = rng.pick(COLOUR_CHORDS);
    }
    return loop;
  }

  /** Weighted walk restricted to the darkwave palette (no ii dim). */
  private walkProgression(rng: SeededRng, motion: GenHarmonicMotion): number[] {
    const palette = [0, 2, 3, 4, 5, 6];
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

  private expandChords(loop: number[], totalSteps: number): number[] {
    const chords: number[] = [];
    for (let step = 0; step < totalSteps; step++) {
      const bar = Math.floor(step / STEPS_PER_BAR);
      chords.push(loop[bar % loop.length]);
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
    // Density picks how big the motif is (3-5 onsets a bar) rather than
    // sprinkling extra notes on top of it, so the phrase stays a motif at
    // every setting and the note count stays inside §4.1's window.
    const wantedOnsets = 3 + Math.round(clamp01(ctx.density) * 2);
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

  private buildMelody(rng: SeededRng, rhythm: PhraseRhythm, ctx: BuildContext): MotifNote[] {
    const positions: number[] = [];
    rhythm.onsets.forEach((on, step) => { if (on) positions.push(step); });
    if (positions.length < 4) return [];

    const contour = this.pickContour(rng, ctx.contour);
    // 3-5 scale steps lands the range near the 7-12 semitone target; the
    // scorer rejects the draws that miss.
    const amplitude = rng.range(3, 5);
    const skeleton = this.contourSkeleton(contour, positions.length, amplitude);

    // §9 bar 1 starts on 5 or b3; picking the base from the cadence degrees
    // also makes the phrase land on 1, b3 or 5 by construction, instead of
    // teleporting there with a corrective leap at the end.
    const base = 14 + rng.pick(CADENCE_DEGREES);
    const degrees = skeleton.map((offset) => base + offset);

    // §2.1B / §7 the one uncommon gradient, then the deliberate leap accents
    // that keep the phrase off the "all steps" extreme (§4.1).
    const twistIndex = this.twistIndex(rng, positions, rhythm.twistBar, degrees.length);
    const leapIndices = this.planLeaps(rng, positions, twistIndex, degrees.length);

    this.enforceMotionBudget(degrees, leapIndices, twistIndex, ctx);
    this.alignStrongBeats(rng, degrees, positions, leapIndices, twistIndex, ctx);
    this.applyCadence(degrees);

    return degrees.map((degree, i) => ({ step: positions[i], degree, alteration: 0 }));
  }

  /** Where the uncommon turning-point gradient goes: inside the twist bar. */
  private twistIndex(
    rng: SeededRng,
    positions: number[],
    twistBar: number,
    count: number,
  ): number {
    const candidates: number[] = [];
    for (let i = 1; i < count - 1; i++) {
      if (Math.floor(positions[i] / STEPS_PER_BAR) === twistBar) candidates.push(i);
    }
    if (candidates.length === 0) return Math.max(1, Math.floor(count / 2));
    return candidates[Math.floor(candidates.length / 2)] ?? candidates[0];
  }

  /** §4.1 one headline leap per 2 bars, the twist included. */
  private planLeaps(
    rng: SeededRng,
    positions: number[],
    twistIndex: number,
    count: number,
  ): Set<number> {
    const leaps = new Set<number>([twistIndex]);
    const wanted = rng.range(LEAPS_PER_PHRASE.min, LEAPS_PER_PHRASE.max);

    // Spread the accents: prefer positions well away from the twist and from
    // each other, and never on the final note (that one has to cadence).
    let guard = 0;
    while (leaps.size < wanted && guard++ < 40) {
      const index = 1 + rng.int(Math.max(1, count - 2));
      const clashes = [...leaps].some((existing) => Math.abs(existing - index) < 3);
      if (!clashes) leaps.add(index);
    }
    void positions;
    return leaps;
  }

  /**
   * §4.1 motion budget: every move is a step unless it was planned as a leap.
   *
   * This runs after the contour skeleton, so it preserves the direction of
   * travel while removing the accidental leaps that the old code produced
   * whenever a chord snap, the twist, or the cadence pulled a note off-line.
   * It is also what keeps information content low between the planned spikes.
   */
  private enforceMotionBudget(
    degrees: number[],
    leapIndices: Set<number>,
    twistIndex: number,
    ctx: BuildContext,
  ): void {
    for (let i = 1; i < degrees.length; i++) {
      const delta = degrees[i] - degrees[i - 1];

      if (!leapIndices.has(i)) {
        const limited = Math.sign(delta) * Math.min(Math.abs(delta), MAX_STEP_MOVE);
        degrees[i] = degrees[i - 1] + limited;
        continue;
      }

      // A planned leap: force a real one, in the skeleton's direction where it
      // has one, and make the twist wide enough to read as uncommon.
      const direction = delta !== 0 ? Math.sign(delta) : (i <= degrees.length / 2 ? 1 : -1);
      let size = i === twistIndex ? 2 + Math.round(ctx.twist) : 2;
      size = Math.min(Math.max(size, 2), MAX_LEAP_MOVE);
      let target = degrees[i - 1] + direction * size;

      if (i === twistIndex) {
        // Verify against the calibrated threshold rather than assuming a
        // 2-step move is uncommon — that depends on where in the mode it sits.
        const semitones =
          degreeToMidi(target, ctx.scaleIntervals) - degreeToMidi(degrees[i - 1], ctx.scaleIntervals);
        if (intervalSurprisal(semitones) <= ATYPICAL_GRADIENT_BITS) {
          target = degrees[i - 1] + direction * Math.min(size + 1, MAX_LEAP_MOVE);
        }
      }
      degrees[i] = target;

      // §4.1 resolve every leap by step in the opposite direction — but *when*
      // matters. Reversing immediately turns the leap note into a turning
      // point with an uncommon gradient, and §8B allows exactly one of those
      // per 4 bars. So only the twist reverses on the very next note; the
      // accent leaps carry on one more step first, which leaves their turning
      // point stepwise and keeps the phrase's single twist singular.
      const resolveAt = i === twistIndex ? i + 1 : i + 2;
      if (i + 1 < degrees.length && !leapIndices.has(i + 1)) {
        degrees[i + 1] = i === twistIndex ? target - direction : target + direction * MAX_STEP_MOVE;
      }
      if (resolveAt === i + 2 && i + 2 < degrees.length && !leapIndices.has(i + 2)) {
        degrees[i + 2] = degrees[i + 1] - direction * MAX_STEP_MOVE;
      }
    }
  }

  /**
   * §6 chord tones on beats 1 and 3 — but only where it costs at most one
   * scale step, so the line stays stepwise and the contour survives.
   */
  private alignStrongBeats(
    rng: SeededRng,
    degrees: number[],
    positions: number[],
    leapIndices: Set<number>,
    twistIndex: number,
    ctx: BuildContext,
  ): void {
    for (let i = 1; i < degrees.length - 1; i++) {
      const inBar = positions[i] % STEPS_PER_BAR;
      if (inBar !== 0 && inBar !== 8) continue;
      if (i === twistIndex || leapIndices.has(i) || leapIndices.has(i + 1)) continue;

      const bar = Math.floor(positions[i] / STEPS_PER_BAR);
      const chord = ctx.chordLoop[bar % ctx.chordLoop.length];

      const roll = rng.next();
      const wanted = roll < 0.65
        ? [chord, chord + 2, chord + 4].map((d) => mod(d, 7))          // chord tone
        : roll < 0.9
          ? (ctx.modeName === 'dorian' ? [5] : [5, 6])                  // modal colour
          : null;                                                       // leave it
      if (!wanted) continue;

      const candidate = this.nearestDegree(degrees[i], wanted);
      // Only accept the nudge if it keeps both neighbouring moves stepwise.
      const okBefore = Math.abs(candidate - degrees[i - 1]) <= MAX_STEP_MOVE;
      const okAfter = Math.abs(degrees[i + 1] - candidate) <= MAX_STEP_MOVE;
      if (okBefore && okAfter) degrees[i] = candidate;
    }
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

  private mutateCandidate(rng: SeededRng, source: Candidate, ctx: BuildContext): Candidate {
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
      // Keep the rhythm identical and change exactly one interior pitch (§9).
      index = 1 + rng.int(notes.length - 2);
      notes[index].degree += rng.pick([-2, -1, 1, 2]);
    }

    return { notes, rhythm: source.rhythm, score: this.score(notes, source.rhythm, ctx) };
  }

  /** The A' half of the hook: identical rhythm, one note different. */
  private mutate(rng: SeededRng, source: Candidate, ctx: BuildContext): Candidate {
    let best = this.mutateCandidate(rng, source, ctx);
    for (let i = 0; i < 5; i++) {
      const attempt = this.mutateCandidate(rng, source, ctx);
      if (attempt.score.total > best.score.total) best = attempt;
    }
    return best;
  }

  // --- RENDERING -----------------------------------------------------------

  /**
   * §3.1 mini-song: Intro (4) -> Verse groove (4) -> Hook/Chorus (4) ->
   * Hook variation (4), repeating for longer requests.
   */
  private sectionForBar(bar: number): Section {
    const position = bar % 16;
    if (position < 4) return 'intro';
    if (position < 8) return 'verse';
    if (position < 12) return 'chorus';
    return 'variation';
  }

  private renderLead(
    totalSteps: number,
    hook: Candidate,
    variation: Candidate,
    scaleIntervals: readonly number[],
    modeName: GenMode,
  ): Track {
    const notes: NoteEvent[] = [];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    for (let bar = 0; bar < totalBars; bar += BARS_PER_PHRASE) {
      const section = this.sectionForBar(bar);
      if (section === 'intro') continue;

      const source = section === 'variation' ? variation : hook;
      const velocity = section === 'verse' ? 0.68 : section === 'chorus' ? 0.92 : 0.86;
      const offset = bar * STEPS_PER_BAR;

      source.notes.forEach((note, i) => {
        // Verse states the hook sparsely so the chorus reads as a lift; the
        // pitches are identical, which is the repetition §2.1D relies on.
        if (section === 'verse' && i % 3 === 2) return;

        const isLast = i === source.notes.length - 1;
        // §1 "harmonic minor moment ... only for cadences".
        const intervals = modeName === 'harmonic_minor' && !isLast
          ? MODES.aeolian
          : scaleIntervals;

        const nextStep = source.notes[i + 1]?.step ?? PHRASE_STEPS;
        notes.push({
          id: `lead-${bar}-${i}`,
          note: midiToNoteName(degreeToMidi(note.degree, intervals, note.alteration)),
          startStep: offset + note.step,
          duration: Math.max(1, Math.min(4, nextStep - note.step)),
          velocity,
        });
      });
    }

    return {
      id: 'lead', name: 'LEAD', color: 'bg-neon-purple',
      volume: 0.75, isCollapsed: false, notes: this.cleanupOverlaps(notes),
    };
  }

  /**
   * §3.4 compound hook: the pluck doubles the hook's onset grid instead of
   * ignoring it, so the rhythmic hook is stacked rather than smeared. The old
   * version took the lead notes as a parameter and never read them.
   */
  private generateCounterMelody(
    rng: SeededRng,
    totalSteps: number,
    chords: number[],
    hook: Candidate,
    scaleIntervals: readonly number[],
    density: number,
  ): Track {
    const notes: NoteEvent[] = [];
    const arpPattern = [0, 2, 4, 7];
    const hookOnsets = hook.rhythm.onsets;
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.sectionForBar(bar);
      if (section === 'intro') continue;

      for (let inBar = 0; inBar < STEPS_PER_BAR; inBar++) {
        const step = bar * STEPS_PER_BAR + inBar;
        const phraseStep = step % PHRASE_STEPS;

        // Lock to the hook's signature rhythm; fill elsewhere only if dense.
        const onHook = hookOnsets[phraseStep];
        if (!onHook && !rng.chance(density * 0.25)) continue;
        if (onHook && !rng.chance(0.85)) continue;

        const chord = chords[step];
        const arpIndex = Math.floor(inBar / 2) % arpPattern.length;
        const degree = chord + arpPattern[arpIndex] + 14;

        notes.push({
          id: `pluck-${step}`,
          note: midiToNoteName(degreeToMidi(degree, scaleIntervals)),
          startStep: step,
          duration: 1,
          velocity: 0.45 + (section === 'chorus' ? 0.2 : 0),
        });
      }
    }
    return { id: 'pluck', name: 'PLUCK', color: 'bg-teal-500', volume: 0.6, isCollapsed: true, notes };
  }

  private generateAtmosphere(totalSteps: number, chords: number[], scaleIntervals: readonly number[]): Track {
    const notes: NoteEvent[] = [];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.sectionForBar(bar);
      const step = bar * STEPS_PER_BAR;
      if (section === 'intro' && bar % 4 !== 0) continue;

      const chord = chords[step];
      notes.push({
        id: `pad-${bar}`,
        note: midiToNoteName(degreeToMidi(chord + 14, scaleIntervals)),
        startStep: step,
        duration: STEPS_PER_BAR,
        velocity: section === 'chorus' || section === 'variation' ? 0.55 : 0.35,
      });
    }
    return { id: 'pad', name: 'PAD', color: 'bg-blue-800', volume: 0.4, isCollapsed: true, notes };
  }

  private generateBass(
    rng: SeededRng,
    totalSteps: number,
    chords: number[],
    kickSteps: SequencerStep[],
    mode: GenBass,
    scaleIntervals: readonly number[],
  ): Track {
    const notes: NoteEvent[] = [];
    const driving = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    const acid = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1];
    const sustained = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const totalBars = Math.floor(totalSteps / STEPS_PER_BAR);

    for (let bar = 0; bar < totalBars; bar++) {
      const section = this.sectionForBar(bar);
      if (section === 'intro' && bar % 16 < 2) continue;

      const rhythm = mode === 'acid' ? acid : mode === 'sustained' ? sustained : driving;

      rhythm.forEach((active, inBar) => {
        if (!active) return;
        const step = bar * STEPS_PER_BAR + inBar;
        const chord = chords[step];

        if (mode === 'driving' && !kickSteps[step]?.active && rng.chance(0.2)) return;

        let degree = chord;
        if ((mode === 'driving' || mode === 'acid') && inBar % 8 === 4) degree += 7;
        if (mode === 'walking' && inBar >= 12) degree = chord + 1;

        notes.push({
          id: `bass-${step}`,
          note: midiToNoteName(degreeToMidi(degree, scaleIntervals)),
          startStep: step,
          duration: mode === 'sustained' ? STEPS_PER_BAR : 1,
          velocity: section === 'chorus' ? 1.0 : 0.85,
        });
      });
    }
    return { id: 'bass', name: 'BASS', color: 'bg-indigo-600', volume: 0.8, isCollapsed: false, notes };
  }

  private generateDrums(
    rng: SeededRng,
    totalSteps: number,
    mode: GenDrums,
    hook: Candidate,
  ): { drumTracks: Track[]; kickSteps: SequencerStep[] } {
    // Build with a factory, not Array.fill: fill() shares one object across
    // every index, which is a live aliasing hazard the moment anything mutates.
    const blank = (): SequencerStep[] =>
      Array.from({ length: totalSteps }, () => ({ active: false, velocity: 0 }));

    const kickSteps = blank();
    const snareSteps = blank();
    const hihatSteps = blank();
    const fxSteps = blank();

    const kickPattern = mode === 'breakbeat' ? [0, 3, 8, 11] : mode === 'tribal' ? [0, 6, 8, 14] : [0, 4, 8, 12];

    for (let step = 0; step < totalSteps; step++) {
      const bar = Math.floor(step / STEPS_PER_BAR);
      const section = this.sectionForBar(bar);
      const inBar = step % STEPS_PER_BAR;

      if (section !== 'intro' || bar % 16 >= 2) {
        if (kickPattern.includes(inBar)) kickSteps[step] = { active: true, velocity: 1.0 };
      }

      if (section !== 'intro') {
        if (inBar === 4 || inBar === 12) snareSteps[step] = { active: true, velocity: 0.9 };
        if (inBar % 2 === 0) {
          hihatSteps[step] = { active: true, velocity: inBar % 4 === 0 ? 0.7 : 0.5 };
        }
        if ((mode === 'breakbeat' || section === 'chorus') && inBar % 2 === 1 && rng.chance(0.4)) {
          hihatSteps[step] = { active: true, velocity: 0.4 };
        }
      }
    }

    // §3.4 timbral hook: put the FX gesture on the twist, so the ear is
    // pointed at the one uncommon gradient in the phrase.
    const twistStep = hook.notes.find(
      (n) => Math.floor(n.step / STEPS_PER_BAR) === hook.rhythm.twistBar,
    )?.step ?? 0;
    for (let bar = 0; bar < Math.floor(totalSteps / STEPS_PER_BAR); bar += BARS_PER_PHRASE) {
      if (this.sectionForBar(bar) === 'intro') continue;
      const step = bar * STEPS_PER_BAR + twistStep;
      if (step < totalSteps) fxSteps[step] = { active: true, velocity: 0.8 };
    }

    const drumTracks: Track[] = [
      { id: 'fx', name: 'FX', color: 'bg-neon-pink', volume: 0.5, isCollapsed: false, steps: fxSteps },
      { id: 'hihat', name: 'HH', color: 'bg-yellow-400', volume: 0.5, isCollapsed: false, steps: hihatSteps },
      { id: 'snare', name: 'SD', color: 'bg-cyan-400', volume: 0.7, isCollapsed: false, steps: snareSteps },
      { id: 'kick', name: 'BD', color: 'bg-red-500', volume: 0.9, isCollapsed: false, steps: kickSteps },
    ];
    return { drumTracks, kickSteps };
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
  chordLoop: number[];
  contour: GenContour;
  density: number;
  twist: number;
  modeName: GenMode;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const generatorService = new EarwormGenerator();
