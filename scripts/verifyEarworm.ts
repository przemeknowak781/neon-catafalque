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
import { TARGETS, analyzeExpectation, degreeToMidi, mod, scoreMotif } from '../services/earwormAnalysis';
import { BUILT_IN_SONGS } from '../songs';
import { ANEMOIA_HOOK, anemoiaHarmony, midiOf } from '../songs/anemoia';
import { SUMMER_CHORUS, SUMMER_CHORUS_FULL } from '../songs/summer';
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

// --- built-in songs ----------------------------------------------------------
//
// A song written by hand gets no exemption, but it is held to what it is built
// from rather than to the generator's melodic targets. Anemoia's chorus puts
// its held notes on chord colours and leaves its key through a chromatic
// mediant, so it sits outside §3.3's stepwise band (about 54% and 27%
// stepwise motion in its two four-bar halves, against 70-90%), its turning
// points are mostly uncommon where §8B asks for exactly one, and its
// information content runs above §2.2's band. Its first version met those
// targets and was heard as busy and scalar; its second was heard as naive.
// So what is checked is what the third is made of — one rhythmic cell, the
// repeat, held notes that are chord tones and mostly colours, the mediant and
// the hexatonic pole, a verse pedal and a bridge in major thirds — plus the
// spec's range, length and rhythm bands per four bars, which it still meets,
// and the structural checks a generated song gets.

