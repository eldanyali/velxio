# ✅ Fase 3 Completada - Drag & Drop de Componentes

## 🎉 Resumen de lo Implementado

Has completado exitosamente la **Fase 3: Drag & Drop y Gestión Dinámica de Componentes**. Ahora puedes arrastrar componentes al canvas, asignarles pines, y verlos funcionar en tiempo real.

### ✅ Nuevos Componentes Implementados

#### 1. [ComponentPalette.tsx](frontend/src/components/simulator/ComponentPalette.tsx)
**Paleta de componentes arrastrables**

**Características:**
- 💡 LED - Diodo emisor de luz
- ⚡ Resistor - Resistencia eléctrica
- 🔘 Button - Botón pulsador
- 🎛️ Potentiometer - Potenciómetro

**Uso:**
```typescript
<ComponentPalette onDragStart={(template) => setDraggedTemplate(template)} />
```

#### 2. [PinSelector.tsx](frontend/src/components/simulator/PinSelector.tsx)
**Selector visual de pines**

**Características:**
- Selector visual de pines digitales (0-13)
- Selector de pines analógicos (A0-A5 / 14-19)
- Muestra pin actual del componente
- Confirmación antes de asignar
- Modal centrado con overlay

**Uso:**
```typescript
<PinSelector
  componentId="led-123"
  componentType="led"
  currentPin={13}
  onPinSelect={(id, pin) => updateComponent(id, { pin })}
  onClose={() => setShowPinSelector(false)}
  position={{ x: 300, y: 200 }}
/>
```

#### 3. [Potentiometer.tsx](frontend/src/components/components-wokwi/Potentiometer.tsx)
**Wrapper para wokwi-potentiometer**

**Características:**
- Valores 0-100
- Evento onChange para interacción
- Listo para conectar a pines analógicos

#### 4. [SimulatorCanvas.tsx](frontend/src/components/simulator/SimulatorCanvas.tsx) - Mejorado
**Canvas con drag & drop completo**

**Nuevas funcionalidades:**
- ✅ Drag & drop desde paleta
- ✅ Click para seleccionar componentes
- ✅ Asignación de pines con modal
- ✅ Delete/Backspace para eliminar
- ✅ Borde visual de selección
- ✅ Grid background para mejor UX
- ✅ Contador de componentes
- ✅ Soporte para 4 tipos de componentes

## 🎨 Interfaz de Usuario

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Component Palette  │  Simulator Canvas                 │
│                     │  ┌─────────────────────────────┐  │
│  💡 LED             │  │ Header: Running / 5 comps  │  │
│  ⚡ Resistor        │  │                             │  │
│  🔘 Button          │  │  [Arduino Uno]              │  │
│  🎛️ Potentiometer   │  │                             │  │
│                     │  │  [Components...]            │  │
│  [Help Text]        │  │                             │  │
└─────────────────────┴──┴─────────────────────────────┘
```

### Flujo de Trabajo

```
1. Arrastra componente desde paleta
   ↓
2. Suelta en canvas
   ↓
3. Componente aparece (sin pin)
   ↓
4. Click en componente
   ↓
5. Modal de selección de pin
   ↓
6. Selecciona pin (D0-D13, A0-A5)
   ↓
7. Click "Confirm"
   ↓
8. Componente conectado a pin
   ↓
9. Compilar código → Run
   ↓
10. Componente reacciona a digitalWrite/analogRead!
```

## 🚀 Cómo Usar

### 1. Agregar un LED

**Pasos:**
1. Arrastra 💡 LED desde la paleta
2. Suelta donde quieras en el canvas
3. Click en el LED
4. Selecciona un pin (ej: D12)
5. Click "Confirm"

**Código Arduino:**
```cpp
void setup() {
  pinMode(12, OUTPUT);
}

void loop() {
  digitalWrite(12, HIGH);
  delay(500);
  digitalWrite(12, LOW);
  delay(500);
}
```

### 2. Crear Secuencia de LEDs

**Pasos:**
1. Arrastra 3 LEDs al canvas
2. Asigna pines: D11, D12, D13
3. Arrastra diferente posición vertical para cada uno

**Código Arduino:**
```cpp
int leds[] = {11, 12, 13};

