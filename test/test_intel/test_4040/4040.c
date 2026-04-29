/*
 * Intel 4040 emulator — clean-room implementation as a velxio custom chip.
 *
 * Source (in autosearch/pdfs/):
 *   [M40] Intel MCS-40 User's Manual (Nov 1974). Page numbers 1-x are
 *         the printed Ch. 1 footers.
 * See autosearch/13_4040_authoritative_spec.md for citations.
 *
 * The 4040 is a binary-compatible superset of the 4004. The 46 4004
 * opcodes execute identically; 14 new opcodes use OPR=0000 with
 * OPA=0x01..0x0E (NOP=0x00 is preserved). The 4040 also adds
 * interrupts, single-step (STOP/STOPACK), three banks of 8 index
 * registers (SB0/SB1 select), 7-deep PC stack, two CM-ROM lines
 * (DB0/DB1 select), and a CY output pin.
 *
 * Implementation model: parallel to 4004.c — one timer fire = one
 * clock phase, 8-phase frame (A1..X3). The new control logic is:
 *   - STP rising edge → set stp_pending; latched at M2; STOP FF set
 *     at X3; STPA asserts.
 *   - INT rising edge with EIN=1 → set int_pending; latched at M2;
 *     forced JMS to PC=0x003 at X3; INTA asserts.
 *
 * Scope of this implementation (matches active tests in
 * test_4040/4040.test.js):
 *   - Pin contract (24-pin DIP per [M40] pp. 1-5/1-6).
 *   - STP/STPA protocol that asserts STPA within ~2 instruction cycles
 *     of STP going high.
 *
 * Out of scope (deferred to follow-up; covered as it.todo):
 *   - INT vectoring to 0x003 with INTA + register-bank save.
 *   - BBS (return from interrupt subroutine, opcode 0x02).
 *   - All 14 new opcodes' actual semantics (LCR, OR4/OR5, AN6/AN7,
 *     DB0/DB1, SB0/SB1, EIN/DIN, RPM).
 *   - Full 4004-superset ISA decoding.
 */
#include "velxio-chip.h"
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

typedef enum {
    PHASE_A1 = 0, PHASE_A2, PHASE_A3,
    PHASE_M1, PHASE_M2,
    PHASE_X1, PHASE_X2, PHASE_X3,
} phase_t;

typedef struct {
    /* Pin handles — names from [M40] pp. 1-5/1-6 */
    vx_pin dpin[4];
    vx_pin sync;
    vx_pin reset;
    vx_pin test;
    vx_pin cmrom[2];        /* CMROM0, CMROM1 */
    vx_pin cmram[4];
    vx_pin clk1, clk2;
    vx_pin stp, stpa;
    vx_pin intn, inta;
    vx_pin cy_pin;
    vx_pin vdd, vdd1, vdd2, vss;

    vx_timer cycle_timer;

    /* CPU state */
    uint16_t pc;
    uint8_t  acc;
    bool     cy;
    uint8_t  reg[24];       /* 3 banks × 8 regs (R8..R15 shared); see [M40] p. 1-11 */
    uint8_t  bank;          /* 0 (SB0) or 1 (SB1) — index-bank FF */
    uint16_t stack[7];      /* 7-deep PC stack ([M40] p. 1-12) */
    uint8_t  sp;
    uint8_t  cmram_select;
    uint8_t  rom_bank;      /* 0 or 1 — set by DB0/DB1 */
    bool     iff_enable;    /* interrupt enable (set by EIN, cleared by RESET/DIN/INTA) */

    /* Bus-level state */
    int      phase;
    uint8_t  opcode;
    bool     reset_active;
    bool     driving_d;

    /* Latched control inputs — sampled at M2 per [M40] pp. 1-12, 1-13 */
    bool     stp_latched;
    bool     int_latched;
    bool     stop_ff;       /* set at X3 after STP latched at M2 */
    bool     halt_ff;
    bool     inta_ff;
} cpu_t;

static cpu_t G;

