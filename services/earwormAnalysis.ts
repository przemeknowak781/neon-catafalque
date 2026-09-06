/**
 * earwormAnalysis.ts — the measurement layer for the earworm spec.
 *
 * `earworm.md` declares a generate -> score -> optimize loop built on three
 * empirical claims. None of them were measurable before, because nothing in the
 * codebase ever looked at a melody after generating it. This module supplies the
 * measurements, so the generator can be scored against its own spec instead of
 * merely gesturing at it.
 *
 * Claims implemented here (section numbers refer to earworm.md):
 *   §2.1A  global contour typicality  -> classifyContour()
 *   §2.1B  turning-point "twist"      -> findTurningPoints() + isAtypicalTurn()
 *   §2.2   IDyOM-style expectation    -> analyzeExpectation()
 *   §8     candidate scoring function -> scoreMotif()
 *
 * Honest scoping note: §2.2 asks for IDyOM. IDyOM is a corpus-trained
 * variable-order Markov model (Pearce 2005). We ship no corpus, so this is an
 * "IDyOM-style" reduction: a documented parametric long-term interval prior
 * blended with a short-term variable-order model learned from the melody itself.
 * It reproduces IDyOM's information-content signal shape, not its trained
 * probabilities. Where a real corpus is available, replace LTM_INTERVAL_PRIOR
 * and the model keeps working unchanged.
 */

