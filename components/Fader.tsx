
import React from 'react';

interface FaderProps {
  value: number;
  onChange: (value: number) => void;
  colorClass?: string;
  label?: string;
}

/**
 * Fader uses an exponential taper (gain = position^2) for more musical control.
 * This makes the fader less sensitive at the high end and more precise at the low end.
 */
export const Fader: React.FC<FaderProps> = ({ value, onChange, colorClass = 'bg-neon-cyan', label }) => {
  // Convert actual gain value to visual position (0-1)
  const position = Math.sqrt(Math.min(Math.max(value, 0), 1));
  const percentage = position * 100;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const update = (moveE: MouseEvent | React.MouseEvent) => {
      const offsetX = moveE.clientX - rect.left;
      const rawPosition = Math.max(0, Math.min(1, offsetX / rect.width));
      // Map linear slider position to exponential gain
      const newValue = rawPosition * rawPosition;
      onChange(newValue);
    };

    update(e);

    const onMouseMove = (moveE: MouseEvent) => update(moveE);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="flex flex-col w-full gap-1">
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{label}</span>
          <span className="text-[9px] font-mono text-zinc-400">{(value * 100).toFixed(0)}</span>
        </div>
      )}
      <div 
        className="h-6 w-full bg-zinc-900 border border-zinc-800 rounded relative cursor-pointer group flex items-center px-1"
        onMouseDown={handleMouseDown}
      >
        {/* Track Background */}
        <div className="absolute left-1 right-1 h-0.5 bg-zinc-800 rounded-full" />
        
        {/* Active Track */}
        <div 
          className={`absolute left-1 h-0.5 rounded-full transition-all duration-75 ${colorClass} opacity-40`}
          style={{ width: `calc(${percentage}% - 8px)` }}
        />

        {/* Knob */}
        <div 
          className={`absolute w-4 h-4 rounded-sm border-2 border-white/20 shadow-lg transition-all duration-75 flex items-center justify-center ${colorClass} group-hover:brightness-125`}
          style={{ left: `calc(${percentage}% - 8px)`, pointerEvents: 'none' }}
        >
           <div className="w-0.5 h-2 bg-black/40" />
        </div>
      </div>
    </div>
  );
};
