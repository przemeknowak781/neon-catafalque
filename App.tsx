
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SequencerGrid } from './components/SequencerGrid';
import { Knob } from './components/Knob';
import { Fader } from './components/Fader';
import { Visualizer } from './components/Visualizer';
import { audioEngine } from './services/audioEngine';
import { midiService } from './services/midiService';
import { generatorService, GenMode, GenHarmonicMotion, GenContour, GenBass, GenDrums, KEYS, OCTAVE_RANGE, type GenKey, type OctaveShifts } from './services/earwormGenerator';
import type { SongPlan } from './services/earwormGenerator';
import type { ScoreBreakdown } from './services/earwormAnalysis';
import { scheduleStep, secondsPerStepAt } from './services/songScheduler';
import { ARRANGEMENT_PRESETS, arrangementByName } from './services/arrangement';
import { HARMONY_PRESETS, VOICE_LEADING_PRESETS } from './services/harmonyPresets';
import { renderOffline } from './services/offlineRender';
import {
  buildPresetFile, downloadBlob, encodeWav, exportMidi, importMidi, parsePresetFile,
} from './services/songExport';
import {
  MissingApiKeyError,
  clearApiKey,
  hasApiKey,
  setApiKey as persistApiKey,
  subscribeToApiKey,
} from './services/geminiClient';
import { generateAIPresetSet, generateSingleAIPreset, AIPresetSet, AISinglePreset } from './services/aiPresetService';
import { composeAISong, AISongResult, AISectionData } from './services/aiComposer';
import { composerAgent } from './services/composerAgent';
import { Track, TrackType, InstrumentParams, GlobalFXParams, NoteEvent, SequencerStep } from './types';
import type { SongPreset } from './constants';
import { 
  INITIAL_TRACKS, DEFAULT_BPM, SONG_PRESETS, 
  DEFAULT_LEAD_PARAMS, DEFAULT_BASS_PARAMS, DEFAULT_PAD_PARAMS, DEFAULT_PLUCK_PARAMS,
  DEFAULT_GLOBAL_FX, INSTRUMENT_PRESETS
} from './constants';

/**
 * The scale list as a player would read it, rather than as modal theory names.
 *
 * Ordered by how much of the genre actually uses each one: natural minor and
 * major first, then the lead scales, then the modes that colour them, then the
 * two Eastern ones. The note on each says what it is for, not what it is made
 * of — the intervals live in MODES, in the generator.
 */
/** The parts whose register can be shifted, in the order the mixer lists them. */
const OCTAVE_PARTS: { id: keyof OctaveShifts; label: string }[] = [
  { id: 'lead', label: 'Lead' },
  { id: 'pluck', label: 'Plk' },
  { id: 'pad', label: 'Pad' },
  { id: 'bass', label: 'Bass' },
];

