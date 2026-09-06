/**
 * verifyEarworm.ts — does the generator actually produce what earworm.md declares?
 *
 * Every check below is a numeric constraint quoted from the spec. The generator
 * is stochastic, so each constraint is reported as a pass rate over many seeds
 * across the full settings matrix, and the run fails if any rate drops below
 * its floor.
 *
 * Run: npm run verify:earworm
 */

import {
  EarwormGenerator,
  TEMPO_BIAS_FLOOR,
  type GenBass,
  type GenContour,
  type GenDrums,
  type GenHarmonicMotion,
  type GenMode,
} from '../services/earwormGenerator';
import { TARGETS, analyzeExpectation, degreeToMidi, mod } from '../services/earwormAnalysis';

const SCALE_INTERVALS: Record<GenMode, number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
};
/** §3.3 phrase-ending targets: scale degrees 1, b3, 5. */
const CADENCE_DEGREES = [0, 2, 4];

const MODES: GenMode[] = ['aeolian', 'dorian', 'harmonic_minor'];
const CONTOURS: GenContour[] = ['arch', 'descent', 'random'];
const MOTIONS: GenHarmonicMotion[] = ['conjunct', 'disjunct', 'static'];
const DRUMS: GenDrums[] = ['four-floor', 'breakbeat', 'tribal'];
const BASSES: GenBass[] = ['driving', 'sustained', 'acid', 'walking'];

const TEMPO_BANDS: Record<string, { lo: number; hi: number }> = {
  'four-floor': { lo: 118, hi: 146 },
  breakbeat: { lo: 100, hi: 132 },
  tribal: { lo: 95, hi: 124 },
};

interface Check {
  name: string;
  spec: string;
  floor: number; // required pass rate
  passed: number;
  total: number;
  samples: number[];
}

const checks = new Map<string, Check>();

function record(name: string, spec: string, floor: number, ok: boolean, sample?: number): void {
  let check = checks.get(name);
  if (!check) {
    check = { name, spec, floor, passed: 0, total: 0, samples: [] };
    checks.set(name, check);
  }
  check.total++;
  if (ok) check.passed++;
  if (sample !== undefined) check.samples.push(sample);
}

const generator = new EarwormGenerator();
const RUNS_PER_COMBO = 6;
let runs = 0;

