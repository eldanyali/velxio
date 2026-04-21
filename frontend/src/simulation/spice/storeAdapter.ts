/**
 * Bridge between Velxio's simulator store (components, wires, boards) and
 * the NetlistBuilder inputs. Kept separate so the SPICE engine never has
 * to import the full Zustand store or its types.
 *
 * Callers construct a `BuildNetlistInput` by calling
 *   `buildInputFromStore(storeSnapshot)`
 */
import type { BuildNetlistInput, BoardForSpice, ComponentForSpice, WireForSpice, PinSourceState, AnalysisMode } from './types';
import type { Wire } from '../../types/wire';
import type { BoardKind } from '../../types/board';
import { BOARD_PIN_GROUPS } from './boardPinGroups';

// Minimum transient stop time so RC/decoupling networks reach steady-state
// even if the source is very high frequency.
const MIN_TRAN_STOP_S = 5e-3;
// Cap transient stop time to keep solve cost bounded for very low-frequency
// sources (e.g. 0.1 Hz → 40 s would be absurd). 400 ms covers 20 cycles at
// 50 Hz and gives plenty of time to reach steady state for filter networks.
const MAX_TRAN_STOP_S = 0.4;
const SAMPLES_PER_PERIOD = 20;
const PERIODS_TO_SETTLE = 4;

/**
 * Scan components for time-dependent sources and pick a transient analysis
 * window that captures all frequencies with enough resolution. Returns `null`
 * if every source is DC (→ caller uses `.op`).
 */
function pickDynamicAnalysis(
  components: StoreSnapshot['components'],
): AnalysisMode | null {
  const frequencies: number[] = [];
  for (const c of components) {
    if (c.metadataId !== 'signal-generator') continue;
    const waveform = String(c.properties.waveform ?? 'sine').toLowerCase();
    if (waveform === 'dc') continue;
    const freq = Number(c.properties.frequency ?? 0);
    if (freq > 0) frequencies.push(freq);
  }
  if (frequencies.length === 0) return null;

  const maxFreq = Math.max(...frequencies);
  const minFreq = Math.min(...frequencies);
  const stepS = 1 / (maxFreq * SAMPLES_PER_PERIOD);
  const rawStop = PERIODS_TO_SETTLE / minFreq;
  const stopS = Math.min(MAX_TRAN_STOP_S, Math.max(MIN_TRAN_STOP_S, rawStop));
  return {
    kind: 'tran',
    step: stepS.toExponential(3),
    stop: stopS.toExponential(3),
  };
}

export interface StoreSnapshot {
  components: Array<{
    id: string;
    metadataId: string;
    properties: Record<string, unknown>;
  }>;
  wires: Wire[];
  boards: Array<{
    id: string;
    boardKind: BoardKind;
    pinStates: Record<string, PinSourceState>; // caller pre-populates from PinManager + PWM
  }>;
}

/**
 * Convert a Velxio store snapshot into the `BuildNetlistInput` consumed
 * by the NetlistBuilder.
 */
export function buildInputFromStore(snap: StoreSnapshot): BuildNetlistInput {
  const components: ComponentForSpice[] = snap.components.map((c) => ({
    id: c.id,
    metadataId: c.metadataId,
    properties: c.properties,
  }));

  const wires: WireForSpice[] = snap.wires.map((w) => ({
    id: w.id,
    start: { componentId: w.start.componentId, pinName: w.start.pinName },
    end: { componentId: w.end.componentId, pinName: w.end.pinName },
  }));

  const boards: BoardForSpice[] = snap.boards.map((b) => {
    const group = BOARD_PIN_GROUPS[b.boardKind] ?? BOARD_PIN_GROUPS.default;
    return {
      id: b.id,
      vcc: group.vcc,
      pins: b.pinStates,
      groundPinNames: group.gnd,
      vccPinNames: group.vcc_pins,
    };
  });

  const analysis: AnalysisMode = pickDynamicAnalysis(snap.components) ?? { kind: 'op' };

  return {
    components,
    wires,
    boards,
    analysis,
  };
}