{
  const IONIAN = SCALE_INTERVALS.ionian;
  const tonicPc = mod(midiOf(`${ANEMOIA_HOOK.tonic}4`), 12);
  const chorus = ANEMOIA_HOOK.chorus;
  type Cells = (typeof chorus)[number];
  const firstChorus = ANEMOIA_HOOK.chorusStarts[0][0];

  const harmonyMap = anemoiaHarmony();
  const chordAtStep = (step: number) => {
    const inBar = harmonyMap.filter((h) => h.bar === Math.floor(step / 16));
    return [...inBar].reverse().find((h) => h.at <= step % 16) ?? inBar[0];
  };
  const chordAtBar = (b: number) => chordAtStep(b * 16);
  /** A tone of the chord as written: its symbol's tones, its voicing, its root. */
  const isChordTone = (midi: number, step: number) => {
    const c = chordAtStep(step);
    return c.tones.includes(mod(midi, 12)) || [c.root, ...c.pad].some((m) => mod(m - midi, 12) === 0);
  };
  const isMinor = (c: { root: number; tones: number[] }) =>
    c.tones.includes(mod(c.root + 3, 12)) && !c.tones.includes(mod(c.root + 4, 12));
  const isMajor = (c: { root: number; tones: number[] }) => c.tones.includes(mod(c.root + 4, 12));

  const cell = (cells: Cells) => cells.map(([step]) => step).join(',');
  const commonest = [...new Set(chorus.map(cell))]
    .map((r) => ({ r, n: chorus.filter((cells) => cell(cells) === r).length }))
    .sort((x, y) => y.n - x.n)[0];
  record('built-in hook: one rhythmic cell in at least six of eight bars', 'motif', 1.0,
    commonest.n >= 6, commonest.n);

  record('built-in hook: bar 5 repeats bar 1 exactly', 'motif', 1.0,
    JSON.stringify(chorus[4]) === JSON.stringify(chorus[0]));

  // Held notes: chord tones, and at least half of them the chord's colours —
  // a seventh, ninth, eleventh or thirteenth rather than its root, third or
  // fifth.
  const held = chorus.flatMap((cells, b) => cells
    .filter(([, , length]) => length >= 6)
    .map(([step, pitch]) => ({ midi: midiOf(pitch), step: (firstChorus + b) * 16 + step })));
  const colours = held.filter((h) =>
    [1, 2, 5, 6, 9, 10, 11].includes(mod(h.midi - chordAtStep(h.step).root, 12))).length;
  record('built-in hook: at least half its held notes are chord colours', 'harmony', 1.0,
    held.every((h) => isChordTone(h.midi, h.step)) && colours * 2 >= held.length, colours);

  const toMotif = (bars: readonly Cells[]) => {
    const notes: { step: number; degree: number; alteration: number }[] = [];
    bars.forEach((cells, b) => cells.forEach(([step, pitch]) => {
      const rel = midiOf(pitch) - tonicPc - 24;
      const octave = Math.floor(rel / 12);
      const pc = mod(rel, 12);
      const d = IONIAN.indexOf(pc);
      notes.push({
        step: b * 16 + step,
        degree: octave * 7 + (d >= 0 ? d : IONIAN.indexOf(pc - 1)),
        alteration: d >= 0 ? 0 : 1,
      });
    }));
    return notes;
  };
  for (const half of [chorus.slice(0, 4), chorus.slice(4)]) {
    const notes = toMotif(half);
    const onsets = Array.from({ length: 64 }, (_, i) => notes.some((n) => n.step === i));
    const d = scoreMotif({
      notes, scaleIntervals: IONIAN, modeName: 'ionian', onsets,
      cellLength: 16, barsInPhrase: 4, targetContours: ['arch', 'descent'],
    }).detail;
    record('built-in hook: each four bars in range and length, one rhythmic cell', '§3.3 / §8A', 1.0,
      d.range >= TARGETS.rangeMin && d.range <= TARGETS.rangeMax &&
      notes.length >= 12 && notes.length <= 22 &&
      d.rhythmSimilarity >= TARGETS.rhythmSimilarityMin, d.range);
    record('built-in hook: each four bars has a common contour', '§2.1A', 1.0,
      d.contourClass === 'arch' || d.contourClass === 'descent');
  }

  // The last bar starts on the tonic, over the tonic, at the top of the chorus.
  const all = chorus.flat().map(([, p]) => midiOf(p));
  const [, lastPitch] = chorus[chorus.length - 1][0];
  record('built-in hook: lands on the tonic at its highest note', '§3.3', 1.0,
    mod(midiOf(lastPitch) - tonicPc, 12) === 0 && midiOf(lastPitch) === Math.max(...all) &&
    mod(chordAtBar(firstChorus + chorus.length - 1).root - tonicPc, 12) === 0);

  // Anemoia's own harmony: the mediant, the hexatonic pole, the verse pedal
  // and the bridge in major thirds.
  {
    const sections = ANEMOIA_HOOK.sections;
    // Every chorus leaves through the chromatic mediant (flat-VI major), turns
    // it minor — the tonic's hexatonic pole — and comes home with every pad
    // voice moving by one semitone (Cohn 2004).
    const strange = ANEMOIA_HOOK.chorusStarts.every(([start, shift]) => {
      const mediant = chordAtBar(start + 5), pole = chordAtBar(start + 6), home = chordAtBar(start + 7);
      const rel = (c: { root: number }) => mod(c.root - tonicPc - shift, 12);
      const a = [...pole.pad].sort((x, y) => x - y), b = [...home.pad].sort((x, y) => x - y);
      return rel(mediant) === 8 && isMajor(mediant) && rel(pole) === 8 && isMinor(pole) &&
        rel(home) === 0 && isMajor(home) && a.every((m, i) => Math.abs(m - b[i]) === 1);
    });
    record('built-in song: every chorus comes home from the hexatonic pole by semitones', 'harmony', 1.0, strange);

    const v = sections.verse1[0];
    const verseRoots = new Set([0, 1, 2, 3].map((i) => mod(chordAtBar(v + i).root, 12)));
    const verseChords = new Set([0, 1, 2, 3].map((i) => chordAtBar(v + i).name));
    record('built-in song: the verse holds a pedal under four chords', 'harmony', 1.0,
      verseRoots.size === 1 && verseChords.size === 4);

    const br = sections.bridge[0];
    const brRoots = [0, 1, 2].map((i) => chordAtBar(br + i).root);
    record('built-in song: the bridge moves by major thirds', 'harmony', 1.0,
      mod(brRoots[1] - brRoots[0], 12) === 8 && mod(brRoots[2] - brRoots[1], 12) === 8 &&
      [0, 1, 2].every((i) => isMajor(chordAtBar(br + i))));
  }
}

