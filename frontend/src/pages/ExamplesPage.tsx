/**
 * Examples Page Component
 *
 * Displays the examples gallery
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExamplesGallery } from '../components/examples/ExamplesGallery';
import { AppHeader } from '../components/layout/AppHeader';
import { useEditorStore } from '../store/useEditorStore';
import { useSimulatorStore } from '../store/useSimulatorStore';
import { isBoardComponent } from '../utils/boardPinMapping';
import type { ExampleProject } from '../data/examples';

export const ExamplesPage: React.FC = () => {
  const navigate = useNavigate();
  const { setCode } = useEditorStore();
  const { setComponents, setWires, setBoardType, activeBoardId } = useSimulatorStore();

  const handleLoadExample = (example: ExampleProject) => {
    console.log('Loading example:', example.title);

    // Switch board type if the example specifies one
    const targetBoard = example.boardType || 'arduino-uno';
    setBoardType(targetBoard);

    // Load the code into the editor
    setCode(example.code);

    // Filter out board components from examples (board is rendered separately in SimulatorCanvas)
    const componentsWithoutBoard = example.components.filter(
      (comp) =>
        !comp.type.includes('arduino') &&
        !comp.type.includes('pico') &&
        !comp.type.includes('esp32')
    );

    // Load components into the simulator
    // Convert component type to metadataId (e.g., 'wokwi-led' -> 'led')
    setComponents(
      componentsWithoutBoard.map((comp) => ({
        id: comp.id,
        metadataId: comp.type.replace('wokwi-', ''),
        x: comp.x,
        y: comp.y,
        properties: comp.properties,
      }))
    );

    // The active board's instance ID (DOM id of the board element).
    // setBoardType changes boardKind but not the instance ID, so wires that
    // reference any known board component ID must be remapped to this ID.
    const boardInstanceId = activeBoardId ?? 'arduino-uno';
    const remapBoardId = (id: string) => isBoardComponent(id) ? boardInstanceId : id;

    // Load wires — positions are calculated by SimulatorCanvas after mount
    const wiresWithPositions = example.wires.map((wire) => ({
      id: wire.id,
      start: {
        componentId: remapBoardId(wire.start.componentId),
        pinName: wire.start.pinName,
        x: 0,
        y: 0,
      },
      end: {
        componentId: remapBoardId(wire.end.componentId),
        pinName: wire.end.pinName,
        x: 0,
        y: 0,
      },
      color: wire.color,
      controlPoints: [],
      isValid: true,
      signalType: 'digital' as const,
    }));

    setWires(wiresWithPositions);

    // Navigate to the editor
    navigate('/editor');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1e1e1e' }}>
      <AppHeader />
      <ExamplesGallery onLoadExample={handleLoadExample} />
    </div>
  );
};
