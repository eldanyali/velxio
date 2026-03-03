# Plan: Construcción de Emulador Arduino Local (Wokwi Clone)

## Resumen Ejecutivo

Crear una aplicación web local que permita editar, compilar y emular código Arduino con visualización de componentes electrónicos en tiempo real.

**Arquitectura:** Monolito web (React + Vite) con backend FastAPI para compilación
**Prioridades:** Editor de código + compilación, emulación Arduino Uno, componentes básicos (LED, resistencias)
**Persistencia:** SQLite

## Tecnologías Core

### Frontend
- **React + Vite + TypeScript** - Framework principal
- **Monaco Editor** (`@monaco-editor/react`) - Editor de código
- **avr8js** - Emulador AVR8 (ATmega328p = Arduino Uno)
- **@wokwi/elements** - Componentes electrónicos web (LEDs, resistencias)
- **Zustand** - State management

### Backend
- **FastAPI + Python** - API REST
- **arduino-cli** - Compilador de Arduino
- **SQLAlchemy + SQLite** - Base de datos

## Estructura del Proyecto

```
wokwi_clon/
├── frontend/                         # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── CodeEditor.tsx       # Monaco Editor wrapper
│   │   │   │   └── EditorToolbar.tsx    # Compile/Run/Stop
│   │   │   ├── simulator/
│   │   │   │   ├── SimulatorCanvas.tsx  # Canvas principal
│   │   │   │   └── ArduinoBoard.tsx     # Visualización Arduino Uno
│   │   │   ├── components-wokwi/
│   │   │   │   ├── LED.tsx              # Wrapper para wokwi-led
│   │   │   │   └── Resistor.tsx         # Wrapper para wokwi-resistor
│   │   │   └── projects/
│   │   │       ├── ProjectList.tsx      # Lista de proyectos
│   │   │       └── ProjectDialog.tsx    # Guardar/Cargar
│   │   ├── simulation/
│   │   │   ├── AVRSimulator.ts          # Core: avr8js wrapper
│   │   │   ├── PinManager.ts            # Gestión de pines
│   │   │   └── ComponentRegistry.ts     # Registro de componentes
│   │   ├── store/
│   │   │   ├── useSimulatorStore.ts     # Estado de simulación (Zustand)
│   │   │   ├── useEditorStore.ts        # Estado del editor
│   │   │   └── useProjectStore.ts       # Estado de proyectos
│   │   ├── services/
│   │   │   ├── api.ts                   # Cliente API
│   │   │   └── compilation.ts           # Servicio de compilación
│   │   └── utils/
│   │       └── hexParser.ts             # Parser de archivos .hex
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                          # Python + FastAPI
│   ├── app/
│   │   ├── main.py                      # Entry point
│   │   ├── api/routes/
│   │   │   ├── compile.py               # POST /api/compile
│   │   │   └── projects.py              # CRUD proyectos
│   │   ├── services/
│   │   │   └── arduino_cli.py           # Integración arduino-cli
│   │   ├── models/
│   │   │   └── project.py               # Modelo SQLAlchemy
│   │   └── database/
│   │       └── connection.py            # Conexión SQLite
│   └── requirements.txt
│
└── README.md
```

## Flujo de Datos Principal

### 1. Compilación (Editor → Backend → Hex)
```
Usuario escribe código en Monaco Editor
  ↓
Click "Compile"
  ↓
POST /api/compile { code: "...", board_fqbn: "arduino:avr:uno" }
  ↓
Backend: arduino-cli compila código a .hex
  ↓
Backend retorna { success: true, hex_content: "..." }
  ↓
Frontend: useSimulatorStore.loadHex(hex)
```

### 2. Emulación (Hex → CPU → Pines → Componentes)
```
AVRSimulator.loadHex(hexString)
  ↓
Parse hex → Uint16Array (program memory)
  ↓
Inicializar CPU (ATmega328p)
  ↓
Click "Run"
  ↓
Execution loop (requestAnimationFrame)
  ↓
CPU ejecuta ~267k cycles/frame @ 60fps
  ↓
CPU escribe en PORTB/PORTC/PORTD
  ↓
Write hooks → PinManager.updatePort()
  ↓
PinManager notifica componentes conectados
  ↓
LED actualiza estado visual (ref.current.value = true/false)
```

## Archivos Críticos para Implementar

### 1. `frontend/src/simulation/AVRSimulator.ts`
**Motor de emulación**
- Integra avr8js (CPU, AVRTimer, AVRUSART)
- Carga archivos .hex a memoria de programa
- Loop de ejecución con requestAnimationFrame
- Write hooks en registros PORT (0x25=PORTB, 0x28=PORTC, 0x2B=PORTD)

```typescript
export class AVRSimulator {
  private cpu: CPU | null = null;
  private program: Uint16Array | null = null;

  loadHex(hexContent: string) {
    const bytes = hexToUint8Array(hexContent);
    this.program = new Uint16Array(16384); // 32KB
    // Load bytes into program memory...
    this.cpu = new CPU(this.program);
    this.setupPinHooks();
  }

  start() {
    const execute = () => {
      for (let i = 0; i < 267000; i++) {
        this.cpu.tick();
      }
      requestAnimationFrame(execute);
    };
    requestAnimationFrame(execute);
  }
}
```

### 2. `frontend/src/components/components-wokwi/LED.tsx`
**Wrapper React para Web Components**
- Importa `@wokwi/elements`
- Usa `useRef` para manipular DOM directamente
- Propiedades via asignación directa (no atributos)

```typescript
import '@wokwi/elements';

export const LED = ({ color, value, x, y }) => {
  const ledRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ledRef.current) {
      (ledRef.current as any).value = value;
      (ledRef.current as any).color = color;
    }
  }, [value, color]);

  return <wokwi-led ref={ledRef} style={{ position: 'absolute', left: x, top: y }} />;
};
```

