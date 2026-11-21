import React from 'react';
import { Sliders } from 'lucide-react';
import { clampMixerLevel, isPartAudible, MixerLevels } from '../audio/sequencerLogic';
import { PART_DEFINITIONS, PART_ORDER, PartId } from '../audio/synthConfig';

interface FourChannelMixerProps {
  mixerLevels: MixerLevels;
  muted: Record<PartId, boolean>;
  soloed: Record<PartId, boolean>;
  selectedPart: PartId;
  onChangeChannelLevel: (partId: PartId, level: number) => void;
  onToggleMute: (partId: PartId) => void;
  onSelectAndTriggerPart: (partId: PartId) => void;
}

export const FourChannelMixer: React.FC<FourChannelMixerProps> = ({
  mixerLevels,
  muted,
  soloed,
  selectedPart,
  onChangeChannelLevel,
  onToggleMute,
  onSelectAndTriggerPart,
}) => {
  return (
    <section
      aria-label="Four-Channel Track Mixer"
      data-testid="four-channel-mixer"
      className="bg-[#070b24] border-b-2 border-white px-2.5 py-1 flex flex-col lg:flex-row items-stretch lg:items-center gap-1.5"
    >
      <div className="flex items-center gap-1.5 shrink-0 pr-1">
        <Sliders className="w-3.5 h-3.5 text-[#55ffff]" aria-hidden="true" />
        <span className="font-mono-tabular text-[10px] font-extrabold uppercase tracking-wider text-[#55ffff] whitespace-nowrap">
          4-CH MIXER
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 flex-1">
        {PART_ORDER.map((partId, idx) => {
          const def = PART_DEFINITIONS[partId];
          const level = clampMixerLevel(mixerLevels[partId]);
          const isMuted = muted[partId];
          const audible = isPartAudible(partId, muted, soloed);
          const isSelected = selectedPart === partId;

          return (
            <div
              key={partId}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 border bg-black transition-colors ${
                isSelected ? 'border-white' : 'border-[#2e3e82]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectAndTriggerPart(partId)}
                aria-label={`Select mixer channel ${def.name}`}
                className="flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-90"
              >
                <span
                  className="w-2 h-4 border border-white/60 shrink-0"
                  style={{
                    backgroundColor: audible ? def.accentHex : '#4b5563',
                    opacity: audible ? 1 : 0.4,
                  }}
                  aria-hidden="true"
                />
                <span className="font-mono-tabular text-[10px] font-extrabold text-white whitespace-nowrap">
                  {idx + 1}.{def.shortName}
                </span>
              </button>

              {/* Tactile Fader Track + Native Range Input */}
              <div className="relative flex-1 h-5 bg-[#0c1238] border border-[#3d52a8] flex items-center overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-75"
                  style={{
                    width: `${level}%`,
                    backgroundColor: audible ? def.accentHex : '#4b5563',
                    opacity: audible ? 0.72 : 0.25,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={level}
                  onChange={(e) =>
                    onChangeChannelLevel(partId, Number(e.target.value))
                  }
                  onDoubleClick={() => onChangeChannelLevel(partId, 85)}
                  aria-label={`${def.name} mixer level`}
                  data-testid={`mixer-fader-${partId}`}
                  className="relative z-10 w-full h-full opacity-0 cursor-ew-resize"
                />
                <span className="absolute right-1 z-0 font-mono-tabular text-[9px] font-extrabold text-white drop-shadow-[0_1px_1px_#000] pointer-events-none">
                  {level}%
                </span>
              </div>

              <button
                type="button"
                onClick={() => onToggleMute(partId)}
                aria-pressed={isMuted}
                aria-label={`Mixer mute ${def.name}`}
                className={`w-5 h-5 font-mono-tabular text-[9px] font-extrabold border cursor-pointer shrink-0 flex items-center justify-center ${
                  isMuted
                    ? 'bg-[#ff5555] text-white border-white'
                    : 'bg-[#101640] text-[#b6c6ff] border-[#3d52a8] hover:text-white'
                }`}
              >
                M
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
