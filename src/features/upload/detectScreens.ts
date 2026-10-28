import type { FieldType, Screen, ScreenField } from '../../types'
import { uid } from '../../utils/strings'

/**
 * Heuristic, dependency-free screen detector. Takes plain text extracted from a
 * PDF/DOCX (pages separated by form-feed `\f`) and splits it into screens with
 * fields, buttons and layout sections.
 *
 * Recognised conventions (case-insensitive):
 *   Screen 1: Login | Page - Dashboard | View: Settings   -> screen heading
 *   ## Login                                             -> markdown heading
 *   Login Screen | 2. Order Details Page                 -> "<name> screen/page/view"
 *   Description: ...  / Purpose: ...                    -> description
 *   Fields: a, b (select: x, y), c  or bullet list       -> fields
 *   Buttons: Save, Cancel  / Actions: ...  or [ Save ]   -> buttons
 *   Sections: / Layout: / Components:                    -> layout sections
 */

const HEADING_PATTERNS: RegExp[] = [
  /^(?:screen|page|view)\s*#?\s*\d*\s*[:\-–—.)]\s*(.+)$/i,
  /^#{1,3}\s+(.+)$/,
  /^(?:\d+[.)]\s+)?([^:\-*•▪◦·[\]][^:[\]]{1,58}?)\s+(?:screen|page|view)\s*$/i,
]

const BULLET = /^(?:[-*•▪◦·‣–]|\d+[.)])\s+(.*)$/
const KEYWORDS: Array<{ key: ListKey | 'description'; re: RegExp }> = [
  { key: 'description', re: /^(?:description|purpose|summary|overview|goal)\b/i },
  { key: 'fields', re: /^(?:form\s+)?(?:fields?|inputs?|form)\b/i },
  { key: 'buttons', re: /^(?:buttons?|actions?|ctas?)\b/i },
  { key: 'sections', re: /^(?:sections?|layout|components?|regions?|widgets?)\b/i },
]

type ListKey = 'fields' | 'buttons' | 'sections'

/** Infer an input type from a field label. */
export function inferFieldType(label: string): FieldType {
  const l = label.toLowerCase()
  if (/search|filter|keyword|query/.test(l)) return 'text'
  if (/e-?mail/.test(l)) return 'email'
  if (/password|passcode|\bpin\b/.test(l)) return 'password'
  if (/phone|mobile|\btel\b|telephone/.test(l)) return 'tel'
  if (/\bdate\b|\bdob\b|birth|deadline|\bfrom\b|\bto\b(?=\s*$)/.test(l)) return 'date'
  if (/remember|agree|accept|subscribe|terms|enabled?\b|active\b/.test(l)) return 'checkbox'
  if (/notes?\b|comments?|message|description|address|remarks|bio\b/.test(l)) return 'textarea'
  if (/amount|price|qty|quantity|\bage\b|count|total|number|\bno\.?\b|budget|salary|cost/.test(l)) return 'number'
  return 'text'
}

function typeFromHint(hint: string): FieldType | undefined {
  const h = hint.toLowerCase().trim()
  if (/^(select|dropdown|drop-down|combo|combobox|radio|choice|options?)/.test(h)) return 'select'
  if (/^(checkbox|check|toggle|switch|boolean)/.test(h)) return 'checkbox'
  if (/^(textarea|multi-?line|long text)/.test(h)) return 'textarea'
  if (/^e-?mail/.test(h)) return 'email'
  if (/^password/.test(h)) return 'password'
  if (/^(number|numeric|integer|decimal|currency)/.test(h)) return 'number'
  if (/^(date|datepicker|date picker)/.test(h)) return 'date'
  if (/^(phone|tel)/.test(h)) return 'tel'
  if (/^(text|string|input)/.test(h)) return 'text'
  return undefined
}