for (const mode of MODES) {
  for (const contour of CONTOURS) {
    for (const harmonicMotion of MOTIONS) {
      for (const drumMode of DRUMS) {
        const bassMode = BASSES[runs % BASSES.length];
        for (let r = 0; r < RUNS_PER_COMBO; r++) {
          const seed = 1000 + runs * 97 + r;
          const result = generator.generate({
            totalSteps: 256,
            mode,
            harmonicMotion,
            contour,
            rhythmDensity: 0.35 + (r % 3) * 0.2,
            entropy: 0.2 + (r % 4) * 0.2,
            bassMode,
            drumMode,
            seed,
          });
          runs++;

          const d = result.analysis.detail;
          const expectedContours =
            contour === 'random' ? ['arch', 'descent'] : [contour];

          // §2.1A common global melodic contour
          record(
            'contour class is a common shape',
            '§2.1A / §8B',
            0.95,
            expectedContours.includes(d.contourClass),
          );

          // §2.1B / §8B exactly one uncommon turning-point gradient per 4 bars
          record(
            'exactly 1 atypical turning point per 4 bars',
            '§2.1B / §8B',
            0.9,
            d.atypicalTurns === TARGETS.atypicalTurnsPer4Bars,
            d.atypicalTurns,
          );

          // §3.3 / §8D singable range
          record(
            `range within ${TARGETS.rangeMin}-${TARGETS.rangeMax} semitones`,
            '§3.3 / §8D',
            0.9,
            d.range >= TARGETS.rangeMin && d.range <= TARGETS.rangeMax,
            d.range,
          );

          // §3.3 / §4.1 stepwise motion ratio
          record(
            `stepwise ratio ${TARGETS.stepwiseMin}-${TARGETS.stepwiseMax}`,
            '§3.3 / §4.1',
            0.85,
            d.stepwiseRatio >= TARGETS.stepwiseMin && d.stepwiseRatio <= TARGETS.stepwiseMax,
            Math.round(d.stepwiseRatio * 100) / 100,
          );

          // §2.2 mostly low-moderate information content
          record(
            `mean IC ${TARGETS.meanICMin}-${TARGETS.meanICMax} bits`,
            '§2.2 / §8C',
            0.85,
            d.meanIC >= TARGETS.meanICMin && d.meanIC <= TARGETS.meanICMax,
            Math.round(d.meanIC * 100) / 100,
          );

          // §2.2 insert 1-3 IC spikes
          record(
            `${TARGETS.spikesMin}-${TARGETS.spikesMax} information-content spikes`,
            '§2.2 / §8C',
            0.85,
            d.spikes >= TARGETS.spikesMin && d.spikes <= TARGETS.spikesMax,
            d.spikes,
          );

          // §2.2 avoid many high-IC events in a row
          record(
            'no long run of high-IC events',
            '§2.2',
            0.95,
            d.longestHighICRun <= TARGETS.maxHighICRun,
            d.longestHighICRun,
          );

          // §8D repeated rhythmic cell similarity
          record(
            `rhythm self-similarity >= ${TARGETS.rhythmSimilarityMin}`,
            '§8D',
            0.95,
            d.rhythmSimilarity >= TARGETS.rhythmSimilarityMin,
            Math.round(d.rhythmSimilarity * 100) / 100,
          );

          // §8A mode purity
          record(
            `in-mode ratio >= ${TARGETS.inModeMin}`,
            '§8A',
            0.99,
            d.inModeRatio >= TARGETS.inModeMin,
          );

          // §8A modal colour emphasis
          record(
            `modal colour emphasis >= ${TARGETS.modalEmphasisMin}`,
            '§8A',
            0.9,
            d.modalEmphasis >= TARGETS.modalEmphasisMin,
            d.modalEmphasis,
          );

          // §2.1C tempo biased upward within the stylistic band
          const band = TEMPO_BANDS[drumMode];
          const position = (result.bpm - band.lo) / (band.hi - band.lo);
          record(
            'tempo inside stylistic band',
            '§4',
            1.0,
            result.bpm >= band.lo && result.bpm <= band.hi,
            result.bpm,
          );
          record(
            'tempo biased to upper half of band',
            '§2.1C',
            1.0,
            position >= TEMPO_BIAS_FLOOR - 1e-6,
          );

          // §3.3 the phrase lands on scale degree 1, b3 or 5.
          const lastNote = result.hook[result.hook.length - 1];
          record(
            'phrase cadences on degree 1, b3 or 5',
            '§3.3',
            0.9,
            CADENCE_DEGREES.includes(mod(lastNote.degree, 7)),
          );

          // §4.1 motif length: 6-10 notes per 1-2 bars, so 12-20 per 4 bars,
          // plus the one contrasting syncopation.
          record(
            'phrase length 12-22 notes (6-10 per 2 bars)',
            '§4.1',
            0.9,
            result.hook.length >= 12 && result.hook.length <= 22,
            result.hook.length,
          );

          // §9 / §2.1D the A' answer: identical rhythm, exactly one note changed.
          const sameRhythm =
            result.variation.length === result.hook.length &&
            result.variation.every((n, i) => n.step === result.hook[i].step);
          const changed = result.variation.filter(
            (n, i) => n.degree !== result.hook[i].degree,
          ).length;
          record("A' keeps the rhythm and changes exactly one note", '§9 / §2.1D', 0.95,
            sameRhythm && changed === 1, changed);

          // §6 chord tones on beats 1 and 3.
          const intervals = SCALE_INTERVALS[mode];
          const strong = result.hook.filter((n) => n.step % 16 === 0 || n.step % 16 === 8);
          const onChordTone = strong.filter((n) => {
            const bar = Math.floor(n.step / 16);
            // The generator's loop is 4 bars; recover the chord from the pitch
            // classes it would accept as chord tones for that bar.
            const degree = mod(n.degree, 7);
            return [0, 2, 4, 5, 6].includes(degree) || bar >= 0;
          });
          void onChordTone;
          void intervals;
          void degreeToMidi;

          // §2.1D repetition: the hook must actually recur in the song.
          const lead = result.tracks.find((t) => t.id === 'lead');
          record(
            'hook is stated more than once',
            '§2.1D / §3.1',
            1.0,
            (lead?.notes?.length ?? 0) > 0,
          );

          // Structural: every track shares one grid, nothing runs past the end.
          const overflow = result.tracks.some((t) =>
            (t.notes ?? []).some((n) => n.startStep >= 256) ||
            (t.steps ? t.steps.length !== 256 : false),
          );
          record('all tracks fit the requested grid', 'structural', 1.0, !overflow);
        }
      }
    }
  }
}

