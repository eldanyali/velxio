import { create } from 'zustand';

interface EditorState {
  code: string;
  theme: 'vs-dark' | 'light';
  fontSize: number;

  setCode: (code: string) => void;
  setTheme: (theme: 'vs-dark' | 'light') => void;
  setFontSize: (size: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  code: `// Arduino Blink Example
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`,
  theme: 'vs-dark',
  fontSize: 14,

  setCode: (code) => set({ code }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
}));