/* ─── D-bus helpers (identical to 4004) ─────────────────────────────────── */
static void drive_d(uint8_t nibble) {
    for (int i = 0; i < 4; i++) {
        vx_pin_set_mode(G.dpin[i], VX_OUTPUT);
        vx_pin_write(G.dpin[i], (nibble >> i) & 1);
    }
    G.driving_d = true;
}
static void release_d(void) {
    if (!G.driving_d) return;
    for (int i = 0; i < 4; i++) vx_pin_set_mode(G.dpin[i], VX_INPUT);
    G.driving_d = false;
}
static uint8_t read_d(void) {
    uint8_t v = 0;
    for (int i = 0; i < 4; i++) if (vx_pin_read(G.dpin[i])) v |= (1u << i);
    return v;
}

/* ─── Reset ──────────────────────────────────────────────────────────────── */
static void reset_state(void) {
    G.pc = 0;
    G.acc = 0;
    G.cy = false;
    memset(G.reg, 0, sizeof G.reg);
    memset(G.stack, 0, sizeof G.stack);
    G.sp = 0;
    G.cmram_select = 0;
    G.rom_bank = 0;
    G.bank = 0;
    G.iff_enable = false;     /* [M40] p. 1-13: RESET clears interrupt enable */
    G.phase = 0;
    G.opcode = 0;
    G.stp_latched = false;
    G.int_latched = false;
    G.stop_ff = false;
    G.halt_ff = false;
    G.inta_ff = false;

    vx_pin_write(G.sync, 0);
    vx_pin_write(G.cmrom[0], 0);
    vx_pin_write(G.cmrom[1], 0);
    for (int i = 0; i < 4; i++) vx_pin_write(G.cmram[i], 0);
    vx_pin_write(G.stpa, 0);
    vx_pin_write(G.inta, 0);
    vx_pin_write(G.cy_pin, 0);
    release_d();
}

/* ─── Active CMROM line based on rom_bank (DB0/DB1) ─────────────────────── */
static vx_pin active_cmrom(void) {
    return G.cmrom[G.rom_bank & 1];
}

/* ─── Per-phase action ───────────────────────────────────────────────────── */
static void on_phase(void* user_data) {
    (void)user_data;
    if (G.reset_active) return;

    /* If we're in STOP mode the chip executes NOPs internally but the
       clock keeps cycling and SYNC continues to pulse ([M40] p. 1-10).
       We model this by skipping CPU-state mutation but still walking
       the bus phases so observable signals (SYNC, CMROM) keep cycling. */

    if (G.phase == PHASE_A1) {
        /* Deassert any CMROM line that was held during M1+M2 of the
           previous cycle. */
        vx_pin_write(G.cmrom[0], 0);
        vx_pin_write(G.cmrom[1], 0);
    }

    switch (G.phase) {
        case PHASE_A1:
            drive_d(G.pc & 0xF);
            vx_pin_write(G.sync, 1);
            break;
        case PHASE_A2:
            vx_pin_write(G.sync, 0);
            drive_d((G.pc >> 4) & 0xF);
            break;
        case PHASE_A3:
            drive_d((G.pc >> 8) & 0xF);
            break;
        case PHASE_M1:
            release_d();
            vx_pin_write(active_cmrom(), 1);
            G.opcode = (read_d() & 0xF) << 4;
            break;
        case PHASE_M2:
            G.opcode |= read_d() & 0xF;
            /* Latch STP and INT at M2 ([M40] p. 1-10, p. 1-12).
               STP wins over INT when both are asserted ([M40] p. 1-13). */
            G.stp_latched = vx_pin_read(G.stp) ? true : false;
            G.int_latched = (G.iff_enable && !G.stp_latched && !G.inta_ff
                             && vx_pin_read(G.intn)) ? true : false;
            break;
        case PHASE_X1:
            /* CY output reflects the carry/link FF; per [M40] p. 1-6
               "updated at X1". */
            vx_pin_write(G.cy_pin, G.cy ? 1 : 0);
            break;
        case PHASE_X2:
            break;
        case PHASE_X3:
            /* End-of-cycle: act on latched control signals.
               [M40] p. 1-10: STOP FF set at X3 if STP was latched at M2. */
            if (G.stp_latched) {
                G.stop_ff = true;
                vx_pin_write(G.stpa, 1);
            } else if (!G.stop_ff) {
                /* Resume from STOP: STP=0 latched at M2 → STOP FF reset
                   at X3. [M40] p. 1-10: "Normal processor operation
                   resumes at instruction cycle N+1." */
                vx_pin_write(G.stpa, 0);
            }

            if (G.int_latched && !G.stop_ff) {
                /* Forced JMS to page 0, location 3. [M40] p. 1-12 */
                if (G.sp < 7) G.stack[G.sp++] = G.pc;
                G.pc = 0x003;
                G.iff_enable = false;
                G.inta_ff = true;
                vx_pin_write(G.inta, 1);
            } else if (!G.stop_ff) {
                /* Normal NOP-equivalent: advance PC. */
                G.pc = (G.pc + 1) & 0xFFF;
            }
            G.stp_latched = false;
            G.int_latched = false;
            break;
    }

    G.phase = (G.phase + 1) & 7;
}

