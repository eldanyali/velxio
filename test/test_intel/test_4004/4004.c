/*
 * Intel 4004 emulator — clean-room implementation as a velxio custom chip.
 *
 * Sources (in autosearch/pdfs/):
 *   [M4]  Intel MCS-4 User's Manual (Feb 1973)
 *   [M40] Intel MCS-40 User's Manual (Nov 1974) — Ch. 1 cross-checks 4004.
 * See autosearch/12_4004_authoritative_spec.md for citations.
 *
 * Architecture distinct from 8080/Z80: the 4-bit data bus D0..D3 is
 * MULTIPLEXED across an 8-cycle frame of the external two-phase clock.
 * Each frame walks through the phases A1, A2, A3, M1, M2, X1, X2, X3
 * carrying — in order — three address nibbles, two opcode nibbles, and
 * three execution nibbles ([M4] Fig. 2 p. 6).
 *
 * Implementation model: ONE timer fire = ONE clock phase. A phase
 * counter cycles 0..7. Tests in test_4004/4004.test.js drive simulated
 * time via `board.advanceNanos(CLOCK_NS)` once per phase.
 *
 * Scope of this implementation:
 *   - Pin contract (16-pin DIP per [M4] §III)
 *   - 8-phase frame with SYNC pulse at A1 + low-nibble-first 12-bit addr
 *   - CMROM strobe during M1 (per [M4] Fig. 4 — also per all four
 *     reference emulators surveyed in autosearch/14)
 *   - PC increments at end of every cycle (NOP-equivalent default)
 *
 * Out of scope (deferred to a follow-up that promotes it.todo opcode
 * tests):
 *   - Full 46-instruction ISA. The chip currently treats every fetched
 *     opcode as NOP. Adding LDM/ADD/JCN/FIM/JMS/BBL/etc. is a separate
 *     task once the bus skeleton is validated.
 *   - SRC bank-select latching (CMRAMᵢ strobing during X2/X3)
 *   - I/O instructions (WRM/RDM/WRR/etc.)
 *   - DCL command-control register
 */
#include "velxio-chip.h"
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

/* 4004 internal phase numbering. The names match [M4] Fig. 2. */
typedef enum {
    PHASE_A1 = 0, PHASE_A2, PHASE_A3,
    PHASE_M1, PHASE_M2,
    PHASE_X1, PHASE_X2, PHASE_X3,
} phase_t;

typedef struct {
    /* Pin handles */
    vx_pin dpin[4];
    vx_pin sync;
    vx_pin reset;
    vx_pin test;
    vx_pin cmrom;
    vx_pin cmram[4];
    vx_pin clk1, clk2;
    vx_pin vdd, vss;

    vx_timer cycle_timer;

    /* CPU state — names per [M4] §III */
    uint16_t pc;            /* 12-bit program counter */
    uint8_t  acc;           /* 4-bit accumulator */
    bool     cy;            /* carry/link flip-flop */
    uint8_t  reg[16];       /* 16 × 4-bit index registers */
    uint16_t stack[3];      /* 3-deep PC stack ([M4] p. 7, p. 13) */
    uint8_t  sp;            /* points at next-free slot 0..3 */
    uint8_t  cmram_select;  /* 1-of-4 active CMRAMᵢ; 0 after RESET */

    /* Bus-level state */
    int      phase;         /* 0..7 within the current 8-phase frame */
    uint8_t  opcode;        /* assembled OPR (high) | OPA (low) over M1+M2 */
    bool     reset_active;
    bool     driving_d;     /* true iff D pins currently in OUTPUT mode */
} cpu_t;

static cpu_t G;

