# Wokwi Libraries Integration

Este proyecto utiliza los repositorios oficiales de Wokwi clonados localmente, lo que permite mantenerlos actualizados y compatibles con las últimas versiones.

## Repositorios Clonados

### 📦 wokwi-elements
- **Ubicación**: `wokwi-libs/wokwi-elements/`
- **Descripción**: Web Components para elementos electrónicos (LEDs, resistencias, botones, etc.)
- **Repositorio**: https://github.com/wokwi/wokwi-elements
- **Licencia**: MIT
- **Versión actual**: 1.9.2

### 🎮 avr8js
- **Ubicación**: `wokwi-libs/avr8js/`
- **Descripción**: Emulador de microcontroladores AVR8 (Arduino Uno, Mega, etc.) en JavaScript
- **Repositorio**: https://github.com/wokwi/avr8js
- **Licencia**: MIT
- **Versión actual**: 0.21.0

### 🚀 rp2040js
- **Ubicación**: `wokwi-libs/rp2040js/`
- **Descripción**: Emulador de Raspberry Pi Pico (RP2040) en JavaScript
- **Repositorio**: https://github.com/wokwi/rp2040js
- **Licencia**: MIT
- **Uso**: Futuro soporte para Raspberry Pi Pico

### 📝 wokwi-features
- **Ubicación**: `wokwi-libs/wokwi-features/`
- **Descripción**: Documentación y tracking de features de Wokwi
- **Repositorio**: https://github.com/wokwi/wokwi-features

## Configuración del Proyecto

### Frontend (Vite)

El archivo [vite.config.ts](frontend/vite.config.ts) está configurado para usar los repositorios locales:

```typescript
resolve: {
  alias: {
    'avr8js': path.resolve(__dirname, '../wokwi-libs/avr8js/dist/esm'),
    '@wokwi/elements': path.resolve(__dirname, '../wokwi-libs/wokwi-elements/dist/esm'),
  },
}
```

El archivo [package.json](frontend/package.json) referencia los paquetes locales:

```json
{
  "dependencies": {
    "@wokwi/elements": "file:../wokwi-libs/wokwi-elements",
    "avr8js": "file:../wokwi-libs/avr8js"
  }
}
```

## Actualizar las Librerías de Wokwi

Para mantener tu proyecto actualizado con las últimas versiones de Wokwi:

### Opción 1: Actualizar todas las librerías (Recomendado)

```bash
cd e:\Hardware\wokwi_clon

# Script para actualizar todos los repositorios
./update-wokwi-libs.bat
```

### Opción 2: Actualizar manualmente cada repositorio

```bash
cd e:\Hardware\wokwi_clon\wokwi-libs

# Actualizar wokwi-elements
cd wokwi-elements
git pull origin main
npm install
npm run build

# Actualizar avr8js
cd ../avr8js
git pull origin main
npm install
npm run build

# Actualizar rp2040js
cd ../rp2040js
git pull origin main
npm install
npm run build
```

### Opción 3: Actualizar a una versión específica

```bash
cd e:\Hardware\wokwi_clon\wokwi-libs\wokwi-elements

# Ver versiones disponibles
git tag -l

# Cambiar a una versión específica
git checkout v1.9.2

# Recompilar
npm install
npm run build
```

## Script de Actualización Automática

Se ha creado un script [update-wokwi-libs.bat](update-wokwi-libs.bat) para facilitar las actualizaciones:

```batch
@echo off
echo ========================================
echo Actualizando Wokwi Libraries
echo ========================================
echo.

cd wokwi-libs

echo [1/3] Actualizando wokwi-elements...
cd wokwi-elements
git pull origin main
npm install
npm run build
cd ..

echo.
echo [2/3] Actualizando avr8js...
cd avr8js
git pull origin main
npm install
npm run build
cd ..

echo.
echo [3/3] Actualizando rp2040js...
cd rp2040js
git pull origin main
npm install
npm run build
cd ..

echo.
echo ========================================
echo Actualizacion completada!
echo ========================================
pause
```

