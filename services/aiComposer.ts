
import { Type, Schema } from "@google/genai";
import { getGeminiClient } from "./geminiClient";
import { InstrumentParams } from "../types";

export interface AINote {
  n: string; // Note name (e.g., "C3")
  s: number; // Start step relative to section start
  d: number; // Duration in steps
}

export interface AISectionData {
  lead: AINote[];
  bass: AINote[];
  pad: AINote[];
  pluck: AINote[];
  kick: boolean[];
  snare: boolean[];
  hihat: boolean[];
  fx: boolean[];
}

export interface AISongResult {
  bpm: number;
  key: string;
  themeName: string;
  // Global Sound Design
  leadParams: InstrumentParams;
  bassParams: InstrumentParams;
  padParams: InstrumentParams;
  pluckParams: InstrumentParams;
  // Sections
  intro: AISectionData; // 32 steps (2 bars)
  verse: AISectionData; // 32 steps (2 bars)
  chorus: AISectionData; // 64 steps (4 bars)
}

const instrumentParamsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    osc1Wave: { type: Type.STRING, description: "sawtooth, square, sine, or triangle" },
    osc2Wave: { type: Type.STRING, description: "sawtooth, square, sine, or triangle" },
    detune: { type: Type.NUMBER },
    subLevel: { type: Type.NUMBER },
    noiseLevel: { type: Type.NUMBER },
    cutoff: { type: Type.NUMBER },
    resonance: { type: Type.NUMBER },
    filterEnvAmount: { type: Type.NUMBER },
    attack: { type: Type.NUMBER },
    decay: { type: Type.NUMBER },
    sustain: { type: Type.NUMBER },
    release: { type: Type.NUMBER },
    filterAttack: { type: Type.NUMBER },
    filterDecay: { type: Type.NUMBER },
    filterSustain: { type: Type.NUMBER },
    filterRelease: { type: Type.NUMBER },
    glide: { type: Type.NUMBER },
    vibratoRate: { type: Type.NUMBER },
    vibratoDepth: { type: Type.NUMBER },
    chorusMix: { type: Type.NUMBER },
  },
  required: [
    "osc1Wave", "osc2Wave", "detune", "subLevel", "noiseLevel", "cutoff", "resonance",
    "filterEnvAmount", "attack", "decay", "sustain", "release", "filterAttack",
    "filterDecay", "filterSustain", "filterRelease", "glide", "vibratoRate",
    "vibratoDepth", "chorusMix"
  ],
};

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    n: { type: Type.STRING, description: "Note e.g. C3, D#2." },
    s: { type: Type.INTEGER, description: "Start step relative to section." },
    d: { type: Type.NUMBER, description: "Duration in steps." }
  },
  required: ["n", "s", "d"]
};

const sectionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    lead: { type: Type.ARRAY, items: noteSchema },
    bass: { type: Type.ARRAY, items: noteSchema },
    pad: { type: Type.ARRAY, items: noteSchema },
    pluck: { type: Type.ARRAY, items: noteSchema },
    kick: { type: Type.ARRAY, items: { type: Type.BOOLEAN } },
    snare: { type: Type.ARRAY, items: { type: Type.BOOLEAN } },
    hihat: { type: Type.ARRAY, items: { type: Type.BOOLEAN } },
    fx: { type: Type.ARRAY, items: { type: Type.BOOLEAN } },
  },
  required: ["lead", "bass", "pad", "pluck", "kick", "snare", "hihat", "fx"]
};

export const composeAISong = async (): Promise<AISongResult> => {
  const prompt = `
    Act as an Expert Darkwave Composer & Music Psychologist.
    Compose a complete 128-step Darkwave track with structure: INTRO -> VERSE -> CHORUS.
    
    CRITICAL: Apply Scientific Earworm Principles (Involuntary Musical Imagery) to the CHORUS.
    
    1. STRUCTURE
       - INTRO (32 Steps / 2 Bars): Atmospheric, establishing the "Flat-Side" harmony (i - bVII - bVI).
       - VERSE (32 Steps / 2 Bars): Driving bass, sparser melody, building tension.
       - CHORUS (64 Steps / 4 Bars): The "Sticky" Hook.
    
    2. CHORUS EARWORM RULES (Apply strictly to Chorus section)
       - PHRASING: Use A - A' structure (Repeat the motif with small variation).
       - CONTOUR: Use a "Common Global Contour" (Arch: Rise-Peak-Fall or Descent).
       - THE TWIST: Insert exactly one "Turning Point Twist" (unusual interval/gradient) in the 3rd bar of the chorus (steps 32-48 relative). This micro-surprise triggers memory retention.
       - RHYTHM: Repetitive rhythmic cell (high singability).
    
    3. DARKWAVE AESTHETIC
       - Harmony: Minor/Aeolian mode. Focus on i, bVI, bVII.
       - Bass: Driving 8th notes (Root-Octave or walking). Sawtooth/Square.
       - Drums: "Machine" feel. Kick 4-on-floor, Snare on 2/4 with gated reverb style.
       - BPM: Fast/Driving (120-138 BPM).
    
    4. OUTPUT
       - Generate sound design parameters (InstrumentParams) for the whole track.
       - Generate Note/Drum patterns for INTRO, VERSE, and CHORUS sections separately.
  `;

  const response = await getGeminiClient().models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are a specialized AI for procedural music generation, focusing on Goth, Darkwave, and EBM genres.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bpm: { type: Type.INTEGER },
          key: { type: Type.STRING },
          themeName: { type: Type.STRING },
          leadParams: instrumentParamsSchema,
          bassParams: instrumentParamsSchema,
          padParams: instrumentParamsSchema,
          pluckParams: instrumentParamsSchema,
          intro: sectionSchema,
          verse: sectionSchema,
          chorus: sectionSchema
        },
        required: ["bpm", "key", "themeName", "leadParams", "bassParams", "padParams", "pluckParams", "intro", "verse", "chorus"],
      },
    },
  });

  return JSON.parse(response.text);
};
