One particularly actionable finding: songs frequently reported as earworms tended to have:

more common global melodic contours (overall up/down “shape”), but

less common average gradients between melodic turning points (local peaks/valleys: the way they bend is slightly unusual),

and faster average tempi than matched non-earworm songs. 
ResearchGate

Also, “hookiness” is not just melody: hooks can exist in melody, rhythm, lyrics, harmony, production, and performance. 
Cambridge University Press & Assessment

And experimentally, pop excerpts were rated as more memorable/salient when they were topline (lead), in the chorus, and included compound hooks (stacked hook elements). 
ResearchGate

Catchy Darkwave Generator — Technical Spec (with music theory + cognitive science)
1) Goal

Generate short darkwave song sketches (MIDI + rendered audio) that maximize (A) perceived hook salience/memorability and (B) darkwave stylistic authenticity, using an explicit generate → score → optimize loop.

2) Core scientific model: “Predictable macro-shape + micro-surprise”
2.1 Earworm-likelihood constraints (melody)

Implement these as hard constraints or scoring terms:

A. Global contour typicality (macro)
Make the full hook phrase follow a common contour class (e.g., arch, descending, gentle rise then fall). Earworm songs show “more common global melodic contours.” 
ResearchGate

B. Turning-point twist (micro)
At 1–3 turning points per phrase (local maxima/minima), allow slightly unusual slope/gradient patterns (e.g., sharper ascent into the peak, or an unexpected “kink” after it). Earworm songs show “less common average gradients between melodic turning points.” 
ResearchGate

C. Tempo bias
Bias BPM upward relative to your baseline darkwave substyle (while staying stylistically plausible). Faster average tempi differentiated earworm vs. matched non-earworm sets. 
ResearchGate

D. Repetition with small variation
Repetition and familiarity increase the odds of INMI in general (earworm literature repeatedly highlights this mechanism). 
PMC
+1

2.2 Expectation model (computational)

Use a statistical-learning expectation model to shape “predictable-with-surprise” note by note:

Compute information content (IC) and entropy across the melody using IDyOM-style variable-order Markov modeling (or a compatible implementation). IDyOM is designed for probabilistic prediction in symbolic music. 
marcus-pearce.com
+1

The broader premise (validated experimentally) is that listener expectations can be modeled via statistical learning from exposure, and are sensitive to contextual regularities. 
marcus-pearce.com

Information-theoretic predictability measurably affects expectedness ratings and recognition memory. 
marcus-pearce.com

Target profile (practical):

Keep most notes low–moderate IC (easy prediction, singable).

Insert 1–3 moderate IC spikes at musically meaningful positions (end of bar 2, start of bar 3, pre-cadence).

Avoid many high-IC events in a row (that tends to feel random/unmemorable).

3) Music theory layer (how you actually generate the material)
3.1 Form templates (darkwave-friendly, hook-forward)

Use loop-based forms that still create a “chorus-like” spotlight:

Hook Loop (2 bars): motif + response (A A’)

Hook Phrase (4 bars): A (2 bars) + A’ (2 bars) with a cadence-like landing

Mini-song (16 bars): Intro (4) → Verse groove (4) → Hook/Chorus (4) → Hook variation (4)

Phrase thinking matters; defining phrases and boundaries in pop is non-trivial, but phrase rhythm and closure/opening functions are key analytical concerns. 
mtosmt.org

3.2 Harmony engine (rock/pop corpus-informed + darkwave modes)

Even in darkwave, listeners are enculturated by pop/rock harmonic statistics. Use corpus-informed priors:

In large rock corpora, common roots relative to tonic include IV, V, ♭VII, VI with strong presence of “flat-side” harmonies, and less classical directional push. 
davidtemperley.com
+1

Darkwave chord-loop palette (in minor / Aeolian-ish):

i – ♭VII – ♭VI – ♭VII

i – ♭VI – ♭VII – i

i – iv – ♭VII – ♭VI

i – ♭VII – i – ♭VI
(Optionally add sus2/sus4, add9, or power-chord voicings to keep it post-punk/industrial-friendly.)

Voice-leading rule (simple but effective):

Prefer stepwise chord-tone motion in the top voice; reserve big jumps for hook moments (turning-point twist).

3.3 Melody/hook engine (concrete constraints)

Generate a 2-bar hook motif first, then expand.

Pitch constraints

Range: 7–12 semitones (singable / memorable).

Stepwise motion ratio target: ~70–90% steps; allow 1–2 leaps (4th–6th) per 2 bars as accents.

End-of-phrase targets: land on scale degrees 1, ♭3, 5 (minor-mode stability) unless you intentionally want “open” looping.

