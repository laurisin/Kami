import { useCallback, useEffect, useRef, useState } from 'react';
import { createReliableClockTimer, ReliableClockTimer } from './audio/clockWorker';
import { VolcaDrumEngine } from './audio/drumEngine';
import {
  alignPartStepToBarPhase,
  bpmToBarDurationSec,
  calculatePartStepHitTimeSec,
  calculateRatchetSubHitTimesSec,
  clampBpm,
  clampMixerLevel,
  clampPartStepCount,
  clampRatchetCount,
  clampSwing,
  clearPartConditions,
  clearPartInGrid,
  clearPartPLocks,
  clearPartRatchets,
  createEmptyConditions,
  createEmptyPLocks,
  createEmptyRatchets,
  createEmptySteps,
  createInitialSequencerState,
  isPartAudible,
  nextRatchetCount,
  nextTrigCondition,
  randomizePartSteps,
  resolveEffectiveStepParams,
  SequencerState,
  setStepRatchetInGrid,
  shouldTriggerCondition,
  toggleStepInGrid,
  TrigCondition,
} from './audio/sequencerLogic';
import { MasterFxParams, PART_ORDER, PartId, STEP_COUNT } from './audio/synthConfig';
import { FourChannelMixer } from './components/FourChannelMixer';
import { MasterFxPanel } from './components/MasterFxPanel';
import { PartSynthPanel } from './components/PartSynthPanel';
import { SequencerEditMode, StepSequencerGrid } from './components/StepSequencerGrid';
import { TransportBar } from './components/TransportBar';

const STOPPED_PLAYHEADS: Record<PartId, number> = {
  kick: -1,
  snare: -1,
  hihat: -1,
  fmsynth: -1,
};

