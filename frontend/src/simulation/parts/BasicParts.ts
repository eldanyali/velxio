import { PartSimulationRegistry } from './PartSimulationRegistry';
import type { AVRSimulator } from '../AVRSimulator';

/**
 * Basic Pushbutton implementation (full-size)
 */
PartSimulationRegistry.register('pushbutton', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        const arduinoPin =
            getArduinoPinHelper('1.l') ?? getArduinoPinHelper('2.l') ??
            getArduinoPinHelper('1.r') ?? getArduinoPinHelper('2.r');

        if (arduinoPin === null) return () => { };

        const onButtonPress = () => {
            avrSimulator.setPinState(arduinoPin, false); // Active LOW
            (element as any).pressed = true;
        };
        const onButtonRelease = () => {
            avrSimulator.setPinState(arduinoPin, true);
            (element as any).pressed = false;
        };

        element.addEventListener('button-press', onButtonPress);
        element.addEventListener('button-release', onButtonRelease);
        return () => {
            element.removeEventListener('button-press', onButtonPress);
            element.removeEventListener('button-release', onButtonRelease);
        };
    },
});

/**
 * 6mm Pushbutton — same behaviour as the full-size pushbutton
 */
PartSimulationRegistry.register('pushbutton-6mm', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        const arduinoPin =
            getArduinoPinHelper('1.l') ?? getArduinoPinHelper('2.l') ??
            getArduinoPinHelper('1.r') ?? getArduinoPinHelper('2.r');

        if (arduinoPin === null) return () => { };

        const onPress = () => {
            avrSimulator.setPinState(arduinoPin, false);
            (element as any).pressed = true;
        };
        const onRelease = () => {
            avrSimulator.setPinState(arduinoPin, true);
            (element as any).pressed = false;
        };

        element.addEventListener('button-press', onPress);
        element.addEventListener('button-release', onRelease);
        return () => {
            element.removeEventListener('button-press', onPress);
            element.removeEventListener('button-release', onRelease);
        };
    },
});

/**
 * Slide Switch — toggles between HIGH and LOW on each click
 */
PartSimulationRegistry.register('slide-switch', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        // Slide switch has pins: 1, 2, 3 — middle pin (2) is the common output
        const arduinoPin = getArduinoPinHelper('2') ?? getArduinoPinHelper('1');
        if (arduinoPin === null) return () => { };

        // Read initial value from element (0 or 1)
        let state = (element as any).value === 1;
        avrSimulator.setPinState(arduinoPin, state);

        const onChange = () => {
            state = (element as any).value === 1;
            avrSimulator.setPinState(arduinoPin, state);
            console.log(`[SlideSwitch] pin ${arduinoPin} → ${state ? 'HIGH' : 'LOW'}`);
        };

        element.addEventListener('change', onChange);
        // The slide-switch element fires a 'change' event when clicked
        element.addEventListener('input', onChange);
        return () => {
            element.removeEventListener('change', onChange);
            element.removeEventListener('input', onChange);
        };
    },
});

/**
 * DIP Switch 8 — 8 independent toggle switches
 * Pin layout: 1A-8A on one side, 1B-8B on the other
 */
PartSimulationRegistry.register('dip-switch-8', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        // Each switch i has pins (i+1)A and (i+1)B; we use the A side as output
        const pins: (number | null)[] = [];
        for (let i = 1; i <= 8; i++) {
            pins.push(getArduinoPinHelper(`${i}A`) ?? getArduinoPinHelper(`${i}a`));
        }

        // Sync initial states
        const values: number[] = (element as any).values || new Array(8).fill(0);
        pins.forEach((pin, i) => {
            if (pin !== null) avrSimulator.setPinState(pin, values[i] === 1);
        });

        const onChange = () => {
            const newValues: number[] = (element as any).values || new Array(8).fill(0);
            pins.forEach((pin, i) => {
                if (pin !== null) {
                    const state = newValues[i] === 1;
                    avrSimulator.setPinState(pin, state);
                }
            });
        };

        element.addEventListener('change', onChange);
        element.addEventListener('input', onChange);
        return () => {
            element.removeEventListener('change', onChange);
            element.removeEventListener('input', onChange);
        };
    },
});

/**
 * Basic LED implementation
 */
PartSimulationRegistry.register('led', {
    onPinStateChange: (pinName, state, element) => {
        if (pinName === 'A') { // Anode
            (element as any).value = state;
        }
    }
});

/**
 * LED Bar Graph — 10 LEDs, each driven by one pin
 * Wokwi pin names: A1-A10
 */
PartSimulationRegistry.register('led-bar-graph', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        const pinManager = (avrSimulator as any).pinManager;
        if (!pinManager) return () => { };

        const values = new Array(10).fill(0);
        const unsubscribers: (() => void)[] = [];

        for (let i = 1; i <= 10; i++) {
            const pin = getArduinoPinHelper(`A${i}`);
            if (pin !== null) {
                const idx = i - 1;
                unsubscribers.push(
                    pinManager.onPinChange(pin, (_p: number, state: boolean) => {
                        values[idx] = state ? 1 : 0;
                        (element as any).values = [...values];
                    })
                );
            }
        }

        return () => unsubscribers.forEach(u => u());
    },
});

/**
 * 7-Segment Display
 * Pins: A, B, C, D, E, F, G, DP (common cathode — segments light when HIGH)
 * The wokwi-7segment 'values' property is an array of 8 values (A B C D E F G DP)
 */
PartSimulationRegistry.register('7segment', {
    attachEvents: (element, avrSimulator, getArduinoPinHelper) => {
        const pinManager = (avrSimulator as any).pinManager;
        if (!pinManager) return () => { };

        // Order matches wokwi-elements values array: [A, B, C, D, E, F, G, DP]
        const segmentPinNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
        const values = new Array(8).fill(0);
        const unsubscribers: (() => void)[] = [];

        segmentPinNames.forEach((segName, idx) => {
            const pin = getArduinoPinHelper(segName);
            if (pin !== null) {
                unsubscribers.push(
                    pinManager.onPinChange(pin, (_p: number, state: boolean) => {
                        values[idx] = state ? 1 : 0;
                        (element as any).values = [...values];
                    })
                );
            }
        });

        return () => unsubscribers.forEach(u => u());
    },
});