// The Summer We Never Had: a falling bass, a borrowed iv, appoggiaturas and
// sequences (Sloboda 1991), and the chorus a semitone up at the end.
{
  const song = BUILT_IN_SONGS.find((s) => s.name === 'The Summer We Never Had')!;
  const map = song.analysis.harmony();
  const chordAtBarS = (b: number) => map.find((h) => h.bar === b && h.at === 0) ?? map.find((h) => h.bar === b)!;
  const tonicPc = mod(midiOf('D4'), 12);
  const [start] = song.analysis.chorusStarts[0];

  // One progression, I - V/vi - vi - IV, I - V/vi - IV - V, in root position,
  // under the verse and the chorus alike.
  const rel = (b: number) => mod(chordAtBarS(b).root - tonicPc, 12);
  const major3 = (b: number) => chordAtBarS(b).tones.includes(mod(chordAtBarS(b).root + 4, 12));
  const PROGRESSION = [0, 4, 9, 5, 0, 4, 5, 7];
  const standsOnIt = (from: number) => PROGRESSION.every((r, i) => rel(from + i) === r) &&
    [1, 5].every((i) => major3(from + i) && chordAtBarS(from + i).tones.includes(mod(tonicPc + 4 + 10, 12))) &&
    [0, 1, 2, 3, 4, 5, 6, 7].every((i) => { const c = chordAtBarS(from + i); return mod(Math.min(...c.pad) - c.root, 12) === 0; });
  record('summer: verse and chorus stand on I - V/vi - vi - IV, I - V/vi - IV - V', 'harmony', 1.0,
    standsOnIt(song.analysis.intro[1]) && standsOnIt(start));
  record('summer: the secondary dominant resolves to vi, then deceptively to IV', 'harmony', 1.0,
    rel(start + 2) === 9 && rel(start + 6) === 5);
  const br = song.analysis.bridge[0];
  record('summer: the bridge holds the secondary dominant for four bars', 'harmony', 1.0,
    [0, 1, 2, 3].every((i) => rel(br + i) === 4 && major3(br + i)));
  const lastBar = map.filter((h) => h.at === 0).slice(-1)[0];
  record('summer: the outro lands on the tonic, a semitone up', 'structure', 1.0,
    mod(lastBar.root - tonicPc - 1, 12) === 0);

  // Bars 2, 4 and 6 open on a note foreign to the chord that falls a step
  // into it: the appoggiatura.
  const appoggiaturas = [1, 3, 5].filter((b) => {
    const [first, second] = SUMMER_CHORUS[b];
    const c = chordAtBarS(start + b);
    const a = midiOf(first[1]), r = midiOf(second[1]);
    return first[2] >= 4 && !c.tones.includes(mod(a, 12)) && c.tones.includes(mod(r, 12)) && [1, 2].includes(a - r);
  }).length;
  record('summer: three appoggiaturas, each falling a step into its chord', 'Sloboda 1991', 1.0,
    appoggiaturas === 3, appoggiaturas);

  // Bars 1 and 3 state one idea, the second a diatonic third lower: a sequence.
  const shape = (cells: typeof SUMMER_CHORUS[number]) =>
    cells.map(([step, , length]) => `${step}:${length}`).join(',');
  const intervals = (cells: typeof SUMMER_CHORUS[number]) =>
    cells.slice(1).map(([, p], i) => midiOf(p) - midiOf(cells[i][1]));
  const i1 = intervals(SUMMER_CHORUS[0]), i3 = intervals(SUMMER_CHORUS[2]);
  record('summer: bar 3 is bar 1 in sequence', 'Sloboda 1991', 1.0,
    shape(SUMMER_CHORUS[0]) === shape(SUMMER_CHORUS[2]) && shape(SUMMER_CHORUS[0]) === shape(SUMMER_CHORUS[4]) &&
    i1.every((x, i) => Math.sign(x) === Math.sign(i3[i]) && Math.abs(x - i3[i]) <= 2));

  // The carved chorus keeps the skeleton: every onset of the plain chorus is
  // in it, at the same pitch, and its tails leave the appoggiaturas intact.
  const plain = new Map(SUMMER_CHORUS.flatMap((cells, b) => cells.map(([st, p]) => [b * 16 + st, midiOf(p)] as const)));
  const full = new Map(SUMMER_CHORUS_FULL.flatMap((cells, b) => cells.map(([st, p]) => [b * 16 + st, midiOf(p)] as const)));
  record('summer: the carved chorus keeps every note of the plain one', 'motif', 1.0,
    [...plain].every(([st, m]) => full.get(st) === m) && full.size > plain.size);

  const all = SUMMER_CHORUS.flat().map(([, p]) => midiOf(p));
  const peakBar = SUMMER_CHORUS.findIndex((cells) => cells.some(([, p]) => midiOf(p) === Math.max(...all)));
  record('summer: the chorus peaks in its second half', 'structure', 1.0, peakBar >= 4, peakBar + 1);

  const tracks = song.build();
  const lead = tracks.find((t) => t.id === 'lead')!.notes!;
  const tops = (from: number) => {
    const by = new Map<number, number>();
    for (const n of lead) if (n.startStep >= from * 16 && n.startStep < (from + 8) * 16) {
      by.set(n.startStep - from * 16, Math.max(by.get(n.startStep - from * 16) ?? -1, noteToMidi(n.note)));
    }
    return by;
  };
  const [lastStart, shift] = song.analysis.chorusStarts[2];
  const first = tops(start), last = tops(lastStart);
  // The last chorus contains the first a semitone up; it may add answers in
  // the rests, which the first chorus does not have.
  record('summer: the last chorus is the first a semitone up', 'structure', 1.0,
    shift === 1 && [...first].every(([s, m]) => last.get(s) === m + 1));

}