## Ventajas de Este Enfoque

### ✅ Ventajas

1. **Actualización Fácil**: Un simple `git pull` en cada repo te da las últimas mejoras
2. **Compatible con Wokwi**: Si Wokwi agrega nuevos elementos o mejoras a avr8js, automáticamente estarán disponibles
3. **Control de Versiones**: Puedes hacer checkout a versiones específicas si necesitas estabilidad
4. **Desarrollo**: Puedes modificar el código fuente si necesitas hacer debugging o agregar features
5. **Sin Dependencia de npm**: No dependes de que publiquen en npm

### ⚠️ Consideraciones

1. **Espacio en Disco**: Los repositorios clonados ocupan más espacio (~200MB)
2. **Compilación**: Debes compilar los repositorios después de actualizarlos
3. **Tiempo de Build**: La primera instalación toma más tiempo

## Componentes Wokwi Disponibles

### Elementos Básicos
- `wokwi-led` - LED de colores (red, green, blue, yellow, white, orange)
- `wokwi-resistor` - Resistencia con código de colores
- `wokwi-pushbutton` - Botón pulsador
- `wokwi-slide-switch` - Interruptor deslizante
- `wokwi-potentiometer` - Potenciómetro

### Placas
- `wokwi-arduino-uno` - Arduino Uno R3
- `wokwi-arduino-mega` - Arduino Mega 2560
- `wokwi-arduino-nano` - Arduino Nano
- `wokwi-pi-pico` - Raspberry Pi Pico
- `wokwi-esp32-devkit-v1` - ESP32 DevKit v1

### Pantallas
- `wokwi-lcd1602` - LCD 16x2 con I2C
- `wokwi-neopixel` - LED RGB direccionable
- `wokwi-7segment` - Display de 7 segmentos

### Sensores
- `wokwi-dht22` - Sensor de temperatura y humedad
- `wokwi-hc-sr04` - Sensor ultrasónico de distancia
- `wokwi-pir-motion-sensor` - Sensor de movimiento PIR
- `wokwi-photoresistor-sensor` - Fotoresistor (LDR)

### Otros
- `wokwi-servo` - Servo motor
- `wokwi-membrane-keypad` - Teclado matricial 4x4
- `wokwi-ir-receiver` - Receptor infrarrojo
- `wokwi-ds1307` - Reloj de tiempo real (RTC)

## Uso de los Componentes

### Ejemplo: LED

```tsx
import { LED } from './components/components-wokwi/LED';

<LED
  id="led1"
  x={300}
  y={200}
  color="red"
  value={true}  // LED encendido
/>
```

### Ejemplo: Arduino Uno

```tsx
import { ArduinoUno } from './components/components-wokwi/ArduinoUno';

<ArduinoUno
  x={50}
  y={50}
  led13={true}  // LED interno encendido
/>
```

### Ejemplo: Botón

```tsx
import { Pushbutton } from './components/components-wokwi/Pushbutton';

<Pushbutton
  x={400}
  y={300}
  color="red"
  onPress={() => console.log('Presionado!')}
  onRelease={() => console.log('Liberado!')}
/>
```

## Troubleshooting

### Error: "Module not found: @wokwi/elements"

Asegúrate de que los repositorios estén compilados:

```bash
cd wokwi-libs/wokwi-elements
npm install
npm run build
```

### Error: "Cannot find module 'avr8js'"

Verifica que el alias en `vite.config.ts` esté correcto y que avr8js esté compilado.

### Los componentes no se muestran

Asegúrate de importar `@wokwi/elements` en tus componentes:

```tsx
import '@wokwi/elements';
```

## Referencias

- [Wokwi Elements Documentation](https://elements.wokwi.com/)
- [AVR8js Documentation](https://github.com/wokwi/avr8js/tree/main/demo)
- [Wokwi Simulator](https://wokwi.com)
- [Web Components Guide](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
