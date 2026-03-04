/**
 * Arduino Example Projects
 *
 * Collection of example projects that users can load and run
 */

export interface ExampleProject {
  id: string;
  title: string;
  description: string;
  category: 'basics' | 'sensors' | 'displays' | 'communication' | 'games' | 'robotics';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  code: string;
  components: Array<{
    type: string;
    id: string;
    x: number;
    y: number;
    properties: Record<string, any>;
  }>;
  wires: Array<{
    id: string;
    start: { componentId: string; pinName: string };
    end: { componentId: string; pinName: string };
    color: string;
  }>;
  thumbnail?: string;
}

export const exampleProjects: ExampleProject[] = [
  {
    id: 'blink-led',
    title: 'Blink LED',
    description: 'Classic Arduino blink example - toggle an LED on and off',
    category: 'basics',
    difficulty: 'beginner',
    code: `// Blink LED Example
// Toggles the built-in LED on pin 13

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
    ],
    wires: [],
  },
  {
    id: 'traffic-light',
    title: 'Traffic Light',
    description: 'Simulate a traffic light with red, yellow, and green LEDs',
    category: 'basics',
    difficulty: 'beginner',
    code: `// Traffic Light Simulator
// Red -> Yellow -> Green -> Yellow -> Red

const int RED_PIN = 13;
const int YELLOW_PIN = 12;
const int GREEN_PIN = 11;

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
}

void loop() {
  // Red light
  digitalWrite(RED_PIN, HIGH);
  delay(3000);
  digitalWrite(RED_PIN, LOW);

  // Yellow light
  digitalWrite(YELLOW_PIN, HIGH);
  delay(1000);
  digitalWrite(YELLOW_PIN, LOW);

  // Green light
  digitalWrite(GREEN_PIN, HIGH);
  delay(3000);
  digitalWrite(GREEN_PIN, LOW);

  // Yellow light again
  digitalWrite(YELLOW_PIN, HIGH);
  delay(1000);
  digitalWrite(YELLOW_PIN, LOW);
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-led',
        id: 'led-red',
        x: 400,
        y: 100,
        properties: { color: 'red', pin: 13 },
      },
      {
        type: 'wokwi-led',
        id: 'led-yellow',
        x: 400,
        y: 200,
        properties: { color: 'yellow', pin: 12 },
      },
      {
        type: 'wokwi-led',
        id: 'led-green',
        x: 400,
        y: 300,
        properties: { color: 'green', pin: 11 },
      },
    ],
    wires: [
      {
        id: 'wire-red',
        start: { componentId: 'arduino-uno', pinName: '13' },
        end: { componentId: 'led-red', pinName: 'A' },
        color: '#ff0000',
      },
      {
        id: 'wire-yellow',
        start: { componentId: 'arduino-uno', pinName: '12' },
        end: { componentId: 'led-yellow', pinName: 'A' },
        color: '#ffaa00',
      },
      {
        id: 'wire-green',
        start: { componentId: 'arduino-uno', pinName: '11' },
        end: { componentId: 'led-green', pinName: 'A' },
        color: '#00ff00',
      },
    ],
  },
  {
    id: 'button-led',
    title: 'Button Control',
    description: 'Control an LED with a pushbutton',
    category: 'basics',
    difficulty: 'beginner',
    code: `// Button LED Control
// Press button to turn LED on

const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int buttonState = digitalRead(BUTTON_PIN);

  if (buttonState == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-pushbutton',
        id: 'button-1',
        x: 400,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-led',
        id: 'led-1',
        x: 400,
        y: 250,
        properties: { color: 'red', pin: 13 },
      },
    ],
    wires: [
      {
        id: 'wire-button',
        start: { componentId: 'arduino-uno', pinName: '2' },
        end: { componentId: 'button-1', pinName: '1.l' },
        color: '#00aaff',
      },
      {
        id: 'wire-led',
        start: { componentId: 'arduino-uno', pinName: '13' },
        end: { componentId: 'led-1', pinName: 'A' },
        color: '#ff0000',
      },
    ],
  },
  {
    id: 'fade-led',
    title: 'Fade LED',
    description: 'Smoothly fade an LED using PWM',
    category: 'basics',
    difficulty: 'beginner',
    code: `// Fade LED with PWM
// Smoothly fade LED brightness

const int LED_PIN = 9; // PWM pin

int brightness = 0;
int fadeAmount = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  analogWrite(LED_PIN, brightness);

  brightness += fadeAmount;

  if (brightness <= 0 || brightness >= 255) {
    fadeAmount = -fadeAmount;
  }

  delay(30);
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-led',
        id: 'led-1',
        x: 400,
        y: 150,
        properties: { color: 'blue', pin: 9 },
      },
    ],
    wires: [
      {
        id: 'wire-led',
        start: { componentId: 'arduino-uno', pinName: '9' },
        end: { componentId: 'led-1', pinName: 'A' },
        color: '#0000ff',
      },
    ],
  },
  {
    id: 'serial-hello',
    title: 'Serial Hello World',
    description: 'Send messages through serial communication',
    category: 'communication',
    difficulty: 'beginner',
    code: `// Serial Communication Example
// Send messages to Serial Monitor

void setup() {
  Serial.begin(9600);
  Serial.println("Hello, Arduino!");
  Serial.println("System initialized");
}

void loop() {
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seconds");
  delay(2000);
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
    ],
    wires: [],
  },
  {
    id: 'rgb-led',
    title: 'RGB LED Colors',
    description: 'Cycle through colors with an RGB LED',
    category: 'basics',
    difficulty: 'intermediate',
    code: `// RGB LED Color Cycling
// Display different colors

const int RED_PIN = 9;
const int GREEN_PIN = 10;
const int BLUE_PIN = 11;

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
}

void setColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}

void loop() {
  // Red
  setColor(255, 0, 0);
  delay(1000);

  // Green
  setColor(0, 255, 0);
  delay(1000);

  // Blue
  setColor(0, 0, 255);
  delay(1000);

  // Yellow
  setColor(255, 255, 0);
  delay(1000);

  // Cyan
  setColor(0, 255, 255);
  delay(1000);

  // Magenta
  setColor(255, 0, 255);
  delay(1000);

  // White
  setColor(255, 255, 255);
  delay(1000);
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-rgb-led',
        id: 'rgb-led-1',
        x: 400,
        y: 150,
        properties: {},
      },
    ],
    wires: [
      {
        id: 'wire-red',
        start: { componentId: 'arduino-uno', pinName: '9' },
        end: { componentId: 'rgb-led-1', pinName: 'R' },
        color: '#ff0000',
      },
      {
        id: 'wire-green',
        start: { componentId: 'arduino-uno', pinName: '10' },
        end: { componentId: 'rgb-led-1', pinName: 'G' },
        color: '#00ff00',
      },
      {
        id: 'wire-blue',
        start: { componentId: 'arduino-uno', pinName: '11' },
        end: { componentId: 'rgb-led-1', pinName: 'B' },
        color: '#0000ff',
      },
    ],
  },
  {
    id: 'simon-says',
    title: 'Simon Says Game',
    description: 'Memory game with LEDs and buttons',
    category: 'games',
    difficulty: 'advanced',
    code: `// Simon Says Game
// Memory game with 4 LEDs and buttons

const int LED_PINS[] = {8, 9, 10, 11};
const int BUTTON_PINS[] = {2, 3, 4, 5};
const int NUM_LEDS = 4;

int sequence[100];
int sequenceLength = 0;
int currentStep = 0;

void setup() {
  Serial.begin(9600);

  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(LED_PINS[i], OUTPUT);
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  }

  randomSeed(millis());
  newGame();
}

void newGame() {
  sequenceLength = 1;
  currentStep = 0;
  addToSequence();
  playSequence();
}

void addToSequence() {
  sequence[sequenceLength - 1] = random(0, NUM_LEDS);
}

void playSequence() {
  for (int i = 0; i < sequenceLength; i++) {
    flashLED(sequence[i]);
    delay(500);
  }
}

void flashLED(int led) {
  digitalWrite(LED_PINS[led], HIGH);
  delay(300);
  digitalWrite(LED_PINS[led], LOW);
}

void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    if (digitalRead(BUTTON_PINS[i]) == LOW) {
      flashLED(i);

      if (i == sequence[currentStep]) {
        currentStep++;
        if (currentStep == sequenceLength) {
          delay(1000);
          sequenceLength++;
          currentStep = 0;
          addToSequence();
          playSequence();
        }
      } else {
        // Wrong button - game over
        for (int j = 0; j < 3; j++) {
          for (int k = 0; k < NUM_LEDS; k++) {
            digitalWrite(LED_PINS[k], HIGH);
          }
          delay(200);
          for (int k = 0; k < NUM_LEDS; k++) {
            digitalWrite(LED_PINS[k], LOW);
          }
          delay(200);
        }
        newGame();
      }

      delay(300);
      while (digitalRead(BUTTON_PINS[i]) == LOW);
    }
  }
}`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-led',
        id: 'led-red',
        x: 450,
        y: 100,
        properties: { color: 'red', pin: 8 },
      },
      {
        type: 'wokwi-led',
        id: 'led-green',
        x: 550,
        y: 100,
        properties: { color: 'green', pin: 9 },
      },
      {
        type: 'wokwi-led',
        id: 'led-blue',
        x: 450,
        y: 200,
        properties: { color: 'blue', pin: 10 },
      },
      {
        type: 'wokwi-led',
        id: 'led-yellow',
        x: 550,
        y: 200,
        properties: { color: 'yellow', pin: 11 },
      },
      {
        type: 'wokwi-pushbutton',
        id: 'button-red',
        x: 450,
        y: 300,
        properties: {},
      },
      {
        type: 'wokwi-pushbutton',
        id: 'button-green',
        x: 550,
        y: 300,
        properties: {},
      },
      {
        type: 'wokwi-pushbutton',
        id: 'button-blue',
        x: 450,
        y: 400,
        properties: {},
      },
      {
        type: 'wokwi-pushbutton',
        id: 'button-yellow',
        x: 550,
        y: 400,
        properties: {},
      },
    ],
    wires: [
      {
        id: 'wire-led-red',
        start: { componentId: 'arduino-uno', pinName: '8' },
        end: { componentId: 'led-red', pinName: 'A' },
        color: '#ff0000',
      },
      {
        id: 'wire-led-green',
        start: { componentId: 'arduino-uno', pinName: '9' },
        end: { componentId: 'led-green', pinName: 'A' },
        color: '#00ff00',
      },
      {
        id: 'wire-led-blue',
        start: { componentId: 'arduino-uno', pinName: '10' },
        end: { componentId: 'led-blue', pinName: 'A' },
        color: '#0000ff',
      },
      {
        id: 'wire-led-yellow',
        start: { componentId: 'arduino-uno', pinName: '11' },
        end: { componentId: 'led-yellow', pinName: 'A' },
        color: '#ffaa00',
      },
      {
        id: 'wire-button-red',
        start: { componentId: 'arduino-uno', pinName: '2' },
        end: { componentId: 'button-red', pinName: '1.l' },
        color: '#00aaff',
      },
      {
        id: 'wire-button-green',
        start: { componentId: 'arduino-uno', pinName: '3' },
        end: { componentId: 'button-green', pinName: '1.l' },
        color: '#00aaff',
      },
      {
        id: 'wire-button-blue',
        start: { componentId: 'arduino-uno', pinName: '4' },
        end: { componentId: 'button-blue', pinName: '1.l' },
        color: '#00aaff',
      },
      {
        id: 'wire-button-yellow',
        start: { componentId: 'arduino-uno', pinName: '5' },
        end: { componentId: 'button-yellow', pinName: '1.l' },
        color: '#00aaff',
      },
    ],
  },
  {
    id: 'lcd-hello',
    title: 'LCD 20x4 Display',
    description: 'Display text on a 20x4 LCD using the LiquidCrystal library',
    category: 'displays',
    difficulty: 'intermediate',
    code: `// LiquidCrystal Library - Hello World
// Demonstrates the use a 20x4 LCD display

#include <LiquidCrystal.h>

// initialize the library by associating any needed LCD interface pin
// with the arduino pin number it is connected to
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

void setup() {
  // set up the LCD's number of columns and rows:
  lcd.begin(20, 4);
  // Print a message to the LCD.
  lcd.print("Hello, Arduino!");
  lcd.setCursor(0, 1);
  lcd.print("Wokwi Emulator");
  lcd.setCursor(0, 2);
  lcd.print("LCD 2004 Test");
}

void loop() {
  // set the cursor to column 0, line 3
  lcd.setCursor(0, 3);
  // print the number of seconds since reset:
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
}
`,
    components: [
      {
        type: 'wokwi-arduino-uno',
        id: 'arduino-uno',
        x: 100,
        y: 100,
        properties: {},
      },
      {
        type: 'wokwi-lcd2004',
        id: 'lcd1',
        x: 450,
        y: 100,
        properties: { pins: 'full' },
      },
    ],
    wires: [
      { id: 'w-rs', start: { componentId: 'arduino-uno', pinName: '12' }, end: { componentId: 'lcd1', pinName: 'RS' }, color: 'green' },
      { id: 'w-en', start: { componentId: 'arduino-uno', pinName: '11' }, end: { componentId: 'lcd1', pinName: 'E' }, color: 'green' },
      { id: 'w-d4', start: { componentId: 'arduino-uno', pinName: '5' }, end: { componentId: 'lcd1', pinName: 'D4' }, color: 'blue' },
      { id: 'w-d5', start: { componentId: 'arduino-uno', pinName: '4' }, end: { componentId: 'lcd1', pinName: 'D5' }, color: 'blue' },
      { id: 'w-d6', start: { componentId: 'arduino-uno', pinName: '3' }, end: { componentId: 'lcd1', pinName: 'D6' }, color: 'blue' },
      { id: 'w-d7', start: { componentId: 'arduino-uno', pinName: '2' }, end: { componentId: 'lcd1', pinName: 'D7' }, color: 'blue' },
      // Power / Contrast logic is usually handled internally or ignored in basic simulation
    ],
  },
];

// Get examples by category
export function getExamplesByCategory(category: ExampleProject['category']): ExampleProject[] {
  return exampleProjects.filter((example) => example.category === category);
}

// Get example by ID
export function getExampleById(id: string): ExampleProject | undefined {
  return exampleProjects.find((example) => example.id === id);
}

// Get all categories
export function getCategories(): ExampleProject['category'][] {
  return ['basics', 'sensors', 'displays', 'communication', 'games', 'robotics'];
}
