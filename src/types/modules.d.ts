declare module 'mammoth/mammoth.browser.js' {
  const mammoth: typeof import('mammoth')
  export default mammoth
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