/** Split on commas/semicolons that are not inside parentheses. */
export function splitList(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of input) {
    if (ch === '(' || ch === '[') depth++
    if ((ch === ')' || ch === ']') && depth > 0) depth--
    if ((ch === ',' || ch === ';' || ch === '|') && depth === 0) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Parse a field definition like "Product (select: Laptop, Monitor)" or "Email *". */
export function parseField(raw: string): ScreenField | null {
  let text = raw.replace(/[_.]{3,}/g, '').replace(/\s*\*\s*$/, '').trim()
  text = text.replace(/:\s*$/, '').trim()
  if (!text) return null
  const m = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  if (m && m[1]) {
    const label = m[1].trim()
    const [hintType, ...rest] = m[2].split(':')
    const explicit = typeFromHint(hintType)
    const options = rest.length ? splitList(rest.join(':')) : undefined
    const type = explicit ?? (options?.length ? 'select' : inferFieldType(label))
    return options?.length ? { label, type, options } : { label, type }
  }
  return { label: text, type: inferFieldType(text) }
}

/**
 * Returns the screen name and a rank for a heading line (lower rank = stronger signal),
 * or null when the line is not a heading.
 */
function matchHeading(line: string): { name: string; rank: number } | null {
  for (let i = 0; i < HEADING_PATTERNS.length; i++) {
    const m = line.match(HEADING_PATTERNS[i])
    if (!m || !m[1]) continue
    const name = m[1].replace(/[#*_]+/g, '').trim()
    if (name.length === 0 || name.length > 80) continue
    if (i === 0) return { name, rank: 0 }
    if (i === 1) return { name, rank: line.startsWith('# ') ? 2 : 1 }
    // "<name> screen" style: only short, title-like phrases (avoid matching prose sentences).
    if (name.split(/\s+/).length <= 4 && !/[.!?,]/.test(name)) return { name, rank: 1 }
  }
  return null
}

function matchKeyword(line: string): { key: ListKey | 'description'; rest: string } | null {
  for (const { key, re } of KEYWORDS) {
    const m = line.match(re)
    if (!m) continue
    const after = line.slice(m[0].length)
    // Either "Keyword:" / "Keyword -" followed by content, or the keyword alone.
    const sep = after.match(/^\s*(?:[:\-–—])\s*(.*)$/)
    if (sep) return { key, rest: sep[1].trim() }
    if (/^\s*$/.test(after)) return { key, rest: '' }
  }
  return null
}

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = keyOf(item).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

interface Block {
  name: string
  lines: string[]
}

/** Parse a single block of lines (belonging to one screen) into a Screen. */
export function parseScreenBlock(name: string, lines: string[], sourceFile?: string): Screen {
  const description: string[] = []
  const fields: ScreenField[] = []
  const buttons: string[] = []
  const sections: string[] = []
  let mode: ListKey | 'description' | null = null

  const addItem = (key: ListKey, item: string) => {
    const clean = item.replace(/^\[\s*|\s*\]$/g, '').trim()
    if (!clean) return
    if (key === 'fields') {
      const f = parseField(clean)
      if (f) fields.push(f)
    } else if (key === 'buttons') buttons.push(clean)
    else sections.push(clean)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (mode === 'description') mode = null
      continue
    }

    const kw = matchKeyword(line)
    if (kw) {
      mode = kw.key
      if (kw.rest) {
        if (kw.key === 'description') description.push(kw.rest)
        else if (kw.key === 'sections') sections.push(kw.rest)
        else splitList(kw.rest).forEach((i) => addItem(kw.key as ListKey, i))
      }
      continue
    }

    // Inline bracket buttons: "[ Save ]  [ Cancel ]"
    const brackets = [...line.matchAll(/\[\s*([^\]]{1,40}?)\s*\]/g)].map((m) => m[1])
    if (brackets.length && line.replace(/\[[^\]]*\]/g, '').trim() === '') {
      brackets.forEach((b) => buttons.push(b))
      continue
    }

    const bullet = line.match(BULLET)
    if (bullet) {
      const item = bullet[1].trim()
      if (mode === 'fields' || mode === 'buttons' || mode === 'sections') {
        // Bullets in the fields list may still hold several comma separated items.
        if (mode === 'sections') addItem('sections', item)
        else splitList(item).forEach((i) => addItem(mode as ListKey, i))
      } else {
        sections.push(item)
      }
      continue
    }

    // "Label: ______" style form fields.
    if (/^[^:]{1,40}:\s*[_.]{3,}\s*$/.test(line)) {
      addItem('fields', line)
      continue
    }

    if (mode === 'fields' || mode === 'buttons') {
      // Lists extracted from PDFs often lose their bullet characters: keep short lines in the list.
      if (line.length <= 60 && !/[.!?]$/.test(line)) {
        splitList(line).forEach((i) => addItem(mode as ListKey, i))
        continue
      }
      mode = 'description'
    }
    if (mode === 'sections' && line.length <= 80) {
      sections.push(line)
      continue
    }
    description.push(line)
    mode = 'description'
  }

  return {
    id: uid('screen'),
    name,
    description: description.join(' ').replace(/\s+/g, ' ').trim() || `${name} screen.`,
    sections: dedupe(sections, (s) => s),
    fields: dedupe(fields, (f) => f.label),
    buttons: dedupe(buttons, (b) => b),
    rawText: [name, ...lines].join('\n').trim(),
    sourceFile,
  }
}

function fileBaseName(fileName?: string): string | undefined {
  if (!fileName) return undefined
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || undefined
}

/**
 * Detect screens in extracted document text.
 * @param text Plain text. Pages may be separated by `\f`.
 * @param sourceFile Optional originating file name (used for naming fallbacks).
 */
export function detectScreens(text: string, sourceFile?: string): Screen[] {
  const normalised = text.replace(/\r\n?/g, '\n')
  const lines = normalised.split('\n')
  const blocks: Block[] = []
  let current: Block | null = null

  // Only the strongest heading style present is used to split screens, so e.g. a markdown
  // "# Document title" is ignored when "## Screen" headings exist.
  const headings = lines.map((raw) => {
    const line = raw.replace(/\f/g, '').trim()
    return line ? matchHeading(line) : null
  })
  const bestRank = Math.min(...headings.map((h) => (h ? h.rank : Infinity)))

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const heading = headings[i]
    if (heading && heading.rank === bestRank) {
      current = { name: heading.name, lines: [] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(raw.replace(/\f/g, ''))
    }
  }

  // Drop heading-only blocks (e.g. a document title followed directly by "Screen 1: ...").
  let contentBlocks = blocks.filter((b) => b.lines.some((l) => l.trim()))

  if (contentBlocks.length === 0) {
    // No explicit headings: fall back to one screen per page, or a single screen.
    const pages = normalised
      .split('\f')
      .map((p) => p.split('\n').map((l) => l.trim()))
      .filter((p) => p.some(Boolean))
    if (pages.length === 0) return []
    contentBlocks = pages.map((pageLines, i) => {
      const first = pageLines.find(Boolean) ?? ''
      const looksLikeTitle = first.length <= 60 && !matchKeyword(first)
      const name = looksLikeTitle
        ? first.replace(/[#*_:]+/g, '').trim()
        : pages.length === 1
          ? fileBaseName(sourceFile) ?? 'Screen 1'
          : `Page ${i + 1}`
      const rest = looksLikeTitle ? pageLines.slice(pageLines.indexOf(first) + 1) : pageLines
      return { name: name || `Screen ${i + 1}`, lines: rest }
    })
  }

  return contentBlocks.map((b) => parseScreenBlock(b.name, b.lines, sourceFile))
}
