import type { BrandLogo } from '../../types'
import { LOGO_MIME_TYPES } from '../generate/generators/branding'

/** Largest logo file accepted from the user. */
export const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024

export const LOGO_PROMPT =
  'We detected a logo in your document. Would you like to provide/upload the logo image to use consistently across generated screens?'

/** `accept` attribute for the logo file input. */
export const LOGO_ACCEPT = '.png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg'

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/**
 * Resolve the MIME type of a logo file, falling back to its extension (some
 * browsers report an empty type for SVG). Returns undefined when unsupported.
 */
export function logoMimeType(name: string, type: string): string | undefined {
  const normalized = type.toLowerCase()
  if (normalized && LOGO_MIME_TYPES[normalized]) return normalized
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_MIME[ext]
}

/** Validate a user supplied logo file and read it as a data URL. */
export async function readLogoFile(file: File): Promise<BrandLogo> {
  const mimeType = logoMimeType(file.name, file.type)
  if (!mimeType) throw new Error('Unsupported logo format. Use a .png, .svg or .jpg image.')
  if (file.size > MAX_LOGO_FILE_SIZE) throw new Error('Logo image must be 2 MB or smaller.')
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the logo file.'))
    reader.readAsDataURL(file)
  })
  // Rebuild the data URL with the validated MIME type so it always matches the asset extension.
  return { dataUrl: `data:${mimeType};base64,${base64}`, fileName: file.name, mimeType }
}
