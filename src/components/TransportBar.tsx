import React, { useRef } from 'react';
import { Maximize2, Minimize2, Minus, Play, Plus, Square } from 'lucide-react';
import {
  clampBpm,
  formatSwingValue,
  MAX_BPM,
  MAX_SWING,
  MIN_BPM,
  MIN_SWING,
} from '../audio/sequencerLogic';
import { RotaryKnob } from './RotaryKnob';

interface TransportBarProps {
  isPlaying: boolean;
  bpm: number;
  swing: number;
  masterVolume: number;
  currentStep: number;
  isFullscreen: boolean;
  onTogglePlay: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeSwing: (swing: number) => void;
  onChangeMasterVolume: (vol: number) => void;
  onToggleFullscreen: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  bpm,
  swing,
  masterVolume,
  currentStep,
  isFullscreen,
  onTogglePlay,
  onChangeBpm,
  onChangeSwing,
  onChangeMasterVolume,
  onToggleFullscreen,
}) => {
  const stepLabel = currentStep >= 0 ? String(currentStep + 1).padStart(2, '0') : '--';
  const bpmDragRef = useRef<{ startY: number; startBpm: number } | null>(null);

  const handleBpmPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    bpmDragRef.current = { startY: e.clientY, startBpm: bpm };
  };

  const handleBpmPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bpmDragRef.current) return;
    const deltaY = bpmDragRef.current.startY - e.clientY;
    const nextBpm = clampBpm(bpmDragRef.current.startBpm + Math.round(deltaY * 1.2));
    if (nextBpm !== bpm) {
      onChangeBpm(nextBpm);
    }
  };

  const handleBpmPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bpmDragRef.current) {
      bpmDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleBpmKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChangeBpm(clampBpm(bpm + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChangeBpm(clampBpm(bpm - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeBpm(MIN_BPM);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeBpm(MAX_BPM);
    }
  };

  return (
    <header className="temple-titlebar-blue border-b-2 border-white px-3 py-1 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
      {/* Eccentric VGA OS Title Block: Kami Block */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="grid grid-cols-2 w-7 h-7 border-2 border-white bg-black shrink-0"
          aria-hidden="true"
        >
          <span className="bg-[#55ffff]" />
          <span className="bg-[#ffff55]" />
          <span className="bg-[#ff55ff]" />
          <span className="bg-[#55ff55]" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-white uppercase leading-none">
            KAMI <span className="text-[#ffff55]">BLOCK</span>
          </h1>
          <div className="text-[10px] font-mono-tabular font-bold text-[#55ffff] tracking-wider uppercase leading-none mt-0.5">
            640x480 AUDIO.OS
          </div>
        </div>
      </div>

      {/* Transport + Clock (3..333 BPM) + Swing (-99..+99) + Master */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-pressed={isPlaying}
          className={`temple-bevel-btn min-h-[38px] min-w-[92px] px-3.5 py-1 font-mono-tabular font-extrabold text-sm uppercase flex items-center justify-center gap-2 transition-transform active:translate-y-0.5 cursor-pointer whitespace-nowrap shrink-0 border-2 border-white ${
            isPlaying
              ? 'bg-[#ff5555] hover:bg-[#ff6e6e] text-white'
              : 'bg-[#55ff55] hover:bg-[#77ff77] text-black'
          }`}
        >
          {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{isPlaying ? 'Stop' : 'Play'}</span>
        </button>

        {/* VGA LED Clock & Step */}
        <div className="flex items-center gap-1 temple-led-screen px-1.5 py-1">
          <button
            type="button"
            onClick={() => onChangeBpm(bpm - 1)}
            aria-label="Decrease BPM"
            className="temple-bevel-btn w-9 h-9 bg-[#1f2c6b] hover:bg-[#2d3e94] border border-white text-white flex items-center justify-center cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Tempo BPM"
            aria-valuemin={MIN_BPM}
            aria-valuemax={MAX_BPM}
            aria-valuenow={bpm}
            aria-valuetext={`${bpm} BPM`}
            onPointerDown={handleBpmPointerDown}
            onPointerMove={handleBpmPointerMove}
            onPointerUp={handleBpmPointerUp}
            onPointerCancel={handleBpmPointerUp}
            onKeyDown={handleBpmKeyDown}
            onWheel={(e) => {
              e.preventDefault();
              onChangeBpm(clampBpm(bpm + (e.deltaY < 0 ? 1 : -1)));
            }}
            style={{ touchAction: 'none' }}
            title="Tempo (3–333 BPM): drag up/down or use +/-"
            className="px-2 text-center min-w-[60px] cursor-ns-resize select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffff55]"
          >
            <div className="text-[9px] font-mono-tabular uppercase tracking-wider text-[#55ffff] leading-none mb-0.5">
              Tempo
            </div>
            <div
              className="font-mono-tabular text-base font-extrabold text-[#ffff55] leading-none"
              data-testid="bpm-readout"
            >
              {bpm}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChangeBpm(bpm + 1)}
            aria-label="Increase BPM"
            className="temple-bevel-btn w-9 h-9 bg-[#1f2c6b] hover:bg-[#2d3e94] border border-white text-white flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>

          <div className="h-6 w-0.5 bg-[#55ffff]/40 mx-1" aria-hidden="true" />

          <div className="px-2 text-center min-w-[46px]">
            <div className="text-[9px] font-mono-tabular uppercase tracking-wider text-[#55ffff] leading-none mb-0.5">
              Step
            </div>
            <div
              className="font-mono-tabular text-base font-extrabold text-[#ff5555] leading-none"
              data-testid="step-readout"
            >
              {stepLabel}
            </div>
          </div>
        </div>

        {/* Swing (-99..+99) & Master */}
        <div className="flex items-center gap-3 px-1">
          <RotaryKnob
            label="Swing"
            value={swing}
            min={MIN_SWING}
            max={MAX_SWING}
            step={1}
            defaultValue={0}
            displayValue={formatSwingValue(swing)}
            accentColor="#ffff55"
            size="sm"
            onChange={onChangeSwing}
          />
          <RotaryKnob
            label="Master"
            value={masterVolume}
            min={0}
            max={100}
            step={1}
            defaultValue={85}
            displayValue={`${masterVolume}%`}
            accentColor="#55ffff"
            size="sm"
            onChange={onChangeMasterVolume}
          />
        </div>
      </div>

      {/* Full Screen Window Button */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          className={`temple-bevel-btn min-h-[42px] px-3.5 py-1.5 border-2 border-white font-mono-tabular text-xs font-bold uppercase flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
            isFullscreen
              ? 'bg-[#ffff55] text-black'
              : 'bg-[#00aaaa] hover:bg-[#22cccc] text-black'
          }`}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{isFullscreen ? 'Exit Full' : 'Full Screen'}</span>
        </button>
      </div>
    </header>
  );
};
