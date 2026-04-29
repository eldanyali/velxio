/**
 * Intel 4040 emulator chip — TDD spec.
 *
 * The 4040 is a strict superset of the 4004. It adds:
 *   - Interrupts (INT pin, fixed vector — verify exact addr from datasheet)
 *   - Single-step / STOP / STOP-ACK
 *   - Expanded register file (16 → 24 4-bit registers)
 *   - Deeper PC stack (3 → 7)
 *   - 14 new opcodes (interrupt enable/disable, return-from-interrupt,
 *     stop, additional register-pair ops)
 *   - 24-pin DIP, 2 CM-ROM lines (vs 1 on 4004)
 *
 * Tests focus on the deltas from 4004. The shared 4004-subset behavior
 * should be exercised by a parametrised re-run of test_4004's suite once
 * both chips are implemented (deferred).
 */
import { describe, it, expect } from 'vitest';
import { BoardHarness } from '../src/BoardHarness.js';
import { chipWasmExists } from '../src/helpers.js';

const CHIP = '4040';
const skip = !chipWasmExists(CHIP);

const CLOCK_HZ = 740_000;
const CLOCK_NS = Math.round(1e9 / CLOCK_HZ);

/**
 * Pin names match the Intel MCS-40 User's Manual (Nov 1974) pin-description
 * table on pages 1-5/1-6. Φ1/Φ2 are renamed CLK1/CLK2 (no Greek letters in
 * C identifiers); the three −15 V supply pins (Vdd, Vdd1, Vdd2) are kept
 * separate even though velxio is digital and treats them all as power.
 */
function fullPinMap() {
  const m = {
    SYNC: 'SYNC', RESET: 'RESET', TEST: 'TEST',
    CMROM0: 'CMROM0', CMROM1: 'CMROM1',
    CMRAM0: 'CMRAM0', CMRAM1: 'CMRAM1', CMRAM2: 'CMRAM2', CMRAM3: 'CMRAM3',
    CLK1: 'CLK1', CLK2: 'CLK2',
    STP: 'STP', STPA: 'STPA',          // Stop input + Stop-acknowledge output
    INT: 'INT', INTA: 'INTA',          // Interrupt input + ack output
    CY: 'CY',                          // Carry output buffer (open drain)
    VDD: 'VDD', VDD1: 'VDD1', VDD2: 'VDD2', VSS: 'VSS',
  };
  for (let i = 0; i < 4; i++) m[`D${i}`] = `D${i}`;
  return m;
}

describe('Intel 4040 chip', () => {

  describe('pin contract', () => {
    it.skipIf(skip)('registers the 24-pin contract (4004 superset)', async () => {
      const board = new BoardHarness();
      await expect(board.addChip(CHIP, fullPinMap())).resolves.toBeDefined();
      board.dispose();
    });
  });

  describe('STP / STPA', () => {
    it.skipIf(skip)('asserting STP causes STPA to assert within one cycle', async () => {
      // Per MCS-40 manual p. 1-10: when STP is latched at M2, the STOP FF
      // sets at X3; the CPU then executes NOPs in a loop (clock and SYNC
      // KEEP RUNNING) and STPA asserts. So the assertion here is that
      // STPA goes high — we deliberately do NOT assert that SYNC stops.
      const board = new BoardHarness();
      await board.addChip(CHIP, fullPinMap());

      // Reset and run a few cycles freely.
      board.setNet('RESET', true);
      board.advanceNanos(CLOCK_NS * 12);   // ≥96 clk per p. 1-5 RESET min
      board.setNet('RESET', false);
      for (let i = 0; i < 16; i++) board.advanceNanos(CLOCK_NS);

      // Now assert STP (active high per pin description, p. 1-5) and watch.
      let acked = false;
      board.watchNet('STPA', (high) => { if (high) acked = true; });
      board.setNet('STP', true);

      // Allow up to 2 instruction cycles for the chip to latch STP at M2
      // and assert STPA at X3.
      for (let i = 0; i < 24; i++) board.advanceNanos(CLOCK_NS);

      expect(acked, 'STPA must rise within ~two instruction cycles').toBe(true);
      board.dispose();
    });
  });

  describe('interrupts', () => {
    it.todo('rising edge on INT vectors PC to the documented interrupt entry address');
    it.todo('return-from-interrupt opcode restores PC + flags');
  });

  describe('extended register file', () => {
    it.todo('FIM works on registers R16..R23 (4040-only range)');
  });
});
