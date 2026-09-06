/**
 * Vertical harmony analysis: what actually sounds together, and does it agree?
 *
 * The conformance harness only ever looked at the hook in isolation. It cannot
 * see whether the lead agrees with the chord underneath it, or whether two
 * tracks are voicing different scales at the same instant.
 */
import { generatorService, type GenMode } from '../services/earwormGenerator';
import { mod } from '../services/earwormAnalysis';

const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const toMidi = (n: string): number => {
  const m = n.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return -1;
  return (parseInt(m[2], 10) + 1) * 12 + NAMES.indexOf(m[1]);
};

interface Sounding { track: string; midi: number; }

export function analyze(mode: GenMode, seed: number) {
  const song = generatorService.generate({
    totalSteps: 256, mode, harmonicMotion: 'conjunct', contour: 'arch',
    rhythmDensity: 0.5, entropy: 0.4, bassMode: 'driving', drumMode: 'four-floor', seed,
  });

  // Which pitch classes are sounding at each step, per track.
  const at: Sounding[][] = Array.from({ length: 256 }, () => []);
  for (const t of song.tracks) {
    if (!t.notes) continue;
    for (const n of t.notes) {
      const midi = toMidi(n.note);
      const start = Math.floor(n.startStep);
      const end = Math.min(256, start + Math.max(1, Math.round(n.duration)));
      for (let s = start; s < end; s++) at[s]?.push({ track: t.id, midi });
    }
  }

  let semitoneClashes = 0;
  let tritones = 0;
  const byPair = new Map<string, number>();
  let leadStrong = 0, leadStrongChordTone = 0;
  const clashExamples: string[] = [];
  const pcSetsPerStep: number[] = [];

  for (let step = 0; step < 256; step++) {
    const sounding = at[step];
    if (sounding.length < 2) continue;

    // Harsh vertical intervals between different tracks.
    for (let i = 0; i < sounding.length; i++) {
      for (let j = i + 1; j < sounding.length; j++) {
        if (sounding[i].track === sounding[j].track) continue;
        // Dissonance depends on how close two notes actually are, not on
        // their pitch classes: a minor 2nd is harsh, the same pair an octave
        // apart is a minor 9th and is mild, and wider still is nothing at all.
        // Measuring modulo 12 counted every one of those as a clash.
        const iv = Math.abs(sounding[i].midi - sounding[j].midi);
        const cls = iv === 1 ? 1 : iv === 6 ? 6 : 0;
        if (cls === 1) {
          semitoneClashes++;
          const pair = [sounding[i].track, sounding[j].track].sort().join('/');
          byPair.set(pair, (byPair.get(pair) ?? 0) + 1);
          if (clashExamples.length < 6) {
            clashExamples.push(
              `step ${step}: ${sounding[i].track} ${NAMES[mod(sounding[i].midi,12)]} vs ` +
              `${sounding[j].track} ${NAMES[mod(sounding[j].midi,12)]}`);
          }
        } else if (cls === 6) tritones++;
      }
    }

    const pcs = new Set(sounding.map(s => mod(s.midi, 12)));
    pcSetsPerStep.push(pcs.size);

    // Is the lead on a chord tone at beats 1 and 3?
    if (step % 8 !== 0) continue;
    const lead = sounding.find(s => s.track === 'lead');
    const bass = sounding.find(s => s.track === 'bass');
    if (!lead || !bass) continue;
    leadStrong++;
    const interval = mod(lead.midi - bass.midi, 12);
    // Root, minor/major third, fifth, octave above the bass root.
    if ([0, 3, 4, 7].includes(interval)) leadStrongChordTone++;
  }

  const distinctPcs = new Set<number>();
  for (const s of at.flat()) distinctPcs.add(mod(s.midi, 12));

  return {
    mode, seed,
    semitoneClashes, tritones,
    leadStrong, leadStrongChordTone,
    chordToneRate: leadStrong ? leadStrongChordTone / leadStrong : 1,
    distinctPitchClasses: [...distinctPcs].sort((a,b)=>a-b).map(p => NAMES[p]),
    clashExamples,
    byPair,
  };
}

for (const mode of ['aeolian','dorian','harmonic_minor'] as GenMode[]) {
  let clashes = 0, tri = 0, strong = 0, chordTone = 0;
  const pairs = new Map<string, number>();
  let sample: ReturnType<typeof analyze> | null = null;
  for (let seed = 1; seed <= 12; seed++) {
    const r = analyze(mode, seed);
    clashes += r.semitoneClashes; tri += r.tritones;
    strong += r.leadStrong; chordTone += r.leadStrongChordTone;
    for (const [k, v] of r.byPair) pairs.set(k, (pairs.get(k) ?? 0) + v);
    if (!sample && r.semitoneClashes > 0) sample = r;
  }
  console.log(`\n${mode}`);
  console.log(`  true minor 2nds between tracks  : ${clashes}  (over 12 songs)`);
  console.log(`  bare tritones between tracks    : ${tri}`);
  console.log(`  lead on a chord tone at beat 1/3: ${(100*chordTone/Math.max(1,strong)).toFixed(1)}%`);
  console.log(`  pitch classes used              : ${analyze(mode,1).distinctPitchClasses.join(' ')}`);
  const ranked = [...pairs.entries()].sort((a,b)=>b[1]-a[1]);
  console.log(`  clashes by track pair           : ${ranked.map(([k,v])=>`${k}=${v}`).join('  ')}`);
}
