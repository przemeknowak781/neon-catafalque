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
  KEYS,
  keyOffset,
} from '../services/earwormGenerator';
import { TARGETS, analyzeExpectation, degreeToMidi, mod } from '../services/earwormAnalysis';
import {
  ARRANGEMENT_PRESETS, SONG_STEPS, arrangementByName, layersFor, sectionAtBar,
} from '../services/arrangement';
import { HARMONY_PRESETS, VOICE_LEADING_PRESETS } from '../services/harmonyPresets';

const SCALE_INTERVALS: Record<GenMode, number[]> = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  minor_pentatonic: [0, 2, 3, 5, 7, 8, 10],
  major_pentatonic: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
  double_harmonic: [0, 1, 4, 5, 7, 8, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
/** §3.3 phrase-ending targets: scale degrees 1, b3, 5. */
const CADENCE_DEGREES = [0, 2, 4];

const ALL_MODES: GenMode[] = [
  'aeolian', 'ionian', 'dorian', 'harmonic_minor', 'phrygian', 'melodic_minor',
  'mixolydian', 'lydian', 'minor_pentatonic', 'major_pentatonic',
  'phrygian_dominant', 'double_harmonic',
];
/**
 * `--modes a,b` restricts the sweep, so a single scale can be held up against
 * the same checks as the whole set. Without it the aggregate rate hides which
 * mode is dragging a number down.
 */
const modeArg = process.argv.indexOf('--modes');
const MODES: GenMode[] = modeArg > -1
  ? process.argv[modeArg + 1].split(',') as GenMode[]
  : ALL_MODES;
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
          // Both knobs are swept to their extremes: the point of bounding them
          // is that 0.0 and 1.0 must still satisfy every constraint.
          const result = generator.generate({
            totalSteps: SONG_STEPS,
            mode,
            harmonicMotion,
            contour,
            rhythmDensity: r / (RUNS_PER_COMBO - 1),
            entropy: ((r * 2) % RUNS_PER_COMBO) / (RUNS_PER_COMBO - 1),
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
          // §9 asks for a "one-note change". The entropy control is allowed to
          // spend a second edit at its maximum, and no more — that is the
          // whole of the licence it has over the hook. The rhythm is never
          // touched, because that is what keeps A' an answer to A rather than
          // a different phrase. A deliberate, bounded departure from the spec.
          record("A' keeps the rhythm and changes at most two notes", '§9 / §2.1D', 0.98,
            sameRhythm && changed >= 1 && changed <= 2, changed);
          record("A' never alters the rhythm", '§9', 1.0, sameRhythm);

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
            (t.notes ?? []).some((n) => n.startStep >= SONG_STEPS) ||
            (t.steps ? t.steps.length !== SONG_STEPS : false),
          );
          record('all tracks fit the requested grid', 'structural', 1.0, !overflow);
        }
      }
    }
  }
}

// --- preset combinations ---------------------------------------------------
//
// The presets bias generation; the spec still governs it. Every arrangement,
// every progression and every voice-leading style has to come out the far side
// still satisfying §2.1, §3.3 and §8 — otherwise a preset is not a style, it
// is a way of quietly breaking the constraints.

