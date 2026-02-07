// ---------------------------------------------------------------------------
// Protocol generation
// ---------------------------------------------------------------------------

/**
 * Generates a protocol string in the format "PAR-YYYY-000123".
 *
 * @param slug  - Parish slug (uppercased, first 3 chars used as prefix)
 * @param sequence - Sequential number for the request
 */
export function generateProtocol(slug: string, sequence: number): string {
  const prefix = slug.toUpperCase().slice(0, 3);
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(6, "0");
  return `${prefix}-${year}-${seq}`;
}

// ---------------------------------------------------------------------------
// Phone helpers
// ---------------------------------------------------------------------------

/**
 * Formats a raw phone string (digits only) to the pattern (XX) XXXXX-XXXX.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return phone;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Validates whether a phone string matches (XX) XXXXX-XXXX.
 */
export function isValidPhone(phone: string): boolean {
  return /^\(\d{2}\)\s\d{5}-\d{4}$/.test(phone);
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the name contains at least two words.
 */
export function isFullName(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Truncates text to `maxLen` characters, appending "..." when truncated.
 */
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// ---------------------------------------------------------------------------
// Date / time helpers (Brazilian locale)
// ---------------------------------------------------------------------------

/**
 * Formats a Date object to DD/MM/YYYY.
 */
export function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Validates and returns a time string in HH:mm format.
 * Throws if the value does not match the expected pattern.
 */
export function formatTimeBR(time: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Horario invalido: "${time}". Esperado formato HH:mm.`);
  }
  return time;
}
