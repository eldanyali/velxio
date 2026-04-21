/**
 * Reproduce the live-app failure of the "Half-Wave Rectifier" example.
 *
 * This test recreates every layer of Velxio's runtime pipeline so we can
 * pinpoint which step fails when `analogRead(A0)` always returns 0 in the
 * running app:
 *
 *   L1. buildInputFromStore           — does the adapter pick `.tran`?
 *   L2. buildNetlist                  — does the netlist have SIN + diode?
 *                                       does pinNetMap contain `arduino-uno:A0`?
 *   L3. runNetlist (ngspice)          — does the solve converge? produce a
 *                                       rectified waveform on the A0 net?
 *   L4. CircuitScheduler.solveNow     — does the result propagate with
 *                                       `timeWaveforms` populated?
 *   L5. interpolation                 — does interpolateAt(ts, vs, t) return
 *                                       real samples (not zero) at t ∈ [0, T)?
 *   L6. setAdcVoltage → AVRADC        — does the partUtils helper write into
 *                                       channelValues[0] correctly?
 *   L7. full RAF-replay + AVR loop    — simulate the production replay loop
 *                                       against a real AVRADC and confirm
 *                                       `analogRead(A0)` reads varying values.
 *   L8. wireElectricalSolver()        — invoke the real function against the
 *                                       live stores (just like EditorPage
 *                                       mounts it) with the rectifier already
 *                                       in setComponents/setWires.
 *
 * The AVR program (`adcReadProgram`) continuously triggers an ADC conversion
 * and writes ADCH/ADCL into r20/r21. By polling ADCH across simulated time,
 * we can prove whether the rectified waveform is reaching the MCU.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildInputFromStore } from '../simulation/spice/storeAdapter';
import { buildNetlist } from '../simulation/spice/NetlistBuilder';
import { circuitScheduler } from '../simulation/spice/CircuitScheduler';
import { runNetlist } from '../simulation/spice/SpiceEngine';
import { setAdcVoltage } from '../simulation/parts/partUtils';
import { AVRTestHarness, adcReadProgram } from './helpers/avrTestHarness';

// ── Snapshot mirroring examples-circuits.ts:403 ("Half-Wave Rectifier") ──
// The shape is what loadExample.ts produces via
//   metadataId: comp.type.replace('wokwi-', '')
function rectifierSnapshot() {
  return {
    components: [
      {
        id: 'sg1',
        metadataId: 'signal-generator',
        properties: { waveform: 'sine', frequency: 50, amplitude: 5, offset: 0 },
      },
      { id: 'd1', metadataId: 'diode-1n4007', properties: {} },
      { id: 'rl', metadataId: 'resistor', properties: { value: '1000' } },
    ],
    wires: [
      { id: 'w1', start: { componentId: 'sg1', pinName: 'SIG' }, end: { componentId: 'd1', pinName: 'A' } },
      { id: 'w2', start: { componentId: 'd1', pinName: 'C' }, end: { componentId: 'rl', pinName: '1' } },
      { id: 'w3', start: { componentId: 'rl', pinName: '2' }, end: { componentId: 'arduino-uno', pinName: 'GND' } },
      { id: 'w4', start: { componentId: 'sg1', pinName: 'GND' }, end: { componentId: 'arduino-uno', pinName: 'GND' } },
      { id: 'w5', start: { componentId: 'd1', pinName: 'C' }, end: { componentId: 'arduino-uno', pinName: 'A0' } },
    ],
    boards: [{
      id: 'arduino-uno',
      boardKind: 'arduino-uno' as const,
      pinStates: {}, // Arduino is just observing A0 — no driven pins
    }],
  };
}

// Copy of subscribeToStore.ts `interpolateAt` so the test stays independent.
function interpolateAt(ts: number[], vs: number[], t: number): number {
  if (t <= ts[0]) return vs[0];
  const last = ts.length - 1;
  if (t >= ts[last]) return vs[last];
  let lo = 0, hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid; else hi = mid;
  }
  const t0 = ts[lo], t1 = ts[hi];
  if (t1 === t0) return vs[lo];
  const a = (t - t0) / (t1 - t0);
  return vs[lo] * (1 - a) + vs[hi] * a;
}

describe('Half-Wave Rectifier — layer-by-layer reproduction', () => {
  it('traces every pipeline layer with logs so we can spot the failure point', async () => {
    // ── L1 ────────────────────────────────────────────────────────────────
    const snap = rectifierSnapshot();
    const input = buildInputFromStore(snap);
    console.log('\n=== L1 buildInputFromStore ===');
    console.log('analysis:', input.analysis);
    console.log('components:', input.components.map((c) => ({ id: c.id, meta: c.metadataId })));
    console.log('boards[0]:', { id: input.boards[0].id, vcc: input.boards[0].vcc, pins: input.boards[0].pins, gnd: input.boards[0].groundPinNames, vccPins: input.boards[0].vccPinNames });
    expect(input.analysis.kind).toBe('tran');
    expect(input.components.some((c) => c.metadataId === 'signal-generator')).toBe(true);

    // ── L2 ────────────────────────────────────────────────────────────────
    const { netlist, pinNetMap } = buildNetlist(input);
    console.log('\n=== L2 buildNetlist ===');
    console.log('netlist:\n' + netlist);
    console.log('pinNetMap entries:', [...pinNetMap.entries()]);
    const a0Key = 'arduino-uno:A0';
    expect(pinNetMap.has(a0Key)).toBe(true);
    const a0Net = pinNetMap.get(a0Key)!;
    console.log('A0 pin resolves to net:', a0Net);
    expect(netlist).toMatch(/SIN\(/);
    expect(netlist).toMatch(/\.tran\b/);

    // ── L3 ────────────────────────────────────────────────────────────────
    console.log('\n=== L3 runNetlist (ngspice) ===');
    const cooked = await runNetlist(netlist);
    console.log('variableNames:', cooked.variableNames);
    const times = cooked.vec('time') as number[];
    console.log('time points:', times.length, 'first:', times[0], 'last:', times[times.length - 1]);
    const wfName = `v(${a0Net})`;
    expect(cooked.variableNames.map((n) => n.toLowerCase())).toContain(wfName.toLowerCase());
    const wf = cooked.vec(wfName) as number[];
    console.log(`${wfName} samples: peak=${Math.max(...wf).toFixed(3)} V  min=${Math.min(...wf).toFixed(3)} V  mean=${(wf.reduce((a,b)=>a+b,0)/wf.length).toFixed(3)} V`);
    console.log(`${wfName} first 12 samples:`, wf.slice(0, 12).map((v) => v.toFixed(3)));
    const peak = Math.max(...wf);
    expect(peak).toBeGreaterThan(3.0);

    // ── L4 ────────────────────────────────────────────────────────────────
    console.log('\n=== L4 circuitScheduler.solveNow ===');
    const result = await circuitScheduler.solveNow(input);
    console.log('analysisMode:', result.analysisMode);
    console.log('converged:', result.converged, 'error:', result.error);
    console.log('nodeVoltage keys:', Object.keys(result.nodeVoltages));
    console.log('pinNetMap keys:', [...result.pinNetMap.keys()]);
    console.log('timeWaveforms present:', !!result.timeWaveforms);
    if (result.timeWaveforms) {
      console.log('timeWaveforms nodes:', [...result.timeWaveforms.nodes.keys()]);
      console.log('timeWaveforms branches:', [...result.timeWaveforms.branches.keys()]);
    }
    expect(result.timeWaveforms).toBeDefined();
    expect(result.timeWaveforms!.nodes.has(a0Net)).toBe(true);

    // ── L5 ────────────────────────────────────────────────────────────────
    console.log('\n=== L5 interpolateAt sanity at 8 phases ===');
    const rtw = result.timeWaveforms!;
    const rSamples = rtw.nodes.get(a0Net)!;
    const periodS = rtw.time[rtw.time.length - 1];
    const phases: Array<{ t: number; v: number }> = [];
    for (const q of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const t = (q / 8) * periodS;
      const v = interpolateAt(rtw.time, rSamples, t);
      phases.push({ t, v });
      console.log(`  t = ${(t * 1000).toFixed(2)} ms → V(A0) = ${v.toFixed(3)} V`);
    }
    const vMax = Math.max(...phases.map((p) => p.v));
    const vMin = Math.min(...phases.map((p) => p.v));
    console.log(`interpolated vMax=${vMax.toFixed(3)} vMin=${vMin.toFixed(3)}`);
    expect(vMax).toBeGreaterThan(1.5);

    // ── L6 ────────────────────────────────────────────────────────────────
    console.log('\n=== L6 setAdcVoltage → AVRADC ===');
    const avr = new AVRTestHarness();
    avr.loadProgram(adcReadProgram());
    const mockSim = { getADC: () => avr.adc, getCurrentCycles: () => avr.cpu.cycles } as unknown as Parameters<typeof setAdcVoltage>[0];
    const ok25 = setAdcVoltage(mockSim, 14, 2.5);
    console.log('setAdcVoltage(mockSim, 14, 2.5) returned', ok25, 'channelValues[0]=', avr.adc.channelValues[0]);
    expect(ok25).toBe(true);
    expect(avr.adc.channelValues[0]).toBeCloseTo(2.5, 3);
    avr.runCycles(80_000);
    const adch25 = avr.reg(0x79);
    console.log('ADCH after AVR run with 2.5 V on ch0:', adch25, '(expected ~128 for ADLAR left-shift of 512/1024 ≈ 0.5)');
    expect(adch25).toBeGreaterThan(0);

    // ── L7 ────────────────────────────────────────────────────────────────
    // Full RAF-replay simulation: step AVR through simulated time, replay
    // the rectified waveform into channelValues[0] at each frame. This is
    // the exact loop that runs inside subscribeToStore.ts:adcReplayFrame.
    console.log('\n=== L7 full replay loop over 80 ms of AVR time ===');
    const freshAvr = new AVRTestHarness();
    freshAvr.loadProgram(adcReadProgram());
    const freshMock = { getADC: () => freshAvr.adc, getCurrentCycles: () => freshAvr.cpu.cycles } as unknown as Parameters<typeof setAdcVoltage>[0];
    const CPU_HZ = 16_000_000;
    const STEP_CYCLES = 16_000;          // 1 ms of AVR
    const STEPS = 200;                   // → 200 ms total
    const adcSeries: number[] = [];
    const adchSeries: number[] = [];
    for (let i = 0; i < STEPS; i++) {
      const simT = freshAvr.cpu.cycles / CPU_HZ;
      const t = simT % periodS;
      const v = interpolateAt(rtw.time, rSamples, t);
      setAdcVoltage(freshMock, 14, Math.max(0, Math.min(5, v)));
      freshAvr.runCycles(STEP_CYCLES);
      adcSeries.push(freshAvr.adc.channelValues[0]);
      adchSeries.push(freshAvr.reg(0x79));
    }
    const hi = adcSeries.filter((v) => v > 1.5).length;
    const lo = adcSeries.filter((v) => v < 0.2).length;
    console.log(`channelValues[0] over ${STEPS} ms: highs(>1.5V)=${hi}, lows(<0.2V)=${lo}`);
    console.log('first 30 ADC voltages:', adcSeries.slice(0, 30).map((v) => v.toFixed(2)));
    console.log('first 30 ADCH reads:', adchSeries.slice(0, 30));
    const maxAdch = Math.max(...adchSeries);
    console.log('max ADCH seen by AVR:', maxAdch);
    expect(hi).toBeGreaterThanOrEqual(20);
    expect(lo).toBeGreaterThanOrEqual(20);
    expect(maxAdch).toBeGreaterThan(100);
  }, 60_000);
});

// ── L8: live reproduction through the real wireElectricalSolver() ───────
// This imports the actual store and solver bootstrap, exactly as EditorPage
// does. If the app-level timing / subscription bug exists, this test will
// reproduce it here. We stub `requestAnimationFrame` so we can drive replay
// frames deterministically.
describe('Half-Wave Rectifier — wireElectricalSolver live bootstrap', () => {
  let rafCallbacks: Array<() => void>;

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // wireElectricalSolver installs window.__spiceDebug — give it a target
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function flushRaf() {
    // Pop and run any queued callbacks; each one may queue the next frame.
    while (rafCallbacks.length > 0) {
      const cbs = rafCallbacks.splice(0, rafCallbacks.length);
      for (const cb of cbs) {
        try { cb(); } catch (e) { console.warn('RAF cb threw', e); }
      }
      // One trip through the queue per flushRaf call — caller iterates.
      break;
    }
  }

  it('invokes wireElectricalSolver against live stores populated by loadExample', async () => {
    const { useSimulatorStore } = await import('../store/useSimulatorStore');
    const { useElectricalStore } = await import('../store/useElectricalStore');
    const { wireElectricalSolver } = await import('../simulation/spice/subscribeToStore');

    // Replicate what loadExample() does: setComponents + setWires on the real store.
    const snap = rectifierSnapshot();
    console.log('\n=== L8 preparing live store ===');
    const store = useSimulatorStore.getState();
    console.log('initial boards:', store.boards.map((b) => ({ id: b.id, kind: b.boardKind })));

    store.setComponents(
      snap.components.map((c) => ({
        id: c.id,
        metadataId: c.metadataId,
        x: 0,
        y: 0,
        properties: c.properties,
      })),
    );
    store.setWires(
      snap.wires.map((w) => ({
        id: w.id,
        start: { componentId: w.start.componentId, pinName: w.start.pinName, x: 0, y: 0 },
        end: { componentId: w.end.componentId, pinName: w.end.pinName, x: 0, y: 0 },
        color: '#ffaa00',
        waypoints: [],
      })),
    );
    console.log('components set:', useSimulatorStore.getState().components.map((c) => c.id));
    console.log('wires set:', useSimulatorStore.getState().wires.length);

    // Now mount wireElectricalSolver — exactly as EditorPage useEffect does.
    console.log('\n=== L8 calling wireElectricalSolver() ===');
    const unsub = wireElectricalSolver();

    // Give the debounced solve (50ms) + async ngspice time to complete.
    // Poll the store until timeWaveforms appears or we time out.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const es = useElectricalStore.getState();
      if (es.timeWaveforms) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const finalES = useElectricalStore.getState();
    console.log('\n=== L8 electrical store after solve ===');
    console.log('analysisMode:', finalES.analysisMode);
    console.log('converged:', finalES.converged, 'error:', finalES.error);
    console.log('pinNetMap size:', finalES.pinNetMap.size, 'entries:', [...finalES.pinNetMap.entries()].slice(0, 16));
    console.log('hasTimeWaveforms:', !!finalES.timeWaveforms);
    if (finalES.timeWaveforms) {
      console.log('timeWaveforms.nodes keys:', [...finalES.timeWaveforms.nodes.keys()]);
      const a0Net = finalES.pinNetMap.get('arduino-uno:A0');
      console.log('arduino-uno:A0 → net:', a0Net);
      if (a0Net) {
        const samples = finalES.timeWaveforms.nodes.get(a0Net);
        if (samples) {
          console.log(`samples @ A0 net: peak=${Math.max(...samples).toFixed(3)} V, count=${samples.length}`);
        } else {
          console.log('!!! a0Net has no samples in timeWaveforms.nodes !!!');
        }
      } else {
        console.log('!!! pinNetMap does not contain arduino-uno:A0 !!!');
      }
    }
    console.log('RAF queued frames:', rafCallbacks.length);

    // Drain some RAF frames to confirm the replay actually writes into AVRADC.
    const sim = (await import('../store/useSimulatorStore')).getBoardSimulator('arduino-uno');
    console.log('live simulator:', sim ? 'present' : 'absent');
    if (sim) {
      const adc = (sim as unknown as { getADC: () => { channelValues: Float32Array | number[] } }).getADC();
      console.log('ADC channelValues BEFORE RAF:', adc ? [...adc.channelValues].slice(0, 6) : 'no adc');
      // Drive 10 RAF frames simulating ~160ms of real time
      for (let i = 0; i < 10; i++) await flushRaf();
      console.log('RAF callbacks after drain:', rafCallbacks.length);
      console.log('ADC channelValues AFTER RAF:', adc ? [...adc.channelValues].slice(0, 6) : 'no adc');
    }

    unsub();

    // Assertions — the pipeline should have produced a valid waveform.
    expect(finalES.converged).toBe(true);
    expect(finalES.analysisMode).toBe('tran');
    expect(finalES.timeWaveforms).toBeDefined();
    expect(finalES.pinNetMap.size).toBeGreaterThan(0);
    expect(finalES.pinNetMap.has('arduino-uno:A0')).toBe(true);
  }, 45_000);
});

// ── L9: full live flow — loadHex + wall-clock advancing + RAF replay ─────
// This replicates exactly what happens in the browser once the user clicks
// Compile & Run. We can't invoke the production AVRSimulator's `loadHex()`
// in node (no HEX file compiled here), so we monkey-patch a fresh ADC onto
// the real simulator so the RAF replay has a real target. The replay clock
// is wall-clock (`performance.now`) — we stub it to advance deterministically
// by 16 ms per RAF frame, matching a real browser at 60 Hz.
describe('Half-Wave Rectifier — full live flow with advancing wall-clock', () => {
  let rafCallbacks: Array<() => void>;
  let fakeNowMs: number;
  let realPerfNow: () => number;

  beforeEach(() => {
    rafCallbacks = [];
    fakeNowMs = 1000;
    realPerfNow = performance.now.bind(performance);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('window', globalThis);
    // Patch performance.now so the replay's wall-clock advances in lockstep
    // with the RAF tick count, not with the test's own computation time.
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNowMs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Sanity: restore unmocked performance.now for subsequent tests.
    void realPerfNow;
  });

  it('advances wall-clock and confirms channelValues[0] tracks rectified waveform', async () => {
    const { useSimulatorStore, getBoardSimulator } = await import('../store/useSimulatorStore');
    const { useElectricalStore } = await import('../store/useElectricalStore');
    const { wireElectricalSolver } = await import('../simulation/spice/subscribeToStore');

    const snap = rectifierSnapshot();
    const store = useSimulatorStore.getState();
    store.setComponents(
      snap.components.map((c) => ({ id: c.id, metadataId: c.metadataId, x: 0, y: 0, properties: c.properties })),
    );
    store.setWires(
      snap.wires.map((w) => ({
        id: w.id,
        start: { componentId: w.start.componentId, pinName: w.start.pinName, x: 0, y: 0 },
        end: { componentId: w.end.componentId, pinName: w.end.pinName, x: 0, y: 0 },
        color: '#ffaa00',
        waypoints: [],
      })),
    );

    // Simulate loadHex(): build a real AVR harness with fresh ADC, then attach
    // it to the production simulator so `sim.getADC()` returns a real target.
    // The RAF replay uses wall-clock (`performance.now`) — we advance it per
    // frame below — so we no longer need to patch `getCurrentCycles`.
    const avr = new AVRTestHarness();
    avr.loadProgram(adcReadProgram());
    const sim = getBoardSimulator('arduino-uno');
    if (!sim) throw new Error('arduino-uno simulator not registered');
    (sim as unknown as { adc: typeof avr.adc }).adc = avr.adc;
    console.log('\n=== L9 after fake loadHex ===');
    console.log('sim.getADC():', (sim as unknown as { getADC: () => unknown }).getADC() ? 'present' : 'null');

    // Mount the solver — on-mount maybeSolve should trigger a .tran solve.
    console.log('\n=== L9 mounting wireElectricalSolver ===');
    const unsub = wireElectricalSolver();

    // Wait for the solve to land.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const es = useElectricalStore.getState();
      if (es.timeWaveforms) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const es = useElectricalStore.getState();
    expect(es.timeWaveforms).toBeDefined();
    expect(es.analysisMode).toBe('tran');

    // Now simulate 200+ ms of real browser time: advance wall-clock + flush RAF.
    // Each "frame" = 16 ms of wall-clock (60 Hz). `periodS` is 80 ms so 12
    // frames spans ~192 ms and we should see multiple peaks and valleys.
    console.log('\n=== L9 stepping through 12 RAF frames with wall-clock advancing ===');
    const seriesADC: number[] = [];
    const seriesT: number[] = [];
    for (let frame = 0; frame < 12; frame++) {
      fakeNowMs += 16;
      // Flush exactly one RAF tick
      const cbs = rafCallbacks.splice(0, rafCallbacks.length);
      for (const cb of cbs) cb();
      seriesT.push(fakeNowMs - 1000); // ms since replay armed
      seriesADC.push(avr.adc.channelValues[0]);
    }
    console.log('wall times (ms):', seriesT.map((t) => t.toFixed(1)));
    console.log('ADC ch0 voltages:', seriesADC.map((v) => v.toFixed(3)));

    const hi = seriesADC.filter((v) => v > 1.5).length;
    const lo = seriesADC.filter((v) => v < 0.3).length;
    console.log(`frames with >1.5V: ${hi}, frames with <0.3V: ${lo}`);

    unsub();
    expect(seriesADC.some((v) => v > 1.5)).toBe(true); // Peaks reach rectified amplitude
    expect(seriesADC.some((v) => v < 0.3)).toBe(true); // Valleys dip to zero
  }, 60_000);
});
