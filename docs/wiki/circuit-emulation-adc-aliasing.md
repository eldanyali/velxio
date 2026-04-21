# Time-Domain Fidelity: The ADC Aliasing Bug

> A deep-dive into why `analogRead(A0)` returned `0` on the Half-Wave Rectifier
> example even though the SPICE solver was producing a perfectly correct
> rectified waveform — and how we fixed it with a per-read hook into the
> emulated ADC peripheral.

## Target audience

Anyone touching the electrical-simulation layer in Velxio, or trying to make
an Arduino/RP2040 sketch sample an AC source with real-world fidelity.

---

## 1. The symptom

The built-in example **Half-Wave Rectifier** wires:

```
signal-generator(sine, 50 Hz, 5 Vpp) → 1N4007 → 10 kΩ load ─┬─ A0
                                                            └─ GND
```

The sketch does:

```c
void setup()  { Serial.begin(9600); }
void loop()   { Serial.println(analogRead(A0)); delay(5); }
```

**Expected:** values oscillating between `0` (negative half-cycle blocked by
the diode) and `~880` (positive peak ≈ 4.3 V → `4.3/5 × 1024`).

**Actual (pre-fix):** a long run of `0`s, indefinitely.

---

## 2. The architecture (refresher)

```
┌────────────────────┐  SPICE  ┌─────────────────┐  RAF (60 Hz)  ┌─────────┐
│ NetlistBuilder     │ ──────► │ .tran waveform  │ ────────────► │ AVRADC  │ ───┐
│ (.op vs .tran)     │         │ (400 samples)   │   sets        │ channel │    │
└────────────────────┘         └─────────────────┘  channelValues│ Values  │    │
                                                                 └─────────┘    │
                                                                                ▼
                                                                ┌───────────────────────┐
                                                    analogRead  │ AVR CPU (avr8js)       │
                                                    (200 Hz)    │ reads channelValues[]  │
                                                                └───────────────────────┘
```

The key file is
[`frontend/src/simulation/spice/subscribeToStore.ts`](../../frontend/src/simulation/spice/subscribeToStore.ts).
It runs the RAF loop and writes `channelValues[channel] = v` at each frame.

---

## 3. Root cause, layer 1 — the clock was frozen at `t = 0`

The first `adcReplayFrame()` log line showed `t: 0, v: -0, clamped: 0` for
hundreds of frames. Reason:

```ts
// BROKEN:
function simTimeSeconds(sim): number {
  return sim.getCurrentCycles() / 16_000_000;  // AVR cycle count
}
```

Before the user presses **Run**, `cpu.cycles === 0`. So `t = 0` and
`V(sine at phase 0) = 0` — forever. Even after Run, the cycle counter is
updated in batches on the same animation frame, so the 60 Hz sampler was
stepping in non-monotonic jumps that aliased hard against the signal.

**Fix:** drive the replay clock from wall-clock time. An ideal signal
generator keeps oscillating regardless of whether the MCU is running — a
paused AVR still sees a live signal on its pins, just like real hardware.

```ts
// FIXED:
function simTimeSeconds(_sim): number {
  return (performance.now() - replayStartWallMs) / 1000;
}
```

After this fix, the browser console showed `channelValues[0]` oscillating
correctly **after the AVR stopped**, but during the run it was *still* stuck
on long flat runs of the same value.

---

## 4. Root cause, layer 2 — frame-rate aliasing

The RAF runs at ~60 Hz. The signal is 50 Hz. Beat frequency = 10 Hz. Every
~100 ms the RAF samples the sine at nearly the same phase, producing long
plateaus of near-identical voltages.

But the deeper problem was this: **`channelValues[0]` is overwritten once per
animation frame**, and the AVR sketch calls `analogRead` at ~200 Hz — meaning
3-4 consecutive reads within a single frame all see *exactly the same*
voltage. The entire time-domain resolution offered by the 400-sample `.tran`
waveform was being collapsed to a 60 Hz zero-order hold.

Nyquist gives the bound: to faithfully sample a 50 Hz signal, the reader must
sample at > 100 Hz. 60 Hz RAF alone fails that — with the additional
same-value-within-frame issue, the *effective* sampling rate drops to zero.

---

## 5. Why the test didn't catch this

