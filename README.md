<div align="center">

# NEON CATAFALQUE

**A darkwave sequencer that generates hooks against a written specification — and proves it did.**

<sub>
Twelve scales · twelve keys · five song forms · seven progressions · twenty synth patches<br>
Web Audio synthesis · MIDI and WAV export · 49 conformance checks · runs entirely in the browser, no server and no account
</sub>

</div>

---

Most generative music tools produce something and leave you to decide whether
it worked. This one starts from [`earworm.md`](earworm.md) — a specification of
what makes a melody stick, written in numbers — generates candidates, scores
them against it, and keeps the best. Then a test suite re-derives every one of
those numbers from 1900-odd generated songs and fails the build if any of them
drifts.

So the claims below are checkable. `npm run verify:earworm` prints the table.

```
PASS    100.0%    95%  §2.1A / §8B    contour class is a common shape
PASS     99.7%    90%  §2.1B / §8B    exactly 1 atypical turning point per 4 bars
PASS     88.8%    85%  §3.3 / §4.1    stepwise ratio 0.7-0.9
PASS     99.8%    85%  §2.2 / §8C     mean information content 1.5-4 bits
PASS     92.4%    85%  §6             lead agrees with the chord on beats 1 and 3
...                                   49 checks, 1944 generated songs
```

---

## What it does

**Writes the hook first.** A melody is built from anchor notes on the strong
beats outward, not left to right. Each candidate is scored on contour shape,
interval distribution, information content under a variable-order Markov model,
rhythmic self-similarity and modal colour; the top few are mutated and the best
survives. The A′ variation keeps the rhythm exactly and changes at most two
notes, which is what makes a hook feel answered rather than replaced.

**Then builds a song around it.** Intro, verses, choruses, a bridge that drops
the kit, and a final chorus that lands higher than the first. The hook is
withheld through the intro, stated sparsely in the verses and in full in every
chorus.

**Then plays it.** Four subtractive synth voices and a drum kit, built from
Web Audio primitives — 24 dB/octave filters, unison oscillator stacks, a stereo
chorus at Juno-106 rates, a four-stage phaser, a flanger, a ping-pong delay
locked to the transport, a plate with early reflections, and a mastering chain
with mid/side width, bus compression, shelves and kick-driven sidechain
ducking.

## The calibration

The information-content band is the part that could most easily have been
invented, so it is pinned to melodies anyone can check:

| reference | mean IC | in band |
|---|---|---|
| *Ode to Joy* | 3.09 bits | yes |
| *Smoke on the Water* | 3.69 bits | yes |
| one note repeated | 0.42 bits | no |

A band that admits both of those and rejects a flat line is a band that means
something. The generator's own median is 3.31 bits.

## Sound

Twenty synth patches. Three reconstruct documented instruments and say so:

- **Vox Humana** — the Polymoog 280A factory preset Gary Numan bought the
  instrument for, and the string part on *Cars* (1979). Chorused, near-still
  filter, and a phaser, which is the treatment that record is reported to have
  used.
- **Source Sequence** — the Moog Source, monophonic and hard, as used for the
  bassline of New Order's *Blue Monday* (1982).
- **Juno Cold / Juno Fog / Juno Bass** — the Roland Juno-106, one DCO per voice
  with the chorus doing the work rather than the filter.

The rest are built from the same vocabulary. Where a preset name refers to a
genre rather than a machine, it describes a convention and says so — nothing
here claims to be a band's actual patch without a source.

These are reconstructions from documented character, not samples and not A/B'd
against the originals.

## Scales and keys

| | |
|---|---|
| **Common** | Natural Minor, Major, Harmonic Minor, Dorian |
| **Lead scales** | Minor Pentatonic, Major Pentatonic |
| **Modal colour** | Mixolydian, Lydian, Phrygian, Melodic Minor |
| **Eastern** | Phrygian Dominant, Double Harmonic |

Each mode gets the chords it actually has — the canonical darkwave loops are
written for Aeolian and produce triads that do not exist elsewhere — and its
own melodic colour tones.