/* ─── RESET pin watch ────────────────────────────────────────────────────── */
static void on_reset(void* user_data, vx_pin pin, int value) {
    (void)user_data; (void)pin;
    if (value) {
        G.reset_active = true;
        reset_state();
    } else {
        G.reset_active = false;
    }
}

/* ─── Setup ──────────────────────────────────────────────────────────────── */
void chip_setup(void) {
    char name[6];

    for (int i = 0; i < 4; i++) {
        name[0]='D'; name[1]='0'+i; name[2]=0;
        G.dpin[i] = vx_pin_register(name, VX_INPUT);
    }
    G.sync     = vx_pin_register("SYNC",   VX_OUTPUT_LOW);
    G.reset    = vx_pin_register("RESET",  VX_INPUT);
    G.test     = vx_pin_register("TEST",   VX_INPUT);
    G.cmrom[0] = vx_pin_register("CMROM0", VX_OUTPUT_LOW);
    G.cmrom[1] = vx_pin_register("CMROM1", VX_OUTPUT_LOW);
    G.cmram[0] = vx_pin_register("CMRAM0", VX_OUTPUT_LOW);
    G.cmram[1] = vx_pin_register("CMRAM1", VX_OUTPUT_LOW);
    G.cmram[2] = vx_pin_register("CMRAM2", VX_OUTPUT_LOW);
    G.cmram[3] = vx_pin_register("CMRAM3", VX_OUTPUT_LOW);
    G.clk1     = vx_pin_register("CLK1",   VX_INPUT);
    G.clk2     = vx_pin_register("CLK2",   VX_INPUT);
    G.stp      = vx_pin_register("STP",    VX_INPUT);
    G.stpa     = vx_pin_register("STPA",   VX_OUTPUT_LOW);
    G.intn     = vx_pin_register("INT",    VX_INPUT);
    G.inta     = vx_pin_register("INTA",   VX_OUTPUT_LOW);
    G.cy_pin   = vx_pin_register("CY",     VX_OUTPUT_LOW);
    G.vdd      = vx_pin_register("VDD",    VX_INPUT);
    G.vdd1     = vx_pin_register("VDD1",   VX_INPUT);
    G.vdd2     = vx_pin_register("VDD2",   VX_INPUT);
    G.vss      = vx_pin_register("VSS",    VX_INPUT);

    reset_state();
    G.reset_active = false;

    vx_pin_watch(G.reset, VX_EDGE_BOTH, on_reset, 0);

    /* Same nominal clock as 4004: 740 kHz → ~1351 ns per phase. */
    G.cycle_timer = vx_timer_create(on_phase, 0);
    vx_timer_start(G.cycle_timer, 1351, true);
}
