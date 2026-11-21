import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignPartStepToBarPhase,
  bpmToBarDurationSec,
  bpmToStepDurationMs,
  calculateDuckMinGain,
  calculatePartStepHitTimeSec,
  calculateRatchetSubHitTimesSec,
  calculateSwingDelayMs,
  clampBpm,
  clampMixerLevel,
  clampParamValue,
  clampPartStepCount,
  clampRatchetCount,
  clampSwing,
  clearPartConditions,
  clearPartInGrid,
  clearPartPLocks,
  clearPartRatchets,
  computeDistortionSample,
  computeLookaheadHorizonSec,
  countActiveSteps,
  countStepPLocks,
  createInitialSequencerState,
  dbToGain,
  formatMasterFxValue,
  formatParamValue,
  formatSwingValue,
  getFmCarrierGainCompensation,
  getKnobDefinition,
  isPartAudible,
  midiToFreq,
  midiToNoteName,
  nextRatchetCount,
  nextTrigCondition,
  partStepDurationSec,
  randomizePartSteps,
  resolveEffectiveStepParams,
  setStepRatchetInGrid,
  shouldTriggerCondition,
  toggleStepInGrid,
} from './sequencerLogic';
import { MASTER_FX_KNOBS, PART_DEFINITIONS, STEP_COUNT } from './synthConfig';

test('initial sequencer state starts clear with all 4x16 steps off, 16-step division, 1x ratchets, and Elektron defaults', () => {
  const state = createInitialSequencerState();
  assert.equal(state.bpm, 120);
  assert.equal(state.swing, 0);
  assert.equal(state.masterFx.scPump, 48);
  assert.equal(state.mixerLevels.kick, 90);
  assert.equal(state.mixerLevels.fmsynth, 82);
  assert.equal(state.steps.kick.length, STEP_COUNT);
  assert.equal(state.steps.snare.length, STEP_COUNT);
  assert.equal(state.steps.hihat.length, STEP_COUNT);
  assert.equal(state.steps.fmsynth.length, STEP_COUNT);
  assert.equal(state.fmNotes.length, STEP_COUNT);
  assert.equal(state.stepCounts.kick, 16);
  assert.equal(state.stepCounts.snare, 16);
  assert.equal(state.stepCounts.hihat, 16);
  assert.equal(state.stepCounts.fmsynth, 16);
  assert.ok(state.ratchets.kick.every((r) => r === 1));
  assert.ok(state.conditions.kick.every((c) => c === '100%'));
  assert.ok(state.pLocks.kick.every((p) => p === null));
  assert.equal(countActiveSteps(state.steps, 'kick'), 0);
  assert.equal(countActiveSteps(state.steps, 'snare'), 0);
  assert.equal(countActiveSteps(state.steps, 'hihat'), 0);
  assert.equal(countActiveSteps(state.steps, 'fmsynth'), 0);
});

test('BPM 3..333 timing and -99 to +99 swing calculations are accurate', () => {
  assert.equal(clampBpm(1), 3);
  assert.equal(clampBpm(3), 3);
  assert.equal(clampBpm(333), 333);
  assert.equal(clampBpm(500), 333);
  assert.equal(clampSwing(-150), -99);
  assert.equal(clampSwing(-99), -99);
  assert.equal(clampSwing(99), 99);
  assert.equal(clampSwing(150), 99);
  assert.equal(formatSwingValue(-99), '-99%');
  assert.equal(formatSwingValue(0), '0%');
  assert.equal(formatSwingValue(99), '+99%');

  assert.equal(bpmToStepDurationMs(120), 125); // 60000 / 120 / 4 = 125ms
  assert.equal(bpmToStepDurationMs(3), 5000); // 60000 / 3 / 4 = 5000ms
  assert.equal(bpmToBarDurationSec(120), 2.0); // 4 beats at 120 BPM = 2.0s
  assert.equal(calculateSwingDelayMs(0, 125, 20), 0);
  assert.equal(calculateSwingDelayMs(1, 125, 20), 25);
  assert.equal(calculateSwingDelayMs(1, 125, -99), -123.75);
  assert.equal(calculateSwingDelayMs(2, 125, 99), 0);
  assert.equal(calculateSwingDelayMs(3, 125, 140), 123.75); // clamped at +99%

  // Lookahead horizon expands for negative swing so slow BPMs don't miss step 1
  const horizon = computeLookaheadHorizonSec(0, 0.1, 3, -99);
  assert.ok(horizon > 5.0);
});

