# Arquitectura del Proyecto - Arduino Emulator

## Visión General

Este proyecto es un emulador de Arduino que funciona completamente local, utilizando los repositorios oficiales de Wokwi para máxima compatibilidad.

```
┌─────────────────────────────────────────────────────────────┐
│                    USUARIO (Navegador)                      │
│                   http://localhost:5173                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND (React + Vite)                     │
│                                                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ Monaco Editor  │  │  Zustand Store   │  │  Simulator  │ │
│  │  (Code Edit)   │  │  (State Mgmt)    │  │   Canvas    │ │
│  └────────────────┘  └──────────────────┘  └─────────────┘ │
│           │                   │                      │       │
│           └───────────────────┴──────────────────────┘       │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Wokwi Components Integration                 │   │
│  │  (wokwi-elements + avr8js desde repos locales)      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (axios)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (FastAPI + Python)                      │
│                http://localhost:8000                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  POST /api/compile                                   │    │
│  │  - Recibe código Arduino (.ino)                      │    │
│  │  - Compila con arduino-cli                           │    │
│  │  - Retorna archivo .hex                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Arduino CLI Service                          │    │
│  │  (Invoca arduino-cli como subprocess)                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │    arduino-cli       │
                │   (Sistema local)    │
                └──────────────────────┘
```

## Flujo de Datos: Compilación y Simulación

### 1. Edición de Código
```
Usuario escribe código
    ↓
Monaco Editor
    ↓
Zustand (useEditorStore)
    ↓
Estado: code
```

### 2. Compilación
```
Click en "Compile"
    ↓
EditorToolbar.tsx → compileCode()
    ↓
Axios POST → http://localhost:8000/api/compile
    ↓
Backend: ArduinoCLIService.compile()
    ↓
arduino-cli compile --fqbn arduino:avr:uno
    ↓
Genera archivo .hex en directorio temporal
    ↓
Backend lee .hex y retorna contenido
    ↓
Frontend: useSimulatorStore.setCompiledHex()
```

### 3. Simulación (Actualmente simplificada)
```
Click en "Run"
    ↓
useSimulatorStore.setRunning(true)
    ↓
SimulatorCanvas: useEffect detecta running=true
    ↓
setInterval cada 1000ms
    ↓
updateComponentState('led-builtin', !state)
    ↓
wokwi-led component actualiza visualmente
```

### 4. Simulación Real (Próximamente con avr8js)
```
Archivo .hex compilado
    ↓
AVRSimulator.loadHex(hex)
    ↓
hexParser → Uint16Array (program memory)
    ↓
CPU = new CPU(program)
    ↓
Click "Run" → AVRSimulator.start()
    ↓
requestAnimationFrame loop
    ↓
CPU.tick() × 267,000 cycles/frame
    ↓
Escribe en PORTB/PORTC/PORTD
    ↓
Write hooks → PinManager.updatePort()
    ↓
PinManager notifica callbacks
    ↓
Componentes actualizan estado visual
```

## Componentes Clave

### Frontend

#### 1. Stores (Zustand)
- **[useEditorStore.ts](frontend/src/store/useEditorStore.ts)**
  - `code`: Código fuente actual
  - `theme`: Tema del editor (dark/light)
  - `setCode()`: Actualizar código

- **[useSimulatorStore.ts](frontend/src/store/useSimulatorStore.ts)**
  - `running`: Estado de simulación
  - `compiledHex`: Archivo hex compilado
  - `components`: Lista de componentes electrónicos
  - `setCompiledHex()`: Guardar hex
  - `updateComponentState()`: Actualizar LED/componente

#### 2. Componentes UI
- **[CodeEditor.tsx](frontend/src/components/editor/CodeEditor.tsx)**
  - Wrapper de Monaco Editor
  - Syntax highlighting C++
  - Auto-completado

- **[EditorToolbar.tsx](frontend/src/components/editor/EditorToolbar.tsx)**
  - Botones: Compile, Run, Stop
  - Manejo de estados de compilación
  - Mensajes de error/éxito

- **[SimulatorCanvas.tsx](frontend/src/components/simulator/SimulatorCanvas.tsx)**
  - Renderiza Arduino Uno
  - Renderiza componentes (LEDs)
  - Loop de simulación

#### 3. Wokwi Components Wrappers
- **[LED.tsx](frontend/src/components/components-wokwi/LED.tsx)**
  - Wrapper React para `<wokwi-led>`
  - Props: color, value, x, y

- **[ArduinoUno.tsx](frontend/src/components/components-wokwi/ArduinoUno.tsx)**
  - Wrapper React para `<wokwi-arduino-uno>`
  - Control de LED interno (pin 13)

- **[Resistor.tsx](frontend/src/components/components-wokwi/Resistor.tsx)**
  - Wrapper React para `<wokwi-resistor>`
  - Props: value (ohms)

