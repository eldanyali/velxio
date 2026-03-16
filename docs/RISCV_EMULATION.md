# RISC-V Emulation (ESP32-C3 / XIAO-C3 / C3 SuperMini)

> Status: **Functional** · In-browser emulation · No backend dependencies
> Engine: **RiscVCore (RV32IMC)** — implemented in TypeScript
> Platform: **ESP32-C3 @ 160 MHz** — 32-bit RISC-V architecture

---

## Table of Contents

1. [Overview](#1-overview)
2. [Supported Boards](#2-supported-boards)
3. [Emulator Architecture](#3-emulator-architecture)
4. [Emulated Memory and Peripherals](#4-emulated-memory-and-peripherals)
5. [Full Flow: Compile and Run](#5-full-flow-compile-and-run)
6. [ESP32 Image Format](#6-esp32-image-format)
7. [Supported ISA — RV32IMC](#7-supported-isa--rv32imc)
8. [GPIO](#8-gpio)
9. [UART0 — Serial Monitor](#9-uart0--serial-monitor)
10. [Limitations](#10-limitations)
11. [Tests](#11-tests)
12. [Differences vs Xtensa Emulation (ESP32 / ESP32-S3)](#12-differences-vs-xtensa-emulation-esp32--esp32-s3)
13. [Key Files](#13-key-files)

---

## 1. Overview

Boards based on **ESP32-C3** use Espressif's **ESP32-C3** processor, which implements the **RISC-V RV32IMC** architecture (32-bit, Multiply, Compressed instructions). Unlike the ESP32 and ESP32-S3 (Xtensa LX6/LX7), the C3 **does not require QEMU or a backend** to be emulated.

### Emulation Engine Comparison

| Board | CPU | Engine |
| ----- | --- | ------ |
| ESP32, ESP32-S3 | Xtensa LX6/LX7 | QEMU lcgamboa (backend WebSocket) |
| **ESP32-C3, XIAO-C3, C3 SuperMini** | **RV32IMC @ 160 MHz** | **RiscVCore.ts (browser, no backend)** |
| Arduino Uno/Nano/Mega | AVR ATmega | avr8js (browser) |
| Raspberry Pi Pico | RP2040 | rp2040js (browser) |

### Advantages of the JS Emulator

- **No network dependencies** — works offline, no WebSocket connection to the backend
- **Instant startup** — no QEMU process to launch (0 ms latency)
- **Testable with Vitest** — the same TypeScript code that runs in production can be tested in CI
- **Cross-platform** — works the same on Windows, macOS, Linux, and Docker

---

## 2. Supported Boards

| Board | arduino-cli FQBN | Built-in LED |
| ----- | ---------------- | ------------ |
| ESP32-C3 DevKit | `esp32:esp32:esp32c3` | GPIO 8 |
| Seeed XIAO ESP32-C3 | `esp32:esp32:XIAO_ESP32C3` | GPIO 10 (active-low) |
| ESP32-C3 SuperMini | `esp32:esp32:esp32c3` | GPIO 8 |

---

## 3. Emulator Architecture

```
Arduino Sketch (.ino)
        │
        ▼ arduino-cli (backend)
  sketch.ino.bin  ←  ESP32 image format (IROM/DRAM/IRAM segments)
        │
        ▼ base64 → frontend
  compileBoardProgram(boardId, base64)
        │
        ▼ Esp32C3Simulator.loadFlashImage(base64)
  parseMergedFlashImage()  ←  reads segments from the 4MB image
        │
        ├── IROM segment → flash buffer  (0x42000000)
        ├── DROM segment → flash buffer  (0x3C000000, alias)
        ├── DRAM segment → dram buffer   (0x3FC80000)
        └── IRAM segment → iram buffer   (0x4037C000)
        │
        ▼ core.reset(entryPoint)
  RiscVCore.step()  ←  requestAnimationFrame @ 60 FPS
        │             2,666,667 cycles/frame (160 MHz ÷ 60)
        ├── MMIO GPIO_W1TS/W1TC → onPinChangeWithTime → visual components
        └── MMIO UART0 FIFO    → onSerialData → Serial Monitor
```

### Main Classes

| Class | File | Responsibility |
| ----- | ---- | -------------- |
| `RiscVCore` | `simulation/RiscVCore.ts` | RV32IMC decoder/executor, generic MMIO |
| `Esp32C3Simulator` | `simulation/Esp32C3Simulator.ts` | ESP32-C3 memory map, GPIO, UART0, RAF loop |
| `parseMergedFlashImage` | `utils/esp32ImageParser.ts` | ESP32 image format parsing (segments, entry point) |

---

## 4. Emulated Memory and Peripherals

### Memory Map

| Region | Base Address | Size | Description |
| ------ | ------------ | ---- | ----------- |
| Flash IROM | `0x42000000` | 4 MB | Executable code (core's main buffer) |
| Flash DROM | `0x3C000000` | 4 MB | Read-only data (alias of the same buffer) |
| DRAM | `0x3FC80000` | 384 KB | Data RAM (stack, global variables) |
| IRAM | `0x4037C000` | 384 KB | Instruction RAM (ISR, time-critical code) |
| UART0 | `0x60000000` | 1 KB | Serial port 0 |
| GPIO | `0x60004000` | 512 B | GPIO registers |

### GPIO — Implemented Registers

| Register | Offset | Function |
| -------- | ------ | -------- |
| `GPIO_OUT_REG` | `+0x04` | Read/write output state of all pins |
| `GPIO_OUT_W1TS_REG` | `+0x08` | **Set bits** — drive pins HIGH (write-only) |
| `GPIO_OUT_W1TC_REG` | `+0x0C` | **Clear bits** — drive pins LOW (write-only) |
| `GPIO_IN_REG` | `+0x3C` | Read input state of pins |
| `GPIO_ENABLE_REG` | `+0x20` | Pin direction (always returns `0xFF`) |

Covers **GPIO 0–21** (all available on ESP32-C3).

### UART0 — Implemented Registers

| Register | Offset | Function |
| -------- | ------ | -------- |
| `UART_FIFO_REG` | `+0x00` | Write TX byte / read RX byte |
| `UART_STATUS_REG` | `+0x1C` | FIFO status (always returns `0` = ready) |

RX byte reading is available to simulate input from the Serial Monitor.

### Peripherals NOT Emulated (return 0 on read)

- Interrupt Matrix (`0x600C2000`)
- System / Clock (`0x600C0000`, `0x60008000`)
- Cache controller (`0x600C4000`)
- Timer Group 0/1
- SPI flash controller
- BLE / WiFi MAC
- ADC / DAC

> These peripherals return `0` by default. Code that depends on them may not function correctly (see [Limitations](#10-limitations)).

---

## 5. Full Flow: Compile and Run

### 5.1 Compile the Sketch

```bash
# arduino-cli compiles for ESP32-C3:
arduino-cli compile \
  --fqbn esp32:esp32:esp32c3 \
  --output-dir build/ \
  mi_sketch/

# The backend automatically creates the merged image:
#   build/mi_sketch.ino.bootloader.bin  → 0x01000
#   build/mi_sketch.ino.partitions.bin  → 0x08000
#   build/mi_sketch.ino.bin             → 0x10000 (app)
#   → merged: sketch.ino.merged.bin (4 MB)
```

The Velxio backend produces this image automatically and sends it to the frontend as base64.

### 5.2 Minimal Sketch for ESP32-C3

```cpp
// LED on GPIO 8 (ESP32-C3 DevKit)
#define LED_PIN 8

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("ESP32-C3 started");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(500);
  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(500);
}
```

### 5.3 Bare-Metal Sketch (for direct emulation tests)

To verify the emulation without the Arduino framework, you can compile directly with the RISC-V toolchain:

```c
/* blink.c — bare-metal, no ESP-IDF */
#define GPIO_W1TS  (*(volatile unsigned int *)0x60004008u)
#define GPIO_W1TC  (*(volatile unsigned int *)0x6000400Cu)
#define LED_BIT    (1u << 8)

static void delay(int n) { for (volatile int i = 0; i < n; i++); }

void _start(void) {
  while (1) {
    GPIO_W1TS = LED_BIT;   /* LED ON  */
    delay(500);
    GPIO_W1TC = LED_BIT;   /* LED OFF */
    delay(500);
  }
}
```

Compile with the toolchain bundled in arduino-cli:

```bash
# Toolchain installed with: arduino-cli core install esp32:esp32
TOOLCHAIN="$LOCALAPPDATA/Arduino15/packages/esp32/tools/riscv32-esp-elf-gcc/esp-2021r2-patch5-8.4.0/bin"

"$TOOLCHAIN/riscv32-esp-elf-gcc" \
  -march=rv32imc -mabi=ilp32 -Os -nostdlib -nostartfiles \
  -T link.ld -o blink.elf blink.c

"$TOOLCHAIN/riscv32-esp-elf-objcopy" -O binary blink.elf blink.bin
```

See full script: `frontend/src/__tests__/fixtures/esp32c3-blink/build.sh`

---

## 6. ESP32 Image Format

The backend produces a merged **4 MB** image:

```
Offset 0x00000: 0xFF (empty)
Offset 0x01000: bootloader   (ESP32 format image, magic 0xE9)
Offset 0x08000: partition table
Offset 0x10000: app binary   (ESP32 format image, magic 0xE9) ← parsed here
```

### ESP32 Image Header (24 bytes)

```
+0x00  magic (0xE9)
+0x01  segment_count
+0x02  spi_mode
+0x03  spi_speed_size
+0x04  entry_addr       ← uint32 LE — firmware entry point PC
+0x08  extended fields (16 bytes)
```

### Segment Header (8 bytes)

```
+0x00  load_addr   ← destination virtual address (e.g. 0x42000000)
+0x04  data_len
+0x08  data[data_len]
```

The `parseMergedFlashImage()` parser in `utils/esp32ImageParser.ts` extracts all segments and the entry point, which is used for the core reset (`core.reset(entryPoint)`).

---

## 7. Supported ISA — RV32IMC

`RiscVCore.ts` implements the three extensions required to run code compiled for ESP32-C3:

### RV32I — Base Integer (40 instructions)

Includes: LUI, AUIPC, JAL, JALR, BEQ/BNE/BLT/BGE/BLTU/BGEU, LB/LH/LW/LBU/LHU, SB/SH/SW, ADDI/SLTI/SLTIU/XORI/ORI/ANDI/SLLI/SRLI/SRAI, ADD/SUB/SLL/SLT/SLTU/XOR/SRL/SRA/OR/AND, FENCE, ECALL/EBREAK, CSR (reads return 0)

### RV32M — Multiply and Divide (8 instructions)

| Instruction | Operation |
| ----------- | --------- |
| `MUL` | Integer product (low 32 bits) |
| `MULH` | Signed product (high 32 bits) |
| `MULHSU` | Mixed signed×unsigned product (high bits) |
| `MULHU` | Unsigned product (high 32 bits) |
| `DIV` | Signed integer division |
| `DIVU` | Unsigned integer division |
| `REM` | Signed remainder |
| `REMU` | Unsigned remainder |

### RV32C — Compressed Instructions (16-bit)

All 16-bit instructions from the standard C extension are supported. They are detected by `(halfword & 3) !== 3` and decompressed to their RV32I equivalent before execution. This is critical: the GCC compiler for ESP32-C3 heavily generates C instructions (`c.addi`, `c.sw`, `c.lw`, `c.j`, `c.beqz`, `c.bnez`, etc.) which represent ~30-40% of all instructions in the final binary.

---

## 8. GPIO

GPIO handling follows the W1TS/W1TC register model of the ESP32-C3:

```typescript
// Arduino sketch:
digitalWrite(8, HIGH);  // → internally writes 1<<8 to GPIO_OUT_W1TS_REG

// In the simulator:
// SW x10, 0(x12)  where x10=256 (1<<8), x12=0x60004008 (W1TS)
// → writes 4 bytes to 0x60004008..0x6000400B
// → byteIdx=1 (offset 0x09): val=0x01, shift=8 → gpioOut |= 0x100
// → changed = prev ^ gpioOut ≠ 0 → fires onPinChangeWithTime(8, true, timeMs)
```

The callback `onPinChangeWithTime(pin, state, timeMs)` is the integration point with the visual components. `timeMs` is the simulated time in milliseconds (calculated as `core.cycles / CPU_HZ * 1000`).

---

## 9. UART0 — Serial Monitor

Any byte written to `UART0_FIFO_REG` (0x60000000) calls the `onSerialData(char)` callback:

```cpp
// Arduino sketch:
Serial.println("Hello!");
// → Arduino framework writes the bytes of "Hello!\r\n" to UART0_FIFO_REG
// → simulator calls onSerialData("H"), onSerialData("e"), ...
// → Serial Monitor displays "Hello!"
```

To send data to the sketch from the Serial Monitor:

```typescript
sim.serialWrite("COMMAND\n");
// → bytes are added to rxFifo
// → reading UART0_FIFO_REG dequeues one byte from rxFifo
```

---

## 10. Limitations

### ESP-IDF / Arduino Framework

The Arduino framework for ESP32-C3 (based on ESP-IDF 4.4.x) has a complex initialization sequence that accesses non-emulated peripherals:

| Peripheral | Why ESP-IDF accesses it | Effect in emulator |
| ---------- | ----------------------- | ------------------ |
| Cache controller | Configures MMU for flash/DRAM mapping | Reads 0, may not loop |
| Interrupt Matrix | Registers ISR vectors | No effect (silenced) |
| System registers | Configures PLLs and clocks | Reads 0 (assumes default speed) |
| FreeRTOS tick timer | Timer 0 → periodic interrupt | No interrupt = tasks not scheduled |

As a result, an Arduino sketch compiled with the full framework may execute partially — code prior to FreeRTOS initialization may work, but `setup()` and `loop()` depend on FreeRTOS running.

**Scenarios that DO work:**

- Bare-metal code (no framework, direct GPIO MMIO access)
- Code fragments that do not use FreeRTOS (`delay()`, `millis()`, `digitalWrite()` require FreeRTOS)
- ISA test programs (arithmetic operations, branches, loads/stores to DRAM)

**Roadmap for full support:**

1. Cache controller stub (return values indicating "cache already configured")
2. Interrupt matrix stub (accept writes, ignore)
3. Basic timer peripheral (generate FreeRTOS tick periodically)
4. Once FreeRTOS is active: normal Arduino sketches should work

### Other Limitations

| Limitation | Detail |
| ---------- | ------ |
| No WiFi | ESP32-C3 has BLE/WiFi radio; not emulated |
| No ADC | GPIO 0-5 as ADC not implemented |
| No hardware SPI/I2C | Hardware SPI/I2C peripherals return 0 |
| No interrupts | `attachInterrupt()` does not work |
| No RTC | `esp_sleep_*`, `rtc_*` not implemented |
| No NVS/Flash writes | `Preferences`, `SPIFFS` not implemented |

---

## 11. Tests

RISC-V emulation tests are in `frontend/src/__tests__/`:

```bash
cd frontend
npm test -- esp32c3
```

### `esp32c3-simulation.test.ts` — 30 tests (ISA unit tests)

Directly verifies the instruction decoder in `RiscVCore`:

| Group | Tests | What it verifies |
| ----- | ----- | ---------------- |
| RV32M | 8 | MUL, MULH, MULHSU, MULHU, DIV, DIVU, REM, REMU |
| RV32C | 7 | C.ADDI, C.LI, C.LWSP, C.SWSP, C.MV, C.ADD, C.J, C.BEQZ |
| UART | 3 | Write to FIFO → onSerialData, RX read, multiple bytes |
| GPIO | 8 | W1TS set bit, W1TC clear bit, toggle, timestamp, multiple pins |
| Lifecycle | 4 | reset(), start/stop, basic loadHex |

### `esp32c3-blink.test.ts` — 8 tests (end-to-end integration)

Compiles `blink.c` with `riscv32-esp-elf-gcc` (the arduino-cli toolchain) and verifies execution in the simulator:

| Test | What it verifies |
| ---- | ---------------- |
| `build.sh produces blink.bin` | Toolchain compiles correctly |
| `binary starts with valid RV32 instruction` | Entry point is valid RISC-V code |
| `loadBin() resets PC to 0x42000000` | Correct loading into flash |
| `GPIO 8 goes HIGH after first SW` | First toggle correct |
| `GPIO 8 toggles ON and OFF` | 7 toggles in 2000 steps (4 ON, 3 OFF) |
| `PinManager.setPinState called` | Integration with the component system |
| `timestamps increase monotonically` | Simulated time is consistent |
| `reset() clears GPIO state` | Functional reset |

**Expected result:**
```
✓ esp32c3-simulation.test.ts  (30 tests)  ~500ms
✓ esp32c3-blink.test.ts        (8 tests)  ~300ms
```

### Bare-Metal Test Binary

```
frontend/src/__tests__/fixtures/esp32c3-blink/
├── blink.c       ← bare-metal source code
├── link.ld       ← linker script (IROM @ 0x42000000, DRAM @ 0x3FC80000)
├── build.sh      ← build script (uses arduino-cli toolchain)
├── blink.elf     ← (generated) ELF with debug info
├── blink.bin     ← (generated) raw 58-byte binary
└── blink.dis     ← (generated) disassembly for inspection
```

---

## 12. Differences vs Xtensa Emulation (ESP32 / ESP32-S3)

| Aspect | ESP32-C3 (RISC-V) | ESP32 / ESP32-S3 (Xtensa) |
| ------ | ----------------- | ------------------------- |
| Engine | `Esp32C3Simulator` (TypeScript, browser) | `Esp32Bridge` + backend QEMU |
| Backend dependency | **No** — 100% in the browser | Yes — WebSocket to QEMU process |
| Startup | Instant | ~1-2 seconds |
| GPIO | Via MMIO W1TS/W1TC | Via QEMU callbacks → WebSocket |
| WiFi | Not emulated | Emulated (hardcoded SSIDs) |
| Hardware I2C/SPI | Not emulated | Emulated (synchronous callbacks) |
| LEDC/PWM | Not emulated | Emulated (periodic polling) |
| NeoPixel/RMT | Not emulated | Emulated (RMT decoder) |
| Arduino framework | Partial (FreeRTOS not active) | Full |
| CI tests | Yes (Vitest) | No (requires native lib) |

---

## 13. Key Files

| File | Description |
| ---- | ----------- |
| `frontend/src/simulation/RiscVCore.ts` | RV32IMC emulator core (I + M + C extensions) |
| `frontend/src/simulation/Esp32C3Simulator.ts` | ESP32-C3 memory map, GPIO, UART0, RAF loop |
| `frontend/src/utils/esp32ImageParser.ts` | ESP32 image format parser (merged flash → segments) |
| `frontend/src/store/useSimulatorStore.ts` | `ESP32_RISCV_KINDS`, `createSimulator()`, `compileBoardProgram()` |
| `frontend/src/__tests__/esp32c3-simulation.test.ts` | ISA unit tests (30 tests) |
| `frontend/src/__tests__/esp32c3-blink.test.ts` | End-to-end integration test (8 tests) |
| `frontend/src/__tests__/fixtures/esp32c3-blink/` | Bare-metal test firmware + toolchain script |
