
import React from 'react';
import { Track } from '../types';
import { SCALE_NOTES } from '../constants';

interface SequencerGridProps {
  tracks: Track[];
  currentStep: number;
  totalSteps: number;
  onToggleStep: (trackId: string, stepIndex: number) => void;
  onAddNote: (trackId: string, note: string, step: number) => void;
  onPreviewNote: (trackId: string, note: string) => void;
  onToggleCollapse: (trackId: string) => void;
}

export const SequencerGrid: React.FC<SequencerGridProps> = ({ 
  tracks, currentStep, totalSteps, onToggleStep, onAddNote, onPreviewNote, onToggleCollapse 
}) => {
  const pianoRollTracks = tracks.filter(t => t.notes);
  const rhythmTracks = tracks.filter(t => t.steps);
  const reversedNotes = [...SCALE_NOTES].reverse();

  // Pixel Dimensions
  const LABEL_W = 100;
  const ROW_H = 32;
  const TRACK_HEADER_H = 36;
  const HEADER_H = 32;
  const STEP_W = 24; // Fixed width per step for scrolling

  const totalWidth = totalSteps * STEP_W;

  const getSectionName = (stepIndex: number) => {
      // Logic for the Full Song Structure (416 steps)
      if (totalSteps >= 400) {
          if (stepIndex === 0) return "INTRO";
          if (stepIndex === 32) return "VERSE 1";
          if (stepIndex === 96) return "CHORUS 1";
          if (stepIndex === 160) return "VERSE 2";
          if (stepIndex === 224) return "CHORUS 2";
          if (stepIndex === 288) return "BRIDGE";
          if (stepIndex === 320) return "CHORUS 3";
          if (stepIndex === 384) return "OUTRO";
          return "";
      }
      
      // Fallback for AI Loop (128 steps)
      if (totalSteps === 128) {
          if (stepIndex === 0) return "INTRO";
          if (stepIndex === 32) return "VERSE";
          if (stepIndex === 64) return "CHORUS";
          return "";
      }

      // Generic
      if (stepIndex % 32 === 0) return `${Math.floor(stepIndex/32) + 1}`;
      return "";
  };

  return (
    <div className="flex flex-col select-none h-full font-mono text-zinc-300 w-full overflow-hidden">
      <div className="flex-1 border border-zinc-800 rounded bg-zinc-950 shadow-2xl relative flex flex-col overflow-hidden">
        {/* Timeline / Header */}
        <div className="flex bg-black/80 sticky top-0 z-50 w-full border-b border-zinc-800 h-[32px]">
          <div 
            className="sticky left-0 bg-black z-[60] border-r border-zinc-800 flex items-center px-4 shrink-0" 
            style={{ width: `${LABEL_W}px` }}
          >
             <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Track</span>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
             <div className="absolute inset-0 overflow-hidden" style={{ transform: `translateX(0)` }}>
                {/* Visual Header Placeholders */}
             </div>
          </div>
        </div>

        {/* Scrollable Container for Grid + Header */}
        <div className="flex-1 overflow-auto custom-scrollbar relative flex flex-col">
            <div className="min-w-max flex flex-col h-full" style={{ width: `${LABEL_W + totalWidth}px` }}>
                
                {/* Header Row (re-implemented inside scroll to move with content) */}
                <div className="flex h-[32px] border-b border-zinc-800 bg-black/80 sticky top-0 z-[50]">
                     <div className="sticky left-0 w-[100px] bg-black border-r border-zinc-800 z-[60] flex items-center px-4">
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Timeline</span>
                     </div>
                     <div className="flex h-full relative">
                        {Array(totalSteps).fill(0).map((_, i) => (
                            <div 
                                key={i} 
                                className={`text-[9px] text-zinc-600 flex items-center justify-start pl-1 border-r border-zinc-800/20 relative ${i % 16 === 0 ? 'border-r-zinc-600/40' : ''}`}
                                style={{ width: `${STEP_W}px` }}
                            >
                                {(i % 4 === 0) && <span className="opacity-50">{i + 1}</span>}
                                {(i % 32 === 0 || [96, 160, 224, 288, 320, 384].includes(i)) && getSectionName(i) && (
                                    <span className="absolute top-0 left-1 h-full flex items-center text-neon-cyan/50 font-bold tracking-widest text-[9px] z-10 whitespace-nowrap bg-black/40 px-1 backdrop-blur-sm">
                                        {getSectionName(i)}
                                    </span>
                                )}
                            </div>
                        ))}
                     </div>
                </div>

                {/* Grid Body */}
                <div className="flex flex-col relative">
                    {/* INSTRUMENT SECTION */}
                    {pianoRollTracks.map(track => (
                    <div key={track.id} className="flex flex-col border-b-2 border-black">
                        {/* Track Header */}
                        <div 
                        onClick={() => onToggleCollapse(track.id)}
                        style={{ height: `${TRACK_HEADER_H}px` }}
                        className="flex sticky left-0 w-full z-40"
                        >
                            <div className="sticky left-0 w-[100px] bg-zinc-900 border-r border-zinc-800 flex items-center justify-between px-4 z-[50] cursor-pointer hover:bg-zinc-800">
                                <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${track.color.replace('bg-', 'text-')}`}>{track.name}</span>
                                <span className="text-[8px] text-zinc-600">{track.isCollapsed ? '▶' : '▼'}</span>
                            </div>
                            <div className="flex-1 bg-zinc-900/40 border-b border-zinc-800/50 flex items-center px-2">
                                {!track.isCollapsed && <div className="text-[8px] text-zinc-600 font-mono tracking-widest">{getSectionName(0)}...</div>}
                            </div>
                        </div>

                        {!track.isCollapsed && (
                        <div className="relative flex">
                            {/* Sticky Notes Labels */}
                            <div className="sticky left-0 w-[100px] bg-black/95 border-r border-zinc-800 z-[45] flex flex-col shrink-0">
                                {reversedNotes.map((note) => (
                                    <div key={note} style={{ height: `${ROW_H}px` }} className="flex items-center justify-end pr-3 text-[9px] text-zinc-600 border-b border-zinc-800/20">
                                        {note}
                                    </div>
                                ))}
                            </div>

                            {/* The Grid */}
                            <div className="relative" style={{ width: `${totalWidth}px` }}>
                                {reversedNotes.map((note) => (
                                    <div key={note} style={{ height: `${ROW_H}px` }} className="flex border-b border-zinc-800/10 w-full">
                                        {Array(totalSteps).fill(0).map((_, stepIdx) => (
                                            <div 
                                                key={stepIdx}
                                                style={{ width: `${STEP_W}px` }}
                                                className={`border-r border-zinc-800/10 hover:bg-white/[0.05] cursor-crosshair ${stepIdx % 4 === 0 ? 'bg-white/[0.01]' : ''} ${stepIdx % 16 === 0 ? 'border-r-zinc-700/30' : ''}`}
                                                onClick={() => onAddNote(track.id, note, stepIdx)}
                                            />
                                        ))}
                                    </div>
                                ))}

                                {/* Notes Overlay */}
                                <div className="absolute inset-0 pointer-events-none">
                                    {track.notes?.map(event => {
                                        const noteIndex = reversedNotes.indexOf(event.note);
                                        if (noteIndex === -1) return null;
                                        return (
                                        <div
                                            key={event.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onAddNote(track.id, event.note, event.startStep);
                                            }}
                                            className={`absolute rounded-sm shadow-xl border border-white/20 flex items-center justify-center cursor-pointer pointer-events-auto transition-all hover:brightness-125 z-20 ${track.color} group`}
                                            style={{
                                                height: `${ROW_H - 6}px`,
                                                top: `${noteIndex * ROW_H + 3}px`,
                                                left: `${event.startStep * STEP_W}px`,
                                                width: `${event.duration * STEP_W}px`,
                                                marginLeft: '2px',
                                            }}
                                        >
                                            <span className="text-[7px] font-black text-black/60 overflow-hidden whitespace-nowrap px-0.5 group-hover:text-black">
                                                {event.note}
                                            </span>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                    ))}

                    {/* RHYTHM SECTION */}
                    <div className="bg-zinc-900/20 border-t-2 border-black pb-12">
                         {rhythmTracks.map(track => (
                            <div key={track.id} style={{ height: '52px' }} className="flex border-b border-zinc-800/40 w-full">
                                <div 
                                    onClick={() => onToggleCollapse(track.id)}
                                    className="sticky left-0 w-[100px] z-[45] flex items-center justify-between pr-4 bg-black border-r border-zinc-800 cursor-pointer hover:bg-zinc-900 group"
                                >
                                    <span className={`pl-4 text-[10px] font-mono tracking-widest uppercase ${track.color.replace('bg-', 'text-')}`}>{track.name}</span>
                                    <span className="text-[8px] text-zinc-700">{track.isCollapsed ? '▶' : '▼'}</span>
                                </div>
                                
                                {!track.isCollapsed ? (
                                    <div className="flex h-full relative" style={{ width: `${totalWidth}px` }}>
                                        {track.steps?.map((step, i) => (
                                            <div 
                                                key={i}
                                                style={{ width: `${STEP_W}px` }}
                                                className={`flex items-center justify-center border-r border-zinc-800/20 h-full ${i % 4 === 0 ? 'bg-white/[0.03]' : ''} ${i % 16 === 0 ? 'border-r-zinc-700/30' : ''}`}
                                            >
                                                <button
                                                    onClick={() => {
                                                        onToggleStep(track.id as string, i);
                                                        if (!step.active) onPreviewNote(track.id as string, '');
                                                    }}
                                                    className={`
                                                        w-[80%] h-[80%] rounded-sm transition-all duration-150 transform
                                                        ${step.active 
                                                            ? `${track.color} shadow-[0_0_12px_currentColor] opacity-100 scale-100` 
                                                            : 'bg-zinc-800/40 hover:bg-zinc-700/60 opacity-30 scale-90'}
                                                        ${currentStep === i ? 'ring-2 ring-neon-cyan ring-inset brightness-150 z-10 scale-105' : ''}
                                                    `}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center px-4 bg-black/60 w-full h-full">
                                        <div className="flex gap-1">
                                            {track.steps?.filter((_, idx) => idx < 32).map((s, idx) => s.active && (
                                                <div key={idx} className={`w-1.5 h-1.5 rounded-full shrink-0 ${track.color}`}></div>
                                            ))}
                                            <span className="text-zinc-700 text-[9px] ml-2">...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                         ))}
                    </div>

                    {/* PLAYHEAD */}
                    <div 
                        className="absolute top-0 bottom-0 border-l-2 border-neon-cyan shadow-[0_0_20px_rgba(0,243,255,0.7)] bg-neon-cyan/5 pointer-events-none z-[40] transition-all duration-75"
                        style={{ 
                            left: `${100 + (currentStep * STEP_W)}px`, 
                            width: `${STEP_W}px` 
                        }}
                    >
                        <div className="h-full w-full bg-gradient-to-r from-neon-cyan/10 to-transparent"></div>
                    </div>

                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