- **[Pushbutton.tsx](frontend/src/components/components-wokwi/Pushbutton.tsx)**
  - Wrapper React para `<wokwi-pushbutton>`
  - Events: onPress, onRelease

### Backend

#### 1. API Routes
- **[compile.py](backend/app/api/routes/compile.py)**
  - `POST /api/compile`: Compilar código
  - `GET /api/compile/boards`: Listar placas

#### 2. Services
- **[arduino_cli.py](backend/app/services/arduino_cli.py)**
  - `compile()`: Compilar sketch con arduino-cli
  - `list_boards()`: Obtener placas disponibles
  - Manejo de directorios temporales

### Wokwi Libraries (Clonadas Localmente)

#### 1. wokwi-elements
- **Ubicación**: `wokwi-libs/wokwi-elements/`
- **Build**: `dist/esm/` y `dist/cjs/`
- **Componentes**: 50+ elementos electrónicos
- **Tecnología**: Lit (Web Components)

#### 2. avr8js
- **Ubicación**: `wokwi-libs/avr8js/`
- **Build**: `dist/esm/` y `dist/cjs/`
- **Funcionalidad**: Emulador completo de ATmega328p
- **Soporta**: CPU, Timers, USART, GPIO, ADC, etc.

#### 3. rp2040js
- **Ubicación**: `wokwi-libs/rp2040js/`
- **Uso futuro**: Soporte para Raspberry Pi Pico

## Integración con Vite

### Alias Configuration
```typescript
// vite.config.ts
resolve: {
  alias: {
    'avr8js': path.resolve(__dirname, '../wokwi-libs/avr8js/dist/esm'),
    '@wokwi/elements': path.resolve(__dirname, '../wokwi-libs/wokwi-elements/dist/esm'),
  },
}
```

Esto permite:
- Usar repos locales en lugar de npm
- Actualizar fácilmente con `git pull`
- Modificar código fuente si es necesario

## Stack Tecnológico

### Frontend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 19.2 | Framework UI |
| Vite | 7.3 | Build tool & dev server |
| TypeScript | 5.9 | Tipado estático |
| Monaco Editor | 4.7 | Editor de código (VSCode) |
| Zustand | 5.0 | State management |
| Axios | 1.13 | HTTP client |
| wokwi-elements | 1.9.2 | Componentes electrónicos |
| avr8js | 0.21.0 | Emulador AVR8 |

### Backend
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Python | 3.12+ | Runtime |
| FastAPI | 0.115 | Web framework |
| Uvicorn | 0.32 | ASGI server |
| SQLAlchemy | 2.0 | ORM (futuro) |
| aiosqlite | 0.20 | DB async (futuro) |

### Herramientas Externas
| Herramienta | Propósito |
|-------------|-----------|
| arduino-cli | Compilador de Arduino |
| Git | Control de versiones de Wokwi libs |

## Ventajas de la Arquitectura

### ✅ Separación de Responsabilidades
- **Frontend**: UI, UX, visualización
- **Backend**: Compilación, lógica de negocio
- **Wokwi Libs**: Emulación y componentes (mantenido por Wokwi)

### ✅ Compatibilidad con Wokwi
- Repositorios oficiales = misma funcionalidad
- Actualizaciones automáticas con `git pull`
- Nuevos componentes disponibles inmediatamente

### ✅ Escalabilidad
- Frontend puede agregar más componentes fácilmente
- Backend puede agregar más endpoints (proyectos, sensores)
- Wokwi libs se actualizan independientemente

### ✅ Desarrollo Local
- No requiere internet para funcionar
- Compilación local con arduino-cli
- Base de datos local (SQLite)

## Próximas Mejoras

### Fase 2: Emulación Real (avr8js)
```
[ ] Implementar AVRSimulator.ts
[ ] Parser de archivos Intel HEX
[ ] PinManager con write hooks
[ ] Integrar CPU execution loop
[ ] Mapear pines Arduino a componentes
```

### Fase 3: Más Componentes
```
[ ] Integrar más wokwi-elements
[ ] Botones, potenciómetros
[ ] Sensores (DHT22, HC-SR04)
[ ] Pantallas (LCD, 7-segment)
```

### Fase 4: Persistencia
```
[ ] Base de datos SQLite
[ ] Modelos SQLAlchemy
[ ] CRUD de proyectos
[ ] Guardar circuitos como JSON
```

### Fase 5: Features Avanzadas
```
[ ] Serial Monitor
[ ] Wiring visual (drag & drop)
[ ] Múltiples placas (Mega, Nano, ESP32)
[ ] Exportar a Wokwi.com
```

## Referencias

- [Wokwi Elements Repo](https://github.com/wokwi/wokwi-elements)
- [AVR8js Repo](https://github.com/wokwi/avr8js)
- [Wokwi Simulator](https://wokwi.com)
- [Arduino CLI](https://arduino.github.io/arduino-cli/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Vite Docs](https://vitejs.dev/)