/* ─── D-bus helpers ──────────────────────────────────────────────────────── */
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
    /* [M4] §III.A.5 p. 9 — after RESET held ≥ 64 clocks all FFs and regs
       are cleared, CMRAM0 selected, condition FF=0. */
    G.pc  = 0;
    G.acc = 0;
    G.cy  = false;
    memset(G.reg, 0, sizeof G.reg);
    memset(G.stack, 0, sizeof G.stack);
    G.sp  = 0;
    G.cmram_select = 0;
    G.phase = 0;
    G.opcode = 0;

    vx_pin_write(G.sync, 0);
    vx_pin_write(G.cmrom, 0);
    for (int i = 0; i < 4; i++) vx_pin_write(G.cmram[i], 0);
    release_d();
}

/* ─── Per-phase action ───────────────────────────────────────────────────── */
static void on_phase(void* user_data) {
    (void)user_data;
    if (G.reset_active) return;

    /* On entering a new cycle, deassert CMROM that may have been left
       asserted during M1+M2 of the previous cycle. */
    if (G.phase == PHASE_A1) {
        vx_pin_write(G.cmrom, 0);
    }

    switch (G.phase) {
        case PHASE_A1:
            drive_d(G.pc & 0xF);            /* low nibble first ([M4] Fig. 2) */
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
            vx_pin_write(G.cmrom, 1);       /* request opcode from selected ROM */
            G.opcode = (read_d() & 0xF) << 4;  /* OPR */
            break;
        case PHASE_M2:
            G.opcode |= read_d() & 0xF;     /* OPA */
            break;
        case PHASE_X1:
            /* idle on bus for most opcodes */
            break;
        case PHASE_X2:
            /* SRC: chip-select address; I/O reads: ROM/RAM drives ACC.
               For this minimal implementation (NOP-only), idle. */
            break;
        case PHASE_X3:
            /* End of cycle: advance PC. Real 4004 may have advanced
               earlier on JMP-class ops; for NOP this is the model. */
            G.pc = (G.pc + 1) & 0xFFF;
            break;
    }

    G.phase = (G.phase + 1) & 7;
}

/* ─── Reset pin watch ────────────────────────────────────────────────────── */
static void on_reset(void* user_data, vx_pin pin, int value) {
    (void)user_data; (void)pin;
    /* [M4] p. 9: a logic-1 RESET clears state. In our digital model
       "logic 1" maps to true. */
    if (value) {
        G.reset_active = true;
        reset_state();
    } else {
        G.reset_active = false;
    }
}

/* ─── Setup ──────────────────────────────────────────────────────────────── */
void chip_setup(void) {
    char name[5];

    for (int i = 0; i < 4; i++) {
        name[0]='D'; name[1]='0'+i; name[2]=0;
        G.dpin[i] = vx_pin_register(name, VX_INPUT);
    }
    G.sync   = vx_pin_register("SYNC",  VX_OUTPUT_LOW);
    G.reset  = vx_pin_register("RESET", VX_INPUT);
    G.test   = vx_pin_register("TEST",  VX_INPUT);
    G.cmrom  = vx_pin_register("CMROM", VX_OUTPUT_LOW);
    G.cmram[0] = vx_pin_register("CMRAM0", VX_OUTPUT_LOW);
    G.cmram[1] = vx_pin_register("CMRAM1", VX_OUTPUT_LOW);
    G.cmram[2] = vx_pin_register("CMRAM2", VX_OUTPUT_LOW);
    G.cmram[3] = vx_pin_register("CMRAM3", VX_OUTPUT_LOW);
    G.clk1   = vx_pin_register("CLK1",  VX_INPUT);
    G.clk2   = vx_pin_register("CLK2",  VX_INPUT);
    G.vdd    = vx_pin_register("VDD",   VX_INPUT);
    G.vss    = vx_pin_register("VSS",   VX_INPUT);

    reset_state();
    G.reset_active = false;

    vx_pin_watch(G.reset, VX_EDGE_BOTH, on_reset, 0);

    /* Timer fires once per CLK1 phase. The 4004's nominal clock is
       740 kHz → ~1351 ns per phase. We round to 1351 ns; tests pass
       a CLOCK_NS that matches. */
    G.cycle_timer = vx_timer_create(on_phase, 0);
    vx_timer_start(G.cycle_timer, 1351, true);
}
