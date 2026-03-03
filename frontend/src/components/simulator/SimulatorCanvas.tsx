import { useSimulatorStore } from '../../store/useSimulatorStore';
import { useEffect, useState } from 'react';
import { ArduinoUno } from '../components-wokwi/ArduinoUno';
import { LED } from '../components-wokwi/LED';
import { Resistor } from '../components-wokwi/Resistor';
import { Pushbutton } from '../components-wokwi/Pushbutton';
import { Potentiometer } from '../components-wokwi/Potentiometer';
import { ComponentPalette } from './ComponentPalette';
import { PinSelector } from './PinSelector';
import type { ComponentTemplate } from '../../types/components';
import './SimulatorCanvas.css';

export const SimulatorCanvas = () => {
  const { components, running, pinManager, initSimulator, updateComponentState, addComponent, removeComponent, updateComponent } = useSimulatorStore();
  const [draggedTemplate, setDraggedTemplate] = useState<ComponentTemplate | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [showPinSelector, setShowPinSelector] = useState(false);
  const [pinSelectorPos, setPinSelectorPos] = useState({ x: 0, y: 0 });

  // Initialize simulator on mount
  useEffect(() => {
    initSimulator();
  }, [initSimulator]);

  // Connect components to pin manager
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    components.forEach((component) => {
      if (component.properties.pin !== undefined) {
        const unsubscribe = pinManager.onPinChange(
          component.properties.pin,
          (pin, state) => {
            // Update component state when pin changes
            updateComponentState(component.id, state);
            console.log(`Component ${component.id} on pin ${pin}: ${state ? 'HIGH' : 'LOW'}`);
          }
        );
        unsubscribers.push(unsubscribe);
      }
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [components, pinManager, updateComponentState]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedComponentId) {
        removeComponent(selectedComponentId);
        setSelectedComponentId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponentId, removeComponent]);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTemplate) return;

    const canvasRect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    const newComponent = {
      id: `${draggedTemplate.type}-${Date.now()}`,
      type: draggedTemplate.type,
      x,
      y,
      properties: {
        ...draggedTemplate.defaultProperties,
        state: false,
      },
    };

    addComponent(newComponent as any);
    setDraggedTemplate(null);
  };

  // Component selection
  const handleComponentClick = (componentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedComponentId(componentId);
    setPinSelectorPos({ x: event.clientX, y: event.clientY });
    setShowPinSelector(true);
  };

  // Pin assignment
  const handlePinSelect = (componentId: string, pin: number) => {
    updateComponent(componentId, {
      properties: {
        ...components.find((c) => c.id === componentId)?.properties,
        pin,
      },
    } as any);
  };

  // Render component
  const renderComponent = (component: any) => {
    const isSelected = selectedComponentId === component.id;
    const commonProps = {
      id: component.id,
      x: component.x,
      y: component.y,
    };

    const wrapperStyle = {
      position: 'absolute' as const,
      left: `${component.x}px`,
      top: `${component.y}px`,
      cursor: 'pointer',
      border: isSelected ? '2px dashed #007acc' : '2px solid transparent',
      borderRadius: '4px',
      padding: '4px',
    };

    return (
      <div
        key={component.id}
        style={wrapperStyle}
        onClick={(e) => handleComponentClick(component.id, e)}
      >
        {component.type === 'led' && (
          <>
            <LED
              {...commonProps}
              color={component.properties.color as any}
              value={component.properties.state || false}
            />
            <div className="component-label">
              {component.properties.pin !== undefined
                ? `Pin ${component.properties.pin}`
                : 'No pin'}
            </div>
          </>
        )}
        {component.type === 'resistor' && (
          <>
            <Resistor {...commonProps} value={component.properties.value || 220} />
            <div className="component-label">
              {component.properties.value || 220}Ω
            </div>
          </>
        )}
        {component.type === 'pushbutton' && (
          <>
            <Pushbutton
              {...commonProps}
              color={component.properties.color as any}
              pressed={component.properties.state || false}
            />
            <div className="component-label">
              {component.properties.pin !== undefined
                ? `Pin ${component.properties.pin}`
                : 'No pin'}
            </div>
          </>
        )}
        {component.type === 'potentiometer' && (
          <>
            <Potentiometer {...commonProps} value={component.properties.value || 50} />
            <div className="component-label">
              {component.properties.pin !== undefined
                ? `Pin A${component.properties.pin - 14}`
                : 'No pin'}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="simulator-canvas-container">
      {/* Component Palette */}
      <ComponentPalette onDragStart={setDraggedTemplate} />

      {/* Main Canvas */}
      <div className="simulator-canvas">
        <div className="canvas-header">
          <h3>Arduino Simulator</h3>
          <div className="canvas-header-info">
            <span className={`status-indicator ${running ? 'running' : 'stopped'}`}>
              {running ? 'Running' : 'Stopped'}
            </span>
            <span className="component-count">{components.length} components</span>
          </div>
        </div>
        <div
          className="canvas-content"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => setSelectedComponentId(null)}
        >
          {/* Arduino Uno Board using wokwi-elements */}
          <ArduinoUno
            x={50}
            y={50}
            led13={components.find((c) => c.id === 'led-builtin')?.properties.state || false}
          />

          {/* Components using wokwi-elements */}
          <div className="components-area">{components.map(renderComponent)}</div>
        </div>
      </div>

      {/* Pin Selector Modal */}
      {showPinSelector && selectedComponentId && (
        <PinSelector
          componentId={selectedComponentId}
          componentType={
            components.find((c) => c.id === selectedComponentId)?.type || 'unknown'
          }
          currentPin={
            components.find((c) => c.id === selectedComponentId)?.properties.pin
          }
          onPinSelect={handlePinSelect}
          onClose={() => setShowPinSelector(false)}
          position={pinSelectorPos}
        />
      )}
    </div>
  );
};