export default function App() {
  const [seqState, setSeqState] = useState<SequencerState>(() =>
    createInitialSequencerState()
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [partPlayheads, setPartPlayheads] = useState<Record<PartId, number>>(STOPPED_PLAYHEADS);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [activeRibbonMidi, setActiveRibbonMidi] = useState(48);
  const [editMode, setEditMode] = useState<SequencerEditMode>('step');
  const [activeRatchet, setActiveRatchet] = useState(2);
  const [activeCondition, setActiveCondition] = useState<TrigCondition>('50%');
  const [pLockTarget, setPLockTarget] = useState<{ partId: PartId; stepIndex: number } | null>(
    null
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const engineRef = useRef<VolcaDrumEngine | null>(null);
  const stateRef = useRef<SequencerState>(seqState);
  stateRef.current = seqState;

  const isPlayingRef = useRef(false);
  const barOriginSecRef = useRef(0);
  const prevBpmRef = useRef(seqState.bpm);
  const prevStepCountsRef = useRef<Record<PartId, number>>({ ...seqState.stepCounts });
  const partCursorsRef = useRef<Record<PartId, { barIndex: number; stepIndex: number }>>({
    kick: { barIndex: 0, stepIndex: 0 },
    snare: { barIndex: 0, stepIndex: 0 },
    hihat: { barIndex: 0, stepIndex: 0 },
    fmsynth: { barIndex: 0, stepIndex: 0 },
  });
  const clockTimerRef = useRef<ReliableClockTimer | null>(null);
  const visualQueueRef = useRef<Array<{ partId: PartId; step: number; time: number }>>([]);
  const rafIdRef = useRef<number | null>(null);

  const getEngine = useCallback((): VolcaDrumEngine => {
    if (!engineRef.current) {
      engineRef.current = new VolcaDrumEngine();
    }
    const ctx = engineRef.current.ensureContext();
    if (!analyser) {
      setAnalyser(engineRef.current.getAnalyser());
    }
    engineRef.current.setMasterVolume(stateRef.current.masterVolume);
    engineRef.current.setAllChannelVolumes(stateRef.current.mixerLevels);
    engineRef.current.setMasterFx(stateRef.current.masterFx);
    void ctx;
    return engineRef.current;
  }, [analyser]);

  const stopSequencer = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPartPlayheads(STOPPED_PLAYHEADS);
    clockTimerRef.current?.stop();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    visualQueueRef.current = [];
  }, []);

  const startSequencer = useCallback(() => {
    const engine = getEngine();
    const now = engine.getCurrentTime();

    isPlayingRef.current = true;
    setIsPlaying(true);
    barOriginSecRef.current = now + 0.04;
    prevBpmRef.current = stateRef.current.bpm;
    prevStepCountsRef.current = { ...stateRef.current.stepCounts };
    partCursorsRef.current = {
      kick: { barIndex: 0, stepIndex: 0 },
      snare: { barIndex: 0, stepIndex: 0 },
      hihat: { barIndex: 0, stepIndex: 0 },
      fmsynth: { barIndex: 0, stepIndex: 0 },
    };
    visualQueueRef.current = [];

    if (!clockTimerRef.current) {
      clockTimerRef.current = createReliableClockTimer();
    }

    const lookaheadSec = 0.12;
    const schedulerTick = () => {
      if (!isPlayingRef.current || !engineRef.current) return;
      const currentTime = engineRef.current.getCurrentTime();
      const snap = stateRef.current;

      // Adapt seamlessly when BPM changes mid-playback while staying bar-phase locked
      if (snap.bpm !== prevBpmRef.current) {
        const oldBarDur = bpmToBarDurationSec(prevBpmRef.current);
        const newBarDur = bpmToBarDurationSec(snap.bpm);
        const barPhase = Math.max(0, (currentTime - barOriginSecRef.current) / oldBarDur);
        barOriginSecRef.current = currentTime - barPhase * newBarDur;
        prevBpmRef.current = snap.bpm;
      }

      const barDurSec = bpmToBarDurationSec(snap.bpm);
      const horizonSec = currentTime + lookaheadSec;
      let queuedVisuals = false;

      for (const partId of PART_ORDER) {
        const partStepCount = clampPartStepCount(snap.stepCounts[partId]);

        if (partStepCount !== prevStepCountsRef.current[partId]) {
          const barPhase = Math.max(0, (currentTime - barOriginSecRef.current) / barDurSec);
          partCursorsRef.current[partId] = alignPartStepToBarPhase(barPhase, partStepCount);
          prevStepCountsRef.current[partId] = partStepCount;
        }

        const cursor = partCursorsRef.current[partId];
        let safety = 0;

        while (safety < 64) {
          const rawHitSec = calculatePartStepHitTimeSec(
            barOriginSecRef.current,
            cursor.barIndex,
            cursor.stepIndex,
            partStepCount,
            snap.bpm,
            snap.swing
          );

          // If browser paused/backgrounded far behind, snap cursor to current bar phase
          if (rawHitSec < currentTime - 0.16) {
            const barPhaseNow = Math.max(0, (currentTime - barOriginSecRef.current) / barDurSec);
            const aligned = alignPartStepToBarPhase(barPhaseNow, partStepCount);
            cursor.barIndex = aligned.barIndex;
            cursor.stepIndex = aligned.stepIndex;
            safety += 1;
            continue;
          }

          if (rawHitSec > horizonSec) {
            break;
          }

          const hitTimeSec = Math.max(currentTime + 0.002, rawHitSec);
          const stepIdx = cursor.stepIndex;

          if (
            stepIdx < partStepCount &&
            snap.steps[partId][stepIdx] &&
            isPartAudible(partId, snap.muted, snap.soloed) &&
            shouldTriggerCondition(
              snap.conditions[partId][stepIdx] ?? '100%',
              cursor.barIndex
            )
          ) {
            const ratchetCount = clampRatchetCount(snap.ratchets[partId][stepIdx] ?? 1);
            const subHitTimes = calculateRatchetSubHitTimesSec(
              hitTimeSec,
              stepIdx,
              partStepCount,
              snap.bpm,
              snap.swing,
              ratchetCount
            );
            const effectiveParams = resolveEffectiveStepParams(
              snap.params[partId],
              snap.pLocks[partId][stepIdx]
            );
            const fmNote = partId === 'fmsynth' ? snap.fmNotes[stepIdx] : undefined;

            for (const subTimeSec of subHitTimes) {
              engineRef.current.triggerPart(partId, effectiveParams, subTimeSec, fmNote);
            }
          }

          visualQueueRef.current.push({ partId, step: stepIdx, time: hitTimeSec });
          queuedVisuals = true;

          cursor.stepIndex += 1;
          if (cursor.stepIndex >= partStepCount) {
            cursor.stepIndex = 0;
            cursor.barIndex += 1;
          }
          safety += 1;
        }
      }

      if (queuedVisuals && visualQueueRef.current.length > 1) {
        visualQueueRef.current.sort((a, b) => a.time - b.time);
      }
    };

    const drawPlayhead = () => {
      if (!isPlayingRef.current || !engineRef.current) return;
      const currentTime = engineRef.current.getCurrentTime();
      const updates: Partial<Record<PartId, number>> = {};
      let hasUpdates = false;

      while (
        visualQueueRef.current.length > 0 &&
        visualQueueRef.current[0].time <= currentTime + 0.012
      ) {
        const item = visualQueueRef.current.shift()!;
        updates[item.partId] = item.step;
        hasUpdates = true;
      }

      if (hasUpdates) {
        setPartPlayheads((prev) => {
          let changed = false;
          for (const key of PART_ORDER) {
            const nextVal = updates[key];
            if (nextVal !== undefined && nextVal !== prev[key]) {
              changed = true;
              break;
            }
          }
          return changed ? { ...prev, ...updates } : prev;
        });
      }

      rafIdRef.current = requestAnimationFrame(drawPlayhead);
    };

    schedulerTick();
    clockTimerRef.current.start(schedulerTick, 20);
    rafIdRef.current = requestAnimationFrame(drawPlayhead);
  }, [getEngine]);

  const handleTogglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      stopSequencer();
    } else {
      startSequencer();
    }
  }, [startSequencer, stopSequencer]);

  useEffect(() => {
    return () => {
      clockTimerRef.current?.dispose();
      clockTimerRef.current = null;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen is blocked by embed policy
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  const handleTriggerPart = useCallback(
    (partId: PartId, overrideMidi?: number) => {
      const engine = getEngine();
      const targetLock =
        pLockTarget && pLockTarget.partId === partId
          ? stateRef.current.pLocks[partId][pLockTarget.stepIndex]
          : null;
      const effectiveParams = resolveEffectiveStepParams(
        stateRef.current.params[partId],
        targetLock
      );
      engine.triggerPart(partId, effectiveParams, undefined, overrideMidi);
    },
    [getEngine, pLockTarget]
  );

  const handleSelectAndTriggerPart = useCallback(
    (partId: PartId) => {
      setSeqState((prev) => ({ ...prev, selectedPart: partId }));
      if (pLockTarget && pLockTarget.partId !== partId) {
        setPLockTarget(null);
      }
      handleTriggerPart(partId);
    },
    [handleTriggerPart, pLockTarget]
  );

  const handleChangeParam = useCallback(
    (partId: PartId, key: string, value: number | string) => {
      // If P-Locking a specific step on this part, lock onto that step instead of global voice
      if (editMode === 'plock' && pLockTarget && pLockTarget.partId === partId) {
        const targetStep = pLockTarget.stepIndex;
        setSeqState((prev) => {
          const nextRow = [...prev.pLocks[partId]];
          const existing = nextRow[targetStep] ?? {};
          nextRow[targetStep] = { ...existing, [key]: value };
          const nextSteps = prev.steps[partId][targetStep]
            ? prev.steps
            : toggleStepInGrid(prev.steps, partId, targetStep);
          return {
            ...prev,
            steps: nextSteps,
            pLocks: {
              ...prev.pLocks,
              [partId]: nextRow,
            },
          };
        });
        return;
      }

      setSeqState((prev) => ({
        ...prev,
        params: {
          ...prev.params,
          [partId]: {
            ...prev.params[partId],
            [key]: value,
          },
        },
      }));
    },
    [editMode, pLockTarget]
  );

  const handleClearStepPLock = useCallback(() => {
    if (!pLockTarget) return;
    const { partId, stepIndex } = pLockTarget;
    setSeqState((prev) => {
      const nextRow = [...prev.pLocks[partId]];
      nextRow[stepIndex] = null;
      return {
        ...prev,
        pLocks: {
          ...prev.pLocks,
          [partId]: nextRow,
        },
      };
    });
  }, [pLockTarget]);

  const handleChangeMasterFx = useCallback(
    <K extends keyof MasterFxParams>(key: K, value: MasterFxParams[K]) => {
      setSeqState((prev) => {
        const nextMasterFx = {
          ...prev.masterFx,
          [key]: value,
        };
        if (engineRef.current) {
          engineRef.current.setMasterFx(nextMasterFx);
        }
        return {
          ...prev,
          masterFx: nextMasterFx,
        };
      });
    },
    []
  );

  const handleChangeChannelLevel = useCallback((partId: PartId, level: number) => {
    const clamped = clampMixerLevel(level);
    setSeqState((prev) => ({
      ...prev,
      mixerLevels: {
        ...prev.mixerLevels,
        [partId]: clamped,
      },
    }));
    if (engineRef.current) {
      engineRef.current.setChannelVolume(partId, clamped);
    }
  }, []);

  const handleCycleStepRatchet = useCallback((partId: PartId, stepIndex: number) => {
    setSeqState((prev) => {
      if (stepIndex >= clampPartStepCount(prev.stepCounts[partId])) return prev;
      const isStepOn = prev.steps[partId][stepIndex];
      const currentRatchet = prev.ratchets[partId][stepIndex] ?? 1;
      const nextRatchet = isStepOn ? nextRatchetCount(currentRatchet) : 2;
      const nextSteps = isStepOn ? prev.steps : toggleStepInGrid(prev.steps, partId, stepIndex);
      return {
        ...prev,
        steps: nextSteps,
        ratchets: setStepRatchetInGrid(prev.ratchets, partId, stepIndex, nextRatchet),
      };
    });
  }, []);

  const handleToggleStep = useCallback(
    (partId: PartId, stepIndex: number, shiftKey?: boolean) => {
      if (stepIndex < 0 || stepIndex >= STEP_COUNT) return;
      if (stepIndex >= clampPartStepCount(stateRef.current.stepCounts[partId])) return;

      if (shiftKey) {
        handleCycleStepRatchet(partId, stepIndex);
        return;
      }

      if (editMode === 'ratchet') {
        setSeqState((prev) => {
          const isStepOn = prev.steps[partId][stepIndex];
          const currentRatchet = prev.ratchets[partId][stepIndex] ?? 1;
          const nextRatchet =
            isStepOn && currentRatchet === activeRatchet ? 1 : activeRatchet;
          const nextSteps = isStepOn ? prev.steps : toggleStepInGrid(prev.steps, partId, stepIndex);
          return {
            ...prev,
            steps: nextSteps,
            ratchets: setStepRatchetInGrid(prev.ratchets, partId, stepIndex, nextRatchet),
          };
        });
        return;
      }

      if (editMode === 'cond') {
        setSeqState((prev) => {
          const isStepOn = prev.steps[partId][stepIndex];
          const currentCond = prev.conditions[partId][stepIndex] ?? '100%';
          const nextCond =
            isStepOn && currentCond === activeCondition ? '100%' : activeCondition;
          const nextRow = [...prev.conditions[partId]];
          nextRow[stepIndex] = nextCond;
          const nextSteps = isStepOn ? prev.steps : toggleStepInGrid(prev.steps, partId, stepIndex);
          return {
            ...prev,
            steps: nextSteps,
            conditions: {
              ...prev.conditions,
              [partId]: nextRow,
            },
          };
        });
        return;
      }

      if (editMode === 'plock') {
        setSeqState((prev) => ({
          ...prev,
          selectedPart: partId,
          steps: prev.steps[partId][stepIndex]
            ? prev.steps
            : toggleStepInGrid(prev.steps, partId, stepIndex),
        }));
        setPLockTarget((prev) =>
          prev && prev.partId === partId && prev.stepIndex === stepIndex
            ? null
            : { partId, stepIndex }
        );
        return;
      }

      if (partId === 'fmsynth' && editMode === 'pitch') {
        setSeqState((prev) => {
          const nextNotes = [...prev.fmNotes];
          nextNotes[stepIndex] = activeRibbonMidi;
          const nextSteps = prev.steps.fmsynth[stepIndex]
            ? prev.steps
            : toggleStepInGrid(prev.steps, 'fmsynth', stepIndex);
          return {
            ...prev,
            fmNotes: nextNotes,
            steps: nextSteps,
          };
        });
        handleTriggerPart('fmsynth', activeRibbonMidi);
        return;
      }

      setSeqState((prev) => ({
        ...prev,
        steps: toggleStepInGrid(prev.steps, partId, stepIndex),
      }));
    },
    [
      activeCondition,
      activeRatchet,
      activeRibbonMidi,
      editMode,
      handleCycleStepRatchet,
      handleTriggerPart,
    ]
  );

  const handleChangePartStepCount = useCallback((partId: PartId, count: number) => {
    const clamped = clampPartStepCount(count);
    setSeqState((prev) => ({
      ...prev,
      stepCounts: {
        ...prev.stepCounts,
        [partId]: clamped,
      },
    }));
  }, []);

  const handleToggleRatchetEditMode = useCallback(() => {
    setPLockTarget(null);
    setEditMode((prev) => (prev === 'ratchet' ? 'step' : 'ratchet'));
  }, []);

  const handleSelectActiveRatchet = useCallback((ratchet: number) => {
    setPLockTarget(null);
    setActiveRatchet(clampRatchetCount(ratchet));
    setEditMode('ratchet');
  }, []);

  const handleToggleConditionEditMode = useCallback(() => {
    setPLockTarget(null);
    setEditMode((prev) => (prev === 'cond' ? 'step' : 'cond'));
  }, []);

  const handleCycleActiveCondition = useCallback(() => {
    setPLockTarget(null);
    setActiveCondition((prev) => nextTrigCondition(prev));
    setEditMode('cond');
  }, []);

  const handleTogglePLockEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev === 'plock') {
        setPLockTarget(null);
        return 'step';
      }
      return 'plock';
    });
  }, []);

  const handleToggleMute = useCallback((partId: PartId) => {
    setSeqState((prev) => ({
      ...prev,
      muted: {
        ...prev.muted,
        [partId]: !prev.muted[partId],
      },
    }));
  }, []);

  const handleToggleSolo = useCallback((partId: PartId) => {
    setSeqState((prev) => ({
      ...prev,
      soloed: {
        ...prev.soloed,
        [partId]: !prev.soloed[partId],
      },
    }));
  }, []);

  const handleRandomizePart = useCallback((partId: PartId) => {
    setSeqState((prev) => ({
      ...prev,
      steps: {
        ...prev.steps,
        [partId]: randomizePartSteps(partId),
      },
    }));
  }, []);

  const handleClearPart = useCallback((partId: PartId) => {
    setSeqState((prev) => ({
      ...prev,
      steps: clearPartInGrid(prev.steps, partId),
      ratchets: clearPartRatchets(prev.ratchets, partId),
      conditions: clearPartConditions(prev.conditions, partId),
      pLocks: clearPartPLocks(prev.pLocks, partId),
    }));
    setPLockTarget((prev) => (prev && prev.partId === partId ? null : prev));
  }, []);

  const handleClearAll = useCallback(() => {
    setSeqState((prev) => ({
      ...prev,
      steps: createEmptySteps(),
      ratchets: createEmptyRatchets(),
      conditions: createEmptyConditions(),
      pLocks: createEmptyPLocks(),
    }));
    setPLockTarget(null);
  }, []);

  const handleChangeMasterVolume = useCallback((vol: number) => {
    setSeqState((prev) => ({ ...prev, masterVolume: vol }));
    if (engineRef.current) {
      engineRef.current.setMasterVolume(vol);
    }
  }, []);

  const getReductionDb = useCallback(() => {
    return engineRef.current ? engineRef.current.getCompressionReductionDb() : 0;
  }, []);

  const activeStepPLock =
    pLockTarget && pLockTarget.partId === seqState.selectedPart
      ? seqState.pLocks[seqState.selectedPart][pLockTarget.stepIndex]
      : null;

  return (
    <div className="min-h-screen temple-desktop p-1 sm:p-2 flex items-center justify-center">
      <main className="w-full max-w-[1280px] temple-chassis overflow-hidden flex flex-col">
        <TransportBar
          isPlaying={isPlaying}
          bpm={seqState.bpm}
          swing={seqState.swing}
          masterVolume={seqState.masterVolume}
          currentStep={partPlayheads[seqState.selectedPart]}
          isFullscreen={isFullscreen}
          onTogglePlay={handleTogglePlay}
          onChangeBpm={(nextBpm) =>
            setSeqState((prev) => ({ ...prev, bpm: clampBpm(nextBpm) }))
          }
          onChangeSwing={(nextSwing) =>
            setSeqState((prev) => ({ ...prev, swing: clampSwing(nextSwing) }))
          }
          onChangeMasterVolume={handleChangeMasterVolume}
          onToggleFullscreen={handleToggleFullscreen}
        />

        {/* 4-Channel Live Mixer Directly Under Tempo Section */}
        <FourChannelMixer
          mixerLevels={seqState.mixerLevels}
          muted={seqState.muted}
          soloed={seqState.soloed}
          selectedPart={seqState.selectedPart}
          onChangeChannelLevel={handleChangeChannelLevel}
          onToggleMute={handleToggleMute}
          onSelectAndTriggerPart={handleSelectAndTriggerPart}
        />

        <div className="p-1.5 sm:p-2 flex flex-col gap-1.5">
          {/* Split Middle Deck: Voice Synth (left) + End-of-Chain Pump & Distortion (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-stretch">
            <div className="lg:col-span-8 flex flex-col">
              <PartSynthPanel
                selectedPart={seqState.selectedPart}
                params={seqState.params[seqState.selectedPart]}
                pLockTarget={pLockTarget}
                pLockParams={activeStepPLock}
                activeRibbonMidi={activeRibbonMidi}
                pitchEditMode={editMode === 'pitch'}
                onSelectPart={(partId) => {
                  setSeqState((prev) => ({ ...prev, selectedPart: partId }));
                  if (pLockTarget && pLockTarget.partId !== partId) {
                    setPLockTarget(null);
                  }
                }}
                onChangeParam={handleChangeParam}
                onTriggerPart={handleTriggerPart}
                onSelectRibbonMidi={setActiveRibbonMidi}
                onTogglePitchEditMode={() => {
                  setPLockTarget(null);
                  setEditMode((prev) => (prev === 'pitch' ? 'step' : 'pitch'));
                }}
                onClearStepPLock={handleClearStepPLock}
              />
            </div>

            <div className="lg:col-span-4 flex flex-col">
              <MasterFxPanel
                masterFx={seqState.masterFx}
                analyser={analyser}
                getReductionDb={getReductionDb}
                onChangeMasterFx={handleChangeMasterFx}
              />
            </div>
          </div>

          <StepSequencerGrid
            steps={seqState.steps}
            stepCounts={seqState.stepCounts}
            ratchets={seqState.ratchets}
            conditions={seqState.conditions}
            pLocks={seqState.pLocks}
            fmNotes={seqState.fmNotes}
            selectedPart={seqState.selectedPart}
            partPlayheads={partPlayheads}
            isPlaying={isPlaying}
            muted={seqState.muted}
            soloed={seqState.soloed}
            editMode={editMode}
            activeRatchet={activeRatchet}
            activeCondition={activeCondition}
            pLockTarget={pLockTarget}
            onSelectAndTriggerPart={handleSelectAndTriggerPart}
            onToggleStep={handleToggleStep}
            onCycleStepRatchet={handleCycleStepRatchet}
            onChangePartStepCount={handleChangePartStepCount}
            onToggleRatchetEditMode={handleToggleRatchetEditMode}
            onSelectActiveRatchet={handleSelectActiveRatchet}
            onToggleConditionEditMode={handleToggleConditionEditMode}
            onCycleActiveCondition={handleCycleActiveCondition}
            onTogglePLockEditMode={handleTogglePLockEditMode}
            onToggleMute={handleToggleMute}
            onToggleSolo={handleToggleSolo}
            onRandomizePart={handleRandomizePart}
            onClearPart={handleClearPart}
            onClearAll={handleClearAll}
          />
        </div>
      </main>
    </div>
  );
}