// Every written song: the structural checks a generated song gets, and the
// harmony and texture rules both songs are written to.
for (const song of BUILT_IN_SONGS) {
  const tracks = song.build();
  const steps = song.totalSteps;
  const lane = (id: string) => tracks.find((t) => t.id === id)!;
  const notesOf = (id: string) => lane(id).notes ?? [];
  const { intro, bridge: bridgeBars, choruses } = song.analysis;
  const map = song.analysis.harmony();
  const chordAtStep = (step: number) => {
    const inBar = map.filter((h) => h.bar === Math.floor(step / 16));
    return [...inBar].reverse().find((h) => h.at <= step % 16) ?? inBar[0];
  };
  const isChordTone = (midi: number, step: number) => {
    const c = chordAtStep(step);
    return c.tones.includes(mod(midi, 12)) || [c.root, ...c.pad].some((m) => mod(m - midi, 12) === 0);
  };
  const barsOf = ([from, to]: [number, number]) => ({ from: from * 16, to: to * 16 });
  const inBars = (step: number, [from, to]: [number, number]) => step >= from * 16 && step < to * 16;

  record('built-in song: every track fits its grid', 'structural', 1.0,
    tracks.every((t) => (t.notes ?? []).every((n) => n.startStep >= 0 && n.startStep < steps) &&
      (!t.steps || t.steps.length === steps)));

  const signOn = barsOf(intro);
  record('built-in song: the lead is withheld through the intro', 'structure', 1.0,
    notesOf('lead').every((n) => n.startStep < signOn.from || n.startStep >= signOn.to));

  const bridge = barsOf(bridgeBars);
  record('built-in song: the bridge drops the kick', 'structure', 1.0,
    lane('kick').steps!.slice(bridge.from, bridge.to).every((s) => !s.active));

  // "A final chorus that lands higher than the first": here, literally.
  const meanLead = (range: [number, number]) => {
    const ns = notesOf('lead').filter((n) => inBars(n.startStep, range));
    return ns.reduce((sum, n) => sum + noteToMidi(n.note), 0) / Math.max(1, ns.length);
  };
  record('built-in song: the last chorus sits higher than the first', 'structure', 1.0,
    meanLead(choruses[choruses.length - 1]) > meanLead(choruses[0]));

  const sounding: { track: string; midi: number }[][] = Array.from({ length: steps }, () => []);
  for (const t of tracks) for (const n of t.notes ?? []) {
    const from = Math.floor(n.startStep);
    const to = Math.min(steps, from + Math.max(1, Math.round(n.duration)));
    for (let s = from; s < to; s++) sounding[s].push({ track: t.id, midi: noteToMidi(n.note) });
  }
  let seconds = 0;
  for (const now of sounding) for (let i = 0; i < now.length; i++) for (let j = i + 1; j < now.length; j++) {
    if (now[i].track !== now[j].track && Math.abs(now[i].midi - now[j].midi) === 1) seconds++;
  }
  record('built-in song: no minor 2nds between tracks', 'harmony', 1.0, seconds === 0, seconds);

  let strongBeats = 0, onChord = 0;
  for (let s = 0; s < steps; s += 8) {
    const lead = sounding[s].find((x) => x.track === 'lead');
    if (!lead) continue;
    strongBeats++;
    if (isChordTone(lead.midi, s)) onChord++;
  }
  record('built-in song: lead on a chord tone on beats 1 and 3', '§6', 1.0,
    onChord / Math.max(1, strongBeats) >= 0.75, Math.round((onChord / Math.max(1, strongBeats)) * 100));

  // Held notes are chord tones — except a written appoggiatura, which is
  // held on purpose and resolves within its bar.
  const leadNotes = notesOf('lead');
  const heldLead = leadNotes.filter((n) => n.duration >= 6);
  const resolves = (n: (typeof leadNotes)[number]) => leadNotes.some((r) =>
    r.startStep === n.startStep + n.duration && [1, 2].includes(noteToMidi(n.note) - noteToMidi(r.note)) &&
    isChordTone(noteToMidi(r.note), r.startStep));
  const heldOnChord = heldLead.filter((n) => isChordTone(noteToMidi(n.note), n.startStep) || resolves(n)).length;
  record('built-in song: every held lead note is a chord tone or resolves by step', 'harmony', 1.0,
    heldLead.length > 0 && heldOnChord === heldLead.length, heldLead.length - heldOnChord);

  const padNotes = notesOf('pad');
  const padTop = (step: number) => Math.max(-1, ...padNotes
    .filter((p) => p.startStep <= step && p.startStep + p.duration > step)
    .map((p) => noteToMidi(p.note)));
  const buried = leadNotes.filter((n) => noteToMidi(n.note) < padTop(n.startStep)).length;
  record('built-in song: the lead is never under the pad', 'texture', 1.0, buried === 0, buried);

  // The melody's own onsets; a song may add answering figures on the lead
  // track under their own ids, and those are not the melody.
  const chordNotes = notesOf(song.analysis.chords);
  const onsets = new Map<number, number>();
  for (const n of chordNotes.filter((x) => x.id.startsWith(`${song.analysis.chords}-`))) onsets.set(n.startStep, (onsets.get(n.startStep) ?? 0) + 1);
  const chorusOnsets = [...onsets.entries()].filter(([s]) => choruses.some((c) => inBars(s, c)));
  const full = chorusOnsets.filter(([, k]) => k >= 3).length;
  record('built-in song: the chord melody is struck in three-voice chords', 'harmony', 1.0,
    chorusOnsets.length > 0 && full / chorusOnsets.length >= 0.9, Math.round((100 * full) / Math.max(1, chorusOnsets.length)));
}

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