The L9 test in `spice-rectifier-live-repro.test.ts` verified that the RAF
loop **writes** correct varying values into `channelValues[0]` across a
simulated 120 ms window. It stubbed `performance.now` to advance by 16 ms per
frame and collected a sequence like `[0, 0, 2.543, 4.336, 0, 0, ...]`. That
sequence was *correct*, and the test was happy.

But the test never called `analogRead` on the running AVR. It tested the
*write* path, not the *read* path. The real failure was on the read side:
multiple reads within one animation frame seeing the same stale
`channelValues[0]`. This only manifests when:

1. The AVR is actually executing (cycles advancing),
2. At the same time as RAF is firing,
3. And the sketch samples faster than 60 Hz.

The fix: a new integration test should patch `AVRADC.onADCRead`, advance the
sim 200 AVR reads, and assert that the collected sequence has
non-monotonic oscillations with period ≈ 20 ms (50 Hz).

---

## 6. The fix — per-read waveform sampling

Replace `AVRADC.onADCRead` with a version that interpolates the SPICE
waveform at the **exact wall-clock time of the read**. Now every
`analogRead` call, regardless of RAF rate, samples the signal at its own
call rate (200 Hz for a 5 ms-delay loop) — well above Nyquist for a 50 Hz
source.

```ts
// Simplified — see subscribeToStore.ts::installAdcReadHooks for the full code.
self.onADCRead = function (input) {
  const net = channelToNet.get(input.channel);
  const voltage = sampleWaveformAtNow(net) ?? self.channelValues[input.channel] ?? 0;
  const rawValue = (voltage / self.referenceVoltage) * 1024;
  const result = Math.min(Math.max(Math.floor(rawValue), 0), 1023);
  self.cpu.addClockEvent(() => self.completeADCRead(result), self.sampleCycles);
};
```

Two subtle correctness requirements that turned up during implementation:

- **Idempotent patching.** `loadHex` creates a fresh `AVRADC` on every
  Compile+Run. Use a `WeakSet<object>` to track already-patched ADC
  instances, and re-run the installer from inside `adcReplayFrame` so it
  catches new ADCs between frames.
- **Fallback to `channelValues`.** If there's no `.tran` waveform for that
  net (e.g. DC circuit), fall back to whatever the normal DC injection
  pipeline wrote. This keeps every existing DC example working untouched.

### Serial output after the fix

```
143 760 937 773 353 5 0 0 0 0 0 0 0 0 0 218 588 817 903 723 438 0 0 0 656 297
```

Peaks ≈ 937 (= 4.58 V × 1024/5) match the expected 5 V − 0.7 V diode drop.
Zeros during negative half-cycles confirm the diode is blocking correctly.
Intermediate samples trace the sine envelope faithfully.

---

## 7. Generalization to RP2040

The same bug class exists for any MCU whose ADC reads a SPICE net fed by an
AC source. `RPADC` from `rp2040js` has a slightly different signature:

```ts
onADCRead: (channel: number) => void = (channel) => {
  this.currentChannel = channel;
  this.sampleAlarm.schedule(this.sampleTime * 1000);
};
```

…and reads from `channelValues[currentChannel]` inside the scheduled alarm
callback. The hook for RP2040 is simpler — we overwrite
`channelValues[channel]` synchronously at the moment of the read, then
delegate to the original implementation:

```ts
const originalOnADCRead = self.onADCRead.bind(self);
self.onADCRead = function (channel: number) {
  const v = sampleWaveformAtNow(channelToNet.get(channel));
  if (v != null) {
    // RP2040 is 12-bit, 0-3.3V full scale.
    const clamped = Math.max(0, Math.min(3.3, v));
    self.channelValues[channel] = Math.round((clamped / 3.3) * 4095);
  }
  originalOnADCRead(channel);
};
```

The installer auto-detects which path to use:

```ts
const isRp2040 = 'resolution' in (adc as object);
```

### ESP32 remains on 60 Hz RAF-only

ESP32 boards use the `Esp32BridgeShim.setAdcVoltage` bridge (see
`partUtils.ts`), which has no per-read hook. Until we expose one from the
ESP32 bridge, ESP32 AC readings will be limited to 60 Hz RAF sampling.
**This is acceptable today** because the only AC examples in
`examples-circuits.ts` use AVR boards. If/when we ship an ESP32 AC example,
add a matching hook to `Esp32Bridge.ts::Esp32BridgeShim`.