test('polyrhythmic bar distribution (1-16) evenly divides 1 bar and stays monotonic across all swing values', () => {
  assert.equal(clampPartStepCount(0), 1);
  assert.equal(clampPartStepCount(20), 16);
  assert.equal(clampPartStepCount(11), 11);

  // At 120 BPM, 1 bar = 2.0s. With 11 steps, each step = 2/11 sec; with 9 steps, 2/9 sec
  assert.ok(Math.abs(partStepDurationSec(120, 11) - 2 / 11) < 1e-9);
  assert.ok(Math.abs(partStepDurationSec(120, 9) - 2 / 9) < 1e-9);

  // Across all divisions 1..16 and extreme swings (-99, 0, +99), step times are strictly monotonic
  for (const division of [1, 3, 5, 7, 9, 11, 12, 16]) {
    for (const swing of [-99, -35, 0, 45, 99]) {
      let prev = -1;
      for (let bar = 0; bar < 2; bar++) {
        for (let step = 0; step < division; step++) {
          const t = calculatePartStepHitTimeSec(0, bar, step, division, 120, swing);
          assert.ok(
            t > prev,
            `Expected monotonic time for div=${division}, swing=${swing}, bar=${bar}, step=${step}`
          );
          prev = t;
        }
      }
      // Step 0 of bar 1 always lands cleanly on bar boundary (2.0s) regardless of division or swing
      const bar1Start = calculatePartStepHitTimeSec(0, 1, 0, division, 120, swing);
      assert.ok(Math.abs(bar1Start - 2.0) < 1e-9);
    }
  }

  // Bar-phase alignment when switching divisions mid-playback
  const aligned = alignPartStepToBarPhase(2.5, 9);
  assert.deepEqual(aligned, { barIndex: 2, stepIndex: 5 });
});

test('step ratchets subdivide swung step pockets cleanly and clear properly', () => {
  assert.equal(clampRatchetCount(5), 4);
  assert.equal(nextRatchetCount(1), 2);
  assert.equal(nextRatchetCount(4), 6);
  assert.equal(nextRatchetCount(8), 1);

  // At 120 BPM, N=16, swing=0%, stepDur = 0.125s -> 4x ratchet fires 4 hits spaced by 31.25ms
  const hitsNoSwing = calculateRatchetSubHitTimesSec(1.0, 0, 16, 120, 0, 4);
  assert.equal(hitsNoSwing.length, 4);
  assert.ok(Math.abs(hitsNoSwing[0] - 1.0) < 1e-9);
  assert.ok(Math.abs(hitsNoSwing[3] - 1.09375) < 1e-9);

  // At 120 BPM, N=9, swing=+50%, even step 0 has gap 1.5 * (2/9) = 1/3s to odd step 1
  const hitsSwung = calculateRatchetSubHitTimesSec(0, 0, 9, 120, 50, 3);
  assert.equal(hitsSwung.length, 3);
  assert.ok(Math.abs(hitsSwung[1] - 1 / 9) < 1e-9);
  assert.ok(Math.abs(hitsSwung[2] - 2 / 9) < 1e-9);

  // Mutating and clearing ratchets
  const state = createInitialSequencerState();
  const withRatchet = setStepRatchetInGrid(state.ratchets, 'hihat', 2, 6);
  assert.equal(withRatchet.hihat[2], 6);
  assert.equal(state.ratchets.hihat[2], 1);
  const cleared = clearPartRatchets(withRatchet, 'hihat');
  assert.equal(cleared.hihat[2], 1);
});

