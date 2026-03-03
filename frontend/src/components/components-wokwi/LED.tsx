import '@wokwi/elements';
import { useRef, useEffect } from 'react';

interface LEDProps {
  id?: string;
  color?: 'red' | 'green' | 'blue' | 'yellow' | 'white' | 'orange';
  value?: boolean;
  label?: string;
  x?: number;
  y?: number;
  onPinClick?: (pinName: string) => void;
}

export const LED = ({
  id,
  color = 'red',
  value = false,
  label,
  x = 0,
  y = 0,
  onPinClick,
}: LEDProps) => {
  const ledRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ledRef.current) {
      // Set properties directly on DOM element (Web Component API)
      (ledRef.current as any).value = value;
      (ledRef.current as any).color = color;
      if (label) {
        (ledRef.current as any).label = label;
      }
    }
  }, [value, color, label]);

  useEffect(() => {
    if (ledRef.current && onPinClick) {
      const element = ledRef.current as any;
      // wokwi-elements expose pinInfo for pin positions
      const pinInfo = element.pinInfo; // [{ name: 'A', x, y }, { name: 'C', x, y }]

      if (pinInfo) {
        pinInfo.forEach((pin: any) => {
          const pinElement = element.shadowRoot?.querySelector(
            `[data-pin="${pin.name}"]`
          );
          if (pinElement) {
            pinElement.addEventListener('click', () => onPinClick(pin.name));
          }
        });
      }
    }
  }, [onPinClick]);

  return (
    <wokwi-led
      id={id}
      ref={ledRef}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
      }}
    />
  );
};
