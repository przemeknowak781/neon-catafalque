<div align="center">

# NEON CATAFALQUE

**A darkwave sequencer that generates hooks against a written specification — and proves it did.**

<sub>
Twelve scales · twelve keys · six song forms · eight progressions · twenty-four synth patches · one written song<br>
Web Audio synthesis · a tape stage · MIDI and WAV export · 62 conformance checks · runs entirely in the browser, no server and no account
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
...                                   62 checks, 1944 generated songs
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

Twenty-four synth patches. Three reconstruct documented instruments and say so:

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
here claims to be a band's actual patch without a source. Four — Afterimage,
Tail Lights, Faded Slide and Music Box Mobile — are original, written for the
song below, and say that too. The music box is the closest thing here to a
physical model: a tine is a bar clamped at one end, whose second mode sits at
about 6.27 times its first, so the patch is two sines that far apart with a
filter envelope that kills the upper one within a tenth of a second.

These are reconstructions from documented character, not samples and not A/B'd
against the originals.

**Tape.** The whole mix can be printed to a worn cassette: wow, a slower drift
under it, flutter, hiss and a bandwidth lowpass. It is the one effect that
moves every voice at once, which per-note vibrato cannot do and which is most
of why a worn recording sounds old rather than detuned. Measured on a test
sine, 10 cents of wow set is 9.6 cents at the wow rate and 3 cents of flutter
is 2.7. Off by default, and off means bypassed: renders of the existing presets
null against the engine from before it at the renderer's own noise floor.

Two smaller additions, both from the Juno-106 and both optional: an LFO delay
(the vibrato fades in, 0-3 s, Roland's own range) and a per-patch voice count.

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
| Instrument patches | 24 | Vox Humana, Source Sequence, Ice Pick, Cathedral, Glass Rosary, Afterimage |
| Song presets | 7 | Machine 1979, Juno Winter, Cold Cathedral, Acid Procession, Anemoia |
| Song forms | 6 | Full Song (26 bars), Mini-Song (16), Hook Phrase (8), Long Form (52), Club Edit (40), Anemoia (72) |
| Progressions | 8 | Descent, Lift, Plagal Fall, Rocking, Relative, Turnaround, Royal Road, Auto |
| Voice leading | 5 | Cantabile, Chorale, Angular, Drone, Soaring |

All 240 combinations of form, progression and voice-leading style are swept by
the test suite and each one still has to keep a common contour, a singable
range, one twist and its mode. Presets propose; the specification disposes.

## A song that ships with it

**Anemoia** is written by hand rather than generated, and gets no exemption:
its hook and the answer to it are scored by the same function as every
generated candidate, against the same targets, and the song around them is
checked for what a generated song is checked for — thirteen checks in
`verify:earworm`. Load it from **Song** in the left panel; the generator is
pointed at its key and progression at the same time.

The brief was nostalgia for something the listener never lived through —
*anemoia*, John Koenig's 2012 coinage, a word rather than a measurable state.
The parts of it research can speak to, and what the song does with each:

| finding | in the song |
|---|---|
| Nostalgia is bittersweet: songs evoking mixed emotions were rated more nostalgic (Barrett et al., *Emotion* 10(3), 2010) | a driving 112 BPM under harmony that keeps turning minor |
| Conflicting tempo and mode cues evoke mixed happy-sad feelings (Hunter, Schellenberg & Schimmack, *Cognition and Emotion* 22(2), 2008) | the borrowed minor iv under a held melody note, every chorus |
| Young listeners' memory and emotion also peak for their parents' music, from before they were born (Krumhansl & Zupnick, *Psychological Science* 24(10), 2013) | an eighties vocabulary: chorused pads, gated snare, octave bass, a last-chorus key change |
| Expectations of a style are separate from memory of a piece — schematic and veridical (Bharucha; Huron, *Sweet Anticipation*, 2006) | everything is familiar except the melody |
| Hauntology hears the medium itself as the sign of a lost past (Fisher, *Dancecult* 5(2), 2013) | a tape clearest in the choruses, dissolving at both ends |

The chorus is IVmaj7 – V7sus4 – iii7 – vi7, the royal-road progression of
Japanese pop (Ramage, *Music Theory Spectrum* 45(2), 2023), which never touches
the tonic. Its answer reaches the tonic for one bar and turns it minor in the
next, under a melody note that does not move. The peak is an appoggiatura on
the iii chord — the device Sloboda (*Psychology of Music* 19, 1991) found
associated with tears. The sign-on plays the whole hook at half speed on a
music box, through the most worn tape in the song, so the chorus arrives
already half-known; the bridge sets the hook's opening on borrowed chords at
half speed; the sign-off plays it once more and stops a note short.

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

`npm run mix -- out.wav --builtin Anemoia --bars 0` renders the built-in song
whole. Offline rendering schedules two bars at a time and detaches each voice
when it finishes, so its cost grows with the length of a song rather than with
the square of it — sixteen bars of Anemoia went from 34 s to 13.6 s.

One caveat on reproducibility: in the Chromium this was measured with, two
renders of the same song are not always identical. Some runs diverge from
about 0.75 s, mostly between 500 Hz and 6 kHz — the original engine does it
too — so null tests here compare against the spread of repeated renders, not
against a single one.

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
songs/
  anemoia.ts            the written song: its score, harmony and tape moves
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
