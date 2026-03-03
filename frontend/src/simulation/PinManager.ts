/**
 * PinManager - Manages Arduino pin states and notifies listeners
 *
 * Maps AVR PORT registers to Arduino pin numbers:
 * - PORTB (0x25) → Digital pins 8-13
 * - PORTC (0x28) → Analog pins A0-A5 (14-19)
 * - PORTD (0x2B) → Digital pins 0-7
 */

export type PinState = boolean;
export type PinChangeCallback = (pin: number, state: PinState) => void;

export class PinManager {
  private listeners: Map<number, Set<PinChangeCallback>> = new Map();
  private pinStates: Map<number, boolean> = new Map();

  /**
   * Register callback for pin state changes
   * Returns unsubscribe function
   * Note: Does NOT call callback immediately to avoid infinite loops
   */
  onPinChange(arduinoPin: number, callback: PinChangeCallback): () => void {
    if (!this.listeners.has(arduinoPin)) {
      this.listeners.set(arduinoPin, new Set());
    }
    this.listeners.get(arduinoPin)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(arduinoPin)?.delete(callback);
    };
  }

  /**
   * Update port register and notify listeners
   */
  updatePort(portName: 'PORTB' | 'PORTC' | 'PORTD', newValue: number, oldValue: number = 0) {
    // Map AVR ports to Arduino pin numbers
    const pinOffset = {
      'PORTB': 8,   // PORTB0-7 → Arduino D8-D13 (only D8-D13 are used)
      'PORTC': 14,  // PORTC0-5 → Arduino A0-A5 (14-19)
      'PORTD': 0,   // PORTD0-7 → Arduino D0-D7
    }[portName];

    // Check each bit
    for (let bit = 0; bit < 8; bit++) {
      const mask = 1 << bit;
      const oldState = (oldValue & mask) !== 0;
      const newState = (newValue & mask) !== 0;

      if (oldState !== newState) {
        const arduinoPin = pinOffset + bit;

        // Update internal state
        this.pinStates.set(arduinoPin, newState);

        // Notify listeners
        const callbacks = this.listeners.get(arduinoPin);
        if (callbacks) {
          callbacks.forEach(cb => cb(arduinoPin, newState));
        }

        console.log(`Pin ${arduinoPin} (${portName}${bit}): ${oldState ? 'HIGH' : 'LOW'} → ${newState ? 'HIGH' : 'LOW'}`);
      }
    }
  }

  /**
   * Get current state of a pin
   */
  getPinState(arduinoPin: number): boolean {
    return this.pinStates.get(arduinoPin) || false;
  }

  /**
   * Get all listeners count (for debugging)
   */
  getListenersCount(): number {
    let count = 0;
    this.listeners.forEach(set => count += set.size);
    return count;
  }

  /**
   * Clear all listeners
   */
  clearAllListeners() {
    this.listeners.clear();
  }
}
