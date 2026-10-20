import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

// SPIKE: a placeholder with the same names as the native library. The real one draws maplibre-gl.
export type StyleSpecification = Record<string, unknown>;
export interface CameraRef {
  easeTo(options: unknown): void;
  fitBounds(bounds: readonly number[], options?: unknown): void;
  flyTo(options: unknown): void;
  setStop(options: unknown): void;
}

export function Map({
  style,
  children,
}: {
  style?: ViewStyle;
  children?: ReactNode;
  [k: string]: unknown;
}) {
  return (
    <View
      style={[
        { backgroundColor: '#e3ebe6', alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Text style={{ color: '#66756c' }}>Карта (веб-демо)</Text>
      {children}
    </View>
  );
}

export const Camera = forwardRef<CameraRef, Record<string, unknown>>(function Camera(_props, ref) {
  useImperativeHandle(ref, () => ({
    easeTo: () => undefined,
    fitBounds: () => undefined,
    flyTo: () => undefined,
    setStop: () => undefined,
  }));
  return null;
});

type Silent = (props: Record<string, unknown>) => null;
export const GeoJSONSource: Silent = () => null;
export const Layer: Silent = () => null;
export const Marker: Silent = () => null;
