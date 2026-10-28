import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { BrandingDetection } from '../../types'
import {
  detectDocxBranding,
  detectHeadingFont,
  docxHeadingFonts,
  findHeaderImage,
  mergeBrandingDetection,
  NO_BRANDING_DETECTED,
  normalizeFontName,
  type PdfOpCodes,
} from './detectBranding'

describe('normalizeFontName', () => {
  it.each([
    ['ABCDEF+Roboto-Bold', 'Roboto', true],
    ['TimesNewRomanPSMT', 'Times New Roman', true],
    ['Arial,Bold', 'Arial', true],
    ['OpenSans-SemiBoldItalic', 'Open Sans', true],
    ['Inter', 'Inter', true],
    ['Calibri Light', 'Calibri', true],
    ['MontserratBold', 'Montserrat', true],
    ['AcmeCorpDisplay-Heavy', 'Acme Corp Display', false],
  ])('%s → %s', (raw, family, known) => {
    expect(normalizeFontName(raw)).toEqual({ family, known })
  })

  it('ignores empty, generic and symbol fonts', () => {
    expect(normalizeFontName('')).toBeNull()
    expect(normalizeFontName(undefined)).toBeNull()
    expect(normalizeFontName('sans-serif')).toBeNull()
    expect(normalizeFontName('ABCDEF+Symbol')).toBeNull()
    expect(normalizeFontName('Wingdings')).toBeNull()
  })
})

describe('detectHeadingFont', () => {
  it('prefers the font used by text larger than the body size', () => {
    expect(
      detectHeadingFont([
        { fontName: 'ABCDEF+Montserrat-Bold', size: 24, text: 'Login' },
        { fontName: 'ABCDEF+Montserrat-Bold', size: 18, text: 'Dashboard' },
        { fontName: 'GHIJKL+Roboto-Regular', size: 11, text: 'Body text that is much longer than the headings.' },
        { fontName: 'GHIJKL+Roboto-Regular', size: 11, text: 'More body text in the regular font.' },
      ]),
    ).toEqual({ fontFamily: 'Montserrat', fontConfidence: 'high' })
  })

  it('falls back to the dominant font when every line has the same size', () => {
    expect(
      detectHeadingFont([
        { fontName: 'Lato-Regular', size: 12, text: 'Screen 1: Login' },
        { fontName: 'Arial', size: 12, text: 'x' },
      ]),
    ).toEqual({ fontFamily: 'Lato', fontConfidence: 'high' })
  })

  it('reports low confidence for unknown families and none without usable text', () => {
    expect(detectHeadingFont([{ fontName: 'BrandSans-Bold', size: 20, text: 'Title' }])).toEqual({
      fontFamily: 'Brand Sans',
      fontConfidence: 'low',
    })
    expect(detectHeadingFont([])).toEqual({ fontConfidence: 'none' })
    expect(detectHeadingFont([{ fontName: 'sans-serif', size: 12, text: 'hello' }])).toEqual({ fontConfidence: 'none' })
  })
})

describe('findHeaderImage', () => {
  const OPS: PdfOpCodes = {
    save: 10,
    restore: 11,
    transform: 12,
    paintFormXObjectBegin: 74,
    paintFormXObjectEnd: 75,
    paintImageXObject: 85,
    paintInlineImageXObject: 86,
  }
  const A4 = [0, 0, 595, 842]
  const image = (x: number, y: number, w: number, h: number) => ({
    fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    argsArray: [null, [w, 0, 0, h, x, y], ['img_p0_1', 100, 50], null],
  })

  it('finds a small image in the header area', () => {
    expect(findHeaderImage(image(40, 780, 120, 40), A4, OPS)).toEqual({ x: 40, y: 780, width: 120, height: 40 })
  })

  it('ignores images lower on the page, full-page backgrounds and tiny specks', () => {
    expect(findHeaderImage(image(40, 300, 120, 40), A4, OPS)).toBeNull()
    expect(findHeaderImage(image(0, 0, 595, 842), A4, OPS)).toBeNull()
    expect(findHeaderImage(image(40, 800, 3, 3), A4, OPS)).toBeNull()
    expect(findHeaderImage({ fnArray: [], argsArray: [] }, A4, OPS)).toBeNull()
  })

  it('tracks nested transforms and restores them', () => {
    const ops = {
      fnArray: [OPS.save, OPS.transform, OPS.save, OPS.transform, OPS.restore, OPS.restore, OPS.transform, OPS.paintInlineImageXObject],
      argsArray: [null, [1, 0, 0, 1, 0, 700], null, [2, 0, 0, 2, 0, 0], null, null, [60, 0, 0, 30, 500, 790], [{}]],
    }
    expect(findHeaderImage(ops, A4, OPS)).toEqual({ x: 500, y: 790, width: 60, height: 30 })
  })

  it('applies form XObject matrices', () => {
    const ops = {
      fnArray: [OPS.paintFormXObjectBegin, OPS.transform, OPS.paintImageXObject, OPS.paintFormXObjectEnd],
      argsArray: [[[1, 0, 0, 1, 20, 760], [0, 0, 100, 100]], [80, 0, 0, 40, 0, 0], ['img', 1, 1], null],
    }
    expect(findHeaderImage(ops, A4, OPS)).toEqual({ x: 20, y: 760, width: 80, height: 40 })
  })
})

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const drawing = (rid: string) =>
  `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`

