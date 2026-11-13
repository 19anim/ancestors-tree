const OBJECT_ID = /^[a-f0-9]{24}$/;

/** True for a MongoDB ObjectId written as 24 lowercase hex characters. */
export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

function randomBytes(count: number): Uint8Array {
  // Web Crypto: the same call works in browsers and in Node 24.
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Five random bytes per process (one browser tab or one API instance), as in MongoDB. */
const PROCESS_PART = toHex(randomBytes(5));
let counter = new DataView(randomBytes(4).buffer).getUint32(0) & 0xffffff;

/**
 * A new ObjectId made on the client, so an optimistic edit can show the new person at once
 * (spec §5): 4 bytes of seconds since 1970, 5 random bytes, a 3-byte counter.
 */
export function newObjectId(now: number = Date.now()): string {
  counter = (counter + 1) & 0xffffff;
  const seconds = Math.floor(now / 1000) >>> 0;
  return `${seconds.toString(16).padStart(8, '0')}${PROCESS_PART}${counter.toString(16).padStart(6, '0')}`;
}
