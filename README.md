# Arduino Emulator - Wokwi Clone

Emulador local de Arduino con editor de código y simulador visual.

## Características

- ✅ Editor de código con syntax highlighting (Monaco Editor)
- ✅ Compilación de código Arduino con arduino-cli
- ✅ **Repositorios oficiales de Wokwi clonados localmente**
  - ✅ **wokwi-elements** - Componentes web electrónicos
  - ✅ **avr8js** - Emulador AVR8
  - ✅ **rp2040js** - Emulador RP2040 (futuro)
- ✅ Componentes visuales usando wokwi-elements (Arduino Uno, LEDs, etc.)
- ⏳ Emulación completa con avr8js (en progreso)
- ⏳ Persistencia con SQLite (próximamente)

## Requisitos Previos

### 1. Node.js
- Versión 18 o superior
- Descargar desde: https://nodejs.org/

### 2. Python
- Versión 3.12 o superior
- Descargar desde: https://www.python.org/

### 3. Arduino CLI
Instalar arduino-cli en tu sistema:

**Windows (con Chocolatey):**
```bash
choco install arduino-cli
```

**Windows (manual):**
1. Descargar desde: https://github.com/arduino/arduino-cli/releases
2. Añadir al PATH del sistema

**Verificar instalación:**
```bash
arduino-cli version
```

**Inicializar arduino-cli:**
```bash
arduino-cli core update-index
arduino-cli core install arduino:avr
```

## Instalación

### 1. Clonar el repositorio
```bash
cd e:\Hardware\wokwi_clon
```

### 2. Configurar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual (Windows)
venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

### 3. Configurar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install
```

## Ejecución

### Iniciar el Backend

```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8001
```

El backend estará disponible en:
- API: http://localhost:8001
- Documentación: http://localhost:8001/docs

### Iniciar el Frontend

```bash
cd frontend
npm run dev
```

El frontend estará disponible en:
- App: http://localhost:5173

## Uso

1. Abre http://localhost:5173 en tu navegador
2. Escribe código Arduino en el editor (hay un ejemplo de Blink por defecto)
3. Click en "Compile" para compilar el código
4. Si la compilación es exitosa, click en "Run" para iniciar la simulación
5. Observa el LED simulado parpadeando

## Estructura del Proyecto

```
wokwi_clon/
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── components/          # Componentes React
│   │   │   ├── components-wokwi/  # Wrappers de wokwi-elements
│   │   │   ├── editor/          # Editor Monaco
│   │   │   └── simulator/       # Canvas de simulación
│   │   ├── store/               # Estado global (Zustand)
│   │   ├── services/            # API clients
│   │   └── App.tsx              # Componente principal
│   └── package.json
│
├── backend/                     # FastAPI + Python
│   ├── app/
│   │   ├── api/routes/          # Endpoints REST
│   │   ├── services/            # Lógica de negocio
│   │   └── main.py              # Entry point
│   └── requirements.txt
│
├── wokwi-libs/                  # Repositorios de Wokwi clonados
│   ├── wokwi-elements/          # Web Components
│   ├── avr8js/                  # Emulador AVR8
│   ├── rp2040js/                # Emulador RP2040
│   └── wokwi-features/          # Features y documentación
│
├── README.md
├── WOKWI_LIBS.md                # Documentación de integración Wokwi
└── update-wokwi-libs.bat        # Script de actualización
```

## Tecnologías Utilizadas

### Frontend
- **React** 18 - Framework UI
- **Vite** 5 - Build tool
- **TypeScript** - Tipado estático
- **Monaco Editor** - Editor de código (VSCode)
- **Zustand** - State management
- **Axios** - HTTP client

### Backend
- **FastAPI** - Framework web Python
- **uvicorn** - ASGI server
- **arduino-cli** - Compilador Arduino
- **SQLAlchemy** - ORM (próximamente)
- **SQLite** - Base de datos (próximamente)

### Simulación
- **avr8js** - Emulador AVR8 (próximamente)
- **@wokwi/elements** - Componentes electrónicos (próximamente)

## Próximas Funcionalidades

### Fase 2: Emulación Real con avr8js
- [ ] Integrar avr8js para emulación real del ATmega328p
- [ ] Parser de archivos .hex
- [ ] PinManager para gestión de pines
- [ ] Ejecución en tiempo real

### Fase 3: Componentes Visuales
- [ ] Integrar @wokwi/elements
- [ ] Componente LED con estado real
- [ ] Componente Resistor
- [ ] Drag & drop de componentes
- [ ] Conexiones visuales (wires)

### Fase 4: Persistencia
- [ ] Base de datos SQLite
- [ ] CRUD de proyectos
- [ ] Guardar/cargar código y circuito
- [ ] Historial de proyectos

### Fase 5: Funcionalidades Avanzadas
- [ ] Más componentes (botones, potenciómetros, sensores)
- [ ] Serial monitor
- [ ] Control de velocidad de simulación
- [ ] Proyectos de ejemplo
- [ ] Exportar/importar proyectos

## Actualizar Librerías de Wokwi

Este proyecto usa los repositorios oficiales de Wokwi clonados localmente. Para obtener las últimas actualizaciones:

```bash
# Ejecutar script de actualización
update-wokwi-libs.bat
```

O manualmente:

```bash
cd wokwi-libs/wokwi-elements
git pull origin main
npm install
npm run build
```

Ver [WOKWI_LIBS.md](WOKWI_LIBS.md) para más detalles sobre la integración con Wokwi.

## Solución de Problemas

### Error: "arduino-cli: command not found"
- Asegúrate de tener arduino-cli instalado y en el PATH
- Verifica con: `arduino-cli version`

### Error: "arduino:avr core not found"
- Ejecuta: `arduino-cli core install arduino:avr`

### El frontend no conecta con el backend
- Verifica que el backend esté corriendo en http://localhost:8001
- Verifica los logs de CORS en la consola del navegador

### Errores de compilación
- Revisa la consola del backend para ver los logs de arduino-cli
- Asegúrate de que el código Arduino sea válido
- Verifica que tienes instalado el core `arduino:avr`

## Contribuir

Este es un proyecto educativo. Sugerencias y mejoras son bienvenidas!

## Licencia

MIT

## Referencias

- [Wokwi](https://wokwi.com) - Inspiración del proyecto
- [avr8js](https://github.com/wokwi/avr8js) - Emulador AVR8
- [wokwi-elements](https://github.com/wokwi/wokwi-elements) - Componentes web
- [arduino-cli](https://github.com/arduino/arduino-cli) - Compilador Arduino
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Editor de código
