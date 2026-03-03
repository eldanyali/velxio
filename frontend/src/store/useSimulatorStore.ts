import { create } from 'zustand';
import { AVRSimulator } from '../simulation/AVRSimulator';
import { PinManager } from '../simulation/PinManager';

interface Component {
  id: string;
  type: 'led' | 'resistor' | 'pushbutton' | 'potentiometer';
  x: number;
  y: number;
  properties: {
    color?: string;
    value?: number;
    pin?: number;
    state?: boolean;
  };
}

interface SimulatorState {
  // Simulation state
  simulator: AVRSimulator | null;
  pinManager: PinManager;
  running: boolean;
  compiledHex: string | null;

  // Components
  components: Component[];

  // Actions
  initSimulator: () => void;
  loadHex: (hex: string) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  resetSimulation: () => void;
  setCompiledHex: (hex: string) => void;
  setRunning: (running: boolean) => void;

  // Component management
  addComponent: (component: Component) => void;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<Component>) => void;
  updateComponentState: (id: string, state: boolean) => void;
}

export const useSimulatorStore = create<SimulatorState>((set, get) => {
  // Create PinManager instance
  const pinManager = new PinManager();

  return {
    simulator: null,
    pinManager,
    running: false,
    compiledHex: null,
    components: [
      {
        id: 'led-builtin',
        type: 'led',
        x: 400,
        y: 200,
        properties: {
          color: 'red',
          pin: 13,
          state: false,
        },
      },
    ],

    initSimulator: () => {
      const simulator = new AVRSimulator(pinManager);
      set({ simulator });
      console.log('Simulator initialized');
    },

    loadHex: (hex: string) => {
      const { simulator } = get();
      if (simulator) {
        try {
          simulator.loadHex(hex);
          set({ compiledHex: hex });
          console.log('HEX file loaded successfully');
        } catch (error) {
          console.error('Failed to load HEX:', error);
        }
      } else {
        console.warn('Simulator not initialized');
      }
    },

    startSimulation: () => {
      const { simulator } = get();
      if (simulator) {
        simulator.start();
        set({ running: true });
      }
    },

    stopSimulation: () => {
      const { simulator } = get();
      if (simulator) {
        simulator.stop();
        set({ running: false });
      }
    },

    resetSimulation: () => {
      const { simulator } = get();
      if (simulator) {
        simulator.reset();
        set({ running: false });
      }
    },

    setCompiledHex: (hex: string) => {
      set({ compiledHex: hex });
      // Auto-load hex when set
      get().loadHex(hex);
    },

    setRunning: (running: boolean) => set({ running }),

    addComponent: (component) => {
      set((state) => ({
        components: [...state.components, component],
      }));
    },

    removeComponent: (id) => {
      set((state) => ({
        components: state.components.filter((c) => c.id !== id),
      }));
    },

    updateComponent: (id, updates) => {
      set((state) => ({
        components: state.components.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
    },

    updateComponentState: (id, state) => {
      set((prevState) => ({
        components: prevState.components.map((c) =>
          c.id === id ? { ...c, properties: { ...c.properties, state } } : c
        ),
      }));
    },
  };
});
