// Lightweight HTML sanitizer — strips tags and encodes dangerous characters.
// Used as defense-in-depth before sending user input to the API.
// Backend also validates/sanitizes; this is a client-side layer.

const DANGEROUS = /[<>"'`]/g;
const ENCODE_MAP = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/**
 * Sanitize a single string value.
 * Strips HTML tags and encodes dangerous characters.
 */
export function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '').replace(DANGEROUS, (c) => ENCODE_MAP[c] ?? c);
}

/**
 * Recursively sanitize all string values in an object or array.
 * Non-string primitives (numbers, booleans) pass through unchanged.
 */
export function sanitizePayload(payload) {
  if (Array.isArray(payload)) return payload.map(sanitizePayload);
  if (payload !== null && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, sanitizePayload(v)])
    );
  }
  if (typeof payload === 'string') return sanitizeString(payload);
  return payload;
}
