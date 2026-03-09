import { CPU, AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config, AVRIOPort, portBConfig, portCConfig, portDConfig, avrInstruction, AVRADC, adcConfig, AVRSPI, spiConfig, AVRTWI, twiConfig } from 'avr8js';
import { PinManager } from './PinManager';
import { hexToUint8Array } from '../utils/hexParser';
import { I2CBusManager } from './I2CBusManager';
import type { I2CDevice } from './I2CBusManager';

/**
 * AVRSimulator - Emulates Arduino Uno (ATmega328p) using avr8js
 *
 * Features:
 * - CPU emulation at 16MHz
 * - Timer0/Timer1/Timer2 support (enables millis(), delay(), PWM)
 * - USART support (Serial)
 * - GPIO ports (PORTB, PORTC, PORTD)
 * - ADC support (analogRead())
 * - PWM monitoring via OCR register polling
 * - Pin state tracking via PinManager
 */

// OCR register addresses → Arduino pin mapping for PWM
const PWM_PINS = [
  { ocrAddr: 0x47, pin: 6,  label: 'OCR0A' }, // Timer0A → D6
  { ocrAddr: 0x48, pin: 5,  label: 'OCR0B' }, // Timer0B → D5
  { ocrAddr: 0x88, pin: 9,  label: 'OCR1AL' }, // Timer1A low byte → D9
  { ocrAddr: 0x8A, pin: 10, label: 'OCR1BL' }, // Timer1B low byte → D10
  { ocrAddr: 0xB3, pin: 11, label: 'OCR2A' }, // Timer2A → D11
  { ocrAddr: 0xB4, pin: 3,  label: 'OCR2B' }, // Timer2B → D3
];

export class AVRSimulator {
  private cpu: CPU | null = null;
  /** Peripherals kept alive by reference so GC doesn't collect their CPU hooks */
  private peripherals: unknown[] = [];
  private portB: AVRIOPort | null = null;
  private portC: AVRIOPort | null = null;
  private portD: AVRIOPort | null = null;
  private adc: AVRADC | null = null;
  public spi: AVRSPI | null = null;
  public usart: AVRUSART | null = null;
  public twi: AVRTWI | null = null;
  public i2cBus: I2CBusManager | null = null;
  private program: Uint16Array | null = null;
  private running = false;
  private animationFrame: number | null = null;
  public pinManager: PinManager;
  private speed = 1.0; // Simulation speed multiplier

  /** Serial output buffer — subscribers receive each byte or line */
  public onSerialData: ((char: string) => void) | null = null;
  /** Fires whenever the sketch changes Serial baud rate (Serial.begin) */
  public onBaudRateChange: ((baudRate: number) => void) | null = null;
  private lastPortBValue = 0;
  private lastPortCValue = 0;
  private lastPortDValue = 0;
  private lastOcrValues: number[] = new Array(PWM_PINS.length).fill(-1);

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

    // Initialize peripherals (kept alive so their CPU hooks are not GC'd)
    this.spi = new AVRSPI(this.cpu, spiConfig, 16000000);
    // Default onByte: complete transfer immediately (no external device)
    this.spi.onByte = (value) => {
      this.spi!.completeTransfer(value);
    };

    // USART (Serial) — hook onByteTransmit to forward output
    this.usart = new AVRUSART(this.cpu, usart0Config, 16000000);
    this.usart.onByteTransmit = (value: number) => {
      if (this.onSerialData) {
        this.onSerialData(String.fromCharCode(value));
      }
    };
    this.usart.onConfigurationChange = () => {
      if (this.onBaudRateChange && this.usart) {
        this.onBaudRateChange(this.usart.baudRate);
      }
    };

    // TWI (I2C)
    this.twi = new AVRTWI(this.cpu, twiConfig, 16000000);
    this.i2cBus = new I2CBusManager(this.twi);

