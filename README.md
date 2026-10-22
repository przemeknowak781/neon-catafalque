<div align="center">

# NEON CATAFALQUE

**A darkwave sequencer that generates hooks against a written specification — and proves it did.**

<sub>
Twelve scales · twelve keys · seven song forms · eight progressions · thirty-one synth patches · two written songs<br>
Web Audio synthesis · a tape stage · MIDI and WAV export · 76 conformance checks · runs entirely in the browser, no server and no account
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
...                                   76 checks, 1944 generated songs
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

Thirty-one synth patches. Three reconstruct documented instruments and say so:

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
song below, and say that too. Afterimage is a blurred pluck, a saw and a
triangle that strike and decay to almost nothing, with a long release sent
into the chorus, the delay and the plate, and eight voices: the song plays its
melody as three-voice block chords. Leads and basses stay monophonic unless a
patch sets its own voice count. An optional per-patch `drift` parameter sets
how far each oscillator wanders over a note (4.5 cents, as before, when
absent). The music
box began as a physical model — a tine is a bar clamped at one end, whose
second mode sits at about 6.27 times its first — and now puts its upper sine
two octaves up instead, because in the song it doubles a melody over held
chords. Its comment says which is physics and which is a choice.

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
| Instrument patches | 31 | Vox Humana, Source Sequence, Ice Pick, Cathedral, Glass Rosary, Afterimage, Long Exposure |
| Song presets | 8 | Machine 1979, Juno Winter, Cold Cathedral, Acid Procession, Anemoia, The Summer We Never Had |
| Song forms | 7 | Full Song (26 bars), Mini-Song (16), Hook Phrase (8), Long Form (52), Club Edit (40), Anemoia (72), The Summer We Never Had (64) |
| Progressions | 8 | Descent, Lift, Plagal Fall, Rocking, Relative, Turnaround, Royal Road, Auto |
| Voice leading | 5 | Cantabile, Chorale, Angular, Drone, Soaring |

All 280 combinations of form, progression and voice-leading style are swept by
the test suite and each one still has to keep a common contour, a singable
range, one twist and its mode. Presets propose; the specification disposes.

## Songs that ship with it

**Anemoia** is written by hand rather than generated. Load it from **Song** in
the left panel; the generator is pointed at its key at the same time.

The brief was nostalgia for something the listener never lived through —
*anemoia*, John Koenig's 2012 coinage, a word rather than a measurable state.
The parts of it research can speak to, and what the song does with each:

| finding | in the song |
|---|---|
| Nostalgia is bittersweet: songs evoking mixed emotions were rated more nostalgic (Barrett et al., *Emotion* 10(3), 2010) | a driving 112 BPM under a verse in the relative minor |
| Conflicting tempo and mode cues evoke mixed happy-sad feelings (Hunter, Schellenberg & Schimmack, *Cognition and Emotion* 22(2), 2008) | a major chorus that turns minor on a chord foreign to its key |
| Young listeners' memory and emotion also peak for their parents' music, from before they were born (Krumhansl & Zupnick, *Psychological Science* 24(10), 2013) | an eighties vocabulary: chorused pads, gated snare, octave bass, a last-chorus key change |
| Expectations of a style are separate from memory of a piece — schematic and veridical (Bharucha; Huron, *Sweet Anticipation*, 2006) | a chorus that opens on a progression the ear knows, IVmaj9 – III7♭9 – vi9 – v9 I9 |
| Hexatonic-pole progressions carried the uncanny in nineteenth-century music (Cohn, *JAMS* 57(2), 2004), and major-third progressions are associated with it in pop, though not in every instance (Forrest, *Music Theory Online* 23(4), 2017) | the chorus comes home from B minor, the tonic's pole, every voice moving a semitone; the bridge walks B – G – E♭ |
| Hauntology hears the medium itself as the sign of a lost past (Fisher, *Dancecult* 5(2), 2013) | a tape clearest in the choruses, dissolving at both ends |

The lead plays the melody as block chords: under every melody note, the two
nearest tones of the chord written for that moment, extensions included, at
least a minor third apart, never below the pad's top voice and never a
semitone from any pad note. The chorus has one rhythmic cell — two dotted eighths and a note held from
the "and" of beat two — and every held note is a chord colour or a chord's
reason for being strange: the major seventh of A♭, the seventh of G7♭9, the
ninth of C minor; then, after a C♭ major 9♯11 whose sharp eleventh the melody
holds, the D of B minor, which rises a semitone to the tonic while every voice
of the pad does the same. Freud's uncanny is the familiar made unfamiliar; the
first half of the chorus is the familiar, the second the unfamiliar way home.
The verse sits on a C pedal under C minor 9, D♭ over C (the Phrygian second),
A♭ and B♭ over C, and ends on a G suspension whose dominant resolves
deceptively, onto the chorus's A♭. The sign-on plays the chorus's opening at
half speed on a music box, through the most worn tape in the song; the
sign-off plays the strange half once more and stops a note short of home.

