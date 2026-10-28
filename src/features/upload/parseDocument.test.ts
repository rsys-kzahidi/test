import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  extractDocxText,
  getDocumentKind,
  parseDocument,
  pdfItemsToText,
  UnsupportedDocumentError,
  type DocumentLike,
} from './parseDocument'

function fakeFile(name: string, data: string | Uint8Array, type = ''): DocumentLike {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return {
    name,
    type,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    text: async () => new TextDecoder().decode(bytes),
  }
}

/** Build a minimal but valid .docx in memory. */
async function buildDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('getDocumentKind', () => {
  it('detects supported kinds by extension and MIME type', () => {
    expect(getDocumentKind('Spec.PDF')).toBe('pdf')
    expect(getDocumentKind('blob', 'application/pdf')).toBe('pdf')
    expect(getDocumentKind('design.docx')).toBe('docx')
    expect(getDocumentKind('notes.md')).toBe('text')
    expect(getDocumentKind('legacy.doc')).toBeNull()
    expect(getDocumentKind('image.png', 'image/png')).toBeNull()
  })
})

describe('pdfItemsToText', () => {
  it('rebuilds lines from positioned pdf.js text items', () => {
    const text = pdfItemsToText([
      { str: 'Screen 1:', transform: [1, 0, 0, 1, 0, 700] },
      { str: ' Login', transform: [1, 0, 0, 1, 50, 700], hasEOL: true },
      { str: 'Fields:  Email,', transform: [1, 0, 0, 1, 0, 680] },
      { str: ' Password', transform: [1, 0, 0, 1, 80, 680] },
      { str: 'Buttons: Sign in', transform: [1, 0, 0, 1, 0, 660] },
    ])
    expect(text).toBe('Screen 1: Login\nFields: Email, Password\nButtons: Sign in')
  })
})

describe('parseDocument', () => {
  it('extracts text from a Word .docx and detects screens', async () => {
    const docx = await buildDocx(['Screen 1: Sign Up', 'Fields: Full name, Email', 'Buttons: Create account'])
    expect(await extractDocxText(docx.slice().buffer as ArrayBuffer)).toContain('Screen 1: Sign Up')

    const parsed = await parseDocument(fakeFile('signup.docx', docx))
    expect(parsed.kind).toBe('docx')
    expect(parsed.screens).toHaveLength(1)
    expect(parsed.screens[0]).toMatchObject({
      name: 'Sign Up',
      fields: [
        { label: 'Full name', type: 'text' },
        { label: 'Email', type: 'email' },
      ],
      buttons: ['Create account'],
      sourceFile: 'signup.docx',
    })
    expect(parsed.branding).toEqual({ logoDetected: false, fontConfidence: 'none', sourceFile: 'signup.docx' })
  })

  it('parses plain text documents', async () => {
    const parsed = await parseDocument(fakeFile('spec.txt', 'Screen: Home\nWelcome page.\nButtons: Start'))
    expect(parsed.screens[0].name).toBe('Home')
    expect(parsed.branding).toEqual({ logoDetected: false, fontConfidence: 'none', sourceFile: 'spec.txt' })
  })

  it('rejects unsupported and empty documents', async () => {
    await expect(parseDocument(fakeFile('old.doc', 'x'))).rejects.toBeInstanceOf(UnsupportedDocumentError)
    await expect(parseDocument(fakeFile('empty.txt', '   '))).rejects.toThrow(/No text could be extracted/)
  })
})
