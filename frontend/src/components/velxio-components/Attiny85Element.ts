/**
 * Attiny85Element.ts — DIP-8 ATtiny85 Web Component
 *
 * Visual: Fritzing-drawn ATtiny85 DIP package loaded as a static asset
 * from /component-svgs/attiny85.svg. Original copied verbatim from
 * third-party/fritzing-parts/svg/core/breadboard/ATtiny85_breadboard.svg
 * (CC-BY-SA, see THIRDPARTY_LICENSES.md).
 *
 * Geometry note (different from the original hand-drawn version):
 *   The Fritzing layout puts the chip HORIZONTAL with 4 pins on the TOP
 *   edge and 4 pins on the BOTTOM edge — not vertical with pins on
 *   left/right like the older art. Existing wired examples will rewire
 *   automatically (the wire system reads coords by pin name from
 *   pinInfo) but external components positioned to the right of the
 *   chip may need to be moved manually for clean routing.
 *
 *   viewBox 28.801 × 23.768 mm scaled uniformly at 5.555 px/mm → 160 × 132 px.
 *   Pin terminal centres in the source SVG (mm), all 8 connectors:
 *     row     x       y       pin label
 *     top     3.601   1.084   VCC   (connector7)
 *     top    10.801   1.084   PB2   (connector6)
 *     top    18.000   1.084   PB1   (connector5)
 *     top    25.201   1.084   PB0   (connector4)
 *     bottom  3.601  22.687   PB5   (connector0, RST)
 *     bottom 10.801  22.687   PB3   (connector1)
 *     bottom 18.000  22.687   PB4   (connector2)
 *     bottom 25.201  22.687   GND   (connector3)
 *
 * Built-in LED on PB1 (Digispark convention) is overlaid as a circle in
 * the outer SVG — drives off the `led1` attribute / property like before.
 */

const W = 160;
const H = 132;
const TOP_Y = 6;     // CSS px — y of all four top-edge pin tips
const BOT_Y = 126;   // CSS px — y of all four bottom-edge pin tips
const PIN_X = [20, 60, 100, 140] as const;

const PIN_INFO: ReadonlyArray<{ name: string; x: number; y: number; description?: string }> = [
  // Top row — left to right
  { name: 'VCC', x: PIN_X[0], y: TOP_Y, description: 'VCC (Pin 8)' },
  { name: 'PB2', x: PIN_X[1], y: TOP_Y, description: 'PB2 / SCK / SCL / ADC1 (Pin 7)' },
  { name: 'PB1', x: PIN_X[2], y: TOP_Y, description: 'PB1 / MISO / built-in LED (Pin 6)' },
  { name: 'PB0', x: PIN_X[3], y: TOP_Y, description: 'PB0 / MOSI / SDA / OC0A (Pin 5)' },
  // Bottom row — left to right
  { name: 'PB5', x: PIN_X[0], y: BOT_Y, description: 'PB5 / RESET (Pin 1)' },
  { name: 'PB3', x: PIN_X[1], y: BOT_Y, description: 'PB3 / XTAL1 / ADC3 (Pin 2)' },
  { name: 'PB4', x: PIN_X[2], y: BOT_Y, description: 'PB4 / XTAL2 / ADC2 (Pin 3)' },
  { name: 'GND', x: PIN_X[3], y: BOT_Y, description: 'GND (Pin 4)' },
];

class Attiny85Element extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['led1'];
  }

  private _led1 = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'led1') {
      this._led1 = value !== null && value !== 'false';
      this.updateLed();
    }
  }

  /** Wires use this to find pin coordinates. */
  get pinInfo() {
    return PIN_INFO;
  }

  set led1(v: boolean) {
    this._led1 = !!v;
    this.updateLed();
  }
  get led1(): boolean {
    return this._led1;
  }

  private updateLed() {
    const led = this.shadowRoot?.getElementById('attiny-led1') as unknown as SVGElement | null;
    if (!led) return;
    if (this._led1) {
      led.setAttribute('fill', '#ffee44');
      led.setAttribute('stroke', '#ffcc00');
      led.style.filter = 'drop-shadow(0 0 4px #ffcc00)';
    } else {
      led.setAttribute('fill', '#333');
      led.setAttribute('stroke', '#555');
      led.style.filter = 'none';
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    const ledFill = this._led1 ? '#ffee44' : '#333';
    const ledStroke = this._led1 ? '#ffcc00' : '#555';
    const ledFilter = this._led1 ? 'drop-shadow(0 0 4px #ffcc00)' : 'none';

    // Place the LED indicator just ABOVE the PB1 top-pin (PIN_X[2], TOP_Y),
    // outside the chip body so it stays readable.
    const ledX = PIN_X[2];
    const ledY = TOP_Y - 12;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        svg   { display: block; overflow: visible; }
        .pin-label {
          font: 600 7px monospace;
          fill: #cdf;
          text-anchor: middle;
          pointer-events: none;
        }
        .pin-label.power { fill: #aaa; }
        .pin-label.led   { fill: #ffd066; }
      </style>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <!-- Fritzing ATtiny85 DIP-8 artwork (CC-BY-SA). Scaled to fill
             the 160×132 box; aspect ratio matches the source 1.211:1. -->
        <image href="/component-svgs/attiny85.svg" x="0" y="0" width="${W}" height="${H}" />

        <!-- Built-in LED on PB1 (Digispark convention) -->
        <circle id="attiny-led1"
                cx="${ledX}" cy="${ledY}" r="5"
                fill="${ledFill}" stroke="${ledStroke}" stroke-width="1"
                style="filter: ${ledFilter};" />

        <!-- Pin labels overlaid above/below the connector pads. -->
        <text class="pin-label power" x="${PIN_X[0]}" y="${TOP_Y - 22}">VCC</text>
        <text class="pin-label"       x="${PIN_X[1]}" y="${TOP_Y - 22}">PB2</text>
        <text class="pin-label led"   x="${PIN_X[2]}" y="${TOP_Y - 22}">PB1</text>
        <text class="pin-label"       x="${PIN_X[3]}" y="${TOP_Y - 22}">PB0</text>

        <text class="pin-label"       x="${PIN_X[0]}" y="${BOT_Y + 12}">PB5</text>
        <text class="pin-label"       x="${PIN_X[1]}" y="${BOT_Y + 12}">PB3</text>
        <text class="pin-label"       x="${PIN_X[2]}" y="${BOT_Y + 12}">PB4</text>
        <text class="pin-label power" x="${PIN_X[3]}" y="${BOT_Y + 12}">GND</text>
      </svg>
    `;
  }
}

if (!customElements.get('velxio-attiny85')) {
  customElements.define('velxio-attiny85', Attiny85Element);
}

export {};
