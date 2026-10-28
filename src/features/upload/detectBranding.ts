import JSZip from 'jszip'
import type { BrandLogo, BrandingDetection } from '../../types'
import { FONT_SUGGESTIONS, sanitizeFontFamily } from '../generate/generators/branding'

/**
 * Heuristics that detect branding (a logo image and the dominant heading font)
 * in uploaded design documents. Everything here is best-effort: callers must
 * treat failures as "nothing detected" and let the user confirm/override.
 */

export const NO_BRANDING_DETECTED: BrandingDetection = { logoDetected: false, fontConfidence: 'none' }

/** Largest embedded image (bytes) offered as a logo candidate. */
export const MAX_LOGO_CANDIDATE_BYTES = 2 * 1024 * 1024

// ---------------------------------------------------------------------------
// Font names
// ---------------------------------------------------------------------------

const KNOWN_FAMILIES = [
  ...FONT_SUGGESTIONS,
  'Helvetica Neue',
  'Arial Black',
  'Aptos',
  'Century Gothic',
  'Franklin Gothic',
  'Gill Sans',
  'Futura',
  'Avenir',
  'Avenir Next',
  'Proxima Nova',
  'Source Sans Pro',
  'Roboto Slab',
  'Roboto Condensed',
  'Roboto Mono',
  'Noto Serif',
  'PT Sans',
  'PT Serif',
  'Book Antiqua',
  'Palatino',
  'Candara',
  'Constantia',
  'Corbel',
  'Consolas',
  'Lucida Sans',
  'SF Pro Display',
  'SF Pro Text',
]

const compact = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '')
const KNOWN_BY_KEY = new Map(KNOWN_FAMILIES.map((f) => [compact(f), f]))

/** Fonts that never represent a brand font (generic CSS families, symbol/dingbat fonts). */
const IGNORED_FONTS = new Set(
  ['serif', 'sans-serif', 'sansserif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'symbol', 'zapfdingbats', 'wingdings', 'webdings'].map(
    compact,
  ),
)

const STYLE_SUFFIX =
  /(?:[\s_-]*)(bold|italic|oblique|light|medium|regular|roman|semibold|demibold|demi|extrabold|ultrabold|extralight|ultralight|black|heavy|thin|book|normal)$/i

export interface NormalizedFont {
  family: string
  /** Whether the family matched a well-known font. */
  known: boolean
}

/**
 * Turn a raw font name from a document into a family name, e.g.
 * "ABCDEF+Roboto-Bold" → "Roboto", "TimesNewRomanPSMT" → "Times New Roman",
 * "OpenSans-SemiBoldItalic" → "Open Sans", "Arial,Bold" → "Arial".
 */
export function normalizeFontName(raw: string | undefined | null): NormalizedFont | null {
  if (!raw) return null
  const lookup = (candidate: string) => KNOWN_BY_KEY.get(compact(candidate))
  let name = raw.trim().replace(/^[A-Z]{6}\+/, '')
  if (lookup(name)) return { family: lookup(name)!, known: true }

  name = name.split(',')[0]
  if (IGNORED_FONTS.has(compact(name))) return null
  // PostScript names: Family-Style. Keep the family part.
  if (!/\s/.test(name)) name = name.split('-')[0]
  name = name.replace(/(?:PSMT|PS|MT)$/, '')
  for (let i = 0; i < 4 && !lookup(name) && STYLE_SUFFIX.test(name); i++) {
    const stripped = name.replace(STYLE_SUFFIX, '')
    if (!stripped) break
    name = stripped
  }
  name = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_]+/g, ' ')
  const family = sanitizeFontFamily(name)
  if (!family || IGNORED_FONTS.has(compact(family)) || family.length < 2) return null
  const known = KNOWN_BY_KEY.get(compact(family))
  return known ? { family: known, known: true } : { family, known: false }
}

export interface FontSample {
  /** Raw font name, e.g. "ABCDEF+Inter-Bold". */
  fontName: string
  /** Font size in points. */
  size: number
  text: string
}

