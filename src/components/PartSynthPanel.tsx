import React from 'react';
import { Lock, Volume2, X } from 'lucide-react';
import {
  countStepPLocks,
  formatParamValue,
  midiToNoteName,
  resolveEffectiveStepParams,
} from '../audio/sequencerLogic';
import {
  PART_DEFINITIONS,
  PART_ORDER,
  PartId,
  PartParams,
} from '../audio/synthConfig';
import { RotaryKnob } from './RotaryKnob';

interface PartSynthPanelProps {
  selectedPart: PartId;
  params: PartParams;
  pLockTarget: { partId: PartId; stepIndex: number } | null;
  pLockParams: Partial<PartParams> | null;
  activeRibbonMidi: number;
  pitchEditMode: boolean;
  onSelectPart: (partId: PartId) => void;
  onChangeParam: (partId: PartId, key: string, value: number | string) => void;
  onTriggerPart: (partId: PartId, overrideMidi?: number) => void;
  onSelectRibbonMidi: (midi: number) => void;
  onTogglePitchEditMode: () => void;
  onClearStepPLock: () => void;
}

const RIBBON_SEMITONES = [
  { offset: 0, label: 'C', sharp: false },
  { offset: 1, label: 'C#', sharp: true },
  { offset: 2, label: 'D', sharp: false },
  { offset: 3, label: 'D#', sharp: true },
  { offset: 4, label: 'E', sharp: false },
  { offset: 5, label: 'F', sharp: false },
  { offset: 6, label: 'F#', sharp: true },
  { offset: 7, label: 'G', sharp: false },
  { offset: 8, label: 'G#', sharp: true },
  { offset: 9, label: 'A', sharp: false },
  { offset: 10, label: 'A#', sharp: true },
  { offset: 11, label: 'B', sharp: false },
  { offset: 12, label: 'C', sharp: false },
];