void setup() {
  for (int i = 0; i < 3; i++) {
    pinMode(leds[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(leds[i], HIGH);
    delay(200);
    digitalWrite(leds[i], LOW);
  }
}
```

### 3. Usar Botón (Pushbutton)

**Pasos:**
1. Arrastra 🔘 Button al canvas
2. Asigna pin D2
3. Arrastra 💡 LED
4. Asigna pin D13

**Código Arduino:**
```cpp
const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  digitalWrite(LED_PIN, pressed ? HIGH : LOW);
}
```

### 4. Eliminar Componentes

**Opción 1: Keyboard**
1. Click en componente (aparece borde azul)
2. Presiona Delete o Backspace

**Opción 2: Futuro**
- Botón de eliminar en el componente seleccionado
- Menu contextual con click derecho

## 🎯 Componentes Disponibles

### 💡 LED
- **Tipo**: Output
- **Pines**: Digital (0-13)
- **Propiedades**: color (red, green, blue, yellow, orange)
- **Código**: `digitalWrite(pin, HIGH/LOW)`

### ⚡ Resistor
- **Tipo**: Pasivo
- **Pines**: N/A (visual)
- **Propiedades**: value (ohms)
- **Uso**: Decorativo / diagrama

### 🔘 Pushbutton
- **Tipo**: Input
- **Pines**: Digital (0-13)
- **Propiedades**: color (red, green, blue)
- **Código**: `digitalRead(pin)`
- **Estado**: Presionado = LOW, Liberado = HIGH (pullup)

### 🎛️ Potentiometer
- **Tipo**: Input analógico
- **Pines**: Analógico (A0-A5 / 14-19)
- **Propiedades**: value (0-100)
- **Código**: `analogRead(pin)` (0-1023)

## 📝 Características Técnicas

### Drag & Drop System

```typescript
// Template de componente
interface ComponentTemplate {
  type: 'led' | 'resistor' | 'pushbutton' | 'potentiometer';
  label: string;
  icon: string;
  defaultProperties: {
    color?: string;
    value?: number;
    pin?: number;
  };
}

// Al soltar en canvas
const handleDrop = (e: React.DragEvent) => {
  const x = e.clientX - canvasRect.left;
  const y = e.clientY - canvasRect.top;

  addComponent({
    id: `${type}-${Date.now()}`,
    type,
    x,
    y,
    properties: defaultProperties,
  });
};
```

### Pin Assignment

```typescript
// Grupos de pines
const PIN_GROUPS = [
  {
    label: 'Digital Pins',
    pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
  {
    label: 'Analog Pins',
    pins: [14, 15, 16, 17, 18, 19], // A0-A5
  },
];

// Formato de etiqueta
const formatPinLabel = (pin: number): string => {
  if (pin >= 14 && pin <= 19) {
    return `A${pin - 14}`; // A0, A1, ...
  }
  return `D${pin}`; // D0, D1, ...
};
```

### Component Rendering

```typescript
const renderComponent = (component) => {
  const isSelected = selectedComponentId === component.id;

  return (
    <div
      onClick={(e) => handleComponentClick(component.id, e)}
      style={{
        border: isSelected ? '2px dashed #007acc' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {component.type === 'led' && (
        <LED
          x={component.x}
          y={component.y}
          color={component.properties.color}
          value={component.properties.state}
        />
      )}
      <div className="component-label">
        Pin {component.properties.pin}
      </div>
    </div>
  );
};
```

## 🎨 Estilos y UX

### Grid Background
```css
.canvas-content {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

### Selected Component
```css
.components-area > div {
  transition: all 0.2s;
}

.components-area > div:hover {
  transform: scale(1.05);
}
```

### Drag State
```css
.palette-item:active {
  cursor: grabbing;
  transform: scale(0.95);
}
```

## 🔧 Estado Global (Zustand)

### Component Interface
```typescript
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
```

### Actions
```typescript
addComponent(component)           // Agregar al canvas
removeComponent(id)               // Eliminar del canvas
updateComponent(id, updates)      // Actualizar propiedades
updateComponentState(id, state)   // Actualizar estado (HIGH/LOW)
```

## 🎯 Ejemplo Completo: Semáforo

### Pasos:
1. Arrastra 3 LEDs al canvas
2. Asigna pines:
   - LED 1 (rojo) → D11
   - LED 2 (amarillo) → D12
   - LED 3 (verde) → D13
3. Código Arduino:

```cpp
const int RED = 11;
const int YELLOW = 12;
const int GREEN = 13;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  // Verde
  digitalWrite(GREEN, HIGH);
  delay(3000);
  digitalWrite(GREEN, LOW);

  // Amarillo
  digitalWrite(YELLOW, HIGH);
  delay(1000);
  digitalWrite(YELLOW, LOW);

  // Rojo
  digitalWrite(RED, HIGH);
  delay(3000);
  digitalWrite(RED, LOW);
}
```

4. Compile → Run
5. ¡Observa el semáforo funcionando!

## 🐛 Troubleshooting

### Los componentes no aparecen al arrastrar

**Solución:**
- Verifica que estés soltando dentro del canvas (área gris con grid)
- Revisa la consola del navegador para errores

### Pin Selector no se abre

**Solución:**
- Asegúrate de hacer click directamente en el componente
- No en el label o espacio vacío

### Componente no reacciona al código

**Verificar:**
1. ¿Tiene pin asignado? (debe mostrar "Pin X")
2. ¿El código usa el mismo pin?
3. ¿La simulación está corriendo? (status: Running)

### Delete no funciona

**Verificar:**
- Componente debe estar seleccionado (borde azul)
- Focus debe estar en la ventana del navegador
- Presiona Delete o Backspace

## 📊 Métricas

**Componentes soportados:** 4 tipos
**Pines disponibles:** 20 (D0-D13, A0-A5)
**Max componentes:** Ilimitado (recomendado <50 para performance)

## 🚀 Próximos Pasos (Fase 4)

### Persistencia con SQLite
- [ ] Guardar proyectos con circuitos
- [ ] Cargar proyectos guardados
- [ ] Exportar/importar JSON

### Features Adicionales
- [ ] Drag para mover componentes ya colocados
- [ ] Copiar/pegar componentes
- [ ] Undo/Redo
- [ ] Wiring visual entre componentes
- [ ] Grupos de componentes
- [ ] Templates de circuitos comunes

### Más Componentes
- [ ] Servo motor
- [ ] LCD 16x2
- [ ] Sensor DHT22
- [ ] Sensor ultrasónico HC-SR04
- [ ] NeoPixel strip
- [ ] Keypad 4x4

## 🎊 ¡Logros!

- ✅ Drag & drop intuitivo
- ✅ 4 tipos de componentes
- ✅ Pin assignment visual
- ✅ Selección y eliminación
- ✅ Grid background profesional
- ✅ Component counter
- ✅ Smooth animations
- ✅ Responsive layout

---

🎉 **¡Ahora tienes un editor visual completo de circuitos Arduino!** 🎉