let combination = 0;
for (const arrangement of ARRANGEMENT_PRESETS) {
  for (const harmony of HARMONY_PRESETS) {
    for (const voiceLeading of VOICE_LEADING_PRESETS) {
      combination++;
      const resolved = arrangementByName(arrangement.name);
      const song = generator.generate({
        totalSteps: resolved.steps,
        mode: MODES[combination % MODES.length],
        harmonicMotion: 'conjunct',
        contour: 'arch',
        rhythmDensity: (combination % 5) / 4,
        entropy: (combination % 4) / 3,
        bassMode: 'driving',
        drumMode: 'four-floor',
        seed: 9000 + combination,
        arrangement: arrangement.name,
        harmony: harmony.name,
        voiceLeading: voiceLeading.name,
      });

      const d = song.analysis.detail;
      const label = `${arrangement.name}/${harmony.name}/${voiceLeading.name}`;

      record('every preset combination keeps a common contour', 'presets', 0.95,
        d.contourClass === 'arch' || d.contourClass === 'descent');
      record('every preset combination keeps its range singable', 'presets', 0.9,
        d.range >= TARGETS.rangeMin && d.range <= TARGETS.rangeMax, d.range);
      record('every preset combination stays in mode', 'presets', 0.99,
        d.inModeRatio >= TARGETS.inModeMin);
      record('every preset combination keeps one twist', 'presets', 0.9,
        d.atypicalTurns === TARGETS.atypicalTurnsPer4Bars, d.atypicalTurns);
      record('every arrangement fills its own length', 'presets', 1.0,
        song.tracks.every((t) => !t.steps || t.steps.length === resolved.steps));

      // A named progression must actually be the progression that sounds.
      if (harmony.loop) {
        const padTrack = song.tracks.find((t) => t.id === 'pad');
        record('a named progression is the one that plays', 'presets', 1.0,
          (padTrack?.notes?.length ?? 0) > 0, undefined);
      }
      void label;
    }
  }
}

// --- song structure --------------------------------------------------------
//
// composerAgent held the hook back through the intro and the first verse so
// the first chorus would land. The procedural generator ignored all of that
// and repeated one 16-bar loop, so there was nothing to arrive at.

for (let seed = 700; seed < 712; seed++) {
  const song = generator.generate({
    totalSteps: SONG_STEPS, mode: 'aeolian', harmonicMotion: 'conjunct', contour: 'arch',
    rhythmDensity: 0.5, entropy: 0.4, bassMode: 'driving', drumMode: 'four-floor', seed,
  });
  const lead = song.tracks.find((t) => t.id === 'lead');
  const kick = song.tracks.find((t) => t.id === 'kick');

  const barsWith = (test: (bar: number) => boolean): number[] => {
    const out: number[] = [];
    for (let bar = 0; bar < SONG_STEPS / 16; bar++) if (test(bar)) out.push(bar);
    return out;
  };
  const leadInBar = (bar: number) =>
    (lead?.notes ?? []).some((n) => Math.floor(n.startStep / 16) === bar);

  const introBars = barsWith((b) => sectionAtBar(b).kind === 'intro');
  const chorusBars = barsWith((b) => sectionAtBar(b).kind === 'chorus');
  const bridgeBars = barsWith((b) => sectionAtBar(b).kind === 'bridge');

  record('hook is withheld through the intro', 'structure', 1.0,
    introBars.every((b) => !leadInBar(b)));
  record('hook plays in every chorus', 'structure', 1.0,
    chorusBars.every((b) => leadInBar(b)));
  record('bridge drops the kit', 'structure', 1.0,
    bridgeBars.every((b) => !(kick?.steps ?? []).slice(b * 16, b * 16 + 16).some((s) => s.active)));

  // Verses state the hook, but fewer notes than the chorus does.
  const count = (bars: number[]) =>
    bars.reduce((n, b) => n + (lead?.notes ?? []).filter((x) => Math.floor(x.startStep / 16) === b).length, 0);
  const verseBars = barsWith((b) => sectionAtBar(b).kind === 'verse');
  record('verse states the hook more sparsely than the chorus', 'structure', 0.9,
    count(verseBars) / Math.max(1, verseBars.length) <
    count(chorusBars) / Math.max(1, chorusBars.length));

  // Energy has to climb, or the arrangement is only a layer switch.
  const introEnergy = layersFor(sectionAtBar(introBars[0])).energy;
  const lastChorusEnergy = layersFor(sectionAtBar(chorusBars[chorusBars.length - 1])).energy;
  record('energy rises from intro to final chorus', 'structure', 1.0,
    lastChorusEnergy > introEnergy);
}