// ---------------------------------------------------------------------------
// Deterministic RNG — generation must be reproducible or it cannot be tested.
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, well-distributed, and seedable. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(min: number, maxInclusive: number): number {
    return min + this.int(maxInclusive - min + 1);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.next() * sum;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

/** Modulo that stays non-negative for negative operands (JS % does not). */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/**
 * Diatonic scale-degree index -> MIDI note number.
 * Degree 0 is C1 (MIDI 24); 7 degrees per octave. Handles negative degrees,
 * which the previous implementation did not.
 */
export function degreeToMidi(
  degree: number,
  scaleIntervals: readonly number[],
  alteration = 0,
): number {
  const octave = Math.floor(degree / 7);
  return 24 + octave * 12 + scaleIntervals[mod(degree, 7)] + alteration;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${PITCH_NAMES[mod(rounded, 12)]}${Math.floor(rounded / 12) - 1}`;
}

// ---------------------------------------------------------------------------
// §2.1A — Global contour typicality
// ---------------------------------------------------------------------------

export type ContourClass = 'arch' | 'descent' | 'rise' | 'valley' | 'wave' | 'flat';

/** Per-interval direction, with unisons dropped (a repeat is not a turn). */
export function directionSigns(pitches: readonly number[]): number[] {
  const dirs: number[] = [];
  for (let i = 1; i < pitches.length; i++) {
    const d = pitches[i] - pitches[i - 1];
    if (d > 0) dirs.push(1);
    else if (d < 0) dirs.push(-1);
  }
  return dirs;
}

export function countDirectionChanges(dirs: readonly number[]): number {
  let changes = 0;
  for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) changes++;
  return changes;
}

/**
 * Assign the melody to one of the common global contour classes.
 *
 * The spec's earworm finding is about *global* shape, so this deliberately
 * tolerates local wobble: up to two direction changes still counts as a clean
 * arch or descent, provided the shape's defining move dominates the range.
 */
export function classifyContour(pitches: readonly number[]): ContourClass {
  if (pitches.length < 3) return 'flat';

  const dirs = directionSigns(pitches);
  if (dirs.length === 0) return 'flat';

  const changes = countDirectionChanges(dirs);
  const first = pitches[0];
  const last = pitches[pitches.length - 1];
  const max = Math.max(...pitches);
  const min = Math.min(...pitches);
  const span = max - min;
  if (span === 0) return 'flat';

  const peakIdx = pitches.indexOf(max);
  const valleyIdx = pitches.indexOf(min);
  const interior = (i: number) => i > 0 && i < pitches.length - 1;

  // An arch needs a genuine rise *and* a genuine fall, not a peak grazed on
  // the way down. Each leg must account for at least 30% of the total range.
  const legShare = 0.3;
  if (
    changes <= 2 &&
    interior(peakIdx) &&
    max - first >= span * legShare &&
    max - last >= span * legShare
  ) {
    return 'arch';
  }

  if (
    changes <= 2 &&
    interior(valleyIdx) &&
    first - min >= span * legShare &&
    last - min >= span * legShare
  ) {
    return 'valley';
  }

  const netThreshold = Math.max(2, span * 0.5);
  if (changes <= 2 && first - last >= netThreshold) return 'descent';
  if (changes <= 2 && last - first >= netThreshold) return 'rise';

  return 'wave';
}

/**
 * Reduce a melody to its global shape before classifying it.
 *
 * "Global melodic contour" in the earworm literature is the overall up/down
 * shape of a phrase, not the direction of every passing tone. A 20-note phrase
 * with ordinary neighbour motion has a dozen note-level direction changes while
 * still tracing a single clean arch, so classifying the raw note sequence
 * answers the wrong question. We average pitch within evenly spaced windows
 * (default: one per half bar of a 4-bar phrase) and quantise to the nearest
 * semitone, which is the standard contour-reduction move.
 */
export function reduceContour(pitches: readonly number[], windows = 8): number[] {
  if (pitches.length <= windows) return [...pitches];
  const out: number[] = [];
  for (let w = 0; w < windows; w++) {
    const lo = Math.floor((w * pitches.length) / windows);
    const hi = Math.max(lo + 1, Math.floor(((w + 1) * pitches.length) / windows));
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += pitches[i];
    out.push(Math.round(sum / (hi - lo)));
  }
  return out;
}

/** §2.1A — contour class of the reduced global shape. */
export function classifyGlobalContour(pitches: readonly number[], windows = 8): ContourClass {
  return classifyContour(reduceContour(pitches, windows));
}

// ---------------------------------------------------------------------------
// §2.1B — Turning points and gradient atypicality
// ---------------------------------------------------------------------------

export interface TurningPoint {
  /** Index into the pitch array. */
  index: number;
  type: 'peak' | 'valley';
  /** Signed semitone interval arriving at the turning point. */
  inInterval: number;
  /** Signed semitone interval leaving it. */
  outInterval: number;
}

/**
 * Local maxima/minima, with plateaus collapsed first so that a repeated note
 * cannot masquerade as a turn.
 */
export function findTurningPoints(pitches: readonly number[]): TurningPoint[] {
  const moving: number[] = [0];
  for (let i = 1; i < pitches.length; i++) {
    if (pitches[i] !== pitches[i - 1]) moving.push(i);
  }

  const points: TurningPoint[] = [];
  for (let k = 1; k < moving.length - 1; k++) {
    const prev = pitches[moving[k - 1]];
    const cur = pitches[moving[k]];
    const next = pitches[moving[k + 1]];
    const shared = {
      index: moving[k],
      inInterval: cur - prev,
      outInterval: next - cur,
    };
    if (cur > prev && cur > next) points.push({ ...shared, type: 'peak' });
    else if (cur < prev && cur < next) points.push({ ...shared, type: 'valley' });
  }
  return points;
}

/**
 * Long-term melodic interval prior, by absolute size in semitones.
 *
 * Melodic interval distributions in Western song corpora are strongly
 * step-dominated and decay with size, with a secondary bump at the perfect
 * fourth/fifth. This table encodes that shape as a documented parameter set —
 * it is a stand-in for the corpus statistics earworm.md assumes, not a
 * measurement of one. Swap it for real corpus counts and everything downstream
 * (surprisal, atypicality, information content) keeps working.
 */
const LTM_INTERVAL_PRIOR: readonly number[] = [
  0.09,  // 0  unison
  0.22,  // 1  minor 2nd
  0.24,  // 2  major 2nd
  0.13,  // 3  minor 3rd
  0.1,   // 4  major 3rd
  0.07,  // 5  perfect 4th
  0.015, // 6  tritone
  0.055, // 7  perfect 5th
  0.015, // 8  minor 6th
  0.015, // 9  major 6th
  0.008, // 10 minor 7th
  0.004, // 11 major 7th
  0.018, // 12 octave
];
const LTM_TAIL = 0.002;

/** P(interval), split across the two directions for non-unison sizes. */
export function intervalPrior(semitones: number): number {
  const size = Math.abs(semitones);
  const raw = size < LTM_INTERVAL_PRIOR.length ? LTM_INTERVAL_PRIOR[size] : LTM_TAIL;
  return size === 0 ? raw : raw / 2;
}

/** Surprisal in bits of a single melodic interval under the long-term prior. */
export function intervalSurprisal(semitones: number): number {
  return -Math.log2(Math.max(intervalPrior(semitones), 1e-9));
}

/**
 * Bits above which a turning-point gradient counts as "uncommon".
 *
 * Calibrated so that steps (1-2 semitones) are typical and anything a minor
 * third or wider is atypical — which is exactly the spec's worked example of
 * replacing (+1,+1,+1,-1) with (+1,+1,+4,-1).
 */
export const ATYPICAL_GRADIENT_BITS = 3.2;

export function turningPointSurprisal(tp: TurningPoint): number {
  return Math.max(intervalSurprisal(tp.inInterval), intervalSurprisal(tp.outInterval));
}

export function isAtypicalTurn(tp: TurningPoint): boolean {
  return turningPointSurprisal(tp) > ATYPICAL_GRADIENT_BITS;
}

// ---------------------------------------------------------------------------
// §3.3 / §8D — Singability measurements
// ---------------------------------------------------------------------------

/** Fraction of moving intervals that are steps (<= 2 semitones). Repeats ignored. */
export function stepwiseRatio(pitches: readonly number[]): number {
  let steps = 0;
  let moves = 0;
  for (let i = 1; i < pitches.length; i++) {
    const d = Math.abs(pitches[i] - pitches[i - 1]);
    if (d === 0) continue;
    moves++;
    if (d <= 2) steps++;
  }
  return moves === 0 ? 1 : steps / moves;
}

export function pitchRange(pitches: readonly number[]): number {
  if (pitches.length === 0) return 0;
  return Math.max(...pitches) - Math.min(...pitches);
}

/** Count of leaps (>= 3 semitones). */
export function leapCount(pitches: readonly number[]): number {
  let leaps = 0;
  for (let i = 1; i < pitches.length; i++) {
    if (Math.abs(pitches[i] - pitches[i - 1]) >= 3) leaps++;
  }
  return leaps;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return na === nb ? 1 : 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * §8D "repeated rhythmic cell similarity" — mean cosine similarity between
 * consecutive onset cells. This is the "hook glue" measurement.
 */
export function rhythmSelfSimilarity(onsets: readonly boolean[], cellLength: number): number {
  const cells: number[][] = [];
  for (let i = 0; i + cellLength <= onsets.length; i += cellLength) {
    cells.push(onsets.slice(i, i + cellLength).map((b) => (b ? 1 : 0)));
  }
  if (cells.length < 2) return 1;

  let sum = 0;
  for (let i = 1; i < cells.length; i++) sum += cosine(cells[i - 1], cells[i]);
  return sum / (cells.length - 1);
}

// ---------------------------------------------------------------------------
// §2.2 — IDyOM-style expectation model
// ---------------------------------------------------------------------------

const INTERVAL_ALPHABET: readonly number[] = Array.from({ length: 25 }, (_, i) => i - 12);

export interface ExpectationProfile {
  /** Information content in bits, one entry per melodic interval. */
  informationContent: number[];
  /** Shannon entropy of the predictive distribution at each position. */
  entropy: number[];
  meanIC: number;
  /** Note indices (into the pitch array) whose arrival was a surprise. */
  spikeIndices: number[];
  /** Longest run of consecutive high-IC events — "many in a row" is chaos. */
  longestHighICRun: number;
}

function totalCount(counts: Map<number, number>): number {
  let n = 0;
  for (const v of counts.values()) n += v;
  return n;
}

/**
 * Blend a long-term prior with short-term order-0 and order-1 models.
 * Short-term weights grow with accumulated evidence, mirroring the escape
 * mechanism of PPM-style variable-order models that IDyOM builds on.
 */
function predictiveDistribution(
  order0: Map<number, number>,
  order1: Map<number, Map<number, number>>,
  context: number | null,
): Map<number, number> {
  const contextCounts = context === null ? undefined : order1.get(context);
  const n0 = totalCount(order0);
  const n1 = contextCounts ? totalCount(contextCounts) : 0;

  const w1 = n1 / (n1 + 2);
  const w0 = (1 - w1) * (n0 / (n0 + 3));
  const wLtm = 1 - w1 - w0;

  let priorSum = 0;
  for (const symbol of INTERVAL_ALPHABET) priorSum += intervalPrior(symbol);

  const dist = new Map<number, number>();
  for (const symbol of INTERVAL_ALPHABET) {
    const pLtm = intervalPrior(symbol) / priorSum;
    const p0 = n0 ? (order0.get(symbol) ?? 0) / n0 : 0;
    const p1 = n1 ? (contextCounts!.get(symbol) ?? 0) / n1 : 0;
    dist.set(symbol, wLtm * pLtm + w0 * p0 + w1 * p1);
  }
  return dist;
}

/** Bits above which an event counts as high-surprise in absolute terms. */
export const IC_SPIKE_BITS = 4.5;
/**
 * A "spike" is a *local peak* of information content, not merely a high value.
 *
 * The spec asks for 1-3 IC spikes per phrase. Counting every note above a fixed
 * bit threshold answers a different question: a variable-order model sharpens
 * as it learns, so the absolute scale of IC depends on how predictable the
 * phrase already is. Peak detection relative to the phrase's own mean and
 * spread is what isolates "the moment the listener notices", which is what
 * §2.2 is describing.
 */
export const IC_SPIKE_SIGMA = 1.0;

export function analyzeExpectation(
  pitches: readonly number[],
  spikeThresholdBits: number = IC_SPIKE_BITS,
  spikeSigma: number = IC_SPIKE_SIGMA,
): ExpectationProfile {
  const intervals: number[] = [];
  for (let i = 1; i < pitches.length; i++) {
    intervals.push(clamp(pitches[i] - pitches[i - 1], -12, 12));
  }

  const informationContent: number[] = [];
  const entropy: number[] = [];
  const order0 = new Map<number, number>();
  const order1 = new Map<number, Map<number, number>>();

  for (let i = 0; i < intervals.length; i++) {
    const context = i > 0 ? intervals[i - 1] : null;
    const dist = predictiveDistribution(order0, order1, context);

    const p = dist.get(intervals[i]) ?? 1e-9;
    informationContent.push(-Math.log2(Math.max(p, 1e-9)));

    let h = 0;
    for (const q of dist.values()) if (q > 0) h -= q * Math.log2(q);
    entropy.push(h);

    order0.set(intervals[i], (order0.get(intervals[i]) ?? 0) + 1);
    if (context !== null) {
      if (!order1.has(context)) order1.set(context, new Map());
      const m = order1.get(context)!;
      m.set(intervals[i], (m.get(intervals[i]) ?? 0) + 1);
    }
  }

  const meanIC = informationContent.length
    ? informationContent.reduce((a, b) => a + b, 0) / informationContent.length
    : 0;

  // "Many high-IC events in a row" is an absolute claim about chaos, so the
  // run length keeps the absolute threshold.
  let longestHighICRun = 0;
  let run = 0;
  for (const ic of informationContent) {
    if (ic > spikeThresholdBits) {
      run++;
      longestHighICRun = Math.max(longestHighICRun, run);
    } else {
      run = 0;
    }
  }

  // Spikes: local maxima standing clear of the phrase's own IC distribution.
  const variance = informationContent.length
    ? informationContent.reduce((a, b) => a + (b - meanIC) ** 2, 0) / informationContent.length
    : 0;
  const cutoff = meanIC + spikeSigma * Math.sqrt(variance);

  const spikeIndices: number[] = [];
  for (let i = 0; i < informationContent.length; i++) {
    const ic = informationContent[i];
    if (ic < cutoff) continue;
    const risesFromPrevious = i === 0 || ic > informationContent[i - 1];
    const holdsAgainstNext = i === informationContent.length - 1 || ic >= informationContent[i + 1];
    // interval i lands on note i+1
    if (risesFromPrevious && holdsAgainstNext) spikeIndices.push(i + 1);
  }

  return { informationContent, entropy, meanIC, spikeIndices, longestHighICRun };
}

// ---------------------------------------------------------------------------
// §8 — Candidate scoring function
// ---------------------------------------------------------------------------

/** Score windows, kept as named constants so the harness can assert against them. */
export const TARGETS = {
  /** §3.3 range 7-12 semitones; §8D restates it as <= 9-12. */
  rangeMin: 7,
  rangeMax: 12,
  /** §3.3 / §4.1 stepwise motion ratio. */
  stepwiseMin: 0.7,
  stepwiseMax: 0.9,
  /** §8B exactly one uncommon turning-point gradient per 4 bars. */
  atypicalTurnsPer4Bars: 1,
  /** §3.3 one turning point per bar. */
  turningPointsPerBar: 1,
  /**
   * §2.2 mostly low-moderate information content.
   *
   * Calibrated against real earworms at this phrase length rather than picked
   * by feel: under this model "Ode to Joy" measures 3.09 bits and the "Smoke on
   * the Water" riff 3.69, while a melody of nothing but repeated identical
   * steps collapses to 0.42. The band has to admit the first two and reject the
   * third. scripts/verifyEarworm.ts asserts exactly that, so the calibration is
   * checked rather than asserted.
   */
  meanICMin: 1.5,
  meanICMax: 4.0,
  /** §2.2 insert 1-3 IC spikes. */
  spikesMin: 1,
  spikesMax: 3,
  /** §2.2 "avoid many high-IC events in a row". */
  maxHighICRun: 2,
  /** §8D repeated rhythmic cell similarity. */
  rhythmSimilarityMin: 0.7,
  /** §8A share of notes inside the mode. */
  inModeMin: 0.95,
  /** §8A minimum modal-colour emphasis per phrase. */
  modalEmphasisMin: 2,
} as const;

export interface MotifNote {
  /** Onset position in 16th-note steps, relative to the phrase start. */
  step: number;
  /** Absolute diatonic scale-degree index (7 per octave). */
  degree: number;
  /** Chromatic inflection in semitones; 0 for in-mode notes. */
  alteration: number;
}

export interface ScoreInput {
  notes: readonly MotifNote[];
  scaleIntervals: readonly number[];
  /** 'aeolian' | 'dorian' | 'harmonic_minor' — selects the modal colour degrees. */
  modeName: string;
  /** Onset grid across the whole phrase. */
  onsets: readonly boolean[];
  /** Length in steps of the repeating rhythmic cell. */
  cellLength: number;
  barsInPhrase: number;
  /** Contour classes that count as "common global shape" (§2.1A). */
  targetContours: readonly ContourClass[];
}

export interface ScoreBreakdown {
  total: number;
  contour: number;
  turningTwist: number;
  expectation: number;
  singability: number;
  darkwaveFit: number;
  detail: {
    contourClass: ContourClass;
    turningPoints: number;
    atypicalTurns: number;
    range: number;
    stepwiseRatio: number;
    leaps: number;
    meanIC: number;
    spikes: number;
    longestHighICRun: number;
    rhythmSimilarity: number;
    inModeRatio: number;
    modalEmphasis: number;
  };
}

/** 1.0 inside [lo, hi], decaying linearly to 0 across a tolerance band. */
function window(value: number, lo: number, hi: number, tolerance: number): number {
  if (value >= lo && value <= hi) return 1;
  const distance = value < lo ? lo - value : value - hi;
  return Math.max(0, 1 - distance / tolerance);
}

/** Modal colour degrees whose emphasis marks the mode (§8A). */
function modalColourDegrees(modeName: string): number[] {
  // Degrees are 0-indexed: 5 = 6th scale degree, 6 = 7th.
  if (modeName === 'dorian') return [5]; // natural 6 is what makes it Dorian
  return [5, 6]; // Aeolian / harmonic minor: b6 and b7 carry the colour
}

export function scoreMotif(input: ScoreInput): ScoreBreakdown {
  const { notes, scaleIntervals, modeName, onsets, cellLength, barsInPhrase, targetContours } =
    input;

  const pitches = notes.map((n) => degreeToMidi(n.degree, scaleIntervals, n.alteration));

  // --- §8B.1 global contour typicality -------------------------------------
  const contourClass = classifyGlobalContour(pitches);
  const contourScore = targetContours.includes(contourClass)
    ? 1
    : contourClass === 'wave' || contourClass === 'flat'
      ? 0
      : 0.35; // a clean but off-target shape is still better than shapeless

  // --- §8B.2 turning-point twist -------------------------------------------
  const turningPoints = findTurningPoints(pitches);
  const atypicalTurns = turningPoints.filter(isAtypicalTurn).length;
  const phrases4Bar = Math.max(1, barsInPhrase / 4);
  const wantedAtypical = TARGETS.atypicalTurnsPer4Bars * phrases4Bar;
  const wantedTurns = TARGETS.turningPointsPerBar * barsInPhrase;

  const atypicalScore = window(atypicalTurns, wantedAtypical, wantedAtypical, 2);
  const turnCountScore = window(turningPoints.length, Math.max(1, wantedTurns - 1), wantedTurns + 1, 3);
  const turningTwist = 0.7 * atypicalScore + 0.3 * turnCountScore;

  // --- §8C predictability with one twist -----------------------------------
  const expectationProfile = analyzeExpectation(pitches);
  const meanICScore = window(expectationProfile.meanIC, TARGETS.meanICMin, TARGETS.meanICMax, 2);
  const spikeScore = window(
    expectationProfile.spikeIndices.length,
    TARGETS.spikesMin,
    TARGETS.spikesMax,
    2,
  );
  const runPenalty = expectationProfile.longestHighICRun > TARGETS.maxHighICRun ? 0 : 1;
  const expectation = (0.4 * meanICScore + 0.4 * spikeScore + 0.2 * runPenalty);

  // --- §8D singable loop ----------------------------------------------------
  const range = pitchRange(pitches);
  const stepRatio = stepwiseRatio(pitches);
  const rhythmSimilarity = rhythmSelfSimilarity(onsets, cellLength);

  const rangeScore = window(range, TARGETS.rangeMin, TARGETS.rangeMax, 5);
  const stepScore = window(stepRatio, TARGETS.stepwiseMin, TARGETS.stepwiseMax, 0.25);
  const rhythmScore = window(rhythmSimilarity, TARGETS.rhythmSimilarityMin, 1, 0.4);
  const singability = (rangeScore + stepScore + rhythmScore) / 3;

  // --- §8A darkwave fit -----------------------------------------------------
  const inModeRatio = notes.length
    ? notes.filter((n) => n.alteration === 0).length / notes.length
    : 1;
  const colourDegrees = modalColourDegrees(modeName);
  const modalEmphasis = notes.filter((n) => colourDegrees.includes(mod(n.degree, 7))).length;

  const inModeScore = inModeRatio >= TARGETS.inModeMin ? 1 : Math.max(0, inModeRatio / TARGETS.inModeMin);
  const emphasisScore = window(modalEmphasis, TARGETS.modalEmphasisMin, notes.length, 2);
  const darkwaveFit = 0.6 * inModeScore + 0.4 * emphasisScore;

  // Weighting: the two headline empirical findings (§2.1A, §2.1B) dominate,
  // because they are what distinguishes an earworm from merely valid music.
  const total =
    0.25 * contourScore +
    0.25 * turningTwist +
    0.2 * expectation +
    0.2 * singability +
    0.1 * darkwaveFit;

  return {
    total,
    contour: contourScore,
    turningTwist,
    expectation,
    singability,
    darkwaveFit,
    detail: {
      contourClass,
      turningPoints: turningPoints.length,
      atypicalTurns,
      range,
      stepwiseRatio: stepRatio,
      leaps: leapCount(pitches),
      meanIC: expectationProfile.meanIC,
      spikes: expectationProfile.spikeIndices.length,
      longestHighICRun: expectationProfile.longestHighICRun,
      rhythmSimilarity,
      inModeRatio,
      modalEmphasis,
    },
  };
}