This is the song's third version. The first was written to earworm.md's
melodic targets — 70-90% stepwise motion, exactly one uncommon turning point
per four bars — met every one of them, and was heard as busy and scalar, with
a lead that wailed. The second stood on plain triads and a fifth-third-fifth
motif and was heard as naive. The third is 54% and 27% stepwise in its two
halves, most of its turning points count as uncommon by the spec's own
measure, and its information content runs above the spec's band, so those
targets are not applied to it. `verify:earworm` checks it for what it is made
of instead — one rhythmic cell, the repeat, held notes that are chord tones
and mostly colours, the semitone return from the hexatonic pole, the verse
pedal, the bridge in major thirds, a lead that never sinks under the pad — and
for the spec's range, length, rhythm and contour bands per four bars, which it
still meets, and that the lead plays its chorus as three-voice chords:
eighteen checks. The finding earworm.md quotes for its
turning-point rule — "less common average gradients between melodic turning
points" — is from Jakubowski et al. (*Psychology of Aesthetics, Creativity,
and the Arts* 11(2), 2017), who found it, together with more common global
contours, in earworm tunes against matched tunes and a pop corpus. That is a
statistic of a whole tune; the spec turned it into a count per four bars.

**The Summer We Never Had** is the second, written after Anemoia had drifted
towards chill: extended chords everywhere and the energy held down. This one
is aimed at nostalgia rather than calm, and the difference it bets on is
arousal and line. Arousal predicted music-evoked nostalgia in Barrett et al.
(2010), so it drives: 108 BPM, a sixteenth-note arpeggio, four on the floor
in the choruses, a pad that pumps under the kick. And it sings, in the two
devices Sloboda (*Psychology of Music* 19(2), 1991) found listeners linking
to tears and chills: appoggiaturas and melodic sequences. It starts on the
verse. The whole song stands on one eight-bar progression built around a
secondary dominant: I, V/vi, vi, IV; I, V/vi, IV, V. The F♯7 in every second
bar is the song's one event, resolving to B minor the first time and
deceptively to G the second; the verse plays the loop low and the chorus
high, the bridge holds the F♯7 for four bars, and the last chorus and outro
are a semitone up, the outro ending on the tonic. Its melody is a
pick-up and one long note per bar with the rest of the bar left open, a
gesture stated three times in sequence, the even bars opening on an
appoggiatura that falls a step into the chord, the third statement reaching
the song's highest note. The chord melody — a pick-up and one long note a bar, its even bars opening
on appoggiaturas, the whole gesture stated three times in sequence — is the
pad: struck as four-voice chords an octave down on a supersaw, with the
second chorus answering in its rests and the third carved with tails. Over
it a mono lead sings a second line, entering after the chords strike and
tying across the barline, silent through the first verse, peaking on the
F♯ of the second F♯7. A sixteenth-note arpeggio sits between the two, placed
clear of both, and the rhythm is a pulse: the kick on every beat, the open
hat against it, a bass of held roots, short octaves and a ghost before each
beat, layered with an octave sub. The song is shaped against its own measurements:
the first verse has no kick for four bars and a bass in quiet eighths, the
two bars before every chorus drop the kit and the bass while the tape's
hiss rises like a riser and its lowpass opens, the drop lands on the chorus
downbeat, the second verse puts the arpeggio an octave up, the second
chorus's chord layer answers every held note in the rest after it, and the
third's is carved: the same skeleton with tails that lead each bar into the
next. Rendered,
the first verse sits 3.7 dB under the first chorus and 160 Hz darker in
spectral centroid, where the flat version before it managed 0.8 dB. The last chorus
is a semitone up, reached through F and B♭. Nine checks of its own in
`verify:earworm`, and the shared song checks, which both songs pass.

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
npm run verify:earworm   # the 76 conformance checks
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
  score.ts              what the written songs share: spelling, chords, pad, harmoniser
  anemoia.ts            the first written song: its score, harmony and tape moves
  summer.ts             the second
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
