/** Split arbitrary text into alphanumeric words. */
function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

/** "user list screen" -> "UserListScreen". Guarantees a valid identifier. */
export function toPascalCase(input: string): string {
  const result = words(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
  if (!result) return 'Screen'
  return /^[0-9]/.test(result) ? `Screen${result}` : result
}

/** "Email Address" -> "emailAddress". Guarantees a valid identifier. */
export function toCamelCase(input: string): string {
  const pascal = toPascalCase(input)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

/** "User List Screen" -> "user-list-screen". */
export function toKebabCase(input: string): string {
  const result = words(input)
    .map((w) => w.toLowerCase())
    .join('-')
  return result || 'screen'
}

/** Small unique-ish id generator (no crypto needed for UI ids). */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}

/** Escape text for safe interpolation into generated HTML/JSX text nodes. */
export function escapeMarkup(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
}

/** Escape text for interpolation into a single-quoted TS/JS string literal. */
export function escapeSingleQuoted(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}
