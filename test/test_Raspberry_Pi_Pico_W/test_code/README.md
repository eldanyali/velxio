# test_code — runnable prototype

These scripts validate the **CYW43439 emulator** (`src/cyw43_emulator.ts`)
against the public gSPI / SDPCM / IOCTL contracts the real
`cyw43-driver` exercises. They are **not** wired into Velxio's
frontend yet — the goal is to prove every layer works in isolation
before promoting the code into `frontend/src/simulation/cyw43/`.

The emulator implements the design from
`../autosearch/04_emulation_design.md`:

| Tier | What runs | Status |
|---|---|---|
| 0 | Bus handshake (`0xFEEDBEAD`), F0/F1 register state, on-board LED IOCTL | ✅ |
| 1 | Full IOCTL surface (UP/DOWN/SET_INFRA/SET_AUTH/GET_VAR/SET_VAR/SCAN/SET_SSID/DISASSOC), SDPCM event injection, `Velxio-GUEST` AP, `cur_etheraddr` MAC reply | ✅ |
| 2 | Outbound Ethernet frames on F2 fire `onPacketOut`; inbound frames accepted via `injectPacket()`. Ready to be wired to a backend WS bridge. | ✅ chip side; net bridge is the production seam |
| 3 | Bluetooth, monitor mode, WPA3-SAE | ⏭ out of scope |

## Layout

```
test_code/
├── README.md                       ← this file
├── package.json                    ← local Node deps + npm scripts
├── tsconfig.json                   ← strict TS, ESM
├── src/
│   ├── pio_bus_sniffer.ts          ← decodes 32-bit gSPI command words
│   ├── cyw43_constants.ts          ← F0/F1/WLC/WLC_E definitions
│   ├── sdpcm.ts                    ← SDPCM + CDC + event-frame codec
│   ├── virtual_ap.ts               ← Velxio-GUEST AP (single source of truth)
│   ├── cyw43_emulator.ts           ← FULL emulator (Tier 0/1/2)
│   ├── cyw43_emulator_tier0.ts     ← legacy Tier-0 stub kept for tests/02
│   └── harness.ts                  ← glue with rp2040js
└── tests/
    ├── 01_pio_decoder.test.ts      ← bit-layout unit tests
    ├── 02_handshake.test.ts        ← Tier-0 handshake (legacy stub)
    ├── 03_pico_w_blink.test.ts     ← end-to-end (skipped without UF2)
    ├── 04_sdpcm.test.ts            ← SDPCM/CDC/event-frame codec
    ├── 05_ioctl.test.ts            ← per-IOCTL response validation
    └── 06_full_lifecycle.test.ts   ← bus init → scan → connect → packet → disconnect
```

## Running

```bash
cd test/test_Raspberry_Pi_Pico_W/test_code
npm install
npm test               # 30 unit + integration tests, no firmware needed
npm run e2e            # 1 end-to-end test, needs Pico W MicroPython UF2
npm run all            # everything
```

## Latest results (2026-04-29)

```
✓ tests/01_pio_decoder.test.ts        (9 tests)   ← bit decoder
✓ tests/02_handshake.test.ts          (6 tests)   ← Tier-0 handshake
✓ tests/04_sdpcm.test.ts              (7 tests)   ← SDPCM codec
✓ tests/05_ioctl.test.ts              (5 tests)   ← IOCTL surface
✓ tests/06_full_lifecycle.test.ts     (3 tests)   ← FULL WiFi lifecycle
↓ tests/03_pico_w_blink.test.ts       (1 test  | 1 skipped — needs UF2)

Test Files  5 passed | 1 skipped (6)
     Tests  30 passed | 1 skipped (31)
```

## What `06_full_lifecycle.test.ts` actually proves

A single test exercises the entire emulator surface in the order a real
driver hits it on `network.WLAN(network.STA_IF).connect("Velxio-GUEST")`:

1. **Bus handshake** — first F0:0x14 read returns 0, second returns
   `0xFEEDBEAD`.
2. **Clock CSR** — driver requests `HT_AVAIL_REQ`, chip flips
   `HT_AVAIL` on the next read.
3. **WLC_UP** — chip transitions to "up", `isUp()` returns true.
4. **WLC_SCAN** — chip emits a `WLC_E_ESCAN_RESULT` event whose
   embedded BSS info advertises SSID `Velxio-GUEST` with the
   locally-administered BSSID `02:42:DA:42:00:01`, then
   `WLC_E_SCAN_COMPLETE`.
5. **WLC_SET_SSID Velxio-GUEST** — chip emits the documented event
   sequence (`JOIN_START` → `AUTH` → `ASSOC_START` → `ASSOC` →
   `SET_SSID(SUCCESS)` → `LINK(reason=1)`), `getLinkState()` becomes
   `'up'`, `onConnect` listener fires.
6. **WLC_GET_BSSID** — IOCTL reply contains the AP's BSSID.
7. **Outbound data path** — host pushes an Ethernet frame on SDPCM
   channel 2 with a BDC header; the emulator strips the BDC and fires
   `onPacketOut` with the raw Ethernet payload (this is the seam where
   a backend WS bridge would tunnel out to the host network).
8. **Inbound data path** — `injectPacket()` queues a frame; the next
   F2 read returns it wrapped in SDPCM with channel = 2.
9. **WLC_DOWN** — chip transitions to "down", emits `LINK(reason=0)`,
   `onDisconnect` fires.

Plus negative tests:

- Joining a non-existent SSID → `SET_SSID(FAIL)` event, link stays down.
- Streaming 224 KB of "firmware" through F1 doesn't break the chip.

## Where the constants come from

Every numeric constant in `src/cyw43_constants.ts` is sourced from
**public** documentation:

- **gSPI register addresses** — Infineon CYW43439 datasheet §3.5.
- **WLC IOCTL command numbers** — pico-sdk's `pico_cyw43_driver`
  (BSD-3) and `jbentham/picowi` (MIT). The MIT-licensed picowi tree is
  cloned into `wokwi-libs/picowi/` for cross-reference.
- **WLC_E event numbers** — same two sources.
- **SDPCM/CDC layout** — Broadcom-published in the AirForce SDK and
  re-implemented identically in every open driver.

No code from the closed `georgerobotics/cyw43-driver` is copied; we
read it for sanity-checking but derive only from BSD/MIT sources.
