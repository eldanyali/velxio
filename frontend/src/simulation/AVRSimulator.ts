import { CPU, AVRTimer, timer0Config, AVRUSART, usart0Config, AVRIOPort, portBConfig, portCConfig, portDConfig } from 'avr8js';
import { PinManager } from './PinManager';
import { hexToUint8Array } from '../utils/hexParser';

/**
 * AVRSimulator - Emulates Arduino Uno (ATmega328p) using avr8js
 *
 * Features:
 * - CPU emulation at 16MHz
 * - Timer0 support
 * - USART support (Serial)
 * - GPIO ports (PORTB, PORTC, PORTD)
 * - Pin state tracking via PinManager
 */
export class AVRSimulator {
  private cpu: CPU | null = null;
  private timer0: AVRTimer | null = null;
  private usart: AVRUSART | null = null;
  private portB: AVRIOPort | null = null;
  private portC: AVRIOPort | null = null;
  private portD: AVRIOPort | null = null;
  private program: Uint16Array | null = null;
  private running = false;
  private animationFrame: number | null = null;
  private pinManager: PinManager;
  private speed = 1.0; // Simulation speed multiplier
  private lastPortBValue = 0;
  private lastPortCValue = 0;
  private lastPortDValue = 0;

  constructor(pinManager: PinManager) {
    this.pinManager = pinManager;
  }

  /**
   * Load compiled hex file into simulator
   */
  loadHex(hexContent: string): void {
    console.log('Loading HEX file...');

    // Parse Intel HEX format to Uint8Array
    const bytes = hexToUint8Array(hexContent);

    // Create program memory (ATmega328p has 32KB = 16K words)
    this.program = new Uint16Array(16384);

    // Load bytes into program memory (little-endian, 16-bit words)
    for (let i = 0; i < bytes.length; i += 2) {
      const low = bytes[i] || 0;
      const high = bytes[i + 1] || 0;
      this.program[i >> 1] = low | (high << 8);
    }

    console.log(`Loaded ${bytes.length} bytes into program memory`);

    // Initialize CPU (ATmega328p @ 16MHz)
    this.cpu = new CPU(this.program);

    // Initialize peripherals
    this.timer0 = new AVRTimer(this.cpu, timer0Config);
    this.usart = new AVRUSART(this.cpu, usart0Config, 16000000); // 16MHz

    // Initialize IO ports
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portC = new AVRIOPort(this.cpu, portCConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);

    // Set up pin change hooks
    this.setupPinHooks();

    console.log('AVR CPU initialized successfully');
  }

  /**
   * Monitor pin changes and update component states
   */
  private setupPinHooks(): void {
    if (!this.cpu) return;

    console.log('Setting up pin hooks...');
    console.log('Initial PORTB:', this.portB);
    console.log('Initial PORTC:', this.portC);
    console.log('Initial PORTD:', this.portD);

    // PORTB (Digital pins 8-13)
    // Pin 13 (LED_BUILTIN) = PORTB5
    this.portB!.addListener((value) => {
      console.log(`[PORTB LISTENER CALLED] value: 0x${value.toString(16).padStart(2, '0')} (was 0x${this.lastPortBValue.toString(16).padStart(2, '0')})`);
      console.log(`  Binary: ${value.toString(2).padStart(8, '0')}`);
      console.log(`  Bit 5 (Pin 13): ${(value & 0x20) ? 'HIGH' : 'LOW'}`);
      if (value !== this.lastPortBValue) {
        this.pinManager.updatePort('PORTB', value, this.lastPortBValue);
        this.lastPortBValue = value;
      }
    });

    // PORTC (Analog pins A0-A5)
    this.portC!.addListener((value) => {
      console.log(`[PORTC LISTENER CALLED] value: 0x${value.toString(16).padStart(2, '0')}`);
      if (value !== this.lastPortCValue) {
        this.pinManager.updatePort('PORTC', value, this.lastPortCValue);
        this.lastPortCValue = value;
      }
    });

    // PORTD (Digital pins 0-7)
    this.portD!.addListener((value) => {
      console.log(`[PORTD LISTENER CALLED] value: 0x${value.toString(16).padStart(2, '0')}`);
      if (value !== this.lastPortDValue) {
        this.pinManager.updatePort('PORTD', value, this.lastPortDValue);
        this.lastPortDValue = value;
      }
    });

    console.log('Pin hooks configured successfully');
  }

  /**
   * Start simulation loop
   */
  start(): void {
    if (this.running || !this.cpu) {
      console.warn('Simulator already running or not initialized');
      return;
    }

    this.running = true;
    console.log('Starting AVR simulation...');
    console.log('CPU state:', {
      pc: this.cpu.pc,
      cycles: this.cpu.cycles,
      data: this.cpu.data.slice(0, 10) // First 10 bytes of RAM
    });
    console.log('Program loaded:', this.program?.length, 'words');

    let frameCount = 0;
    const execute = (timestamp: number) => {
      if (!this.running || !this.cpu) return;

      // Execute instructions in batches for performance
      // ATmega328p @ 16MHz = 16M cycles/sec
      // At 60fps: 16,000,000 / 60 ≈ 267,000 cycles per frame
      const cyclesPerFrame = Math.floor(267000 * this.speed);

      try {
        for (let i = 0; i < cyclesPerFrame; i++) {
          // Execute one instruction
          // Note: AVRTimer and AVRUSART are updated automatically by CPU.tick()
          this.cpu.tick();
        }

        // Log every 60 frames (once per second at 60fps)
        frameCount++;
        if (frameCount % 60 === 0) {
          console.log(`[CPU] Frame ${frameCount}, PC: ${this.cpu.pc}, Cycles: ${this.cpu.cycles}`);
          console.log(`[CPU] PORTB register value: 0x${this.cpu.data[0x25].toString(16).padStart(2, '0')}`);
        }
      } catch (error) {
        console.error('Simulation error:', error);
        this.stop();
        return;
      }

      // Schedule next frame
      this.animationFrame = requestAnimationFrame(execute);
    };

    this.animationFrame = requestAnimationFrame(execute);
  }

  /**
   * Stop simulation
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    console.log('AVR simulation stopped');
  }

  /**
   * Reset simulator
   */
  reset(): void {
    this.stop();

    if (this.cpu && this.program) {
      console.log('Resetting AVR CPU...');

      // Reinitialize CPU
      this.cpu = new CPU(this.program);
      this.timer0 = new AVRTimer(this.cpu, timer0Config);
      this.usart = new AVRUSART(this.cpu, usart0Config, 16000000);

      // Reinitialize ports
      this.portB = new AVRIOPort(this.cpu, portBConfig);
      this.portC = new AVRIOPort(this.cpu, portCConfig);
      this.portD = new AVRIOPort(this.cpu, portDConfig);

      // Reset port values
      this.lastPortBValue = 0;
      this.lastPortCValue = 0;
      this.lastPortDValue = 0;

      this.setupPinHooks();

      console.log('AVR CPU reset complete');
    }
  }

  /**
   * Check if simulator is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set simulation speed (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10.0, speed));
    console.log(`Simulation speed set to ${this.speed}x`);
  }

  /**
   * Get current simulation speed
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Execute a single instruction (for step-by-step debugging)
   */
  step(): void {
    if (!this.cpu) return;

    this.cpu.tick();
    if (this.timer0) this.timer0.tick();
    if (this.usart) this.usart.tick();
  }
}
