import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export const Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bufferLength = audioEngine.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      audioEngine.analyser.getByteTimeDomainData(dataArray);

      // Aesthetic clear - solid background in sidebar
      ctx.fillStyle = '#0a0a0a'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#b026ff'; // Match Lead purple for variety
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#b026ff';

      ctx.beginPath();
      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
        <div className="absolute left-2 top-0.5 z-10 font-mono text-[7px] uppercase tracking-widest text-zinc-700">Output</div>
        <canvas ref={canvasRef} width={320} height={96} className="block h-full w-full opacity-60" />
    </div>
  );
};
