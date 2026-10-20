// The phone's proximity sensor (screen lock while walking) has no web counterpart.
export interface ProximityEvent {
  readonly near: boolean;
  readonly distanceCm: number;
  readonly maxRangeCm: number;
}
export const Proximity = {
  isAvailable: (): boolean => false,
  maxRangeCm: (): number => 0,
  start: (): boolean => false,
  stop: (): void => undefined,
  onChange: (): { remove: () => void } => ({ remove: () => undefined }),
};