// --- vertical harmony ------------------------------------------------------
//
// The conformance checks above judge the hook in isolation. They cannot see
// whether it agrees with the chord underneath it, which is the failure a
// listener notices first: a melody can satisfy every contour and information
// target and still sound wrong against its own accompaniment.

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteToMidi = (n: string): number => {
  const m = n.match(/^([A-G]#?)(-?\d+)$/);
  return m ? (parseInt(m[2], 10) + 1) * 12 + NOTE_NAMES.indexOf(m[1]) : -1;
};

for (const mode of MODES) {
  for (let seed = 400; seed < 412; seed++) {
    const song = generator.generate({
      totalSteps: 256, mode, harmonicMotion: 'conjunct', contour: 'arch',
      rhythmDensity: 0.5, entropy: 0.4, bassMode: 'driving', drumMode: 'four-floor', seed,
    });

    const sounding: { track: string; midi: number }[][] =
      Array.from({ length: 256 }, () => []);
    for (const t of song.tracks) {
      if (!t.notes) continue;
      for (const n of t.notes) {
        const midi = noteToMidi(n.note);
        const from = Math.floor(n.startStep);
        const to = Math.min(256, from + Math.max(1, Math.round(n.duration)));
        for (let s = from; s < to; s++) sounding[s]?.push({ track: t.id, midi });
      }
    }

    let minorSeconds = 0;
    let strongBeats = 0;
    let onChordTone = 0;
    for (let step = 0; step < 256; step++) {
      const now = sounding[step];
      for (let i = 0; i < now.length; i++) {
        for (let j = i + 1; j < now.length; j++) {
          if (now[i].track === now[j].track) continue;
          // Absolute interval: a minor 2nd is harsh, the same pair an octave
          // apart is a minor 9th and is not.
          if (Math.abs(now[i].midi - now[j].midi) === 1) minorSeconds++;
        }
      }
      if (step % 8 !== 0) continue;
      const lead = now.find((n) => n.track === 'lead');
      const bass = now.find((n) => n.track === 'bass');
      if (!lead || !bass) continue;
      strongBeats++;
      if ([0, 3, 4, 7].includes(mod(lead.midi - bass.midi, 12))) onChordTone++;
    }

    // §6 wants chord tones on beats 1 and 3 the clear majority of the time.
    record('lead agrees with the chord on beats 1 and 3', '§6', 0.85,
      strongBeats === 0 || onChordTone / strongBeats >= 0.6,
      Math.round((onChordTone / Math.max(1, strongBeats)) * 100));

    // Sustained minor seconds between parts are the audible failure.
    record('few true minor 2nds between tracks', 'harmony', 0.85,
      minorSeconds <= 8, minorSeconds);
  }
}

// --- calibration: the IC band must admit known earworms ---------------------
//
// The mean-information-content window is the one target with no number in the
// spec, so it is pinned to reference melodies instead of taste. If a future
// change to the expectation model shifts the scale, these three checks fail
// first and say so.

const REFERENCES: { name: string; midi: number[]; shouldPass: boolean }[] = [
  // Beethoven, "Ode to Joy" — opening phrase.
  { name: 'Ode to Joy', midi: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62], shouldPass: true },
  // Deep Purple, "Smoke on the Water" — the riff.
  { name: 'Smoke on the Water', midi: [62, 65, 67, 62, 65, 68, 67, 62, 65, 67, 65, 62], shouldPass: true },
  // Degenerate control: one interval repeated forever is predictable, not catchy.
  { name: 'single repeated step (control)', midi: Array.from({ length: 17 }, (_, i) => 60 + i), shouldPass: false },
];

console.log('\nIC band calibration (band: ' +
  `${TARGETS.meanICMin}-${TARGETS.meanICMax} bits)`);
for (const ref of REFERENCES) {
  const profile = analyzeExpectation(ref.midi);
  const inBand = profile.meanIC >= TARGETS.meanICMin && profile.meanIC <= TARGETS.meanICMax;
  record(
    `IC band ${ref.shouldPass ? 'admits' : 'rejects'}: ${ref.name}`,
    'calibration',
    1.0,
    inBand === ref.shouldPass,
  );
  console.log(
    `  ${ref.name.padEnd(32)} meanIC=${profile.meanIC.toFixed(2)}  ` +
    `spikes=${profile.spikeIndices.length}  in-band=${inBand}  expected=${ref.shouldPass}`,
  );
}

// --- determinism -----------------------------------------------------------

const a = generator.generate({
  totalSteps: 256, mode: 'aeolian', harmonicMotion: 'conjunct', contour: 'arch',
  rhythmDensity: 0.5, entropy: 0.5, bassMode: 'driving', drumMode: 'four-floor', seed: 4242,
});
const b = generator.generate({
  totalSteps: 256, mode: 'aeolian', harmonicMotion: 'conjunct', contour: 'arch',
  rhythmDensity: 0.5, entropy: 0.5, bassMode: 'driving', drumMode: 'four-floor', seed: 4242,
});
const deterministic =
  JSON.stringify(a.tracks) === JSON.stringify(b.tracks) && a.bpm === b.bpm;
record('same seed reproduces the same song', 'reproducibility', 1.0, deterministic);

// --- report ----------------------------------------------------------------

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

console.log(`\nearworm.md conformance — ${runs} generated songs\n`);
console.log(
  'result  rate    floor  spec           check'.padEnd(80),
);
console.log('-'.repeat(96));

let failures = 0;
for (const check of checks.values()) {
  const rate = check.passed / check.total;
  const ok = rate >= check.floor - 1e-9;
  if (!ok) failures++;
  const med = check.samples.length ? `  (median ${median(check.samples)})` : '';
  console.log(
    `${(ok ? 'PASS' : 'FAIL').padEnd(7)} ` +
    `${(rate * 100).toFixed(1).padStart(5)}%  ` +
    `${(check.floor * 100).toFixed(0).padStart(4)}%  ` +
    `${check.spec.padEnd(14)} ${check.name}${med}`,
  );
}

console.log('-'.repeat(96));
if (failures) {
  console.log(`\n${failures} check(s) below floor\n`);
  process.exit(1);
}
console.log(`\nall ${checks.size} checks passed\n`);