test('step toggling, division step counting, and clearing work immutably', () => {
  const state = createInitialSequencerState();
  const withSnare = toggleStepInGrid(state.steps, 'snare', 4);
  const withSnareOutOfRange = toggleStepInGrid(withSnare, 'snare', 12);
  const toggled = toggleStepInGrid(withSnareOutOfRange, 'kick', 0);
  assert.equal(toggled.kick[0], true);
  assert.equal(state.steps.kick[0], false);
  // Step 12 is ignored when part division is set to 9
  assert.equal(countActiveSteps(toggled, 'snare', 9), 1);
  assert.equal(countActiveSteps(toggled, 'snare', 16), 2);

  const cleared = clearPartInGrid(toggled, 'kick');
  assert.equal(countActiveSteps(cleared, 'kick'), 0);
  assert.equal(countActiveSteps(cleared, 'snare', 9), 1);
});

test('mute and solo audibility rules resolve correctly', () => {
  const muted = { kick: true, snare: false, hihat: false, fmsynth: false };
  const soloed = { kick: false, snare: false, hihat: false, fmsynth: false };

  assert.equal(isPartAudible('kick', muted, soloed), false);
  assert.equal(isPartAudible('snare', muted, soloed), true);

  const soloSnare = { kick: false, snare: true, hihat: false, fmsynth: false };
  assert.equal(isPartAudible('kick', muted, soloSnare), false);
  assert.equal(isPartAudible('snare', muted, soloSnare), true);
  assert.equal(isPartAudible('hihat', muted, soloSnare), false);
});

test('parameter clamping, formatting, and FM saw wave gain compensation', () => {
  const kickPitch = getKnobDefinition('kick', 'pitch')!;
  assert.equal(clampParamValue(kickPitch, 10), 34);
  assert.equal(clampParamValue(kickPitch, 120), 80);
  assert.equal(formatParamValue(kickPitch, 46), '46 Hz');

  const snareRatio = getKnobDefinition('snare', 'ratio')!;
  assert.equal(clampParamValue(snareRatio, 2.74), 2.7);
  assert.equal(formatParamValue(snareRatio, 2.7), '2.7x');

  const hihatCutoff = getKnobDefinition('hihat', 'cutoff')!;
  assert.equal(formatParamValue(hihatCutoff, 7200), '7.2kHz');

  const fmRoot = getKnobDefinition('fmsynth', 'pitch')!;
  assert.equal(formatParamValue(fmRoot, 48), 'C3');
  assert.equal(midiToNoteName(69), 'A4');
  assert.equal(Math.round(midiToFreq(69)), 440);

  // Sawtooth carrier is attenuated relative to sine/triangle to prevent loudness jump
  assert.ok(
    getFmCarrierGainCompensation('sawtooth') < getFmCarrierGainCompensation('triangle')
  );
  assert.ok(
    getFmCarrierGainCompensation('triangle') < getFmCarrierGainCompensation('sine')
  );

  // Drum parts have 6 knobs, FM Synth has 7 (including post-FM Drive)
  assert.equal(PART_DEFINITIONS.kick.knobs.length, 6);
  assert.equal(PART_DEFINITIONS.snare.knobs.length, 6);
  assert.equal(PART_DEFINITIONS.hihat.knobs.length, 6);
  assert.equal(PART_DEFINITIONS.fmsynth.knobs.length, 7);
  assert.ok(getKnobDefinition('fmsynth', 'drive'));
});

test('randomizePartSteps returns 16 booleans deterministically with seeded rng', () => {
  let seed = 0.2;
  const deterministicRng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pattern = randomizePartSteps('kick', deterministicRng);
  assert.equal(pattern.length, 16);
  assert.ok(pattern.every((v) => typeof v === 'boolean'));
});