### 3. `backend/app/services/arduino_cli.py`
**Integración con arduino-cli**
- Compilación asíncrona con asyncio
- Manejo de archivos temporales
- Parse de errores de compilación

```python
async def compile(code: str, board_fqbn: str = "arduino:avr:uno") -> dict:
    with tempfile.TemporaryDirectory() as temp_dir:
        sketch_dir = Path(temp_dir) / "sketch"
        sketch_dir.mkdir()
        (sketch_dir / "sketch.ino").write_text(code)

        process = await asyncio.create_subprocess_exec(
            "arduino-cli", "compile",
            "--fqbn", board_fqbn,
            "--output-dir", str(sketch_dir / "build"),
            str(sketch_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            hex_file = sketch_dir / "build" / "sketch.ino.hex"
            return {
                "success": True,
                "hex_content": hex_file.read_text()
            }
        else:
            return {
                "success": False,
                "error": stderr.decode()
            }
```

### 4. `frontend/src/store/useSimulatorStore.ts`
**Estado global de simulación (Zustand)**
- Simulator instance
- Estado running/stopped
- Lista de componentes
- Actions: loadHex, start, stop, addComponent

```typescript
export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  simulator: null,
  running: false,
  components: [],

  loadHex: (hex: string) => {
    const { simulator } = get();
    simulator?.loadHex(hex);
  },

  startSimulation: () => {
    get().simulator?.start();
    set({ running: true });
  },

  addComponent: (component) => {
    set(state => ({
      components: [...state.components, component]
    }));
  }
}));
```

### 5. `backend/app/models/project.py`
**Modelo de base de datos**

```python
class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(Text, nullable=False)
    circuit = Column(JSON)  # { components: [...], wires: [...] }
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

**Circuit JSON Structure:**
```json
{
  "components": [
    { "id": "led1", "type": "led", "x": 250, "y": 150, "properties": { "color": "red" } }
  ],
  "wires": [
    { "from": { "component": "arduino", "pin": 13 }, "to": { "component": "led1", "pin": "A" } }
  ]
}
```

## Dependencias Clave

### Frontend
```json
{
  "@monaco-editor/react": "^4.6.0",
  "avr8js": "^0.30.0",
  "@wokwi/elements": "^1.9.1",
  "zustand": "^4.5.0",
  "axios": "^1.7.0",
  "react": "^18.3.1",
  "vite": "^5.4.0"
}
```

### Backend
```txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.36
aiosqlite==0.20.0
pydantic==2.9.2
```

### Herramientas Externas
```bash
# Instalar arduino-cli
# Windows:
choco install arduino-cli

# Inicializar:
arduino-cli core update-index
arduino-cli core install arduino:avr
```

## Fases de Implementación

### Fase 1: Foundation (Prioridad Alta)
- [frontend] Inicializar proyecto Vite + React + TypeScript
- [frontend] Integrar Monaco Editor con syntax highlighting C++
- [frontend] Layout básico (editor izquierda, canvas derecha)
- [backend] Setup FastAPI + endpoint /api/compile
- [backend] Integración arduino-cli para compilación
- **Entregable:** Compilar código y recibir .hex

### Fase 2: Emulation Core (Prioridad Alta)
- [frontend] Implementar AVRSimulator.ts con avr8js
- [frontend] Parser de archivos .hex
- [frontend] PinManager para tracking de pines
- [frontend] Botones Run/Stop/Reset
- **Entregable:** Ejecutar Blink example y ver cambios de pin

### Fase 3: Visual Components (Prioridad Alta)
- [frontend] Wrappers React para wokwi-led, wokwi-resistor
- [frontend] SimulatorCanvas con drag & drop
- [frontend] Conectar LEDs a PinManager
- **Entregable:** LED se enciende/apaga con digitalWrite()

### Fase 4: Project Persistence (Prioridad Media)
- [backend] Setup SQLite con SQLAlchemy
- [backend] CRUD endpoints para proyectos
- [frontend] UI para guardar/cargar proyectos
- **Entregable:** Persistir código + circuito

### Fase 5: Polish (Prioridad Baja)
- Más componentes (botones, potenciómetros)
- Serial monitor
- Control de velocidad
- Ejemplos pre-cargados
- **Entregable:** App completa y pulida

## Puntos Críticos de Integración

### Monaco Editor en Vite
- Usar `@monaco-editor/react` (no `monaco-editor` directamente)
- No requiere configuración especial de Vite
- Syntax highlighting C++ funciona con `defaultLanguage="cpp"`

### Web Components en React
- Web Components requieren manipulación directa del DOM
- Usar `useRef` + `useEffect` para setear propiedades
- Declarar tipos JSX en `vite-env.d.ts`

### avr8js Performance
- Ejecutar en batches (~267k cycles/frame @ 16MHz/60fps)
- Usar `requestAnimationFrame` para smooth simulation
- Evitar re-renders de React (usar refs)

### arduino-cli
- Sketch name debe coincidir con directory name
- Output: `<sketch_name>.ino.hex`
- Requiere `arduino:avr` core instalado

## Comandos de Desarrollo

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Acceso
Frontend: http://localhost:5173
Backend:  http://localhost:8000
API Docs: http://localhost:8000/docs
```

## Archivos de Configuración Esenciales

### [frontend/vite.config.ts](frontend/vite.config.ts)
### [frontend/tsconfig.json](frontend/tsconfig.json)
### [frontend/package.json](frontend/package.json)
### [backend/app/main.py](backend/app/main.py)
### [backend/requirements.txt](backend/requirements.txt)
