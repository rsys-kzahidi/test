import type { Screen } from '../../types'
import { detectScreens } from './detectScreens'

export type DocumentKind = 'pdf' | 'docx' | 'text'

/** File extensions accepted by the upload zone. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const

/** Minimal file-like shape (a browser `File` satisfies it). */
export interface DocumentLike {
  name: string
  type?: string
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

export class UnsupportedDocumentError extends Error {
  constructor(fileName: string) {
    super(
      `Unsupported file type for "${fileName}". Please upload a PDF (.pdf) or Word (.docx) document` +
        ' (plain .txt/.md are also accepted).',
    )
    this.name = 'UnsupportedDocumentError'
  }
}

/** Determine how a file should be parsed, based on extension and MIME type. */
export function getDocumentKind(fileName: string, mimeType = ''): DocumentKind | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf'
  if (
    name.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx'
  if (name.endsWith('.txt') || name.endsWith('.md') || mimeType.startsWith('text/')) return 'text'
  return null
}

interface PdfTextItem {
  str: string
  hasEOL?: boolean
  transform?: number[]
}

/** Rebuild readable lines from pdf.js text items (which are positioned fragments). */
export function pdfItemsToText(items: PdfTextItem[]): string {
  let out = ''
  let lastY: number | undefined
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    const y = item.transform?.[5]
    if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) {
      out += '\n'
    }
    out += item.str
    if (item.hasEOL) out += '\n'
    if (y !== undefined) lastY = y
  }
  return out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
}

/** Extract text from a PDF using pdf.js. Pages are separated by a form-feed (`\f`). */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await loadingTask.promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      pages.push(pdfItemsToText(content.items as PdfTextItem[]))
    }
  } finally {
    await loadingTask.destroy()
  }
  return pages.join('\n\f\n')
}

/** Extract raw text from a Word .docx using mammoth. */
export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  // The prebuilt browser bundle avoids Node-only built-ins (works in browsers, Node and Vitest).
  const mod = await import('mammoth/mammoth.browser.js')
  const mammoth = mod.default ?? (mod as unknown as typeof import('mammoth'))
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return result.value
}

/** Extract plain text from any supported document. */
export async function extractText(file: DocumentLike): Promise<string> {
  const kind = getDocumentKind(file.name, file.type)
  switch (kind) {
    case 'pdf':
      return extractPdfText(await file.arrayBuffer())
    case 'docx':
      return extractDocxText(await file.arrayBuffer())
    case 'text':
      return file.text()
    default:
      throw new UnsupportedDocumentError(file.name)
  }
}

export interface ParsedDocument {
  fileName: string
  kind: DocumentKind
  text: string
  screens: Screen[]
}

/** Extract text from a document and detect the screens it describes. */
export async function parseDocument(file: DocumentLike): Promise<ParsedDocument> {
  const kind = getDocumentKind(file.name, file.type)
  if (!kind) throw new UnsupportedDocumentError(file.name)
  const text = await extractText(file)
  if (!text.trim()) {
    throw new Error(
      `No text could be extracted from "${file.name}". Scanned/image-only documents are not supported (no OCR).`,
    )
  }
  return { fileName: file.name, kind, text, screens: detectScreens(text, file.name) }
}
