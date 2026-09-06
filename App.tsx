
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SequencerGrid } from './components/SequencerGrid';
import { Knob } from './components/Knob';
import { Fader } from './components/Fader';
import { Visualizer } from './components/Visualizer';
import { audioEngine } from './services/audioEngine';
import { midiService } from './services/midiService';
import { generatorService, GenMode, GenHarmonicMotion, GenContour, GenBass, GenDrums } from './services/earwormGenerator';
import type { ScoreBreakdown } from './services/earwormAnalysis';
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
import { 
  INITIAL_TRACKS, DEFAULT_BPM, 
  DEFAULT_LEAD_PARAMS, DEFAULT_BASS_PARAMS, DEFAULT_PAD_PARAMS, DEFAULT_PLUCK_PARAMS,
  DEFAULT_GLOBAL_FX, INSTRUMENT_PRESETS
} from './constants';

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
  const [genHarmonicMotion, setGenHarmonicMotion] = useState<GenHarmonicMotion>('conjunct');
  const [genContour, setGenContour] = useState<GenContour>('arch');
  const [genBass, setGenBass] = useState<GenBass>('driving');
  const [genDrums, setGenDrums] = useState<GenDrums>('four-floor');
  const [genDensity, setGenDensity] = useState<number>(0.7);
  const [genEntropy, setGenEntropy] = useState<number>(0.4);
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
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { totalStepsRef.current = totalSteps; }, [totalSteps]);
  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    const secondsPerStep = (60 / bpmRef.current) * 0.25;
    const currentTracks = tracksRef.current;
    const hasSoloedTrack = currentTracks.some(t => t.isSoloed);

    currentTracks.forEach(track => {
      let playbackVolume = track.volume;
      if (track.isMuted) playbackVolume = 0;
      if (hasSoloedTrack && !track.isSoloed) playbackVolume = 0;
      if (playbackVolume <= 0) return;

      if (track.notes) {
        track.notes.forEach(noteEvent => {
          if (Math.floor(noteEvent.startStep) === stepNumber) {
            const durationSec = noteEvent.duration * secondsPerStep;
            const params = paramsRef.current[track.id];
            if (params) {
              audioEngine.playInstrument(track.id, noteEvent.note, time, durationSec, params, playbackVolume);
            }
          }
        });
      } else if (track.steps) {
        if (track.steps[stepNumber]?.active) {
          audioEngine.playDrum(track.id as TrackType, time, playbackVolume);
        }
      }
    });
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

  const handleGenerateRitual = () => {
    const GEN_STEPS = 256;
    const result = generatorService.generate({ 
      totalSteps: GEN_STEPS, 
      mode: genMode,
      harmonicMotion: genHarmonicMotion,
      contour: genContour,
      bassMode: genBass,
      drumMode: genDrums,
      rhythmDensity: genDensity,
      entropy: genEntropy
    });
    setTracks(result.tracks.map(t => ({ ...t, isMuted: false, isSoloed: false })));
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

  const handleDownloadParams = () => {
    const data = {
      timestamp: new Date().toISOString(),
      theme: currentTheme,
      bpm: bpm,
      instrumentParams: allInstrumentParams,
      globalFX: globalFX,
      masterVolume: masterVolume
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `neon-catafalque-params-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    <div className="flex h-screen w-screen bg-neutral-950 text-gray-200 font-sans overflow-hidden">
      <aside className="w-80 h-full border-r border-zinc-800 bg-black flex flex-col z-50 shrink-0">
        <div className="p-6 space-y-4 border-b border-zinc-800 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-neon-cyan">
              NEON CATAFALQUE
            </h1>
            {currentTheme && (
              <span className="text-[7px] font-mono text-neon-cyan/60 tracking-[0.3em] uppercase mt-1 animate-pulse">
                Theme: {currentTheme}
              </span>
            )}
          </div>
          
          {/* BPM & MIDI */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col flex-1">
               <span className="text-[9px] font-mono text-zinc-600 mb-1 uppercase tracking-widest">BPM</span>
               <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono text-neon-cyan rounded focus:outline-none" />
            </div>
            <div className="relative">
              <button onClick={() => setMidiEnabled(!midiEnabled)} className={`h-9 px-3 text-[9px] font-mono border rounded transition-all ${midiEnabled ? 'border-neon-purple text-neon-purple bg-neon-purple/5' : 'border-zinc-800 text-zinc-600'}`}>
                MIDI {midiEnabled ? 'ON' : 'OFF'}
              </button>
              {midiActive && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-neon-cyan rounded-full animate-ping shadow-[0_0_8px_#00f3ff]" />
              )}
            </div>
          </div>

          {/* GENERATOR CONTROLS */}
          <div className="border border-zinc-800 rounded p-3 bg-zinc-900/20 space-y-3">
             <h3 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-1">Generator Engine</h3>
             
             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                   <label className="text-[8px] text-zinc-600 uppercase">Mode</label>
                   <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className={selectClass}>
                      <option value="aeolian">Aeolian (Minor)</option>
                      <option value="dorian">Dorian</option>
                      <option value="harmonic_minor">Harm. Minor</option>
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[8px] text-zinc-600 uppercase">Motion</label>
                   <select value={genHarmonicMotion} onChange={e => setGenHarmonicMotion(e.target.value as GenHarmonicMotion)} className={selectClass}>
                      <option value="conjunct">Conjunct (Stepwise)</option>
                      <option value="disjunct">Disjunct (Leaps)</option>
                      <option value="static">Static (Drone)</option>
                   </select>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                   <label className="text-[8px] text-zinc-600 uppercase">Contour</label>
                   <select value={genContour} onChange={e => setGenContour(e.target.value as GenContour)} className={selectClass}>
                      <option value="arch">Arch (Rise/Fall)</option>
                      <option value="descent">Descent</option>
                      <option value="wave">Wave</option>
                      <option value="random">Random</option>
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[8px] text-zinc-600 uppercase">Bass Logic</label>
                   <select value={genBass} onChange={e => setGenBass(e.target.value as GenBass)} className={selectClass}>
                      <option value="driving">Driving</option>
                      <option value="acid">Acid</option>
                      <option value="walking">Walking</option>
                      <option value="sustained">Sustained</option>
                   </select>
                </div>
             </div>
             
             <div className="space-y-1">
                  <label className="text-[8px] text-zinc-600 uppercase">Drum Logic</label>
                   <select value={genDrums} onChange={e => setGenDrums(e.target.value as GenDrums)} className={selectClass}>
                      <option value="four-floor">Four-on-Floor</option>
                      <option value="breakbeat">Breakbeat</option>
                      <option value="tribal">Tribal</option>
                   </select>
             </div>

             <div className="flex justify-between pt-2">
                 <Knob label="Density" value={genDensity} min={0.1} max={1.0} onChange={setGenDensity} color="text-neon-cyan" />
                 <Knob label="Twist/Ent" value={genEntropy} min={0.0} max={1.0} onChange={setGenEntropy} color="text-neon-pink" />
             </div>
          </div>

          {/* GEMINI API KEY */}
          <div className="border border-zinc-800 rounded bg-black/40 p-2 space-y-1.5">
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
                AI features need a key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-zinc-500 underline hover:text-neon-cyan"
                >
                  aistudio.google.com
                </a>
                . Stored in this browser only. The sequencer and the Ritual generator work without it.
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button 
                onClick={() => handleAICompose(false)}
                disabled={isComposing || !hasKey}
                className={`flex-1 h-12 relative overflow-hidden group rounded border-2 transition-all ${isComposing || !hasKey ? 'border-zinc-700 bg-zinc-900' : 'border-neon-pink/70 bg-neon-pink/10 hover:bg-neon-pink/20 hover:shadow-[0_0_15px_#ff00ff60]'}`}
              >
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-pink/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                 <span className={`relative z-10 font-mono text-[9px] font-black tracking-[0.1em] uppercase flex flex-col items-center justify-center leading-tight ${isComposing || !hasKey ? 'text-zinc-500' : 'text-neon-pink group-hover:text-white'} ${isComposing ? 'animate-pulse' : ''}`}>
                    {isComposing ? 'CONJURING...' : hasKey ? 'AI LOOP' : 'NO API KEY'}
                    <span className="text-[7px] font-normal opacity-70">128 STEPS</span>
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
                    <span className="text-[7px] font-normal opacity-70">416 STEPS</span>
                 </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button 
                onClick={handleGenerateRitual}
                className="w-full h-8 relative overflow-hidden group rounded border border-neon-purple/50 bg-neon-purple/5 hover:bg-neon-purple/20 transition-all"
                >
                <span className="relative z-10 font-mono text-[8px] font-bold tracking-widest text-neon-purple group-hover:text-white uppercase flex items-center justify-center gap-1">
                    ⏣ Ritual (Proc)
                </span>
                </button>

                <button 
                onClick={handleAITransmute}
                disabled={isTransmuting || !hasKey}
                className={`w-full h-8 relative overflow-hidden group rounded border transition-all ${isTransmuting || !hasKey ? 'border-zinc-800 bg-zinc-900 animate-pulse' : 'border-neon-cyan/50 bg-neon-cyan/5 hover:bg-neon-cyan/20'}`}
                >
                <span className="relative z-10 font-mono text-[8px] font-bold tracking-widest text-neon-cyan group-hover:text-white uppercase flex items-center justify-center gap-1">
                    {isTransmuting ? '...' : '✧ Transmute'}
                </span>
                </button>
            </div>

            {genAnalysis && (
              <div className="mt-3 border border-zinc-800 rounded bg-black/40 p-2 font-mono text-[8px] leading-relaxed">
                <div className="text-zinc-600 uppercase tracking-widest mb-1">Hook analysis</div>
                <div className="flex justify-between text-zinc-400">
                  <span>contour</span><span className="text-neon-purple">{genAnalysis.detail.contourClass}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>twist turns</span><span className="text-neon-pink">{genAnalysis.detail.atypicalTurns}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>range (st)</span><span className="text-neon-cyan">{genAnalysis.detail.range}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>stepwise</span><span className="text-neon-cyan">{Math.round(genAnalysis.detail.stepwiseRatio * 100)}%</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>mean IC</span><span className="text-neon-cyan">{genAnalysis.detail.meanIC.toFixed(2)} bits</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>IC spikes</span><span className="text-neon-cyan">{genAnalysis.detail.spikes}</span>
                </div>
                <div className="flex justify-between text-zinc-500 border-t border-zinc-800 mt-1 pt-1">
                  <span>earworm score</span>
                  <span className="text-white">{genAnalysis.total.toFixed(3)}</span>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={handleDownloadParams}
            className="w-full h-8 relative overflow-hidden group rounded border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800 transition-all mt-4"
          >
            <span className="relative z-10 font-mono text-[9px] font-bold tracking-widest text-zinc-500 group-hover:text-white uppercase flex items-center justify-center gap-2">
                ⤓ Export
            </span>
          </button>
        </div>
        
        <Visualizer />

        <div className="flex border-b border-zinc-800">
          <button 
            onClick={() => setActiveTab('params')}
            className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'params' ? 'text-neon-cyan border-b border-neon-cyan bg-zinc-900/40' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Params
          </button>
          <button 
            onClick={() => setActiveTab('mixer')}
            className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${activeTab === 'mixer' ? 'text-neon-cyan border-b border-neon-cyan bg-zinc-900/40' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Mixer
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {activeTab === 'params' ? (
            <div className="space-y-8 pb-12">
              {!isDrumTrack && currentParams ? (
                <section className="space-y-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <h2 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
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
                      <div className="flex flex-wrap gap-1.5 p-1 bg-zinc-900/50 rounded border border-zinc-800">
                        {Object.keys(trackPresets).map(p => (
                          <button 
                            key={p} 
                            onClick={() => loadPreset(p)}
                            className="px-2 py-1 rounded text-[8px] font-mono uppercase tracking-tight bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-600"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-6 gap-x-2">
                    <Knob label="Cutoff" value={currentParams.cutoff} min={40} max={12000} onChange={(v) => updateTrackParam('cutoff', v)} step={10} color="text-neon-purple" />
                    <Knob label="Env Amt" value={currentParams.filterEnvAmount} min={0} max={1} onChange={(v) => updateTrackParam('filterEnvAmount', v)} color="text-neon-purple" />
                    <Knob label="Sub" value={currentParams.subLevel} min={0} max={1} onChange={(v) => updateTrackParam('subLevel', v)} />
                    <Knob label="Noise" value={currentParams.noiseLevel} min={0} max={0.3} onChange={(v) => updateTrackParam('noiseLevel', v)} />
                    <Knob label="Res" value={currentParams.resonance} min={0} max={20} onChange={(v) => updateTrackParam('resonance', v)} color="text-neon-purple" />
                    <Knob label="Detune" value={currentParams.detune} min={0} max={50} onChange={(v) => updateTrackParam('detune', v)} color="text-neon-cyan" />
                  </div>

                  <div className="border-t border-zinc-900 pt-4 space-y-4">
                     <h3 className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Envelope</h3>
                     <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                        <Knob label="A" value={currentParams.attack} min={0} max={3} onChange={(v) => updateTrackParam('attack', v)} />
                        <Knob label="R" value={currentParams.release} min={0.05} max={3} onChange={(v) => updateTrackParam('release', v)} />
                        <Knob label="D" value={currentParams.decay} min={0.01} max={3} onChange={(v) => updateTrackParam('decay', v)} />
                        <Knob label="S" value={currentParams.sustain} min={0} max={1} onChange={(v) => updateTrackParam('sustain', v)} />
                     </div>
                  </div>

                  <div className="border-t border-zinc-900 pt-4 space-y-4">
                     <h3 className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Modulation</h3>
                     <div className="grid grid-cols-2 gap-y-4 gap-x-2">
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

              <section className="space-y-4 border-t border-zinc-900 pt-6">
                <h2 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Global Master FX</h2>
                <div className="grid grid-cols-2 gap-y-6 gap-x-2">
                  <Knob label="Dly T" value={globalFX.delayTime} min={0} max={1} onChange={(v) => updateGlobalFX('delayTime', v)} color="text-white" />
                  <Knob label="Dly F" value={globalFX.delayFeedback} min={0} max={0.9} onChange={(v) => updateGlobalFX('delayFeedback', v)} color="text-white" />
                  <Knob label="Reverb" value={globalFX.reverbMix} min={0} max={1} onChange={(v) => updateGlobalFX('reverbMix', v)} color="text-white" />
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6 pb-12">
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
        
        <div className="p-6 bg-zinc-900/20 border-t border-zinc-800 flex flex-col gap-4">
          <button onClick={() => setIsPlaying(!isPlaying)} className={`w-full h-14 rounded border-2 transition-all font-mono text-xs tracking-[0.3em] font-bold ${isPlaying ? 'border-neon-pink bg-neon-pink/10 text-neon-pink shadow-[0_0_20px_#ff00ff40]' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {isPlaying ? 'STOP' : 'START'}
          </button>
        </div>
      </aside>

      <main className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden relative">
        <SequencerGrid tracks={tracks} currentStep={currentStep} totalSteps={totalSteps} onToggleStep={handleToggleStep} onAddNote={handleAddNote} onPreviewNote={handlePreviewNote} onToggleCollapse={handleToggleCollapse} />
      </main>
    </div>
  );
};

export default App;