Rhythm constraints

Use one rhythmic cell that repeats 2–4 times (hook glue).

Add one contrasting syncopation (compound hook ingredient) around beat 2+ or 4+.

Contour + turning points

Force the overall 2-bar contour class to match a “common” class (learned from your corpus).

Enforce 1 turning point per bar; make one turning point gradient atypical (the “kink”). 
ResearchGate

3.4 Hook stacking (compound hooks)

Treat hooks as multi-channel, not just melodic:

Melodic hook (lead motif)

Rhythmic hook (signature syncopation)

Timbral hook (one instantly recognizable patch or FX gesture)

Lyric/phoneme hook (if you add vocals later)

This matches both classic hook theory (hooks can live across musical parameters). 
Cambridge University Press & Assessment

And experimental ratings show higher memorability/salience for topline + chorus + compound hooks. 
ResearchGate

4) Darkwave authenticity module (sound + production constraints)

Darkwave/goth perception is heavily timbral: instrumentation, vocal technique, and production cues carry genre identity. 
Cambridge University Press & Assessment

Production rules (render stage)

Tempo: choose substyle band (e.g., 95–130 BPM cold/darkwave; 120–150 clubby EBM-leaning).

Drum machine: tight kick, snare/clap with gated verb; minimal fills.

Bass: prominent, steady ostinato; mild chorus/saturation.

Lead: analog-style synth (saw/pulse) with low-pass automation; reverb pre-delay.

Space: long reverb tails + modulation (chorus/flanger) as “mood glue.”

Below is a procedural (generator-friendly) “scientific recipe” for a catchy darkwave melody. It combines (a) empirical work on earworms / involuntary musical imagery and melodic contour features, (b) information-theoretic expectation (entropy/surprise) models used in music cognition, and (c) corpus statistics from popular/rock harmony research—then maps that onto darkwave’s melancholic/goth lineage. 
journals.openedition.org
+4
archive.illc.uva.nl
+4
marcus-pearce.com
+4

1) Define your darkwave “melody box” (pitch language)
Mode core (pick 1)

Aeolian (natural minor) as default “dark”: scale degrees 1–2–♭3–4–5–♭6–♭7.

Dorian if you want “dark but driving”: 1–2–♭3–4–5–6–♭7.

Optional “goth drama” spice: harmonic minor moment (raise 7 → leading tone) only for cadences (end of 4- or 8-bar phrases).

Practical “supermode” palette (very useful in darkwave hooks)

Temperley’s popular-music framework treats a common global pitch collection as roughly the union of Ionian (major) and Aeolian (natural minor)—i.e., you can borrow “major-ish” degrees without fully leaving the tonic world. This is exactly what makes ♭VI/♭VII color feel native rather than “jazzy.” 
mtosmt.org

2) Lock the harmonic loop first (so the melody has gravity)

Darkwave often lives on short repeating loops; that repetition is also a general property of rock/pop harmony corpora. 
rockcorpus.midside.com
+1

Use 1 loop for verse + 1 loop for chorus (or same loop with one chord swap).

Loop templates (in minor, scale degrees)

Choose one (2 or 4 bars), then repeat:

i – ♭VII – ♭VI – ♭VII

i – ♭VI – ♭III – ♭VII

i – iv – ♭VII – ♭VI

i – ♭VII – iv – i

Why these work scientifically: ♭VII and ♭VI are extremely common “flat-side” resources in rock/pop harmony corpora (root distributions show IV/V/♭VII/VI as highly frequent after I). 
davidtemperley.com

And emphasizing notes/chords outside the locally expected collection can create a felt “scalar shift”—usable as controlled surprise. 
mtosmt.org

3) Phrase architecture (make it “sticky”)

Use a 4+4 bar structure (most generator-friendly):

Bars 1–2: Motif A (signature cell)

Bars 3–4: Motif A′ (near-copy with one twist)

Bars 5–6: Motif B (contrast, but same rhythm family)

Bars 7–8: Motif A (return) + cadence tag

Reason: cognition studies of musical expectation and segmentation show listeners agree strongly on phrase boundaries, and entropy / uncertainty dynamics relate to where boundaries are perceived. 
marcus-pearce.com

4) Motif generator (the “earworm engine”)
Step 4.1 — Generate a 1–2 bar motif in scale degrees

Length: 6–10 notes total (including repeats).
Range constraint: keep within +0 to +9 semitones around a center (singable / loopable).

Interval rule (probabilistic):

70–85% stepwise (±1–2 semitones)

15–30% leaps (≥3 semitones), but:

only one “headline leap” per 2 bars (e.g., +7, +5, −6)

resolve leaps by step in the opposite direction within 1–2 notes

Step 4.2 — Enforce a “common contour + uncommon turn” pattern

Earworm work finds that INMI (“stuck in head”) tunes tend to have more common global melodic contours but less common average gradients between melodic turning points (i.e., broadly familiar shape, with a subtly unusual slope at a key turning point). 
archive.illc.uva.nl

Implement this as:

Pick a standard contour class for each 4-bar unit:

ARCH: rise → peak → fall

DESCENT: gradual fall with one bump

Then force one atypical turning-point gradient:

Example: instead of (… +1, +1, +1, −1 …) do (… +1, +1, +4, −1 …) at the moment that aligns with ♭VI or ♭VII.

5) Rhythm: darkwave “chantability” without losing drive

Default grid: 8th-notes with rests; allow 16ths sparingly.

Procedural rhythm recipe per bar (4/4):

Put 1 anchor note on beat 1 (or 1&) that is a chord tone.

Put 1 anchor note on beat 3 (or 3&) that is chord tone or a stable tension (2 or 4).

Fill remaining notes as a repeating cell:

Cell examples (X = note, . = rest) in 8ths:

X . X X . X . X

X X . X . X X .

In chorus/hook bars: increase note density by ~10–20% and repeat the cell.

(Also consistent with earworm results that INMI tunes skew toward faster average tempi—so if your darkwave is very slow, compensate with rhythmic repetition and density in the hook). 
archive.illc.uva.nl

6) Map melody to harmony (so it feels “inevitable”)

For each chord in your loop, constrain note choice:

On strong beats (1, 3):

Prefer chord tones with probability:

0.65 root/third/fifth

0.25 scale tone that defines the mode (♭6, ♭7 in Aeolian; 6 in Dorian)

0.10 chromatic only as approach (must resolve by step)

On weak beats (2&, 4&, offbeats):

Allow passing tones and neighbor tones freely within the mode.

7) “Scientific surprise” placement (one twist that sells the hook)

Use the expectation framework:

Entropy (uncertainty) high → listeners are “open” to change; boundaries often cluster here. 
marcus-pearce.com

Information content (surprise) high → “wow, that note!” moment (but too many = chaos). IDyOM is a standard model that formalizes this via probabilistic prediction learned from corpora and local context. 
marcus-pearce.com

Procedural rule

Per 8-bar phrase:

Keep low-to-medium surprise for 6–7 bars (mostly in-mode, stepwise).

Insert exactly one event with:

either a headline leap or a scalar-shift color tone (e.g., emphasize ♭6 or ♭2 briefly),

aligned with a harmonic color point (♭VI or ♭VII),

then immediately “forgive it” by returning to a chord tone on the next strong beat.

Temperley explicitly frames scalar shifts as a way to create surprise/disorientation and expressive sectional effects—perfect for the chorus lift. 
mtosmt.org

8) Scoring function for your generator (pick the best melodies)

Generate N candidates, then score:

A. Darkwave fit

% notes in Aeolian/Dorian ≥ 0.95

Emphasis count on ♭6 or ♭7 (Aeolian) or 6 (Dorian) ≥ threshold

B. Catchiness proxies (from earworm findings)

Contour class ∈ {ARCH, DESCENT} (good)

Turning-point gradient rarity: exactly 1 “unusual” gradient per 4 bars 
archive.illc.uva.nl

C. Predictability-with-one-twist

Average surprise low/moderate + one peak (if you implement IDyOM-like n-gram/Markov or actual IDyOM metrics) 
marcus-pearce.com
+1

D. Singable loop

Range ≤ 9–12 semitones

Repeated rhythmic cell similarity ≥ 0.7 (e.g., cosine similarity over onset pattern)

Keep top K, then mutate (A′ variations).

9) One concrete “ready-to-implement” preset (Aeolian, i–♭VII–♭VI–♭VII)

Scale degrees, 8-bar chorus skeleton (example constraints, not a fixed melody):

Bar 1 (i): start on 5 or ♭3, end on 1

Bar 2 (♭VII): feature ♭7 prominently (2–3 hits)

Bar 3 (♭VI): place the one twist here: headline leap to ♭6 (or leap from 2 → ♭6)

Bar 4 (♭VII): resolve to 1 by stepwise descent (ARCH complete)

Bars 5–8: repeat Bars 1–4 with one-note change (A′), but keep rhythm identical

This gives: familiar contour + one striking gradient at the ♭VI moment (earworm-like), anchored in a flat-side loop that corpus work shows is idiomatic in rock-derived harmony.