test('Elektron trig conditions, parameter locks, mixer clamping, and square/supersaw FM carrier compensation', () => {
  assert.equal(clampMixerLevel(-10), 0);
  assert.equal(clampMixerLevel(140), 100);
  assert.equal(nextTrigCondition('100%'), '75%');
  assert.equal(nextTrigCondition('4:4'), '100%');

  // Cycle A:B conditions
  assert.equal(shouldTriggerCondition('1:2', 0), true);
  assert.equal(shouldTriggerCondition('1:2', 1), false);
  assert.equal(shouldTriggerCondition('2:2', 1), true);
  assert.equal(shouldTriggerCondition('1:4', 0), true);
  assert.equal(shouldTriggerCondition('1:4', 2), false);
  assert.equal(shouldTriggerCondition('4:4', 3), true);
  assert.equal(shouldTriggerCondition('4:4', 2), false);

  // Probability conditions
  assert.equal(shouldTriggerCondition('50%', 0, () => 0.49), true);
  assert.equal(shouldTriggerCondition('50%', 0, () => 0.51), false);
  assert.equal(shouldTriggerCondition('25%', 0, () => 0.2), true);
  assert.equal(shouldTriggerCondition('25%', 0, () => 0.3), false);

  // Parameter Locks merge cleanly without mutating base track params
  const state = createInitialSequencerState();
  const locked = resolveEffectiveStepParams(state.params.fmsynth, {
    carrierWave: 'supersaw',
    drive: 65,
  });
  assert.equal(locked.carrierWave, 'supersaw');
  assert.equal(locked.drive, 65);
  assert.equal(state.params.fmsynth.drive, 0);
  assert.equal(countStepPLocks(null), 0);
  assert.equal(countStepPLocks({ drive: 65, pitch: 55 }), 2);

  state.conditions.snare[4] = '4:4';
  const clearedConds = clearPartConditions(state.conditions, 'snare');
  assert.equal(clearedConds.snare[4], '100%');

  state.pLocks.kick[0] = { decay: 700 };
  const clearedLocks = clearPartPLocks(state.pLocks, 'kick');
  assert.equal(clearedLocks.kick[0], null);

  // Square & Supersaw FM carrier modes exist and stay gain-compensated
  const fmModes = PART_DEFINITIONS.fmsynth.modeOptions.map((m) => m.value);
  assert.deepEqual(fmModes, ['sine', 'triangle', 'sawtooth', 'square', 'supersaw']);
  assert.ok(getFmCarrierGainCompensation('supersaw') < getFmCarrierGainCompensation('sawtooth'));
  assert.ok(getFmCarrierGainCompensation('square') < getFmCarrierGainCompensation('triangle'));
});

test('end-of-chain Master FX math computes distortion, sidechain ducking, and formatting', () => {
  assert.equal(Math.round(dbToGain(0) * 100) / 100, 1);
  assert.ok(dbToGain(6) > 1.9);
  assert.equal(calculateDuckMinGain(0), 1);
  assert.equal(Number(calculateDuckMinGain(100).toFixed(2)), 0.08);

  assert.equal(computeDistortionSample(0.5, 0, 'tape'), 0.5);
  const tapeMid = computeDistortionSample(0.35, 80, 'tape');
  assert.ok(tapeMid > 0.7 && tapeMid <= 1.0);
  assert.ok(Math.abs(computeDistortionSample(0.8, 90, 'fuzz')) <= 0.92);
  assert.ok(Math.abs(computeDistortionSample(0.8, 90, 'fold')) <= 1);

  const threshDef = MASTER_FX_KNOBS.find((k) => k.key === 'compThresh')!;
  const makeupDef = MASTER_FX_KNOBS.find((k) => k.key === 'makeupGain')!;
  const toneDef = MASTER_FX_KNOBS.find((k) => k.key === 'distTone')!;
  assert.equal(formatMasterFxValue(threshDef, -18), '-18 dB');
  assert.equal(formatMasterFxValue(makeupDef, 4), '+4 dB');
  assert.equal(formatMasterFxValue(toneDef, 9800), '9.8k');
});