/**
 * Pick the dominant heading font: samples noticeably larger than the body text size
 * are treated as headings; their fonts are tallied by character count. When the
 * document has no larger text, the overall dominant font is used.
 */
export function detectHeadingFont(samples: FontSample[]): Pick<BrandingDetection, 'fontFamily' | 'fontConfidence'> {
  const usable = samples
    .map((s) => ({ ...s, chars: s.text.replace(/\s+/g, '').length, font: normalizeFontName(s.fontName) }))
    .filter((s) => s.chars > 0 && s.size > 0 && s.font)
  if (usable.length === 0) return { fontConfidence: 'none' }

  const charsBySize = new Map<number, number>()
  for (const s of usable) {
    const size = Math.round(s.size * 2) / 2
    charsBySize.set(size, (charsBySize.get(size) ?? 0) + s.chars)
  }
  const bodySize = [...charsBySize.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
  const headings = usable.filter((s) => s.size >= bodySize * 1.15)
  const pool = headings.length ? headings : usable

  const tally = new Map<string, { chars: number; known: boolean }>()
  for (const s of pool) {
    const entry = tally.get(s.font!.family) ?? { chars: 0, known: s.font!.known }
    entry.chars += s.chars
    tally.set(s.font!.family, entry)
  }
  const [family, best] = [...tally.entries()].sort((a, b) => b[1].chars - a[1].chars)[0]
  return { fontFamily: family, fontConfidence: best.known ? 'high' : 'low' }
}

// ---------------------------------------------------------------------------
// PDF images (pdf.js operator list)
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** Same as pdf.js `Util.transform`: concatenate `m` onto the current transform. */
function multiply(ctm: Matrix, m: ArrayLike<number>): Matrix {
  return [
    ctm[0] * m[0] + ctm[2] * m[1],
    ctm[1] * m[0] + ctm[3] * m[1],
    ctm[0] * m[2] + ctm[2] * m[3],
    ctm[1] * m[2] + ctm[3] * m[3],
    ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
    ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
  ]
}

function isMatrix(value: unknown): value is ArrayLike<number> {
  return (Array.isArray(value) || ArrayBuffer.isView(value)) && (value as ArrayLike<number>).length === 6
}

/** Subset of pdf.js `OPS` codes used by {@link findHeaderImage}. */
export interface PdfOpCodes {
  save: number
  restore: number
  transform: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  paintImageXObject: number
  paintInlineImageXObject: number
}

export interface PdfOperatorList {
  fnArray: ArrayLike<number>
  argsArray: ArrayLike<unknown>
}

export interface ImageBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Locate an image that looks like a logo on a page: it must sit in the header area
 * (top 30% of the page), be visible (≥ 8pt each side) and be small (≤ 25% of the page,
 * which excludes full-page backgrounds / scanned pages).
 * `view` is the pdf.js page view box `[x0, y0, x1, y1]` (PDF units, origin bottom-left).
 */
export function findHeaderImage(ops: PdfOperatorList, view: number[], codes: PdfOpCodes): ImageBox | null {
  const [vx0, vy0, vx1, vy1] = view
  const pageW = vx1 - vx0
  const pageH = vy1 - vy0
  if (pageW <= 0 || pageH <= 0) return null

  let ctm: Matrix = IDENTITY
  const stack: Matrix[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[] | null
    if (fn === codes.save) stack.push(ctm)
    else if (fn === codes.restore) ctm = stack.pop() ?? IDENTITY
    else if (fn === codes.transform) {
      if (args && args.length >= 6) ctm = multiply(ctm, args as number[])
    } else if (fn === codes.paintFormXObjectBegin) {
      stack.push(ctm)
      if (args && isMatrix(args[0])) ctm = multiply(ctm, args[0])
    } else if (fn === codes.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY
    else if (fn === codes.paintImageXObject || fn === codes.paintInlineImageXObject) {
      // Images are painted into the unit square transformed by the CTM.
      const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]]
      const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]]
      const box = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
      const centerY = box.y + box.height / 2
      const inHeader = centerY >= vy0 + pageH * 0.7
      const visible = box.width >= 8 && box.height >= 8
      const small = box.width * box.height <= pageW * pageH * 0.25
      if (inHeader && visible && small) return box
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// DOCX (Office Open XML parts read with JSZip)
// ---------------------------------------------------------------------------

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function attr(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`))
  return m ? decodeXml(m[2]) : undefined
}

const HAS_IMAGE = /<w:drawing\b|<v:imagedata\b|<pic:pic\b/

/** XML of the first `count` paragraphs of the document body (where a logo would sit). */
function leadingParagraphs(documentXml: string, count = 3): string {
  const body = documentXml.slice(Math.max(0, documentXml.indexOf('<w:body')))
  let end = 0
  for (let i = 0; i < count; i++) {
    const next = body.indexOf('</w:p>', end)
    if (next < 0) return body
    end = next + '</w:p>'.length
  }
  return body.slice(0, end)
}

function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return `${partPath.slice(0, slash)}/_rels/${partPath.slice(slash + 1)}.rels`
}

async function extractImage(zip: JSZip, partPath: string, xml: string): Promise<BrandLogo | undefined> {
  const rid = attr(xml.match(/<a:blip\b[^>]*>/)?.[0] ?? '', 'r:embed') ?? attr(xml.match(/<v:imagedata\b[^>]*>/)?.[0] ?? '', 'r:id')
  if (!rid) return undefined
  const rels = await zip.file(relsPathFor(partPath))?.async('string')
  const rel = rels?.match(new RegExp(`<Relationship\\b[^>]*\\bId\\s*=\\s*["']${rid}["'][^>]*>`))?.[0]
  const target = rel ? attr(rel, 'Target') : undefined
  if (!target || /^[a-z]+:/i.test(target)) return undefined
  const dir = partPath.slice(0, partPath.lastIndexOf('/'))
  const resolved = target.startsWith('/') ? target.slice(1) : `${dir}/${target}`.replace(/[^/]+\/\.\.\//g, '')
  const file = zip.file(resolved)
  const ext = resolved.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = MIME_BY_EXT[ext]
  if (!file || !mimeType) return undefined
  const base64 = await file.async('base64')
  if (base64.length * 0.75 > MAX_LOGO_CANDIDATE_BYTES) return undefined
  return { dataUrl: `data:${mimeType};base64,${base64}`, fileName: resolved.split('/').pop()!, mimeType }
}

function themeFont(themeXml: string | undefined, kind: 'major' | 'minor'): string | undefined {
  const block = themeXml?.match(new RegExp(`<a:${kind}Font>([\\s\\S]*?)</a:${kind}Font>`))?.[1]
  return block ? attr(block.match(/<a:latin\b[^>]*>/)?.[0] ?? '', 'typeface') : undefined
}

/** Font from a `<w:rFonts>` element, resolving theme references. */
function rFontsFamily(xml: string, themeXml: string | undefined): string | undefined {
  const tag = xml.match(/<w:rFonts\b[^>]*>/)?.[0]
  if (!tag) return undefined
  const explicit = attr(tag, 'w:ascii') ?? attr(tag, 'w:hAnsi')
  if (explicit) return explicit
  const theme = attr(tag, 'w:asciiTheme') ?? attr(tag, 'w:hAnsiTheme')
  if (theme) return themeFont(themeXml, theme.startsWith('major') ? 'major' : 'minor')
  return undefined
}

const HEADING_STYLE = /^(title|heading\s*\d|heading\d)$/i

/** Font names used by headings in a DOCX, most specific first. */
export function docxHeadingFonts(documentXml: string, stylesXml?: string, themeXml?: string): string[] {
  const fonts: string[] = []
  const usedStyles = new Set<string>()
  // 1. Direct formatting on runs inside heading/title paragraphs.
  for (const p of documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []) {
    const style = attr(p.match(/<w:pStyle\b[^>]*>/)?.[0] ?? '', 'w:val')
    if (style && HEADING_STYLE.test(style)) {
      usedStyles.add(style.toLowerCase())
      const font = rFontsFamily(p, themeXml)
      if (font) fonts.push(font)
    }
  }
  // 2. Title / heading paragraph styles — styles the document actually uses first.
  const used: string[] = []
  const unused: string[] = []
  for (const s of stylesXml?.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? []) {
    const id = attr(s.match(/<w:style\b[^>]*>/)![0], 'w:styleId')
    if (id && HEADING_STYLE.test(id)) {
      const font = rFontsFamily(s, themeXml)
      if (font) (usedStyles.has(id.toLowerCase()) ? used : unused).push(font)
    }
  }
  fonts.push(...used, ...unused)
  // 3. Theme heading font, then document defaults / theme body font.
  const major = themeFont(themeXml, 'major')
  if (major) fonts.push(major)
  const defaults = stylesXml?.match(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/)?.[1]
  const body = (defaults && rFontsFamily(defaults, themeXml)) ?? themeFont(themeXml, 'minor')
  if (body) fonts.push(body)
  return fonts
}

/** Detect a header/top-of-document logo and the heading font in a .docx. */
export async function detectDocxBranding(data: ArrayBuffer): Promise<BrandingDetection> {
  const zip = await JSZip.loadAsync(data)
  const documentXml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  const stylesXml = await zip.file('word/styles.xml')?.async('string')
  const themePath = Object.keys(zip.files).find((p) => /^word\/theme\/[^/]+\.xml$/.test(p))
  const themeXml = themePath ? await zip.file(themePath)?.async('string') : undefined

  // Logo: an image in a page header part, or near the top of the body.
  const parts: Array<{ path: string; xml: string }> = []
  for (const path of Object.keys(zip.files).filter((p) => /^word\/header\d*\.xml$/.test(p)).sort()) {
    const xml = await zip.file(path)!.async('string')
    if (HAS_IMAGE.test(xml)) parts.push({ path, xml })
  }
  const top = leadingParagraphs(documentXml)
  if (HAS_IMAGE.test(top)) parts.push({ path: 'word/document.xml', xml: top })

  let logoCandidate: BrandLogo | undefined
  for (const part of parts) {
    logoCandidate = await extractImage(zip, part.path, part.xml).catch(() => undefined)
    if (logoCandidate) break
  }

  let font: NormalizedFont | null = null
  for (const raw of docxHeadingFonts(documentXml, stylesXml, themeXml)) {
    font = normalizeFontName(raw)
    if (font) break
  }

  return {
    logoDetected: parts.length > 0,
    ...(logoCandidate ? { logoCandidate } : {}),
    ...(font ? { fontFamily: font.family, fontConfidence: font.known ? 'high' : 'low' } : { fontConfidence: 'none' }),
  }
}

// ---------------------------------------------------------------------------
// Combining results from several uploads
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK = { none: 0, low: 1, high: 2 } as const

/** Merge detection results across documents: any logo counts; the most confident font wins (first on ties). */
export function mergeBrandingDetection(
  current: BrandingDetection | null,
  next: BrandingDetection,
): BrandingDetection {
  if (!current) return next
  const useNextFont = CONFIDENCE_RANK[next.fontConfidence] > CONFIDENCE_RANK[current.fontConfidence]
  const currentHasSignals = current.logoDetected || current.fontConfidence !== 'none'
  const merged: BrandingDetection = {
    logoDetected: current.logoDetected || next.logoDetected,
    fontConfidence: useNextFont ? next.fontConfidence : current.fontConfidence,
  }
  const logoCandidate = current.logoCandidate ?? next.logoCandidate
  if (logoCandidate) merged.logoCandidate = logoCandidate
  const fontFamily = useNextFont ? next.fontFamily : current.fontFamily
  if (fontFamily) merged.fontFamily = fontFamily
  const sourceFile = currentHasSignals ? current.sourceFile : next.sourceFile
  if (sourceFile) merged.sourceFile = sourceFile
  return merged
}
