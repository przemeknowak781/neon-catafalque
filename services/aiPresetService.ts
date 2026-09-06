
import { GoogleGenAI, Type } from "@google/genai";
import { InstrumentParams } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface AIPresetSet {
  themeName: string;
  lead: { name: string; params: InstrumentParams };
  bass: { name: string; params: InstrumentParams };
  pad: { name: string; params: InstrumentParams };
  pluck: { name: string; params: InstrumentParams };
}

export interface AISinglePreset {
  name: string;
  params: InstrumentParams;
}

const instrumentSchema = {
  type: Type.OBJECT,
  properties: {
    osc1Wave: { type: Type.STRING, description: "One of: sawtooth, square, sine, triangle" },
    osc2Wave: { type: Type.STRING, description: "One of: sawtooth, square, sine, triangle" },
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

export const generateAIPresetSet = async (prompt?: string): Promise<AIPresetSet> => {
  const finalPrompt = prompt 
    ? `Generate a Darkwave preset set themed around: ${prompt}` 
    : "Generate a cohesive set of 4 Darkwave synthesizer presets (Lead, Bass, Pad, Pluck).";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: finalPrompt,
    config: {
      systemInstruction: `You are a legendary Darkwave sound designer. 
      Generate 4 highly evocative synth presets (Lead, Bass, Pad, Pluck) that work perfectly together.
      Rules:
      - Oscillator types must be exactly: 'sawtooth', 'square', 'sine', or 'triangle'.
      - Cutoff should range from 40 to 12000.
      - Resonance from 0 to 20.
      - Attack, Decay, Sustain, Release should be musical (0 to 3 seconds usually).
      - Glide in ms (0 to 500).
      - Chorus and Levels from 0 to 1.
      - Provide a creative 'themeName' for the whole set.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          themeName: { type: Type.STRING },
          lead: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, params: instrumentSchema }, required: ["name", "params"] },
          bass: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, params: instrumentSchema }, required: ["name", "params"] },
          pad: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, params: instrumentSchema }, required: ["name", "params"] },
          pluck: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, params: instrumentSchema }, required: ["name", "params"] },
        },
        required: ["themeName", "lead", "bass", "pad", "pluck"],
      },
    },
  });

  return JSON.parse(response.text);
};

export const generateSingleAIPreset = async (instrumentType: string, prompt?: string): Promise<AISinglePreset> => {
  const finalPrompt = prompt 
    ? `Generate a single ${instrumentType} preset themed around: ${prompt}` 
    : `Generate a killer Darkwave ${instrumentType} synthesizer preset.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: finalPrompt,
    config: {
      systemInstruction: `You are a legendary Darkwave sound designer. 
      Generate a single highly evocative ${instrumentType} synth preset.
      Rules:
      - Oscillator types must be exactly: 'sawtooth', 'square', 'sine', or 'triangle'.
      - Cutoff from 40 to 12000.
      - Resonance from 0 to 20.
      - Attack, Decay, Sustain, Release should be musical.
      - Glide in ms (0 to 500).
      - Chorus and Levels from 0 to 1.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          params: instrumentSchema
        },
        required: ["name", "params"],
      },
    },
  });

  return JSON.parse(response.text);
};