const MODE_GROUPS: { label: string; modes: { value: GenMode; label: string; note: string }[] }[] = [
  {
    label: 'Common',
    modes: [
      { value: 'aeolian', label: 'Natural Minor', note: 'The default minor. Most of darkwave and synthwave sits here.' },
      { value: 'ionian', label: 'Major', note: 'Plain major — the brighter, uplifting side of 80s synth pop.' },
      { value: 'harmonic_minor', label: 'Harmonic Minor', note: 'Natural minor with a raised 7th: the gothic cadence.' },
      { value: 'dorian', label: 'Dorian', note: 'Minor with a major 6th. Cooler and less mournful than natural minor.' },
    ],
  },
  {
    label: 'Lead scales',
    modes: [
      { value: 'minor_pentatonic', label: 'Minor Pentatonic', note: 'Five notes over a minor bed — the standard lead and solo scale.' },
      { value: 'major_pentatonic', label: 'Major Pentatonic', note: 'Five notes over a major bed. Open and hook-shaped.' },
    ],
  },
  {
    label: 'Modal colour',
    modes: [
      { value: 'mixolydian', label: 'Mixolydian', note: 'Major with a flat 7th. Rock and 80s film-score major.' },
      { value: 'lydian', label: 'Lydian', note: 'Major with a raised 4th: the floating, neon, dreamlike major.' },
      { value: 'phrygian', label: 'Phrygian', note: 'Minor with a flat 2nd. Dark and Spanish-edged.' },
      { value: 'melodic_minor', label: 'Melodic Minor', note: 'Minor third with a raised 6th and 7th. Tense and cinematic.' },
    ],
  },
  {
    label: 'Eastern',
    modes: [
      { value: 'phrygian_dominant', label: 'Phrygian Dominant', note: 'Hijaz: flat 2nd over a major 3rd. One augmented second.' },
      { value: 'double_harmonic', label: 'Double Harmonic', note: 'Flat 2nd, major 3rd, flat 6th, major 7th. Two augmented seconds.' },
    ],
  },
];

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(128); 
  const [masterVolume, setMasterVolume] = useState(0.6);
  const [midiActive, setMidiActive] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<TrackType>('lead');
  const [isTransmuting, setIsTransmuting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [transmutingTracks, setTransmutingTracks] = useState<Record<string, boolean>>({});
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState<boolean>(() => hasApiKey());
  const [aiError, setAiError] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<string | null>("Aeolian Stasis");
  
  // Generator Parameters State
  const [genMode, setGenMode] = useState<GenMode>('aeolian');
  const [genKey, setGenKey] = useState<GenKey>('C');
  /** Per-part register, in octaves. 0 is the register everything was written in. */
  const [genOctaves, setGenOctaves] = useState<OctaveShifts>({});
  const [genHarmonicMotion, setGenHarmonicMotion] = useState<GenHarmonicMotion>('conjunct');
  const [genContour, setGenContour] = useState<GenContour>('arch');
  const [genBass, setGenBass] = useState<GenBass>('driving');
  const [genDrums, setGenDrums] = useState<GenDrums>('four-floor');
  const [genDensity, setGenDensity] = useState<number>(0.7);
  const [genEntropy, setGenEntropy] = useState<number>(0.4);
  const [genArrangement, setGenArrangement] = useState<string>(ARRANGEMENT_PRESETS[0].name);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isRenderingWav, setIsRenderingWav] = useState(false);
  /** The decisions behind the song on screen, so parts of it can be rebuilt. */
  const [songPlan, setSongPlan] = useState<SongPlan | null>(null);
  /** When held, the melody survives every regeneration. */
  const [hookLocked, setHookLocked] = useState(false);
  const midiFileInput = useRef<HTMLInputElement>(null);
  const presetFileInput = useRef<HTMLInputElement>(null);
  const [genHarmony, setGenHarmony] = useState<string>(HARMONY_PRESETS[0].name);
  const [genVoiceLeading, setGenVoiceLeading] = useState<string>(VOICE_LEADING_PRESETS[0].name);
  const [genAnalysis, setGenAnalysis] = useState<ScoreBreakdown | null>(null);

  const [tracks, setTracks] = useState<Track[]>(() => {
      return INITIAL_TRACKS.map(t => {
          if (t.steps) {
              const padding = Array(128 - (t.steps.length || 0)).fill({ active: false, velocity: 0 });
              return { ...t, steps: [...t.steps, ...padding].slice(0, 128), isMuted: false, isSoloed: false };
          }
          return { ...t, isMuted: false, isSoloed: false };
      });
  });
  
  const [allInstrumentParams, setAllInstrumentParams] = useState<Record<string, InstrumentParams>>({
    lead: { ...DEFAULT_LEAD_PARAMS },
    bass: { ...DEFAULT_BASS_PARAMS },
    pad: { ...DEFAULT_PAD_PARAMS },
    pluck: { ...DEFAULT_PLUCK_PARAMS }
  });

  const [globalFX, setGlobalFX] = useState<GlobalFXParams>(DEFAULT_GLOBAL_FX);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [paramSection, setParamSection] = useState<'tone'|'env'|'mod'|'send'>('tone');
  const [activeTab, setActiveTab] = useState<'params' | 'mixer'>('params');

  const tracksRef = useRef(tracks);
  const paramsRef = useRef(allInstrumentParams);
  const fxRef = useRef(globalFX);
  const bpmRef = useRef(bpm);
  const totalStepsRef = useRef(totalSteps);
  const nextNoteTime = useRef(0);
  const currentStepRef = useRef(0);
  const timerID = useRef<number | null>(null);

  useEffect(() => {
    midiService.init();
    midiService.onActivity = () => {
      setMidiActive(true);
      setTimeout(() => setMidiActive(false), 100);
    };
  }, []);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { 
    paramsRef.current = allInstrumentParams;
    midiService.setParams(allInstrumentParams.lead);
  }, [allInstrumentParams]);
  useEffect(() => {
    fxRef.current = globalFX;
    audioEngine.updateGlobalFX(globalFX);
  }, [globalFX]);
  // The echo divisions are relative to the transport, so the engine needs to
  // know the tempo before they mean anything.
  useEffect(() => {
    audioEngine.setTempo(bpm);
    audioEngine.updateGlobalFX(fxRef.current);
  }, [bpm]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { totalStepsRef.current = totalSteps; }, [totalSteps]);
  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    scheduleStep(
      audioEngine,
      tracksRef.current,
      paramsRef.current,
      stepNumber,
      time,
      secondsPerStepAt(bpmRef.current),
    );
  }, []);

  const scheduler = useCallback(() => {
    const lookahead = 0.1;
    while (nextNoteTime.current < audioEngine.ctx.currentTime + lookahead) {
      scheduleNote(currentStepRef.current, nextNoteTime.current);
      const secondsPerStep = (60 / bpmRef.current) * 0.25;
      nextNoteTime.current += secondsPerStep;
      currentStepRef.current = (currentStepRef.current + 1) % totalStepsRef.current;
      setCurrentStep(currentStepRef.current);
    }
    timerID.current = window.setTimeout(scheduler, 25);
  }, [scheduleNote]);

  useEffect(() => {
    if (isPlaying) {
      audioEngine.resume();
      nextNoteTime.current = audioEngine.ctx.currentTime;
      currentStepRef.current = 0;
      setCurrentStep(0);
      scheduler();
    } else {
      if (timerID.current) window.clearTimeout(timerID.current);
    }
    return () => { if (timerID.current) window.clearTimeout(timerID.current); };
  }, [isPlaying, scheduler]);

  const handleToggleStep = (trackId: string, stepIndex: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId || !t.steps) return t;
      const newSteps = [...t.steps];
      newSteps[stepIndex] = { ...newSteps[stepIndex], active: !newSteps[stepIndex].active };
      return { ...t, steps: newSteps };
    }));
  };

  const handleAddNote = (trackId: string, note: string, step: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      const existingIdx = t.notes?.findIndex(n => n.note === note && n.startStep === step);
      if (existingIdx !== undefined && existingIdx !== -1) {
        return { ...t, notes: t.notes?.filter((_, i) => i !== existingIdx) };
      }
      const newNote: NoteEvent = {
        id: Math.random().toString(36).substr(2, 9),
        note,
        startStep: step,
        duration: trackId === 'pad' ? 16 : (trackId === 'lead' ? 4 : 1), 
        velocity: 0.8
      };
      return { ...t, notes: [...(t.notes || []), newNote] };
    }));
    handlePreviewNote(trackId, note);
  };

  const handleToggleCollapse = (trackId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isCollapsed: !t.isCollapsed } : t));
    setSelectedTrackId(trackId as TrackType);
  };

  /** One click sets all four instruments and the effects that go with them. */
  const applySongPreset = (preset: SongPreset) => {
    const patch = (track: TrackType, name: string) =>
      INSTRUMENT_PRESETS[track]?.[name];

    setAllInstrumentParams((prev) => ({
      ...prev,
      lead: patch('lead', preset.lead) ?? prev.lead,
      bass: patch('bass', preset.bass) ?? prev.bass,
      pad: patch('pad', preset.pad) ?? prev.pad,
      pluck: patch('pluck', preset.pluck) ?? prev.pluck,
    }));
    setGlobalFX((prev) => ({ ...prev, ...preset.fx }));
    setCurrentTheme(preset.name);
    // Map only the instrument tracks by name. Indexing the preset by track id
    // also matched its `fx` key, which holds the effect settings rather than a
    // patch name — and calling toUpperCase on that object crashed the app.
    const patchNames: Partial<Record<TrackType, string>> = {
      lead: preset.lead, bass: preset.bass, pad: preset.pad, pluck: preset.pluck,
    };
    setTracks((prev) => prev.map((t) => {
      const name = patchNames[t.id];
      return name ? { ...t, name: name.toUpperCase() } : t;
    }));
  };

  const handleGenerateRitual = () => {
    // Length follows the chosen form template.
    const GEN_STEPS = arrangementByName(genArrangement).steps;
    const result = generatorService.generate({ 
      totalSteps: GEN_STEPS, 
      mode: genMode,
      harmonicMotion: genHarmonicMotion,
      contour: genContour,
      bassMode: genBass,
      drumMode: genDrums,
      rhythmDensity: genDensity,
      entropy: genEntropy,
      arrangement: genArrangement,
      harmony: genHarmony,
      voiceLeading: genVoiceLeading,
      key: genKey,
      octaves: genOctaves,
      // A locked hook keeps its melody, its chords and its tempo; everything
      // else is built around it afresh.
      plan: hookLocked && songPlan ? songPlan : undefined,
    });
    setTracks(result.tracks.map(t => ({ ...t, isMuted: false, isSoloed: false })));
    setSongPlan(result.plan);
    setTotalSteps(GEN_STEPS);
    // The generator picks tempo now (earworm.md §2.1C biases BPM upward within
    // the substyle band), so the transport has to follow it.
    setBpm(result.bpm);
    setGenAnalysis(result.analysis);
    if (isPlaying) {
        setIsPlaying(false);
        setTimeout(() => setIsPlaying(true), 50);
    }
  };

  useEffect(() => subscribeToApiKey(() => setHasKey(hasApiKey())), []);

  const handleSaveApiKey = () => {
    persistApiKey(aiKeyInput);
    setAiKeyInput('');
    setAiError(null);
  };

  const handleClearApiKey = () => {
    clearApiKey();
    setAiKeyInput('');
    setAiError(null);
  };

  const describeAiError = (e: unknown): string =>
    e instanceof MissingApiKeyError
      ? e.message
      : 'AI request failed. Check the key, the quota, and the console.';

  /**
   * Rebuild one track and leave the rest alone.
   *
   * Uses the stored plan, so the new part is written against the same chords,
   * the same hook and the same tempo as the parts it has to sit with. Without
   * that it would be a different song in one lane.
   */
  const handleRegenerateTrack = (trackId: TrackType) => {
    if (!songPlan) {
      setExportStatus('Generate a song first');
      return;
    }
    // The lead is the hook. With the plan supplying it, rebuilding the lead
    // reproduced the same melody every time — the button did nothing. It now
    // searches for a new hook over the same chords and tempo, unless the hook
    // is being held, which is exactly a request not to change it.
    const rehook = trackId === 'lead' && !hookLocked;
    const result = generatorService.generate({
      totalSteps,
      mode: genMode,
      harmonicMotion: genHarmonicMotion,
      contour: genContour,
      bassMode: genBass,
      drumMode: genDrums,
      rhythmDensity: genDensity,
      entropy: genEntropy,
      arrangement: genArrangement,
      harmony: genHarmony,
      voiceLeading: genVoiceLeading,
      key: genKey,
      octaves: genOctaves,
      plan: songPlan,
      only: [trackId],
      rehook,
    });
    const replacement = result.tracks.find((t) => t.id === trackId);
    if (!replacement) return;
    setTracks((prev) => prev.map((t) => (
      t.id === trackId ? { ...replacement, volume: t.volume, isMuted: t.isMuted, isSoloed: t.isSoloed, name: t.name } : t
    )));
    // A new hook has to go into the plan, or the next rebuild of any other
    // track would be written against the melody that is no longer playing.
    if (rehook) {
      setSongPlan(result.plan);
      setGenAnalysis(result.analysis);
    } else if (trackId === 'kick') {
      // A new kick pattern is what the bass is written against, so the plan
      // has to carry it forward or the next bass rebuild locks to the old one.
      setSongPlan({ ...songPlan, kickPattern: result.plan.kickPattern });
    }
    setExportStatus(
      trackId === 'lead' && hookLocked
        ? 'Lead held — release Hold to rebuild the melody'
        : `Rebuilt ${trackId}`);
  };

  /** Load a song back from a MIDI file, not just its patches. */
  const handleImportMidi = async (file: File) => {
    const { song, error } = importMidi(await file.arrayBuffer());
    if (!song) {
      setExportStatus(error ?? 'Could not read that MIDI file');
      return;
    }
    setBpm(song.bpm);
    setTotalSteps(song.totalSteps);
    setTracks((prev) => prev.map((track) => {
      if (track.notes !== undefined) {
        const imported = song.notes[track.id] ?? [];
        return {
          ...track,
          notes: imported.map((n, i) => ({ id: `${track.id}-import-${i}`, ...n })),
        };
      }
      const hits = song.steps[track.id] ?? [];
      const steps = Array.from({ length: song.totalSteps }, () => ({ active: false, velocity: 0 }));
      for (const hit of hits) {
        if (hit.step >= 0 && hit.step < steps.length) {
          steps[hit.step] = { active: true, velocity: hit.velocity };
        }
      }
      return { ...track, steps };
    }));
    // The notes came back; the decisions behind them did not.
    setSongPlan(null);
    setHookLocked(false);
    setExportStatus(`Loaded ${file.name} — ${song.bpm} BPM`);
  };

  const handleAICompose = async (fullSong: boolean = false) => {
    setAiError(null);
    setIsComposing(true);
    if (isPlaying) setIsPlaying(false);

    try {
      const songData: AISongResult = await composeAISong();
      
      // Update Global Params
      setBpm(songData.bpm);
      setCurrentTheme(songData.themeName);

      // Update Synth Engines
      setAllInstrumentParams({
        lead: songData.leadParams,
        bass: songData.bassParams,
        pad: songData.padParams,
        pluck: songData.pluckParams
      });

      if (fullSong) {
          // Use Composer Agent to build full arrangement (416 steps)
          const agentResult = composerAgent.composeFullSong(songData, tracks);
          setTotalSteps(agentResult.totalSteps);
          setTracks(agentResult.tracks);
      } else {
          // Standard Loop Mode (128 steps)
          const INTRO_LEN = 32;
          const VERSE_LEN = 32;
          const TOTAL_LEN = 128;
          setTotalSteps(TOTAL_LEN);

          const stitchNotes = (trackKey: 'lead' | 'bass' | 'pad' | 'pluck') => {
            const notes: NoteEvent[] = [];
            songData.intro[trackKey].forEach(n => notes.push({ id: Math.random().toString(36), note: n.n, startStep: n.s, duration: n.d, velocity: 0.8 }));
            songData.verse[trackKey].forEach(n => notes.push({ id: Math.random().toString(36), note: n.n, startStep: n.s + INTRO_LEN, duration: n.d, velocity: 0.8 }));
            songData.chorus[trackKey].forEach(n => notes.push({ id: Math.random().toString(36), note: n.n, startStep: n.s + INTRO_LEN + VERSE_LEN, duration: n.d, velocity: 0.9 }));
            return notes;
          };

          const stitchDrums = (drumKey: 'kick' | 'snare' | 'hihat' | 'fx') => {
             const steps: SequencerStep[] = new Array(TOTAL_LEN).fill({ active: false, velocity: 0 });
             const applyPattern = (pattern: boolean[], offset: number) => {
                 pattern.forEach((active, i) => {
                     if (active) steps[offset + i] = { active: true, velocity: 0.9 };
                 });
             };
             applyPattern(songData.intro[drumKey], 0);
             applyPattern(songData.verse[drumKey], INTRO_LEN);
             applyPattern(songData.chorus[drumKey], INTRO_LEN + VERSE_LEN);
             return steps;
          };

          const newTracks = tracks.map(track => {
            let newTrack = { ...track, isMuted: false, isSoloed: false };
            if (['lead', 'bass', 'pad', 'pluck'].includes(track.id)) {
                newTrack.notes = stitchNotes(track.id as any);
                newTrack.name = `${track.id.toUpperCase()} (AI)`;
            } else if (['kick', 'snare', 'hihat', 'fx'].includes(track.id)) {
                newTrack.steps = stitchDrums(track.id as any);
            }
            return newTrack;
          });
          setTracks(newTracks);
      }

    } catch (e) {
      console.error("AI Composition failed", e);
      setAiError(describeAiError(e));
    } finally {
      setIsComposing(false);
    }
  };

  const handleAITransmute = async () => {
    setAiError(null);
    setIsTransmuting(true);
    try {
      const promptContext = `Darkwave in ${genMode} mode with ${genHarmonicMotion} harmonic motion`;
      const set: AIPresetSet = await generateAIPresetSet(promptContext);
      setAllInstrumentParams({
        lead: set.lead.params,
        bass: set.bass.params,
        pad: set.pad.params,
        pluck: set.pluck.params,
      });
      setCurrentTheme(set.themeName);
      setTracks(prev => prev.map(t => {
        if (t.id === 'lead') return { ...t, name: set.lead.name.toUpperCase() };
        if (t.id === 'bass') return { ...t, name: set.bass.name.toUpperCase() };
        if (t.id === 'pad') return { ...t, name: set.pad.name.toUpperCase() };
        if (t.id === 'pluck') return { ...t, name: set.pluck.name.toUpperCase() };
        return t;
      }));
    } catch (error) {
      console.error("Transmutation failed:", error);
      setAiError(describeAiError(error));
    } finally {
      setIsTransmuting(false);
    }
  };

  const handleSingleTransmute = async (trackId: TrackType) => {
    if (['kick', 'snare', 'hihat', 'fx'].includes(trackId)) return;
    setTransmutingTracks(prev => ({ ...prev, [trackId]: true }));
    try {
      const promptContext = `Darkwave in ${genMode} mode`;
      const preset: AISinglePreset = await generateSingleAIPreset(trackId, promptContext);
      setAllInstrumentParams(prev => ({
        ...prev,
        [trackId]: preset.params
      }));
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, name: preset.name.toUpperCase() } : t));
    } catch (error) {
      console.error(`Transmutation of ${trackId} failed:`, error);
      setAiError(describeAiError(error));
    } finally {
      setTransmutingTracks(prev => ({ ...prev, [trackId]: false }));
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  const handleDownloadParams = () => {
    const preset = buildPresetFile({
      theme: currentTheme,
      bpm,
      masterVolume,
      instrumentParams: allInstrumentParams,
      globalFX,
      generator: {
        mode: genMode, key: genKey, octaves: genOctaves,
        harmonicMotion: genHarmonicMotion, contour: genContour,
        bassMode: genBass, drumMode: genDrums, rhythmDensity: genDensity,
        entropy: genEntropy, arrangement: genArrangement,
        harmony: genHarmony, voiceLeading: genVoiceLeading,
      },
    });
    downloadBlob(
      new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }),
      `neon-catafalque-${stamp()}.json`,
    );
    setExportStatus('Preset saved');
  };

  /** Load a preset file, applying only the parts it actually contains. */
  const handleImportPreset = async (file: File) => {
    const { preset, error } = parsePresetFile(await file.text());
    if (!preset) {
      setExportStatus(error ?? 'Could not read that file');
      return;
    }

    setAllInstrumentParams((prev) => ({ ...prev, ...preset.instrumentParams }));
    setGlobalFX((prev) => ({ ...prev, ...preset.globalFX }));
    if (preset.bpm) setBpm(preset.bpm);
    if (typeof preset.masterVolume === 'number') setMasterVolume(preset.masterVolume);
    if (preset.theme) setCurrentTheme(preset.theme);

    const gen = preset.generator as Record<string, string | number> | undefined;
    if (gen) {
      if (gen.mode) setGenMode(gen.mode as GenMode);
      // Files written before keys existed have no key; they were all in C.
      if (gen.key && KEYS.includes(gen.key as GenKey)) setGenKey(gen.key as GenKey);
      if (gen.octaves && typeof gen.octaves === 'object') {
        setGenOctaves(gen.octaves as OctaveShifts);
      }
      if (gen.harmonicMotion) setGenHarmonicMotion(gen.harmonicMotion as GenHarmonicMotion);
      if (gen.contour) setGenContour(gen.contour as GenContour);
      if (gen.bassMode) setGenBass(gen.bassMode as GenBass);
      if (gen.drumMode) setGenDrums(gen.drumMode as GenDrums);
      if (typeof gen.rhythmDensity === 'number') setGenDensity(gen.rhythmDensity);
      if (typeof gen.entropy === 'number') setGenEntropy(gen.entropy);
      if (gen.arrangement) setGenArrangement(gen.arrangement as string);
      if (gen.harmony) setGenHarmony(gen.harmony as string);
      if (gen.voiceLeading) setGenVoiceLeading(gen.voiceLeading as string);
    }
    setExportStatus(`Loaded ${file.name}`);
  };

  const handleExportMidi = () => {
    const hasNotes = tracks.some((t) => t.notes?.length || t.steps?.some((s) => s.active));
    if (!hasNotes) {
      setExportStatus('Nothing to export — generate a song first');
      return;
    }
    downloadBlob(exportMidi(tracks, bpm, totalSteps), `neon-catafalque-${stamp()}.mid`);
    setExportStatus('MIDI saved');
  };

  const handleExportWav = async () => {
    if (isRenderingWav) return;
    const hasNotes = tracks.some((t) => t.notes?.length || t.steps?.some((s) => s.active));
    if (!hasNotes) {
      setExportStatus('Nothing to export — generate a song first');
      return;
    }
    setIsRenderingWav(true);
    setExportStatus('Rendering…');
    try {
      const { channels, sampleRate } = await renderOffline({
        tracks,
        params: allInstrumentParams,
        globalFX,
        bpm,
        totalSteps,
        masterVolume,
        onProgress: (f) => setExportStatus(`Rendering ${Math.round(f * 100)}%`),
      });
      downloadBlob(encodeWav(channels, sampleRate), `neon-catafalque-${stamp()}.wav`);
      setExportStatus('WAV saved');
    } catch (e) {
      console.error('WAV render failed', e);
      setExportStatus('Render failed — see the console');
    } finally {
      setIsRenderingWav(false);
    }
  };

  const handlePreviewNote = (trackId: string, noteOrType: string) => {
    audioEngine.resume();
    const track = tracks.find(t => t.id === trackId);
    const vol = track ? track.volume : 0.8;
    const now = audioEngine.ctx.currentTime;
    const params = allInstrumentParams[trackId];
    if (params) audioEngine.playInstrument(trackId, noteOrType, now, 0.4, params, vol);
    else audioEngine.playDrum(trackId as TrackType, now, vol);
  };

  function updateTrackParam(key: keyof InstrumentParams, val: any) {
    setAllInstrumentParams(prev => ({
      ...prev,
      [selectedTrackId]: { ...prev[selectedTrackId], [key]: val }
    }));
  }

  function updateGlobalFXFlag(key: keyof GlobalFXParams, val: boolean) {
    setGlobalFX(prev => ({ ...prev, [key]: val }));
  }

  function updateGlobalFX(key: keyof GlobalFXParams, val: number) {
    setGlobalFX(prev => ({ ...prev, [key]: val }));
  }

  function loadPreset(presetName: string) {
    const preset = INSTRUMENT_PRESETS[selectedTrackId]?.[presetName];
    if (preset) {
      setAllInstrumentParams(prev => ({
        ...prev,
        [selectedTrackId]: { ...preset }
      }));
    }
  }

  const currentParams = allInstrumentParams[selectedTrackId];
  const isDrumTrack = ['kick', 'snare', 'hihat', 'fx'].includes(selectedTrackId);
  const trackPresets = INSTRUMENT_PRESETS[selectedTrackId];

  // Helper styles for selects
  const selectClass = "w-full bg-zinc-900 border border-zinc-800 text-neon-cyan text-[9px] font-mono py-1 px-1 rounded focus:outline-none focus:border-neon-cyan uppercase appearance-none cursor-pointer hover:bg-zinc-800 transition-colors";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 font-sans text-gray-200">

      {/* TOP BAR — identity and transport, always visible */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-800 bg-black px-3">
        <div className="flex min-w-0 shrink-0 items-baseline gap-2">
          <h1 className="bg-gradient-to-r from-neon-purple to-neon-cyan bg-clip-text font-mono text-sm font-bold tracking-tighter text-transparent">
            NEON CATAFALQUE
          </h1>
          {currentTheme && (
            <span className="truncate font-mono text-[7px] uppercase tracking-[0.25em] text-neon-cyan/60">
              {currentTheme}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-600">BPM</span>
          <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
                 className="w-14 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-neon-cyan focus:outline-none" />
        </div>

        <div className="relative shrink-0">
          <button onClick={() => setMidiEnabled(!midiEnabled)}
                  className={`h-6 rounded border px-2 font-mono text-[8px] transition-all ${midiEnabled ? 'border-neon-purple bg-neon-purple/5 text-neon-purple' : 'border-zinc-800 text-zinc-600'}`}>
            MIDI {midiEnabled ? 'ON' : 'OFF'}
          </button>
          {midiActive && (
            <div className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-neon-cyan shadow-[0_0_8px_#00f3ff]" />
          )}
        </div>

        <div className="min-w-0 flex-1" />

        <div className="w-40 shrink-0">
          <Fader label="MASTER" value={masterVolume} onChange={setMasterVolume} colorClass="bg-white" />
        </div>

          <button onClick={() => setIsPlaying(!isPlaying)} className={`h-8 w-28 shrink-0 rounded border-2 transition-all font-mono text-[10px] tracking-[0.2em] font-bold ${isPlaying ? 'border-neon-pink bg-neon-pink/10 text-neon-pink shadow-[0_0_20px_#ff00ff40]' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {isPlaying ? 'STOP' : 'START'}
          </button>
      </header>

      <div className="flex min-h-0 flex-1">

        {/* LEFT — the generator */}
        <aside className="flex w-[236px] shrink-0 flex-col gap-2 overflow-hidden border-r border-zinc-800 bg-black p-2">
          {/* GENERATOR CONTROLS */}
          <div className="shrink-0 space-y-1.5 rounded border border-zinc-800 bg-zinc-900/20 p-1.5">
             <h3 className="border-b border-zinc-800 pb-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">Generator Engine</h3>
             
             <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Mode</label>
                   <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className={selectClass}>
                      {MODE_GROUPS.map(group => (
                        <optgroup key={group.label} label={group.label}>
                          {group.modes.map(m => (
                            <option key={m.value} value={m.value} title={m.note}>{m.label}</option>
                          ))}
                        </optgroup>
                      ))}
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Key</label>
                   <select value={genKey} onChange={e => setGenKey(e.target.value as GenKey)} className={selectClass}>
                      {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Motion</label>
                   <select value={genHarmonicMotion} onChange={e => setGenHarmonicMotion(e.target.value as GenHarmonicMotion)} className={selectClass}>
                      <option value="conjunct">Conjunct</option>
                      <option value="disjunct">Disjunct</option>
                      <option value="static">Static</option>
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Contour</label>
                   <select value={genContour} onChange={e => setGenContour(e.target.value as GenContour)} className={selectClass}>
                      <option value="arch">Arch</option>
                      <option value="descent">Descent</option>
                      <option value="wave">Wave</option>
                      <option value="random">Random</option>
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Voicing</label>
                   <select value={genVoiceLeading} onChange={e => setGenVoiceLeading(e.target.value)}
                           title={VOICE_LEADING_PRESETS.find(v => v.name === genVoiceLeading)?.note}
                           className={selectClass}>
                      {VOICE_LEADING_PRESETS.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Bass</label>
                   <select value={genBass} onChange={e => setGenBass(e.target.value as GenBass)} className={selectClass}>
                      <option value="driving">Driving</option>
                      <option value="sustained">Sustained</option>
                      <option value="acid">Acid</option>
                      <option value="walking">Walking</option>
                   </select>
                </div>
                <div className="space-y-0.5">
                   <label className="text-[8px] uppercase text-zinc-600">Drums</label>
                   <select value={genDrums} onChange={e => setGenDrums(e.target.value as GenDrums)} className={selectClass}>
                      <option value="four-floor">Four-on-Floor</option>
                      <option value="breakbeat">Breakbeat</option>
                      <option value="tribal">Tribal</option>
                   </select>
                </div>
             </div>

             <div className="space-y-0.5">
                <label className="text-[8px] uppercase text-zinc-600">Structure</label>
                <select value={genArrangement} onChange={e => setGenArrangement(e.target.value)}
                        title={ARRANGEMENT_PRESETS.find(a => a.name === genArrangement)?.note}
                        className={selectClass}>
                   {ARRANGEMENT_PRESETS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
             </div>

             <div className="space-y-0.5">
                <label className="flex items-baseline justify-between text-[8px] uppercase text-zinc-600">
                  <span>Harmony</span>
                  <span className="normal-case tracking-normal text-zinc-500">
                    {HARMONY_PRESETS.find(h => h.name === genHarmony)?.figures}
                  </span>
                </label>
                <select value={genHarmony} onChange={e => setGenHarmony(e.target.value)}
                        title={HARMONY_PRESETS.find(h => h.name === genHarmony)?.note}
                        className={selectClass}>
                   {HARMONY_PRESETS.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                </select>
             </div>

             <div className="flex justify-around pt-0.5">
                 <Knob size="sm" label="Density" value={genDensity} min={0.1} max={1.0} onChange={setGenDensity} color="text-neon-cyan" />
                 <Knob size="sm" label="Twist" value={genEntropy} min={0.0} max={1.0} onChange={setGenEntropy} color="text-neon-pink" />
             </div>

             {/* Register. Each part moves by whole octaves, on its own. */}
             <div className="space-y-0.5 pt-0.5">
                <label className="text-[8px] uppercase text-zinc-600">Octave</label>
                <div className="grid grid-cols-4 gap-1">
                   {OCTAVE_PARTS.map(part => {
                     const value = genOctaves[part.id] ?? 0;
                     return (
                       <div key={part.id} className="flex flex-col items-center gap-0.5">
                          <span className="text-[7px] uppercase tracking-wider text-zinc-500">{part.label}</span>
                          <div className="flex items-center gap-0.5">
                             <button
                                onClick={() => setGenOctaves(o => ({ ...o, [part.id]: Math.max(OCTAVE_RANGE.min, value - 1) }))}
                                disabled={value <= OCTAVE_RANGE.min}
                                title={`${part.label} down an octave`}
                                className="rounded border border-zinc-800 px-1 font-mono text-[8px] leading-none text-zinc-500 hover:text-neon-cyan disabled:opacity-30"
                             >&minus;</button>
                             <span className={`w-3 text-center font-mono text-[8px] ${value === 0 ? 'text-zinc-600' : 'text-neon-cyan'}`}>
                                {value > 0 ? `+${value}` : value}
                             </span>
                             <button
                                onClick={() => setGenOctaves(o => ({ ...o, [part.id]: Math.min(OCTAVE_RANGE.max, value + 1) }))}
                                disabled={value >= OCTAVE_RANGE.max}
                                title={`${part.label} up an octave`}
                                className="rounded border border-zinc-800 px-1 font-mono text-[8px] leading-none text-zinc-500 hover:text-neon-cyan disabled:opacity-30"
                             >+</button>
                          </div>
                       </div>
                     );
                   })}
                </div>
             </div>
          </div>
          {/* ACTIONS */}
          <div className="shrink-0 space-y-1.5">
            <div className="flex gap-2">
              <button 
                onClick={() => handleAICompose(false)}
                disabled={isComposing || !hasKey}
                className={`flex-1 h-12 relative overflow-hidden group rounded border-2 transition-all ${isComposing || !hasKey ? 'border-zinc-700 bg-zinc-900' : 'border-neon-pink/70 bg-neon-pink/10 hover:bg-neon-pink/20 hover:shadow-[0_0_15px_#ff00ff60]'}`}
              >
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-pink/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                 <span className={`relative z-10 font-mono text-[9px] font-black tracking-[0.1em] uppercase flex flex-col items-center justify-center leading-tight ${isComposing || !hasKey ? 'text-zinc-500' : 'text-neon-pink group-hover:text-white'} ${isComposing ? 'animate-pulse' : ''}`}>
                    {isComposing ? 'CONJURING...' : hasKey ? 'AI LOOP' : 'NO API KEY'}
                    
                 </span>
              </button>

              <button 
                onClick={() => handleAICompose(true)}
                disabled={isComposing || !hasKey}
                className={`flex-1 h-12 relative overflow-hidden group rounded border-2 transition-all ${isComposing || !hasKey ? 'border-zinc-700 bg-zinc-900' : 'border-neon-cyan/70 bg-neon-cyan/10 hover:bg-neon-cyan/20 hover:shadow-[0_0_15px_#00f3ff60]'}`}
              >
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                 <span className={`relative z-10 font-mono text-[9px] font-black tracking-[0.1em] uppercase flex flex-col items-center justify-center leading-tight ${isComposing || !hasKey ? 'text-zinc-500' : 'text-neon-cyan group-hover:text-white'} ${isComposing ? 'animate-pulse' : ''}`}>
                    {isComposing ? 'ARRANGING...' : hasKey ? 'FULL SONG' : 'NO API KEY'}
                    
                 </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button 
                onClick={handleGenerateRitual}
                className="w-full h-8 relative overflow-hidden group rounded border border-neon-purple/50 bg-neon-purple/5 hover:bg-neon-purple/20 transition-all"
                >
                <span className="relative z-10 font-mono text-[8px] font-bold tracking-widest text-neon-purple group-hover:text-white uppercase flex items-center justify-center gap-1">
                    ⏣ Ritual
                </span>
                </button>

                <button
                  onClick={() => setHookLocked((v) => !v)}
                  disabled={!songPlan}
                  title={songPlan
                    ? 'Keep this melody, its chords and its tempo through every regeneration'
                    : 'Generate a song first'}
                  className={`h-8 w-full rounded border font-mono text-[7px] font-bold uppercase tracking-widest transition-all ${
                    !songPlan
                      ? 'border-zinc-800 bg-zinc-900/40 text-zinc-700'
                      : hookLocked
                        ? 'border-neon-cyan/60 bg-neon-cyan/15 text-neon-cyan shadow-[0_0_10px_#00f3ff30]'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-white'}`}
                >
                  {hookLocked ? '⬤ Held' : '○ Hold'}
                </button>

                <button 
                onClick={handleAITransmute}
                disabled={isTransmuting || !hasKey}
                className={`w-full h-8 relative overflow-hidden group rounded border transition-all ${isTransmuting || !hasKey ? 'border-zinc-800 bg-zinc-900 animate-pulse' : 'border-neon-cyan/50 bg-neon-cyan/5 hover:bg-neon-cyan/20'}`}
                >
                <span className="relative z-10 font-mono text-[8px] font-bold tracking-widest text-neon-cyan group-hover:text-white uppercase flex items-center justify-center gap-1">
                    {isTransmuting ? '...' : '✧ Trans'}
                </span>
                </button>
            </div>

            {genAnalysis && (
              <div className="shrink-0 rounded border border-zinc-800 bg-black/40 p-1.5 font-mono text-[8px] leading-tight">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="uppercase tracking-widest text-zinc-600">Hook</span>
                  <span className="text-white">{genAnalysis.total.toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 text-zinc-400">
                  <span>contour</span><span className="text-right text-neon-purple">{genAnalysis.detail.contourClass}</span>
                  <span>twists</span><span className="text-right text-neon-pink">{genAnalysis.detail.atypicalTurns}</span>
                  <span>range</span><span className="text-right text-neon-cyan">{genAnalysis.detail.range} st</span>
                  <span>step</span><span className="text-right text-neon-cyan">{Math.round(genAnalysis.detail.stepwiseRatio * 100)}%</span>
                  <span>IC</span><span className="text-right text-neon-cyan">{genAnalysis.detail.meanIC.toFixed(2)}b</span>
                  <span>spikes</span><span className="text-right text-neon-cyan">{genAnalysis.detail.spikes}</span>
                </div>
              </div>
            )}
          </div>
          {/* SONG PRESETS — a whole instrument set, not one patch */}
          <div className="shrink-0 space-y-0.5 rounded border border-zinc-800 bg-zinc-900/20 p-1.5">
            <label className="text-[8px] uppercase tracking-widest text-zinc-500">Song Preset</label>
            <select
              value={SONG_PRESETS.some((p) => p.name === currentTheme) ? currentTheme : ''}
              onChange={(e) => {
                const preset = SONG_PRESETS.find((p) => p.name === e.target.value);
                if (preset) applySongPreset(preset);
              }}
              title={SONG_PRESETS.find((p) => p.name === currentTheme)?.note}
              className={selectClass}
            >
              <option value="">— choose a sound —</option>
              {SONG_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </select>
          </div>

          {/* GEMINI API KEY */}
          <div className="shrink-0 space-y-1 rounded border border-zinc-800 bg-black/40 p-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[8px] text-zinc-600 uppercase tracking-widest">Gemini API Key</span>
              <span className={`font-mono text-[8px] uppercase tracking-widest ${hasKey ? 'text-neon-cyan' : 'text-zinc-600'}`}>
                {hasKey ? '\u25cf Set' : '\u25cb Not set'}
              </span>
            </div>

            <div className="flex gap-1">
              <input
                type="password"
                value={aiKeyInput}
                onChange={(e) => setAiKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
                placeholder={hasKey ? 'replace key\u2026' : 'paste key\u2026'}
                spellCheck={false}
                autoComplete="off"
                aria-label="Gemini API key"
                className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono text-[9px] text-neon-cyan rounded focus:outline-none focus:border-neon-cyan/50"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!aiKeyInput.trim()}
                className={`px-2 rounded border font-mono text-[8px] uppercase tracking-widest transition-all ${aiKeyInput.trim() ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/30' : 'border-zinc-800 bg-zinc-900 text-zinc-700'}`}
              >
                Save
              </button>
              {hasKey && (
                <button
                  onClick={handleClearApiKey}
                  title="Forget the stored key"
                  className="px-2 rounded border border-zinc-800 bg-zinc-900 font-mono text-[8px] text-zinc-500 hover:text-neon-pink hover:border-neon-pink/40 transition-all"
                >
                  Clear
                </button>
              )}
            </div>

            {aiError && (
              <div className="font-mono text-[8px] text-neon-pink leading-relaxed">{aiError}</div>
            )}

            {!hasKey && (
              <div className="font-mono text-[7px] text-zinc-600 leading-relaxed">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-zinc-500 underline hover:text-neon-cyan"
                >
                  aistudio.google.com
                </a>{' '}
                — stored locally; the sequencer works without it.
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1" />
          <div className="shrink-0 space-y-1">
            <div className="grid grid-cols-3 gap-1">
              <button onClick={handleDownloadParams} title="Save every instrument, effect and generator setting as JSON"
                className="h-6 rounded border border-zinc-800 bg-zinc-900/40 font-mono text-[8px] uppercase tracking-widest text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white">
                ⤓ Preset
              </button>
              <button onClick={() => presetFileInput.current?.click()} title="Load a preset file"
                className="h-6 rounded border border-zinc-800 bg-zinc-900/40 font-mono text-[8px] uppercase tracking-widest text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white">
                ⤒ Import
              </button>
              <button onClick={() => midiFileInput.current?.click()} title="Load a song back from a MIDI file"
                className="h-6 rounded border border-zinc-800 bg-zinc-900/40 font-mono text-[8px] uppercase tracking-widest text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white">
                ⤒ MIDI
              </button>
              <button onClick={handleExportMidi} title="Export the arrangement as a type 1 MIDI file, drums on channel 10"
                className="h-6 rounded border border-zinc-800 bg-zinc-900/40 font-mono text-[8px] uppercase tracking-widest text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white">
                ⤓ MIDI
              </button>
              <button onClick={handleExportWav} disabled={isRenderingWav}
                title="Render the song offline and save it as a 16-bit stereo WAV"
                className={`h-6 rounded border font-mono text-[8px] uppercase tracking-widest transition-all ${
                  isRenderingWav
                    ? 'animate-pulse border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                    : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}>
                ⤓ WAV
              </button>
            </div>
            {exportStatus && (
              <div className="truncate font-mono text-[7px] text-zinc-600" title={exportStatus}>{exportStatus}</div>
            )}
            <input
              ref={midiFileInput}
              type="file"
              accept="audio/midi,.mid,.midi"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportMidi(file);
                e.target.value = '';
              }}
            />
            <input
              ref={presetFileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportPreset(file);
                e.target.value = '';
              }}
            />
          </div>
        </aside>

        {/* CENTRE — every track at once */}
        <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
          <div className="min-h-0 flex-1">
            <SequencerGrid
              tracks={tracks}
              currentStep={currentStep}
              totalSteps={totalSteps}
              selectedTrackId={selectedTrackId}
              arrangement={genArrangement}
              onToggleStep={handleToggleStep}
              onSelectTrack={(id) => setSelectedTrackId(id as TrackType)}
              onToggleMute={(id) => setTracks(prev => prev.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t))}
              onToggleSolo={(id) => setTracks(prev => prev.map(t => t.id === id ? { ...t, isSoloed: !t.isSoloed } : t))}
              onRegenerate={(id) => handleRegenerateTrack(id as TrackType)}
              canRegenerate={songPlan !== null}
            />
          </div>
          <div className="h-9 shrink-0 border-t border-zinc-800">
            <Visualizer />
          </div>
        </main>

        {/* RIGHT — the selected engine */}
        <aside className="flex w-[252px] shrink-0 flex-col overflow-hidden border-l border-zinc-800 bg-black">
        <div className="flex border-b border-zinc-800">
          <button 
            onClick={() => setActiveTab('params')}
            className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'params' ? 'text-neon-cyan border-b border-neon-cyan bg-zinc-900/40' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Params
          </button>
          <button 
            onClick={() => setActiveTab('mixer')}
            className={`flex-1 py-2 text-[9px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'mixer' ? 'text-neon-cyan border-b border-neon-cyan bg-zinc-900/40' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Mixer
          </button>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {activeTab === 'params' ? (
            <div className="space-y-2 pb-2">
              {!isDrumTrack && currentParams ? (
                <section className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <h2 className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">
                        {selectedTrackId} Engine
                      </h2>
                      <button 
                        onClick={() => handleSingleTransmute(selectedTrackId)}
                        disabled={transmutingTracks[selectedTrackId] || !hasKey}
                        className={`px-2 py-1 rounded text-[7px] font-mono uppercase tracking-widest transition-all border ${transmutingTracks[selectedTrackId] ? 'border-zinc-700 bg-zinc-800 animate-pulse text-zinc-500' : 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/30 shadow-[0_0_8px_#00f3ff40]'}`}
                      >
                        {transmutingTracks[selectedTrackId] ? 'Transmuting...' : '✧ Transmute'}
                      </button>
                    </div>
                    {/* Presets Row */}
                    {trackPresets && (
                      <div className="flex flex-wrap gap-1 rounded border border-zinc-800 bg-zinc-900/50 p-1">
                        {Object.keys(trackPresets).map(p => (
                          <button 
                            key={p} 
                            onClick={() => loadPreset(p)}
                            className="rounded border border-transparent bg-zinc-800 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-tight text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-white"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* A deep editor cannot fit on one screen, so it is paged
                      rather than scrolled: every group is one click away and
                      nothing is hidden below a fold. */}
                  <div className="flex gap-0.5">
                    {([['tone','Tone'],['env','Env'],['mod','Mod'],['send','Send']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setParamSection(id)}
                        className={`flex-1 rounded border py-0.5 font-mono text-[7px] uppercase tracking-widest transition-colors ${
                          paramSection === id
                            ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-600 hover:text-zinc-300'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className={paramSection === 'tone' ? 'grid grid-cols-3 justify-items-center gap-x-1 gap-y-1' : 'hidden'}>
                    <Knob label="Cutoff" value={currentParams.cutoff} min={40} max={12000} onChange={(v) => updateTrackParam('cutoff', v)} step={10} color="text-neon-purple" />
                    <Knob label="Env Amt" value={currentParams.filterEnvAmount} min={0} max={1} onChange={(v) => updateTrackParam('filterEnvAmount', v)} color="text-neon-purple" />
                    <Knob label="Sub" value={currentParams.subLevel} min={0} max={1} onChange={(v) => updateTrackParam('subLevel', v)} />
                    <Knob label="Noise" value={currentParams.noiseLevel} min={0} max={0.3} onChange={(v) => updateTrackParam('noiseLevel', v)} />
                    <Knob label="Res" value={currentParams.resonance} min={0} max={20} onChange={(v) => updateTrackParam('resonance', v)} color="text-neon-purple" />
                    <Knob label="Detune" value={currentParams.detune} min={0} max={50} onChange={(v) => updateTrackParam('detune', v)} color="text-neon-cyan" />
                  </div>

                  <div className={paramSection === 'env' ? 'space-y-1' : 'hidden'}>
                     <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                        <Knob label="A" value={currentParams.attack} min={0} max={3} onChange={(v) => updateTrackParam('attack', v)} />
                        <Knob label="R" value={currentParams.release} min={0.05} max={3} onChange={(v) => updateTrackParam('release', v)} />
                        <Knob label="D" value={currentParams.decay} min={0.01} max={3} onChange={(v) => updateTrackParam('decay', v)} />
                        <Knob label="S" value={currentParams.sustain} min={0} max={1} onChange={(v) => updateTrackParam('sustain', v)} />
                     </div>
                  </div>

                  <div className={paramSection === 'send' ? 'space-y-1' : 'hidden'}>
                     <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                        <Knob label="Verb" value={currentParams.reverbSend ?? 0.35} min={0} max={1} onChange={(v) => updateTrackParam('reverbSend', v)} color="text-white" size="sm" />
                        <Knob label="Echo" value={currentParams.delaySend ?? 0} min={0} max={1} onChange={(v) => updateTrackParam('delaySend', v)} color="text-white" size="sm" />
                        <Knob label="Chor" value={currentParams.chorusMix} min={0} max={1} onChange={(v) => updateTrackParam('chorusMix', v)} color="text-neon-cyan" size="sm" />
                        <Knob label="Phas" value={currentParams.phaserSend ?? 0} min={0} max={1} onChange={(v) => updateTrackParam('phaserSend', v)} color="text-neon-purple" size="sm" />
                        <Knob label="Flan" value={currentParams.flangerSend ?? 0} min={0} max={1} onChange={(v) => updateTrackParam('flangerSend', v)} color="text-neon-pink" size="sm" />
                        <Knob label="Drive" value={currentParams.drive ?? 0} min={0} max={1} onChange={(v) => updateTrackParam('drive', v)} color="text-neon-pink" size="sm" />
                        <Knob label="Pan" value={currentParams.pan ?? 0} min={-1} max={1} onChange={(v) => updateTrackParam('pan', v)} color="text-white" size="sm" />
                        <Knob label="Unison" value={currentParams.unison ?? 1} min={1} max={7} step={1} onChange={(v) => updateTrackParam('unison', v)} color="text-neon-cyan" size="sm" />
                        <Knob label="U ¢" value={currentParams.unisonDetune ?? 14} min={0} max={40} onChange={(v) => updateTrackParam('unisonDetune', v)} color="text-neon-cyan" size="sm" />
                     </div>
                  </div>

                  <div className={paramSection === 'mod' ? 'space-y-1' : 'hidden'}>
                     <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                        <Knob label="Chorus" value={currentParams.chorusMix} min={0} max={1} onChange={(v) => updateTrackParam('chorusMix', v)} />
                        <Knob label="Vib D" value={currentParams.vibratoDepth} min={0} max={100} onChange={(v) => updateTrackParam('vibratoDepth', v)} />
                        <Knob label="Vib R" value={currentParams.vibratoRate} min={0} max={20} onChange={(v) => updateTrackParam('vibratoRate', v)} />
                        <Knob label="Glide" value={currentParams.glide} min={0} max={500} onChange={(v) => updateTrackParam('glide', v)} />
                     </div>
                  </div>
                </section>
              ) : (
                <div className="h-40 flex items-center justify-center border border-zinc-900 rounded bg-zinc-950/50">
                   <span className="text-[9px] font-mono text-zinc-700 tracking-widest uppercase px-4 text-center">
                     {isDrumTrack ? 'Sample track selected (No engine parameters)' : 'Select a synth track to edit its engine'}
                   </span>
                </div>
              )}

              
            </div>
          ) : (
            <div className="space-y-3 pb-4">
               <section className="space-y-2 border-b border-zinc-800 pb-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-[9px] uppercase tracking-widest text-zinc-400">Echo</h2>
                  <div className="flex items-center gap-1">
                    <select
                      value={String(globalFX.delayDivision ?? 0)}
                      onChange={(e) => updateGlobalFX('delayDivision', Number(e.target.value))}
                      title="Lock the echo to the transport"
                      className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono text-[7px] text-zinc-400 focus:outline-none"
                    >
                      <option value="0">free</option>
                      <option value="0.25">1/16</option>
                      <option value="0.5">1/8</option>
                      <option value="0.75">1/8 dot</option>
                      <option value="1">1/4</option>
                      <option value="1.5">1/4 dot</option>
                    </select>
                    <button
                      onClick={() => updateGlobalFXFlag('delayPingPong', !(globalFX.delayPingPong ?? true))}
                      title="Bounce the repeats between the channels"
                      className={`rounded border px-1 py-0.5 font-mono text-[7px] uppercase transition-colors ${
                        (globalFX.delayPingPong ?? true)
                          ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-600'}`}
                    >
                      L/R
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                  <Knob label="Dly T" value={globalFX.delayTime} min={0} max={1} onChange={(v) => updateGlobalFX('delayTime', v)} color="text-white" size="sm" />
                  <Knob label="Dly F" value={globalFX.delayFeedback} min={0} max={0.85} onChange={(v) => updateGlobalFX('delayFeedback', v)} color="text-white" size="sm" />
                  <Knob label="Echo" value={globalFX.delayMix ?? 1} min={0} max={1.5} onChange={(v) => updateGlobalFX('delayMix', v)} color="text-white" size="sm" />
                  <Knob label="E Tone" value={globalFX.delayDamp ?? 2600} min={400} max={12000} step={50} onChange={(v) => updateGlobalFX('delayDamp', v)} color="text-white" size="sm" />
                  <Knob label="Reverb" value={globalFX.reverbMix} min={0} max={1} onChange={(v) => updateGlobalFX('reverbMix', v)} color="text-white" size="sm" />
                  <Knob label="Size" value={globalFX.reverbSize ?? 2.4} min={0.6} max={5} step={0.1} onChange={(v) => updateGlobalFX('reverbSize', v)} color="text-white" size="sm" />
                  <Knob label="Damp" value={globalFX.reverbDamp ?? 0.25} min={0} max={1} onChange={(v) => updateGlobalFX('reverbDamp', v)} color="text-white" size="sm" />
                  <Knob label="Pre-D" value={globalFX.reverbPreDelay ?? 0.028} min={0} max={0.25} step={0.002} onChange={(v) => updateGlobalFX('reverbPreDelay', v)} color="text-white" size="sm" />
                </div>

                <h2 className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 pt-1">Modulation</h2>
                <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                  <Knob label="Chorus" value={globalFX.chorusMix ?? 1} min={0} max={1.5} onChange={(v) => updateGlobalFX('chorusMix', v)} color="text-neon-cyan" size="sm" />
                  <Knob label="Phase" value={globalFX.phaserMix ?? 0} min={0} max={1} onChange={(v) => updateGlobalFX('phaserMix', v)} color="text-neon-purple" size="sm" />
                  <Knob label="Ph Rt" value={globalFX.phaserRate ?? 0.35} min={0.02} max={4} step={0.01} onChange={(v) => updateGlobalFX('phaserRate', v)} color="text-neon-purple" size="sm" />
                  <Knob label="Ph Dep" value={globalFX.phaserDepth ?? 0.5} min={0} max={1} onChange={(v) => updateGlobalFX('phaserDepth', v)} color="text-neon-purple" size="sm" />
                  <Knob label="Flang" value={globalFX.flangerMix ?? 0} min={0} max={1} onChange={(v) => updateGlobalFX('flangerMix', v)} color="text-neon-pink" size="sm" />
                  <Knob label="Fl Rt" value={globalFX.flangerRate ?? 0.22} min={0.02} max={3} step={0.01} onChange={(v) => updateGlobalFX('flangerRate', v)} color="text-neon-pink" size="sm" />
                  <Knob label="Fl Fb" value={globalFX.flangerFeedback ?? 0.5} min={0} max={0.9} onChange={(v) => updateGlobalFX('flangerFeedback', v)} color="text-neon-pink" size="sm" />
                  <Knob label="Duck" value={globalFX.sidechain ?? 0.3} min={0} max={0.9} onChange={(v) => updateGlobalFX('sidechain', v)} color="text-neon-cyan" size="sm" />
                  <Knob label="Dk Rel" value={globalFX.sidechainRelease ?? 0.16} min={0.03} max={0.6} step={0.01} onChange={(v) => updateGlobalFX('sidechainRelease', v)} color="text-neon-cyan" size="sm" />
                </div>

                <h2 className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 pt-1">Mastering</h2>
                <div className="grid grid-cols-4 justify-items-center gap-x-0.5 gap-y-1">
                  <Knob label="Width" value={globalFX.width ?? 1} min={0} max={2} onChange={(v) => updateGlobalFX('width', v)} color="text-neon-cyan" size="sm" />
                  <Knob label="Low" value={globalFX.lowShelf ?? 0} min={-8} max={8} onChange={(v) => updateGlobalFX('lowShelf', v)} step={0.5} color="text-neon-purple" size="sm" />
                  <Knob label="Air" value={globalFX.airShelf ?? 0} min={-8} max={8} onChange={(v) => updateGlobalFX('airShelf', v)} step={0.5} color="text-neon-purple" size="sm" />
                  <Knob label="Glue" value={globalFX.glue ?? 0.35} min={0} max={1} onChange={(v) => updateGlobalFX('glue', v)} color="text-neon-pink" size="sm" />
                  <Knob label="Drive" value={globalFX.masterDrive ?? 0.2} min={0} max={1} onChange={(v) => updateGlobalFX('masterDrive', v)} color="text-neon-pink" size="sm" />
                </div>
              </section>
               <div className="pb-4 border-b border-zinc-800">
                  <Fader label="MASTER" value={masterVolume} onChange={setMasterVolume} colorClass="bg-white" />
               </div>
               <div className="space-y-4">
                  {tracks.map(track => (
                    <div 
                      key={track.id} 
                      onClick={() => setSelectedTrackId(track.id)}
                      className={`p-3 bg-zinc-900/40 border transition-colors rounded space-y-3 cursor-pointer ${selectedTrackId === track.id ? 'border-neon-cyan/50' : 'border-zinc-800/40'}`}
                    >
                        <div className="flex justify-between items-start">
                           <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono tracking-widest uppercase ${track.color.replace('bg-', 'text-')}`}>{track.name}</span>
                              {!['kick', 'snare', 'hihat', 'fx'].includes(track.id) && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleSingleTransmute(track.id); }}
                                  disabled={transmutingTracks[track.id] || !hasKey}
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] transition-all border ${transmutingTracks[track.id] ? 'bg-zinc-800 border-zinc-700 animate-spin' : 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan hover:text-black'}`}
                                  title="AI Transmute this engine"
                                >
                                  ✧
                                </button>
                              )}
                           </div>
                           <div className="flex gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? {...t, isMuted: !t.isMuted} : t))}} className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold border ${track.isMuted ? 'bg-red-500 border-red-400 text-black' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>M</button>
                              <button onClick={(e) => { e.stopPropagation(); setTracks(prev => prev.map(t => t.id === track.id ? {...t, isSoloed: !t.isSoloed} : t))}} className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold border ${track.isSoloed ? 'bg-yellow-400 border-yellow-300 text-black' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>S</button>
                           </div>
                        </div>
                        <Fader value={track.volume} onChange={(v) => setTracks(prev => prev.map(t => t.id === track.id ? {...t, volume: v} : t))} colorClass={track.color} />
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
        
        </aside>
      </div>
    </div>
  );
};

export default App;