interface DocxOptions {
  bodyXml: string
  stylesXml?: string
  themeXml?: string
  headerXml?: string
}

async function buildDocx({ bodyXml, stylesXml, themeXml, headerXml }: DocxOptions): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document ${W} ${R} ${A}><w:body>${bodyXml}</w:body></w:document>`)
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships><Relationship Id="rId5" Type="image" Target="media/image1.png"/></Relationships>`,
  )
  zip.file('word/media/image1.png', PNG_BYTES)
  if (stylesXml) zip.file('word/styles.xml', stylesXml)
  if (themeXml) zip.file('word/theme/theme1.xml', themeXml)
  if (headerXml) {
    zip.file('word/header1.xml', `<w:hdr ${W} ${R} ${A}>${headerXml}</w:hdr>`)
    zip.file(
      'word/_rels/header1.xml.rels',
      `<Relationships><Relationship Id="rId1" Type="image" Target="../word/media/image1.png"/></Relationships>`,
    )
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return bytes.slice().buffer as ArrayBuffer
}

const THEME = `<a:theme ${A}><a:themeElements><a:fontScheme>
  <a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>
  <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
</a:fontScheme></a:themeElements></a:theme>`

describe('docxHeadingFonts', () => {
  it('orders direct heading formatting, heading styles, theme major and body fonts', () => {
    const doc = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/></w:rPr><w:t>Login</w:t></w:r></w:p>`
    const styles = `<w:styles ${W}>
      <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:styleId="Title"><w:rPr><w:rFonts w:ascii="Georgia"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Courier New"/></w:rPr></w:style>
    </w:styles>`
    expect(docxHeadingFonts(doc, styles, THEME)).toEqual(['Poppins', 'Georgia', 'Calibri Light', 'Calibri'])
  })

  it('resolves theme references in heading styles', () => {
    const styles = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading2"><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/></w:rPr></w:style></w:styles>`
    expect(docxHeadingFonts('<w:p/>', styles, THEME)[0]).toBe('Calibri Light')
  })

  it('ranks heading styles used by the document before unused ones', () => {
    const styles = `<w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="Title"><w:rPr><w:rFonts w:ascii="Poppins" w:hAnsi="Poppins"/></w:rPr></w:style>
    </w:styles>`
    const doc = `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Acme</w:t></w:r></w:p>`
    expect(docxHeadingFonts(doc, styles, THEME).slice(0, 2)).toEqual(['Poppins', 'Calibri Light'])
  })
})

describe('detectDocxBranding', () => {
  it('detects and extracts an inline logo near the top plus the heading font', async () => {
    const data = await buildDocx({
      bodyXml: `<w:p>${drawing('rId5')}</w:p><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Spec</w:t></w:r></w:p>`,
      stylesXml: `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Title"><w:rPr><w:rFonts w:ascii="Open Sans"/></w:rPr></w:style></w:styles>`,
    })
    const result = await detectDocxBranding(data)
    expect(result).toMatchObject({ logoDetected: true, fontFamily: 'Open Sans', fontConfidence: 'high' })
    expect(result.logoCandidate).toEqual({
      dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`,
      fileName: 'image1.png',
      mimeType: 'image/png',
    })
  })

  it('detects a logo in the page header and uses the theme heading font', async () => {
    const result = await detectDocxBranding(
      await buildDocx({ bodyXml: '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>', headerXml: `<w:p>${drawing('rId1')}</w:p>`, themeXml: THEME }),
    )
    expect(result).toMatchObject({ logoDetected: true, fontFamily: 'Calibri', fontConfidence: 'high' })
    expect(result.logoCandidate?.mimeType).toBe('image/png')
  })

  it('ignores images further down the document and reports nothing for plain documents', async () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => `<w:p><w:r><w:t>Paragraph ${i}</w:t></w:r></w:p>`).join('')
    expect(await detectDocxBranding(await buildDocx({ bodyXml: `${paragraphs}<w:p>${drawing('rId5')}</w:p>` }))).toEqual(
      NO_BRANDING_DETECTED,
    )
  })

  it('still flags a logo when the image cannot be extracted', async () => {
    const result = await detectDocxBranding(await buildDocx({ bodyXml: `<w:p>${drawing('rId404')}</w:p>` }))
    expect(result.logoDetected).toBe(true)
    expect(result.logoCandidate).toBeUndefined()
  })
})

describe('mergeBrandingDetection', () => {
  const pdf: BrandingDetection = { logoDetected: true, fontConfidence: 'low', fontFamily: 'Brand Sans', sourceFile: 'a.pdf' }
  const docx: BrandingDetection = { logoDetected: false, fontConfidence: 'high', fontFamily: 'Inter', sourceFile: 'b.docx' }

  it('keeps any logo and the most confident font', () => {
    expect(mergeBrandingDetection(null, pdf)).toBe(pdf)
    expect(mergeBrandingDetection(pdf, docx)).toEqual({
      logoDetected: true,
      fontConfidence: 'high',
      fontFamily: 'Inter',
      sourceFile: 'a.pdf',
    })
    expect(mergeBrandingDetection({ ...NO_BRANDING_DETECTED, sourceFile: 'x.txt' }, docx).sourceFile).toBe('b.docx')
  })
})