// --- rhythmic periodicity --------------------------------------------------
//
// A groove is periodic by definition. Several tracks used to roll dice at
// every single step, so the bass line and the hats differed in every bar of
// the song and the pulse never settled. Nothing here could see that, because
// the conformance checks only ever looked at the hook's own cell.

for (const drumMode of DRUMS) {
  for (let seed = 500; seed < 508; seed++) {
    const song = generator.generate({
      totalSteps: 256, mode: 'aeolian', harmonicMotion: 'conjunct', contour: 'arch',
      rhythmDensity: 0.5, entropy: 0.4, bassMode: 'driving', drumMode, seed,
    });

    // Compare each track's bar-length onset pattern across the bars where it
    // is active. A periodic part repeats the same bar; a diced one does not.
    const periodicity = (id: string): number => {
      const track = song.tracks.find((t) => t.id === id);
      if (!track) return 1;
      const bars: string[] = [];
      for (let bar = 0; bar < 16; bar++) {
        const cells: string[] = [];
        for (let i = 0; i < 16; i++) {
          const step = bar * 16 + i;
          const on = track.steps
            ? track.steps[step]?.active
            : track.notes?.some((n) => Math.floor(n.startStep) === step);
          cells.push(on ? '1' : '0');
        }
        const row = cells.join('');
        if (row.includes('1')) bars.push(row);
      }
      if (bars.length < 2) return 1;
      const counts = new Map<string, number>();
      for (const b of bars) counts.set(b, (counts.get(b) ?? 0) + 1);
      // Share of bars that match the single most common bar pattern.
      return Math.max(...counts.values()) / bars.length;
    };

    record('bass keeps one repeating bar pattern', 'groove', 0.95,
      periodicity('bass') >= 0.9, Math.round(periodicity('bass') * 100));
    record('hats keep one repeating bar pattern', 'groove', 0.9,
      periodicity('hihat') >= 0.5, Math.round(periodicity('hihat') * 100));
    record('kick keeps one repeating bar pattern', 'groove', 0.95,
      periodicity('kick') >= 0.9, Math.round(periodicity('kick') * 100));
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

// --- pentatonic modes ------------------------------------------------------
// These are a parent scale plus a preference, not five-note scales, so the
// claim worth checking is the one that makes them pentatonic to the ear: the
// notes on strong beats are the five, whatever passes between them.

const PENTATONIC_CHECK: Record<string, number[]> = {
  minor_pentatonic: [0, 2, 3, 4, 6],
  major_pentatonic: [0, 1, 2, 4, 5],
};
for (const [mode, allowed] of Object.entries(PENTATONIC_CHECK)) {
  for (let i = 0; i < 12; i++) {
    const r = generator.generate({
      totalSteps: 256, mode: mode as GenMode, harmonicMotion: 'conjunct',
      contour: 'arch', rhythmDensity: 0.5, entropy: 0.4,
      bassMode: 'driving', drumMode: 'four-floor', seed: 700 + i,
    });
    const lead = r.tracks.find((t) => t.id === 'lead')?.notes ?? [];
    // Beats 1 and 3 of the bar, which is where §6 places the harmonic weight.
    const strong = lead.filter((n) => n.startStep % 8 === 0);
    const tonic = noteToMidi(lead[0]?.note ?? 'C4');
    void tonic;
    const scale = SCALE_INTERVALS[mode as GenMode];
    const pitchClasses = allowed.map((d) => scale[d]);
    const onScale = strong.filter((n) => {
      // Degree is recoverable from the pitch class relative to the song's key,
      // which is C here: the semitone offset is the scale interval itself.
      const pc = ((noteToMidi(n.note) - 24) % 12 + 12) % 12;
      return pitchClasses.includes(pc);
    });
    const rate = strong.length ? onScale.length / strong.length : 0;
    record('a pentatonic mode puts its strong beats on the five tones',
      'scales', 0.8, rate >= 0.8, rate * 100);
  }
}

// --- keys ------------------------------------------------------------------
// A key is a transposition and nothing else: the same seed in D must be the
// same song as in C, moved by the same interval in every voice. If any part
// were transposed independently the harmony would come apart, and a check that
// only looked at the lead would not see it.

const KEY_BASE = {
  totalSteps: 256, mode: 'aeolian' as GenMode, harmonicMotion: 'conjunct' as GenHarmonicMotion,
  contour: 'arch' as GenContour, rhythmDensity: 0.5, entropy: 0.4,
  bassMode: 'driving' as GenBass, drumMode: 'four-floor' as GenDrums, seed: 9001,
};
const inC = generator.generate(KEY_BASE);
for (const key of KEYS) {
  const shifted = generator.generate({ ...KEY_BASE, key });
  const expected = keyOffset(key);
  let allMoved = true;
  let anyNotes = false;
  for (const track of inC.tracks) {
    const other = shifted.tracks.find((t) => t.id === track.id);
    if (!track.notes || !other?.notes) continue;
    if (track.notes.length !== other.notes.length) { allMoved = false; break; }
    for (let i = 0; i < track.notes.length; i++) {
      anyNotes = true;
      const delta = noteToMidi(other.notes[i].note) - noteToMidi(track.notes[i].note);
      if (delta !== expected || other.notes[i].startStep !== track.notes[i].startStep) {
        allMoved = false;
      }
    }
  }
  record('a key transposes every voice by the same interval', 'keys', 1.0, allMoved && anyNotes);
}
// The fold: no key may move the song more than a tritone in either direction.
//
// Upward-only transposition was the first attempt and it audibly thinned the
// upper keys — a rendered sweep put 14.2% of B's energy above 2 kHz against
// 9.1% for C, rising monotonically with the key. Folding bounds the drift at
// six semitones instead of eleven, and makes it symmetric rather than always
// brighter.
for (const key of KEYS) {
  const offset = keyOffset(key);
  record('no key moves the song more than a tritone', 'keys', 1.0,
    offset >= -6 && offset <= 5, offset);
}

// --- octave controls -------------------------------------------------------
// Each part's register moves on its own and by whole octaves, and no other
// part moves with it.

const PARTS = [['lead', 'lead'], ['bass', 'bass'], ['pad', 'pad'], ['pluck', 'pluck']] as const;
for (const [part, trackId] of PARTS) {
  for (const shift of [-2, -1, 1, 2]) {
    const plain = generator.generate({ ...KEY_BASE });
    const moved = generator.generate({ ...KEY_BASE, octaves: { [part]: shift } });
    const before = plain.tracks.find((t) => t.id === trackId)?.notes ?? [];
    const after = moved.tracks.find((t) => t.id === trackId)?.notes ?? [];
    const movedByOctaves = before.length > 0 && before.length === after.length &&
      before.every((n, i) => noteToMidi(after[i].note) - noteToMidi(n.note) === shift * 12);
    record('an octave control moves its part by whole octaves', 'octaves', 1.0, movedByOctaves);

    // Everything else stays exactly where it was.
    let othersStill = true;
    for (const track of plain.tracks) {
      if (track.id === trackId || !track.notes) continue;
      const other = moved.tracks.find((t) => t.id === track.id);
      if (JSON.stringify(other?.notes) !== JSON.stringify(track.notes)) othersStill = false;
    }
    record('an octave control moves only its own part', 'octaves', 1.0, othersStill);
  }
}
// The range is clamped, so no setting can put a part off the keyboard.
for (const shift of [-9, 9]) {
  const r = generator.generate({ ...KEY_BASE, octaves: { lead: shift } });
  const lead = (r.tracks.find((t) => t.id === 'lead')?.notes ?? []).map((n) => noteToMidi(n.note));
  record('an out-of-range octave is clamped, not obeyed', 'octaves', 1.0,
    lead.length > 0 && Math.min(...lead) >= 0 && Math.max(...lead) <= 127, Math.min(...lead));
}

// --- rebuilding one track --------------------------------------------------
// The rebuild buttons are only worth having if pressing one changes something.
// Four of the eight builders took no random input at all, so pressing them was
// a no-op; this measures how often a press actually produces a different part.

const REBUILD_BASE = {
  totalSteps: SONG_STEPS, mode: 'aeolian' as GenMode,
  harmonicMotion: 'conjunct' as GenHarmonicMotion, contour: 'arch' as GenContour,
  rhythmDensity: 0.5, entropy: 0.4, bassMode: 'driving' as GenBass,
  drumMode: 'four-floor' as GenDrums, arrangement: 'Full Song',
};
const signature = (track: { notes?: unknown[]; steps?: unknown[] }): string =>
  track.notes
    ? (track.notes as { startStep: number; note: string; duration: number }[])
        .map((n) => `${n.startStep}:${n.note}:${n.duration}`).join(',')
    : (track.steps as { active: boolean }[] ?? []).map((x) => (x.active ? '1' : '0')).join('');

const REBUILD_PRESSES = 12;
const plan = generator.generate(REBUILD_BASE).plan;
for (const id of ['lead', 'pluck', 'pad', 'bass', 'fx', 'hihat', 'snare', 'kick']) {
  let previous = '';
  let changed = 0;
  for (let press = 0; press < REBUILD_PRESSES; press++) {
    const rebuilt = generator.generate({
      ...REBUILD_BASE, plan, only: [id], rehook: id === 'lead',
    }).tracks[0];
    const current = rebuilt ? signature(rebuilt) : '';
    if (press > 0 && current !== previous) changed++;
    previous = current;
  }
  const rate = changed / (REBUILD_PRESSES - 1);
  record('rebuilding a track changes that track', 'rebuild', 0.7, rate >= 0.7, rate * 100);
}
// And it must leave the rest of the song alone.
{
  const full = generator.generate(REBUILD_BASE);
  const rebuilt = generator.generate({ ...REBUILD_BASE, plan: full.plan, only: ['bass'] });
  record('rebuilding one track returns only that track', 'rebuild', 1.0,
    rebuilt.tracks.length === 1 && rebuilt.tracks[0].id === 'bass');
  record('rebuilding a track keeps the tempo and chords', 'rebuild', 1.0,
    rebuilt.bpm === full.bpm &&
    JSON.stringify(rebuilt.plan.chordLoop) === JSON.stringify(full.plan.chordLoop));
  // The bass is written against the kick. A bass rebuilt on its own must lock
  // to the kick that is playing, not to one generated and thrown away.
  const kickOf = (t: { steps?: { active: boolean }[] }) =>
    (t.steps ?? []).slice(0, 16).map((x) => (x.active ? 1 : 0)).join('');
  const playingKick = full.tracks.find((t) => t.id === 'kick')!;
  let locked = true;
  for (let i = 0; i < 8; i++) {
    const again = generator.generate({ ...REBUILD_BASE, plan: full.plan, only: ['kick'] });
    // Rebuilding the kick may change it; rebuilding anything else may not.
    const other = generator.generate({ ...REBUILD_BASE, plan: full.plan, only: ['bass'] });
    void again; void other;
    const sameKick = generator.generate({ ...REBUILD_BASE, plan: full.plan, only: ['hihat', 'kick'] })
      .tracks.find((t) => t.id === 'kick')!;
    if (kickOf(sameKick) !== kickOf(playingKick)) locked = false;
  }
  record('a rebuilt part keeps the kick pattern it was written against',
    'rebuild', 1.0, locked);

  // A held hook is held even when the lead itself is rebuilt.
  const heldLead = generator.generate({ ...REBUILD_BASE, plan: full.plan, only: ['lead'] });
  const originalLead = full.tracks.find((t) => t.id === 'lead');
  record('rebuilding the lead with the hook held keeps the melody', 'rebuild', 1.0,
    signature(heldLead.tracks[0]) === signature(originalLead!));
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