---

## 8. Where fidelity still falls short (and what to do about it)

The per-read hook brings ADC readings to hardware-faithful fidelity. Other
paths that consume SPICE results still see only scalar (last-sample) values:

| Consumer | Current behavior | Fidelity upgrade |
| --- | --- | --- |
| `<Voltmeter/>` overlay | Shows last `.tran` sample | Show RMS or mean of `timeWaveforms.nodes[net]` |
| `<Ammeter/>` overlay | Shows last `.tran` sample | Show RMS or mean of `timeWaveforms.branches[src]` |
| LED brightness | `Math.abs(branchCurrents[iKey])` | Average `|I(t)|` over the period — see Plan §4 |
| Resistor/diode heat dots | — | Future: `I²R` integrated over period |
| Capacitor Charging example | Uses `.op` → instantaneous only | Promote to `.tran` on step changes, not just AC sources |

The **Capacitor Charging** example deserves particular attention: it's
supposed to show an exponential `V(t) = Vsource × (1 − e^(−t/RC))` charging
curve, but the current `.op` analysis gives only the steady-state endpoint.
Extending `pickDynamicAnalysis` in `storeAdapter.ts` to treat step-function
DC sources (e.g. when a board pin goes from LOW to HIGH into an RC) as
transient inputs would fix this, with the same replay machinery we already
have.

---

## 9. Checklist for adding a new AC/transient example

1. Ensure the circuit uses a `signal-generator` or equivalent AC source.
   `pickDynamicAnalysis` in
   [`storeAdapter.ts`](../../frontend/src/simulation/spice/storeAdapter.ts)
   must detect it and switch analysis to `.tran`.
2. If the ADC pin is wired to a net driven by that source, verify the
   sketch samples at ≥ 2 × f_signal (e.g. `delay(2)` for 50 Hz → 500 Hz
   sampling, plenty of headroom).
3. Boards supported today for per-read fidelity: AVR (Uno, Nano, Mega,
   ATtiny85) and RP2040 (Pico, Pico W). ESP32 is RAF-rate.
4. Add a test in `frontend/src/__tests__/` following the pattern in
   `spice-rectifier-live-repro.test.ts::L9` — advance simulated wall-clock
   across multiple RAF frames and assert the captured trace has the
   expected periodicity.

---

## 10. Key files

| File | Role |
| --- | --- |
| `frontend/src/simulation/spice/subscribeToStore.ts` | RAF replay loop + per-read `onADCRead` hooks (AVR + RP2040) |
| `frontend/src/simulation/spice/CircuitScheduler.ts` | Runs `.tran` and returns `timeWaveforms` |
| `frontend/src/simulation/spice/storeAdapter.ts::pickDynamicAnalysis` | Decides `.op` vs `.tran` |
| `wokwi-libs/avr8js/src/peripherals/adc.ts` | `AVRADC.onADCRead` — patched at runtime |
| `wokwi-libs/rp2040js/src/peripherals/adc.ts` | `RPADC.onADCRead` — patched at runtime |
| `frontend/src/simulation/parts/partUtils.ts::setAdcVoltage` | DC-path voltage injection (fallback) |
| `frontend/src/__tests__/spice-rectifier-live-repro.test.ts` | Live-flow regression test |

---

## 11. TL;DR

- **Bug A:** cycle-based clock was 0 before Run → signal frozen at phase 0.
  **Fix:** switch to `performance.now()`.
- **Bug B:** 60 Hz RAF can't drive a 50 Hz signal, and all `analogRead`s
  within one frame return the same value. **Fix:** override
  `AVRADC.onADCRead` / `RPADC.onADCRead` to sample the SPICE waveform at the
  moment of each read.
- **Why tests missed it:** tests asserted on writes to `channelValues`, not
  on values returned by `analogRead`. Add read-side tests going forward.
- **Where this doesn't generalize yet:** ESP32 (bridged ADC, no per-read
  hook), voltmeter/ammeter overlays (scalar only), capacitor charging
  (needs `.tran` on DC step-function inputs).
