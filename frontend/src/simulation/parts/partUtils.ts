/**
 * partUtils.ts — Shared simulation helpers
 *
 * Provides ADC voltage injection utilities used by both ComplexParts and
 * SensorParts, supporting both AVR (ATmega328p) and RP2040 boards.
 */

import type { AnySimulator } from './PartSimulationRegistry';
import { RP2040Simulator } from '../RP2040Simulator';
import { useSimulatorStore } from '../../store/useSimulatorStore';

/**
 * Mirror a live DOM / sensor-panel value into the component's store properties
 * so SPICE's netlist memo invalidates and the next `maybeSolve()` picks up the
 * change. Without this, dragging a potentiometer, pressing a button, or moving
 * a sensor slider updates the ADC but leaves the SPICE netlist stale, so any
 * analog circuit driven by the input (comparators, op-amp networks, divider
 * bridges) freezes at the first `.op` solve.
 *
 * Idempotent — no-op when the value hasn't changed since the previous sync.
 */
export function syncStoreProperty(componentId: string, propName: string, value: unknown): void {
    const store = useSimulatorStore.getState();
    const comp = store.components.find((c) => c.id === componentId);
    if (!comp) return;
    const prev = comp.properties?.[propName];
    if (String(prev) === String(value)) return;
    store.updateComponent(componentId, {
        properties: { ...comp.properties, [propName]: value },
    });
}

/** Read the ADC instance from the simulator (returns null if not initialized) */
export function getADC(avrSimulator: AnySimulator): any | null {
    return (avrSimulator as any).getADC?.() ?? null;
}

/**
 * Write an analog voltage to an ADC channel, supporting AVR, RP2040, and ESP32.
 *
 * AVR:    pins 14-19 → ADC channels 0-5, voltage stored directly (0-5V)
 * RP2040: GPIO 26-29 → ADC channels 0-3, converted to 12-bit value (0-4095)
 * ESP32:  GPIO 32-39 → ADC1 channels 4-11, sent via WebSocket bridge
 *
 * Returns true if the voltage was successfully injected.
 */
export function setAdcVoltage(simulator: AnySimulator, pin: number, voltage: number): boolean {
    // ESP32 BridgeShim: delegate to bridge via WebSocket
    if (typeof (simulator as any).setAdcVoltage === 'function') {
        return (simulator as any).setAdcVoltage(pin, voltage);
    }
    // RP2040: GPIO26-29 → ADC channels 0-3
    if (simulator instanceof RP2040Simulator) {
        if (pin >= 26 && pin <= 29) {
            const channel = pin - 26;
            // RP2040 ADC: 12-bit, 3.3V reference
            const adcValue = Math.round((voltage / 3.3) * 4095);
            simulator.setADCValue(channel, adcValue);
            return true;
        }
        console.warn(`[setAdcVoltage] RP2040 pin ${pin} is not an ADC pin (26-29)`);
        return false;
    }
    // AVR: pins 14-19 → ADC channels 0-5
    if (pin < 14 || pin > 19) return false;
    const channel = pin - 14;
    const adc = getADC(simulator);
    if (!adc) return false;
    adc.channelValues[channel] = voltage;
    return true;
}