    this.peripherals = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
      this.usart,
      this.spi,
      this.twi,
    ];

    // Initialize ADC (analogRead support)
    this.adc = new AVRADC(this.cpu, adcConfig);

    // Initialize IO ports
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portC = new AVRIOPort(this.cpu, portCConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);

    // Reset OCR tracking
    this.lastOcrValues = new Array(PWM_PINS.length).fill(-1);

    // Set up pin change hooks
    this.setupPinHooks();

    console.log(`AVR CPU initialized (${this.peripherals.length} peripherals, ADC + Timer1/Timer2 enabled)`);
  }

  /**
   * Expose ADC instance so components (potentiometer, etc.) can inject voltages
   */
  getADC(): AVRADC | null {
    return this.adc;
  }

  /**
   * Monitor pin changes and update component states
   */
  private setupPinHooks(): void {
    if (!this.cpu) return;

    console.log('Setting up pin hooks...');

    // PORTB (Digital pins 8-13)
    this.portB!.addListener((value, _oldValue) => {
      if (value !== this.lastPortBValue) {
        this.pinManager.updatePort('PORTB', value, this.lastPortBValue);
        this.lastPortBValue = value;
      }
    });

    // PORTC (Analog pins A0-A5)
    this.portC!.addListener((value, _oldValue) => {
      if (value !== this.lastPortCValue) {
        this.pinManager.updatePort('PORTC', value, this.lastPortCValue);
        this.lastPortCValue = value;
      }
    });

    // PORTD (Digital pins 0-7)
    this.portD!.addListener((value, _oldValue) => {
      if (value !== this.lastPortDValue) {
        this.pinManager.updatePort('PORTD', value, this.lastPortDValue);
        this.lastPortDValue = value;
      }
    });

    console.log('Pin hooks configured successfully');
  }

  /**
   * Poll OCR registers and notify PinManager of PWM duty cycle changes
   */
  private pollPwmRegisters(): void {
    if (!this.cpu) return;

    for (let i = 0; i < PWM_PINS.length; i++) {
      const { ocrAddr, pin } = PWM_PINS[i];
      const ocrValue = this.cpu.data[ocrAddr];
      if (ocrValue !== this.lastOcrValues[i]) {
        this.lastOcrValues[i] = ocrValue;
        const dutyCycle = ocrValue / 255;
        this.pinManager.updatePwm(pin, dutyCycle);
      }
    }
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

    // ATmega328p @ 16MHz
    const CPU_HZ = 16_000_000;
    const CYCLES_PER_MS = CPU_HZ / 1000;

    // Cap: never execute more than 50ms worth of cycles in one frame.
    // This prevents a runaway burst when the tab was backgrounded and
    // then becomes visible again (browser may deliver a huge delta).
    const MAX_DELTA_MS = 50;

    let lastTimestamp = 0;
    let frameCount = 0;

    const execute = (timestamp: number) => {
      if (!this.running || !this.cpu) return;

      // First frame: just record the timestamp and yield
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
        this.animationFrame = requestAnimationFrame(execute);
        return;
      }

      // Clamp delta so we never overshoot after a paused/backgrounded tab
      const rawDelta = timestamp - lastTimestamp;
      const deltaMs  = Math.min(rawDelta, MAX_DELTA_MS);
      lastTimestamp  = timestamp;

      const cyclesPerFrame = Math.floor(CYCLES_PER_MS * deltaMs * this.speed);

      try {
        for (let i = 0; i < cyclesPerFrame; i++) {
          avrInstruction(this.cpu);  // Execute the AVR instruction
          this.cpu.tick();            // Update peripheral timers and cycles
        }

        // Poll PWM registers every frame
        this.pollPwmRegisters();

        frameCount++;
        if (frameCount % 60 === 0) {
          console.log(`[CPU] Frame ${frameCount}, PC: ${this.cpu.pc}, Cycles: ${this.cpu.cycles}`);
        }
      } catch (error) {
        console.error('Simulation error:', error);
        this.stop();
        return;
      }

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

      this.cpu = new CPU(this.program);

      this.spi = new AVRSPI(this.cpu, spiConfig, 16000000);
      this.spi.onByte = (value) => { this.spi!.completeTransfer(value); };

      this.usart = new AVRUSART(this.cpu, usart0Config, 16000000);
      this.usart.onByteTransmit = (value: number) => {
        if (this.onSerialData) this.onSerialData(String.fromCharCode(value));
      };
      this.usart.onConfigurationChange = () => {
        if (this.onBaudRateChange && this.usart) {
          this.onBaudRateChange(this.usart.baudRate);
        }
      };

      this.twi = new AVRTWI(this.cpu, twiConfig, 16000000);
      this.i2cBus = new I2CBusManager(this.twi);

      this.peripherals = [
        new AVRTimer(this.cpu, timer0Config),
        new AVRTimer(this.cpu, timer1Config),
        new AVRTimer(this.cpu, timer2Config),
        this.usart,
        this.spi,
        this.twi,
      ];
      this.adc = new AVRADC(this.cpu, adcConfig);

      this.portB = new AVRIOPort(this.cpu, portBConfig);
      this.portC = new AVRIOPort(this.cpu, portCConfig);
      this.portD = new AVRIOPort(this.cpu, portDConfig);

      this.lastPortBValue = 0;
      this.lastPortCValue = 0;
      this.lastPortDValue = 0;
      this.lastOcrValues = new Array(PWM_PINS.length).fill(-1);

      this.setupPinHooks();

      console.log('AVR CPU reset complete');
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10.0, speed));
    console.log(`Simulation speed set to ${this.speed}x`);
  }

  getSpeed(): number {
    return this.speed;
  }

  step(): void {
    if (!this.cpu) return;
    avrInstruction(this.cpu);
    this.cpu.tick();
  }

  /**
   * Set the state of an Arduino pin externally (e.g. from a UI button)
   */
  setPinState(arduinoPin: number, state: boolean): void {
    if (arduinoPin >= 0 && arduinoPin <= 7 && this.portD) {
      this.portD.setPin(arduinoPin, state);
    } else if (arduinoPin >= 8 && arduinoPin <= 13 && this.portB) {
      this.portB.setPin(arduinoPin - 8, state);
    } else if (arduinoPin >= 14 && arduinoPin <= 19 && this.portC) {
      this.portC.setPin(arduinoPin - 14, state);
    }
  }

  /**
   * Send a byte to the Arduino serial port (RX) — as if typed in the Serial Monitor.
   */
  serialWrite(text: string): void {
    if (!this.usart) return;
    for (let i = 0; i < text.length; i++) {
      this.usart.writeByte(text.charCodeAt(i));
    }
  }

  /**
   * Register a virtual I2C device on the bus (e.g. RTC, sensor).
   */
  addI2CDevice(device: I2CDevice): void {
    if (this.i2cBus) {
      this.i2cBus.addDevice(device);
    }
  }
}
