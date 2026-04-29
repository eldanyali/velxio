"""Reference SSD168x SPI decoder — pure Python, no QEMU, no DOM.

This is the **specification** the Velxio frontend emulator must match.
It exists alongside the actual TS implementation so we can:

  1. Validate the SPI command set against published datasheets without
     spinning up Vite / Vitest / a browser.
  2. Drive the same byte streams through this decoder and the future TS
     decoder and assert the resulting framebuffers are identical.
  3. Catch SSD1681 / SSD1675 / SSD1680 / SSD1683 quirks early — every
     panel that uses a SSD168x part funnels through this one decoder.

The decoder is intentionally minimal: it consumes the bytes the
GxEPD2 / Adafruit_EPD libraries emit, builds a 1-bit-per-pixel
framebuffer, and exposes ``flush()`` to capture the latched image when
the firmware sends 0x20 ACTIVATE.

References:
  - SSD1681 datasheet (Adafruit mirror):
    https://cdn-learn.adafruit.com/assets/assets/000/099/573/original/SSD1681.pdf
  - ESP-BSP command header:
    https://github.com/espressif/esp-bsp/blob/master/components/lcd/esp_lcd_ssd1681/esp_lcd_ssd1681_commands.h
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional


# ── Command opcodes (SSD1681; SSD1675/1680/1683 share these) ─────────────────

CMD_DRIVER_OUTPUT_CTRL    = 0x01
CMD_GATE_DRIVING_VOLTAGE  = 0x03
CMD_SOURCE_DRIVING_VOLT   = 0x04
CMD_DEEP_SLEEP            = 0x10
CMD_DATA_ENTRY_MODE       = 0x11
CMD_SW_RESET              = 0x12
CMD_TEMP_SENSOR           = 0x18
CMD_MASTER_ACTIVATION     = 0x20
CMD_DISP_UPDATE_CTRL_1    = 0x21
CMD_DISP_UPDATE_CTRL_2    = 0x22
CMD_WRITE_BLACK_VRAM      = 0x24
CMD_WRITE_RED_VRAM        = 0x26
CMD_WRITE_VCOM_REG        = 0x2C
CMD_WRITE_LUT             = 0x32
CMD_BORDER_WAVEFORM       = 0x3C
CMD_END_OPTION            = 0x3F
CMD_SET_RAMX_RANGE        = 0x44
CMD_SET_RAMY_RANGE        = 0x45
CMD_SET_RAMX_COUNTER      = 0x4E
CMD_SET_RAMY_COUNTER      = 0x4F


# ── Framebuffer model ────────────────────────────────────────────────────────

@dataclass
class Frame:
    """Composed B/W (and optionally red) frame, ready to render.

    ``pixels`` is a list of ints, one per pixel, in the panel-native
    palette: 0 = black, 1 = white, 2 = red (only when red plane was
    written). Length is always ``width * height``.
    """
    width: int
    height: int
    pixels: List[int]


# ── Decoder ──────────────────────────────────────────────────────────────────

@dataclass
class SSD168xDecoder:
    """SPI-byte stream → latched framebuffer.

    Usage:
        d = SSD168xDecoder(width=200, height=200)
        for byte, dc in spi_trace:        # dc=False (LOW) for cmd, True for data
            d.feed(byte, dc)
        # When the firmware sends 0x20 ACTIVATE, on_flush is invoked.
    """
    width: int
    height: int
    on_flush: Optional[Callable[[Frame], None]] = None

    # Internal state
    bw_ram: bytearray = field(init=False)
    red_ram: bytearray = field(init=False)
    _current_cmd: int = -1
    _params: List[int] = field(default_factory=list)
    _ram_target: str = "bw"           # 'bw' or 'red' — which plane we're writing
    _x_byte: int = 0                   # current X position (in bytes — 8 px/byte)
    _y: int = 0                        # current Y position (scanline)
    _xrange: tuple = (0, 0)            # (start_byte, end_byte)
    _yrange: tuple = (0, 0)            # (start_y, end_y)
    _entry_mode: int = 0x03            # x+ y+ x-first (default for most drivers)
    refreshed_count: int = 0           # how many MASTER_ACTIVATIONs we've seen
    unknown_cmds: List[int] = field(default_factory=list)
    in_deep_sleep: bool = False

    def __post_init__(self) -> None:
        bytes_per_row = (self.width + 7) // 8
        self.bw_ram = bytearray([0xFF] * (bytes_per_row * self.height))   # white
        self.red_ram = bytearray([0x00] * (bytes_per_row * self.height))  # no red
        self._xrange = (0, bytes_per_row - 1)
        self._yrange = (0, self.height - 1)

    # ── Public API ─────────────────────────────────────────────────────

    def feed(self, byte: int, dc_high: bool) -> None:
        """Process one SPI byte. ``dc_high`` mirrors the DC pin (False = command)."""
        if not dc_high:
            self._begin_command(byte)
        else:
            self._handle_data(byte)

    def reset(self) -> None:
        """Clear all state — equivalent to a hardware RST low pulse."""
        bytes_per_row = (self.width + 7) // 8
        self.bw_ram = bytearray([0xFF] * (bytes_per_row * self.height))
        self.red_ram = bytearray([0x00] * (bytes_per_row * self.height))
        self._current_cmd = -1
        self._params = []
        self._ram_target = "bw"
        self._x_byte = 0
        self._y = 0
        self.in_deep_sleep = False

    def compose_frame(self) -> Frame:
        """Build a Frame from the latched RAM planes (red wins over black)."""
        bytes_per_row = (self.width + 7) // 8
        pixels: List[int] = [0] * (self.width * self.height)
        for y in range(self.height):
            for xb in range(bytes_per_row):
                b_byte = self.bw_ram[y * bytes_per_row + xb]
                r_byte = self.red_ram[y * bytes_per_row + xb]
                for bit in range(8):
                    x = xb * 8 + bit
                    if x >= self.width:
                        break
                    mask = 0x80 >> bit
                    is_red = bool(r_byte & mask)
                    is_white = bool(b_byte & mask)
                    pixels[y * self.width + x] = 2 if is_red else (1 if is_white else 0)
        return Frame(self.width, self.height, pixels)

    # ── Internal: command / data dispatch ──────────────────────────────

    def _begin_command(self, cmd: int) -> None:
        self._current_cmd = cmd
        self._params = []

        if cmd == CMD_SW_RESET:
            self.reset()
            return
        if cmd == CMD_MASTER_ACTIVATION:
            self.refreshed_count += 1
            frame = self.compose_frame()
            if self.on_flush:
                self.on_flush(frame)
            return
        if cmd == CMD_WRITE_BLACK_VRAM:
            self._ram_target = "bw"
            return
        if cmd == CMD_WRITE_RED_VRAM:
            self._ram_target = "red"
            return
        if cmd in (
            # Known commands that consume data — handled in _handle_data.
            CMD_DRIVER_OUTPUT_CTRL, CMD_GATE_DRIVING_VOLTAGE,
            CMD_SOURCE_DRIVING_VOLT, CMD_DEEP_SLEEP, CMD_DATA_ENTRY_MODE,
            CMD_TEMP_SENSOR, CMD_DISP_UPDATE_CTRL_1, CMD_DISP_UPDATE_CTRL_2,
            CMD_WRITE_VCOM_REG, CMD_WRITE_LUT, CMD_BORDER_WAVEFORM,
            CMD_END_OPTION, CMD_SET_RAMX_RANGE, CMD_SET_RAMY_RANGE,
            CMD_SET_RAMX_COUNTER, CMD_SET_RAMY_COUNTER,
        ):
            return
        # Anything else: log and silently consume so init flows complete.
        self.unknown_cmds.append(cmd)

    def _handle_data(self, byte: int) -> None:
        cmd = self._current_cmd
        params = self._params
        params.append(byte)

        if cmd == CMD_DEEP_SLEEP and len(params) == 1:
            self.in_deep_sleep = byte != 0
        elif cmd == CMD_DATA_ENTRY_MODE and len(params) == 1:
            self._entry_mode = byte
        elif cmd == CMD_SET_RAMX_RANGE and len(params) == 2:
            self._xrange = (params[0], params[1])
            self._x_byte = params[0]
        elif cmd == CMD_SET_RAMY_RANGE and len(params) == 4:
            self._yrange = (params[0] | (params[1] << 8),
                            params[2] | (params[3] << 8))
            self._y = self._yrange[0]
        elif cmd == CMD_SET_RAMX_COUNTER and len(params) == 1:
            self._x_byte = byte
        elif cmd == CMD_SET_RAMY_COUNTER and len(params) == 2:
            self._y = params[0] | (params[1] << 8)
        elif cmd == CMD_WRITE_BLACK_VRAM:
            self._write_ram_byte(self.bw_ram, byte)
        elif cmd == CMD_WRITE_RED_VRAM:
            self._write_ram_byte(self.red_ram, byte)
        # Other commands silently buffer their parameters.

    def _write_ram_byte(self, plane: bytearray, byte: int) -> None:
        bytes_per_row = (self.width + 7) // 8
        if 0 <= self._x_byte < bytes_per_row and 0 <= self._y < self.height:
            plane[self._y * bytes_per_row + self._x_byte] = byte
        # Auto-increment per data_entry_mode (default x+, then y+ at end of row).
        x_inc = (self._entry_mode & 0x01) == 0x01    # bit0: 1 = X+
        # entry_mode bit1: Y direction; bit2: which counter advances first.
        # For the default 0x03, X advances; once it hits xrange[1], wrap and Y++.
        if x_inc:
            if self._x_byte < self._xrange[1]:
                self._x_byte += 1
            else:
                self._x_byte = self._xrange[0]
                self._y += 1
        else:
            if self._x_byte > self._xrange[0]:
                self._x_byte -= 1
            else:
                self._x_byte = self._xrange[1]
                self._y += 1
