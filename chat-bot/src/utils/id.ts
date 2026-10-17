/**
 * Generates a unique identifier using crypto.randomUUID when available,
 * falling back to timestamp + pseudo-random string for broader compatibility.
 *
 * @param prefix Optional prefix to prepend to the ID (e.g. 'session', 'compress')
 * @returns Unique string ID
 */
export function generateId(prefix?: string): string {
  let unique: string;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    unique = crypto.randomUUID();
  } else {
    unique = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  return prefix ? `${prefix}-${unique}` : unique;
}
