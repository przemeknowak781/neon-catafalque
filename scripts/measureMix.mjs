/**
 * Renders the generated song offline in a headless browser and reports
 * objective mix measurements, then writes a WAV so a human can judge it.
 *
 *   node scripts/measureMix.mjs <out.wav> [--app-levels] [--seed N]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const outPath = process.argv[2] ?? 'mix.wav';
const useAppMixerLevels = process.argv.includes('--app-levels');
const seedArg = process.argv.indexOf('--seed');
const seed = seedArg > -1 ? Number(process.argv[seedArg + 1]) : 7;
const presetArg = process.argv.indexOf('--preset');
const presets = presetArg > -1
  ? { [process.argv[presetArg + 1]]: process.argv[presetArg + 2] } : undefined;
const songArg = process.argv.indexOf('--song');
const songPreset = songArg > -1 ? process.argv[songArg + 1] : undefined;
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : undefined;

const bundle = readFileSync(new URL('../.verify/renderSong.js', import.meta.url), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.error('PAGEERROR:', e.message); process.exitCode = 1; });
await page.goto('about:blank');
await page.addScriptTag({ content: bundle });

const result = await page.evaluate(async ({ seed, useAppMixerLevels, only, presets, songPreset }) => {
  const r = await window.renderSong({ seed, bars: 16, useAppMixerLevels, only, presets, songPreset });
  return {
    sampleRate: r.sampleRate, bpm: r.bpm, peakVoices: r.peakVoices, noteCount: r.noteCount,
    left: Array.from(r.channels[0]), right: Array.from(r.channels[1] ?? r.channels[0]),
  };
}, { seed, useAppMixerLevels, only, presets, songPreset });
await browser.close();

const L = Float32Array.from(result.left);
const R = Float32Array.from(result.right);
const n = L.length;

// --- measurements ----------------------------------------------------------
let peak = 0, sumSq = 0, clipped = 0, dc = 0;
for (let i = 0; i < n; i++) {
  const v = (L[i] + R[i]) / 2;
  const a = Math.abs(v);
  if (a > peak) peak = a;
  if (a >= 0.999) clipped++;
  sumSq += v * v;
  dc += v;
}
const rms = Math.sqrt(sumSq / n);
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const crest = db(peak) - db(rms);

// Short-term RMS spread: a mix pumping against a slammed limiter has an
// unnaturally flat loudness profile; a dynamic one varies.
const win = Math.floor(result.sampleRate * 0.3);
const frames = [];
for (let i = 0; i + win <= n; i += win) {
  let s = 0;
  for (let j = i; j < i + win; j++) { const v = (L[j] + R[j]) / 2; s += v * v; }
  frames.push(Math.sqrt(s / win));
}
const loud = frames.filter(f => f > 1e-4).map(db);
const mean = loud.reduce((a, b) => a + b, 0) / (loud.length || 1);
const sd = Math.sqrt(loud.reduce((a, b) => a + (b - mean) ** 2, 0) / (loud.length || 1));

// Crude spectral balance via zero-crossing-free band energy (Goertzel-free):
// split with one-pole filters, enough to show low-end domination.
function bandEnergy(cutoff, high) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / result.sampleRate;
  const a = dt / (rc + dt);
  let lp = 0, e = 0;
  for (let i = 0; i < n; i++) {
    const v = (L[i] + R[i]) / 2;
    lp += a * (v - lp);
    const s = high ? v - lp : lp;
    e += s * s;
  }
  return Math.sqrt(e / n);
}
const low = bandEnergy(200, false);
const high = bandEnergy(200, true);

// Stereo image. A correlation of 1.0 means the two channels are identical:
// the mix is mono, however wide it was meant to sound.
let ll = 0, rr = 0, lr = 0, side = 0, mid = 0;
for (let i = 0; i < n; i++) {
  ll += L[i] * L[i]; rr += R[i] * R[i]; lr += L[i] * R[i];
  const m = (L[i] + R[i]) / 2, sd = (L[i] - R[i]) / 2;
  mid += m * m; side += sd * sd;
}
const correlation = (ll > 0 && rr > 0) ? lr / Math.sqrt(ll * rr) : 1;
const sideRatio = (mid + side) > 0 ? side / (mid + side) : 0;

// Band energies via cascaded one-pole filters. The earlier attempt at a
// spectral centroid decimated the signal while indexing bins as if it had
// not, so its answer was an artefact of the arithmetic rather than of the
// audio. A band breakdown is cruder and correct.
function lowpassEnergyCurve(cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / result.sampleRate;
  const a = dt / (rc + dt);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += a * ((L[i] + R[i]) / 2 - lp);
    out[i] = lp;
  }
  return out;
}
const EDGES = [0, 120, 500, 2000, 6000, 20000];
const curves = EDGES.slice(1, -1).map(lowpassEnergyCurve);
const bandRms = [];
for (let b = 0; b < EDGES.length - 1; b++) {
  let e = 0;
  for (let i = 0; i < n; i++) {
    const hiCurve = b === EDGES.length - 2 ? (L[i] + R[i]) / 2 : curves[b][i];
    const loCurve = b === 0 ? 0 : curves[b - 1][i];
    const v = hiCurve - loCurve;
    e += v * v;
  }
  bandRms.push(Math.sqrt(e / n));
}
const bandTotal = bandRms.reduce((a, b) => a + b, 0) || 1;

console.log(`\nmix measurements  (seed ${seed}${useAppMixerLevels ? ', app mixer levels' : ', generator levels'})`);
console.log('-'.repeat(62));
console.log(`bpm                    ${result.bpm}`);
console.log(`notes scheduled        ${result.noteCount}`);
console.log(`overlapping notes      ${result.peakVoices} (before voice stealing)`);
console.log(`peak level             ${db(peak).toFixed(2)} dBFS`);
console.log(`rms level              ${db(rms).toFixed(2)} dBFS`);
console.log(`crest factor           ${crest.toFixed(2)} dB`);
console.log(`samples at full scale  ${clipped} (${(100*clipped/n).toFixed(3)}%)`);
console.log(`dc offset              ${(dc/n).toFixed(6)}`);
console.log(`loudness spread        ${sd.toFixed(2)} dB (sd of 300ms frames)`);
console.log(`low/high energy <200Hz ${(low/(low+high)*100).toFixed(1)}% of total`);
console.log(`stereo correlation     ${correlation.toFixed(3)}  (1.000 = mono)`);
console.log(`side energy            ${(sideRatio*100).toFixed(1)}% of total`);
console.log('band balance           ' + EDGES.slice(0, -1)
  .map((lo, i) => `${lo}-${EDGES[i+1]}Hz ${(bandRms[i]/bandTotal*100).toFixed(0)}%`).join('  '));
console.log('-'.repeat(62));

// --- write a 16-bit stereo WAV --------------------------------------------
const bytes = 44 + n * 4;
const buf = Buffer.alloc(bytes);
buf.write('RIFF', 0); buf.writeUInt32LE(bytes - 8, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(result.sampleRate, 24);
buf.writeUInt32LE(result.sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
let o = 44;
const clamp = v => Math.max(-1, Math.min(1, v));
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(clamp(L[i]) * 32767), o); o += 2;
  buf.writeInt16LE(Math.round(clamp(R[i]) * 32767), o); o += 2;
}
writeFileSync(outPath, buf);
console.log(`\nwrote ${outPath} (${(bytes/1024/1024).toFixed(2)} MB)\n`);
