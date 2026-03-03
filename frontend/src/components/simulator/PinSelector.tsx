import { useState } from 'react';
import './PinSelector.css';

interface PinSelectorProps {
  componentId: string;
  componentType: string;
  currentPin?: number;
  onPinSelect: (componentId: string, pin: number) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

// Arduino Uno pin groups
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

export const PinSelector = ({
  componentId,
  componentType,
  currentPin,
  onPinSelect,
  onClose,
  position,
}: PinSelectorProps) => {
  const [selectedPin, setSelectedPin] = useState<number | undefined>(currentPin);

  const handlePinClick = (pin: number) => {
    setSelectedPin(pin);
  };

  const handleConfirm = () => {
    if (selectedPin !== undefined) {
      onPinSelect(componentId, selectedPin);
      onClose();
    }
  };

  const formatPinLabel = (pin: number): string => {
    if (pin >= 14 && pin <= 19) {
      return `A${pin - 14}`;
    }
    return `D${pin}`;
  };

  return (
    <div className="pin-selector-overlay" onClick={onClose}>
      <div
        className="pin-selector"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pin-selector-header">
          <h4>Select Pin</h4>
          <span className="component-type-label">{componentType}</span>
        </div>

        {PIN_GROUPS.map((group) => (
          <div key={group.label} className="pin-group">
            <div className="pin-group-label">{group.label}</div>
            <div className="pin-grid">
              {group.pins.map((pin) => (
                <button
                  key={pin}
                  className={`pin-button ${selectedPin === pin ? 'selected' : ''} ${
                    currentPin === pin ? 'current' : ''
                  }`}
                  onClick={() => handlePinClick(pin)}
                >
                  {formatPinLabel(pin)}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pin-selector-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={selectedPin === undefined}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
