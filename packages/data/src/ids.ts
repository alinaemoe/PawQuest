/**
 * UUID v7 (spec 08 §8.1): a 48-bit millisecond timestamp followed by random bits, so ids sort by
 * creation time. `random` returns a number in [0, 1) and is injected: Hermes has no guaranteed
 * `crypto`, and tests need determinism.
 */
export function uuidv7(nowMs: number, random: () => number): string {
  const bytes: number[] = [];
  let time = Math.floor(nowMs);
  for (let i = 0; i < 6; i += 1) {
    bytes.unshift(time % 256);
    time = Math.floor(time / 256);
  }
  for (let i = 0; i < 10; i += 1) {
    bytes.push(Math.floor(random() * 256) % 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC 4122 variant
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What every repository function needs from the outside world: the clock and an id source. */
export interface Ctx {
  now(): number;
  newId(): string;
}

export function createCtx(
  now: () => number = () => Date.now(),
  random: () => number = Math.random,
): Ctx {
  return { now, newId: () => uuidv7(now(), random) };
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function fromIso(iso: string): number {
  return Date.parse(iso);
}

/** A record that was just written must be readable; anything else is a bug worth a clear error. */
export function expectFound<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`${what} was not found right after it was saved`);
  }
  return value;
}
