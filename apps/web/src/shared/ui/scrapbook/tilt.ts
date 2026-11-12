/** Largest tilt of a card, in degrees, either way. */
export const MAX_TILT = 2.5;

const STEPS = Math.round(MAX_TILT * 10) * 2 + 1; // -2.5 … 2.5 in 0.1° steps = 51 values

/**
 * A small, stable tilt for a person's card, derived from their id (FNV-1a hash), so the
 * board looks hand-made but a card never changes angle between renders or devices.
 */
export function tiltFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const step = (hash >>> 0) % STEPS;
  return (step - (STEPS - 1) / 2) / 10;
}
