#ifndef VELXIO_COMPAT_H
#define VELXIO_COMPAT_H

// Compatibility shims for sketches written against arduino-esp32 3.x running
// on the toolchain pinned to 2.0.17. Only kept until we bump the toolchain.
//
// ledcAttach / ledcAttachChannel were added in 3.x. Map them onto the 2.x
// ledcSetup + ledcAttachPin pair so the sketch compiles unchanged.

#if defined(ARDUINO_ARCH_ESP32) && !defined(ledcAttach)
#include "Arduino.h"

static inline bool ledcAttach(uint8_t pin, uint32_t freq, uint8_t resolution) {
    static uint8_t _velxio_next_channel = 0;
    if (_velxio_next_channel >= 16) return false;
    uint8_t ch = _velxio_next_channel++;
    ledcSetup(ch, freq, resolution);
    ledcAttachPin(pin, ch);
    return true;
}

static inline bool ledcAttachChannel(uint8_t pin, uint32_t freq, uint8_t resolution, uint8_t channel) {
    if (channel >= 16) return false;
    ledcSetup(channel, freq, resolution);
    ledcAttachPin(pin, channel);
    return true;
}
#endif

#endif // VELXIO_COMPAT_H
