import React, { useEffect, useRef } from 'react';
import { formatMasterFxValue } from '../audio/sequencerLogic';
import {
  DISTORTION_MODES,
  DistortionMode,
  MASTER_FX_KNOBS,
  MasterFxParams,
} from '../audio/synthConfig';
import { RotaryKnob } from './RotaryKnob';

interface MasterFxPanelProps {
  masterFx: MasterFxParams;
  analyser: AnalyserNode | null;
  getReductionDb: () => number;
  onChangeMasterFx: <K extends keyof MasterFxParams>(key: K, value: MasterFxParams[K]) => void;
}

const COMP_RATIOS = [4, 8, 16];

export const MasterFxPanel: React.FC<MasterFxPanelProps> = ({
  masterFx,
  analyser,
  getReductionDb,
  onChangeMasterFx,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const grBarRef = useRef<HTMLDivElement | null>(null);
  const grTextRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const drawGrid = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(85, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
    };

    if (!analyser) {
      drawGrid();
      ctx.strokeStyle = '#ff55ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    let rafId = 0;
    let lastDrawMs = 0;
    let lastGrLabel = '-0.0dB';
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const draw = (nowMs: number) => {
      rafId = requestAnimationFrame(draw);
      // Throttle visual scope to ~30fps to free main-thread cycles
      if (nowMs - lastDrawMs < 32) return;
      lastDrawMs = nowMs;

      drawGrid();

      ctx.strokeStyle = '#ff55ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      analyser.getByteTimeDomainData(buffer);
      const sliceWidth = w / buffer.length;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * sliceWidth, y);
      }
      ctx.stroke();

      const grDb = getReductionDb();
      const pct = Math.min(100, (grDb / 24) * 100);
      if (grBarRef.current) {
        grBarRef.current.style.width = `${pct.toFixed(1)}%`;
      }
      const nextLabel = `-${grDb.toFixed(1)}dB`;
      if (grTextRef.current && nextLabel !== lastGrLabel) {
        lastGrLabel = nextLabel;
        grTextRef.current.textContent = nextLabel;
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [analyser, getReductionDb]);

  return (
    <section
      aria-label="Master Bus Compressor and Distortion"
      className="temple-window h-full flex flex-col overflow-hidden"
    >
      {/* Eccentric VGA Title Bar */}
      <div className="temple-titlebar-magenta border-b-2 border-white px-2.5 py-1 flex items-center justify-between gap-2">
        <span className="font-mono-tabular text-xs font-extrabold uppercase tracking-wider text-white">
          [END_OF_CHAIN] :: PUMP &amp; CRUNCH
        </span>
        <span
          ref={grTextRef}
          className="font-mono-tabular text-[11px] font-bold text-[#ffff55]"
          aria-label="Compressor gain reduction"
        >
          -0.0dB
        </span>
      </div>

      <div className="p-2 flex flex-col gap-1.5 flex-1 justify-between">
        {/* Oscilloscope + Live Pumping GR Meter */}
        <div className="flex flex-col gap-1 bg-black border-2 border-[#ff55ff] p-1">
          <canvas
            ref={canvasRef}
            width={300}
            height={26}
            data-testid="oscilloscope-canvas"
            aria-label="Audio waveform monitor"
            className="w-full h-[26px] block"
          />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono-tabular font-bold uppercase text-[#55ffff] shrink-0">
              PUMP GR
            </span>
            <div className="flex-1 h-1.5 bg-[#141a42] border border-[#55ffff]/50 overflow-hidden">
              <div
                ref={grBarRef}
                className="h-full bg-gradient-to-r from-[#55ff55] via-[#ffff55] to-[#ff5555] transition-[width] duration-75"
                style={{ width: '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Distortion Clip Mode + Compressor Ratio Switches */}
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center bg-black border border-white/60 p-0.5 gap-0.5">
            {DISTORTION_MODES.map((m) => {
              const active = masterFx.distMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChangeMasterFx('distMode', m.value as DistortionMode)}
                  aria-pressed={active}
                  className={`min-h-[28px] px-2 py-0.5 text-[10px] font-mono-tabular font-bold uppercase cursor-pointer ${
                    active ? 'bg-[#ff55ff] text-black' : 'text-[#d6e4ff] hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center bg-black border border-white/60 p-0.5 gap-0.5">
            {COMP_RATIOS.map((r) => {
              const active = masterFx.compRatio === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeMasterFx('compRatio', r)}
                  aria-pressed={active}
                  aria-label={`Compressor ratio ${r}:1`}
                  className={`min-h-[28px] px-2 py-0.5 text-[10px] font-mono-tabular font-bold cursor-pointer ${
                    active ? 'bg-[#ffff55] text-black' : 'text-[#d6e4ff] hover:text-white'
                  }`}
                >
                  {r}:1
                </button>
              );
            })}
          </div>
        </div>

        {/* 6 Master End-of-Chain Knobs */}
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 justify-items-center">
          {MASTER_FX_KNOBS.map((knob) => {
            const val = Number(masterFx[knob.key]);
            return (
              <RotaryKnob
                key={knob.key}
                label={knob.label}
                value={val}
                min={knob.min}
                max={knob.max}
                step={knob.step}
                defaultValue={knob.defaultValue}
                displayValue={formatMasterFxValue(knob, val)}
                accentColor={
                  knob.key === 'distDrive' || knob.key === 'distTone'
                    ? '#ff55ff'
                    : '#55ffff'
                }
                size="sm"
                onChange={(nextVal) => onChangeMasterFx(knob.key, nextVal)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