The pentatonics are a parent scale plus a preference rather than five-note
scales: the anchors on strong beats are held to the five tones (99% of them,
measured) and the fill passes through the rest. A strictly five-note melody
cannot satisfy the specification's stepwise band at all, and that is not how
the scale is used anyway.

Twelve keys, folded to the nearest interval — never more than a tritone from C,
so no key thins the mix. Each part's register moves independently by whole
octaves.

## Presets

| bank | count | examples |
|---|---|---|
| Instrument patches | 20 | Vox Humana, Source Sequence, Ice Pick, Cathedral, Glass Rosary |
| Song presets | 6 | Machine 1979, Juno Winter, Cold Cathedral, Acid Procession |
| Song forms | 5 | Full Song (26 bars), Mini-Song (16), Hook Phrase (8), Long Form (52), Club Edit (40) |
| Progressions | 7 | Descent, Lift, Plagal Fall, Rocking, Relative, Turnaround, Auto |
| Voice leading | 5 | Cantabile, Chorale, Angular, Drone, Soaring |

All 175 combinations of form, progression and voice-leading style are swept by
the test suite and each one still has to keep a common contour, a singable
range, one twist and its mode. Presets propose; the specification disposes.

## Holding a hook

Found a melody worth keeping? **Hold** pins it. Generating again keeps it note
for note and rebuilds everything else around it — including into a different
song form, so a line found in Hook Phrase mode grows into a full song without
rolling the dice on it again.

Each track also has a **↻** that rebuilds only that part, against the same
chords, tempo, hook and kick pattern.

## Getting it out

- **MIDI** — a type 1 Standard MIDI File, one track per instrument, drums on
  channel 10 with General MIDI percussion keys, velocities carrying the
  arrangement's dynamics.
- **WAV** — rendered offline through the same engine and scheduler the
  transport uses, so what you export is what you heard.
- **Presets** — a JSON file carrying the patches, the effects and the generator
  settings, so a file restores the whole state.

MIDI files written by Catafalque import back as songs, not just as patches.

## Running it

```bash
npm install
npm run dev
```

No API key needed. The Gemini features (naming and patch suggestions) are
optional and ask for a key in the app if you want them; the sequencer, the
generator and every export work without one.

```bash
npm run build            # production bundle
npm run verify:earworm   # the 49 conformance checks
npm run typecheck
npm run mix              # render a song headlessly and measure it
```

`npm run mix` renders through Chromium and reports peak, RMS, crest factor,
clipping, loudness spread, stereo correlation, side energy and band balance,
then writes a WAV. It is how every mix claim in the commit history was arrived
at.

## On phones

The layout collapses to one column below 1024 px: the sequencer fills the
screen, the two side panels become drawers behind a bottom tab bar, and
transport and generate stay on the top bar where they are always reachable.
Knobs and faders use pointer events with pointer capture, so they work under a
finger.

## Layout

```
services/
  earwormGenerator.ts   scales, chords, the hook search, arrangement rendering
  earwormAnalysis.ts    the measurement layer — contour, intervals, expectation
  audioEngine.ts        synthesis, effect buses, mastering chain
  songScheduler.ts      one step-scheduling path, shared by transport and render
  offlineRender.ts      OfflineAudioContext rendering for export and measurement
  songExport.ts         MIDI and WAV writing, MIDI and preset reading
  arrangement.ts        song forms
  harmonyPresets.ts     progressions and voice-leading styles
scripts/
  verifyEarworm.ts      the conformance suite
  measureMix.mjs        headless mix measurement
earworm.md              the specification everything above is checked against
```

## What this is not

Not a DAW, not a plugin host, and not a model — there is no neural network
here, only a scoring function and a search. It will not write you a song you
could not have written; it will write you a hundred that satisfy a stated
definition of a hook, quickly, and show its working.

---

<div align="center">
<sub>Built with Claude Code. Every number in this file is produced by a command in it.</sub>
</div>
