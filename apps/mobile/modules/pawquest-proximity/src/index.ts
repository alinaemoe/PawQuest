import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface ProximityEvent {
  readonly near: boolean;
  readonly distanceCm: number;
  readonly maxRangeCm: number;
}

interface NativeProximity {
  isAvailable(): boolean;
  maxRangeCm(): number;
  start(): boolean;
  stop(): void;
  addListener(event: 'onProximity', listener: (e: ProximityEvent) => void): EventSubscription;
}

const native = requireNativeModule<NativeProximity>('PawQuestProximity');

export const Proximity = {
  isAvailable: (): boolean => native.isAvailable(),
  maxRangeCm: (): number => native.maxRangeCm(),
  /** Starts the sensor; false when the phone has none. */
  start: (): boolean => native.start(),
  stop: (): void => {
    native.stop();
  },
  onChange: (listener: (e: ProximityEvent) => void): EventSubscription =>
    native.addListener('onProximity', listener),
};