export const PartSynthPanel: React.FC<PartSynthPanelProps> = ({
  selectedPart,
  params,
  pLockTarget,
  pLockParams,
  activeRibbonMidi,
  pitchEditMode,
  onSelectPart,
  onChangeParam,
  onTriggerPart,
  onSelectRibbonMidi,
  onTogglePitchEditMode,
  onClearStepPLock,
}) => {
  const def = PART_DEFINITIONS[selectedPart];
  const isPLocking = pLockTarget !== null && pLockTarget.partId === selectedPart;
  const effectiveParams = isPLocking
    ? resolveEffectiveStepParams(params, pLockParams)
    : params;
  const lockCount = isPLocking ? countStepPLocks(pLockParams) : 0;
  const currentMode = String(effectiveParams[def.modeKey] ?? def.defaultMode);
  const ribbonBaseOctave = Math.floor(activeRibbonMidi / 12) * 12;

  return (
    <section
      aria-label="Synthesis Parameters"
      className="temple-window h-full flex flex-col overflow-hidden"
    >
      {/* Window Title Bar */}
      <div
        className={`${
          isPLocking ? 'temple-titlebar-magenta' : 'temple-titlebar-cyan'
        } border-b-2 border-white px-2.5 py-1 flex items-center justify-between gap-2`}
      >
        <span className="font-mono-tabular text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
          {isPLocking && <Lock className="w-3.5 h-3.5 text-[#ffff55]" />}
          <span>
            {isPLocking
              ? `[P-LOCK] :: ${def.name} STEP ${pLockTarget.stepIndex + 1}`
              : `[SYNTH_VOICE] :: ${def.name}`}
          </span>
        </span>
        <span className="text-[11px] font-mono-tabular font-bold text-[#ffff55] hidden sm:inline">
          {isPLocking
            ? `${lockCount} locked param${lockCount === 1 ? '' : 's'} — turn any knob`
            : def.engineLabel}
        </span>
      </div>

      <div className="p-2 flex flex-col gap-1.5">
        {/* Part Selector Tabs + Audition Button */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-[#2c3b7a]">
          <div className="flex items-center gap-1 bg-black p-0.5 border border-[#55ffff]/60 flex-wrap">
            {PART_ORDER.map((partId, idx) => {
              const pDef = PART_DEFINITIONS[partId];
              const isSelected = partId === selectedPart;
              return (
                <button
                  key={partId}
                  type="button"
                  onClick={() => onSelectPart(partId)}
                  aria-pressed={isSelected}
                  className={`min-h-[34px] px-2 py-0.5 text-xs font-mono-tabular font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap border ${
                    isSelected
                      ? 'bg-[#ffffff] text-black border-white'
                      : 'bg-[#111740] text-[#d6e4ff] hover:text-white border-[#2e3e82]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 border border-black shrink-0"
                    style={{ backgroundColor: pDef.accentHex }}
                    aria-hidden="true"
                  />
                  <span>
                    {idx + 1}. {pDef.name}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onTriggerPart(selectedPart)}
            style={{ backgroundColor: def.accentHex }}
            className="temple-bevel-btn min-h-[36px] px-3 py-1 border-2 border-white font-mono-tabular font-extrabold text-xs uppercase text-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Volume2 className="w-4 h-4" />
            <span>Trigger {def.shortName}</span>
          </button>
        </div>

        {/* Mode Selector + Tailored Knobs */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono-tabular font-bold uppercase text-[#55ffff]">
                {def.modeLabel}:
              </span>
              <div className="flex items-center bg-black p-0.5 border border-white/60 gap-0.5 flex-wrap">
                {def.modeOptions.map((opt) => {
                  const active = currentMode === opt.value;
                  const isLockedKey = isPLocking && pLockParams?.[def.modeKey] !== undefined;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChangeParam(selectedPart, def.modeKey, opt.value)}
                      aria-pressed={active}
                      className={`min-h-[30px] px-2 py-0.5 text-[11px] font-mono-tabular font-bold uppercase cursor-pointer whitespace-nowrap transition-colors ${
                        active
                          ? 'text-black'
                          : isLockedKey
                          ? 'text-[#ff88ff] hover:text-white'
                          : 'text-[#b6c6ff] hover:text-white'
                      }`}
                      style={active ? { backgroundColor: def.accentHex } : undefined}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isPLocking && lockCount > 0 && (
              <button
                type="button"
                onClick={onClearStepPLock}
                aria-label="Clear step parameter locks"
                className="min-h-[30px] px-2 py-0.5 bg-[#aa00aa] hover:bg-[#cc00cc] border border-white text-[10px] font-mono-tabular font-extrabold uppercase text-white flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Clear Step Lock</span>
              </button>
            )}
          </div>

          <div
            className={`grid gap-1.5 py-0.5 justify-items-center ${
              def.knobs.length === 7
                ? 'grid-cols-4 sm:grid-cols-7'
                : 'grid-cols-3 sm:grid-cols-6'
            }`}
          >
            {def.knobs.map((knob) => {
              const rawVal = Number(effectiveParams[knob.key] ?? knob.defaultValue);
              const isKnobLocked = isPLocking && pLockParams?.[knob.key] !== undefined;
              return (
                <RotaryKnob
                  key={`${selectedPart}-${knob.key}`}
                  label={isKnobLocked ? `*${knob.label}` : knob.label}
                  value={rawVal}
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  defaultValue={knob.defaultValue}
                  displayValue={formatParamValue(knob, rawVal)}
                  accentColor={isKnobLocked ? '#ff55ff' : def.accentHex}
                  size={def.knobs.length === 7 ? 'sm' : 'md'}
                  onChange={(nextVal) => onChangeParam(selectedPart, knob.key, nextVal)}
                />
              );
            })}
          </div>
        </div>

        {/* Playable Korg Volca Touch Ribbon when FM Synth is selected */}
        {selectedPart === 'fmsynth' && (
          <div className="pt-1.5 border-t border-[#2c3b7a] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <span className="text-[11px] font-mono-tabular font-bold text-[#55ff55]">
                KEY:{midiToNoteName(activeRibbonMidi)}
              </span>
              <div className="flex items-center gap-1 bg-black border border-white/50 p-0.5">
                <button
                  type="button"
                  onClick={() => onSelectRibbonMidi(Math.max(24, activeRibbonMidi - 12))}
                  className="min-h-[28px] px-2 text-xs font-mono-tabular font-bold text-white hover:bg-[#1f2c6b] cursor-pointer"
                  aria-label="Octave down"
                >
                  Oct-
                </button>
                <button
                  type="button"
                  onClick={() => onSelectRibbonMidi(Math.min(72, activeRibbonMidi + 12))}
                  className="min-h-[28px] px-2 text-xs font-mono-tabular font-bold text-white hover:bg-[#1f2c6b] cursor-pointer"
                  aria-label="Octave up"
                >
                  Oct+
                </button>
              </div>
              <button
                type="button"
                onClick={onTogglePitchEditMode}
                aria-pressed={pitchEditMode}
                className={`min-h-[30px] px-2 text-[11px] font-mono-tabular font-bold uppercase border cursor-pointer whitespace-nowrap ${
                  pitchEditMode
                    ? 'bg-[#55ff55] text-black border-white'
                    : 'bg-black text-[#b6c6ff] border-[#55ff55]/60 hover:text-white'
                }`}
              >
                {pitchEditMode ? 'Pitch Paint: ON' : 'Paint Notes'}
              </button>
            </div>

            <div
              className="grid grid-cols-13 gap-1 flex-1"
              role="group"
              aria-label="FM Synth touch ribbon keyboard"
            >
              {RIBBON_SEMITONES.map((k) => {
                const midi = Math.max(24, Math.min(84, ribbonBaseOctave + k.offset));
                const isSelected = midi === activeRibbonMidi;
                return (
                  <button
                    key={`${k.offset}-${k.label}`}
                    type="button"
                    onClick={() => {
                      onSelectRibbonMidi(midi);
                      onTriggerPart('fmsynth', midi);
                    }}
                    aria-label={`Play ${midiToNoteName(midi)}`}
                    className={`min-h-[34px] text-[10px] font-mono-tabular font-bold cursor-pointer border flex flex-col items-center justify-end pb-0.5 transition-transform active:scale-95 ${
                      isSelected
                        ? 'bg-[#55ff55] text-black border-white'
                        : k.sharp
                        ? 'bg-black text-[#55ffff] border-[#3d52a8] hover:bg-[#161e52]'
                        : 'bg-[#e8eeff] text-black border-white hover:bg-white'
                    }`}
                  >
                    <span>{k.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
