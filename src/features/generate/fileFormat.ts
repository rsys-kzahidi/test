import type { GeneratedFile, GeneratedFileKind } from '../../types'

/**
 * Wire format exchanged with the LLM. Every file is emitted as:
 *
 *   ### FILE: relative/path.ext
 *   ```lang
 *   ...content...
 *   ```
 */
const FILE_HEADER = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*FILE:\s*`?([^`*\n]+?)`?\s*(?:\*\*)?\s*$/i

const LANGUAGE_BY_EXT: Record<string, string> = {
  tsx: 'tsx',
  ts: 'typescript',
  jsx: 'jsx',
  js: 'javascript',
  html: 'html',
  scss: 'scss',
  sass: 'scss',
  css: 'css',
  less: 'less',
  json: 'json',
  md: 'markdown',
  vue: 'html',
}

export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXT[ext] ?? 'text'
}

export function kindForPath(path: string): GeneratedFileKind {
  const p = path.toLowerCase()
  const base = p.split('/').pop() ?? p
  if (p.endsWith('.json')) return 'mock-data'
  if (/\.service\.ts$|(^|[/._-])api([/._-]|$)|client\.ts$/.test(p) || /^use[A-Z]\w*\.tsx?$/.test(path.split('/').pop() ?? '')) {
    return 'api-service'
  }
  if (base.endsWith('.html')) return 'template'
  if (/\.(s?css|sass|less)$/.test(base)) return 'styles'
  if (/\.(tsx|jsx|vue)$|\.component\.ts$/.test(base)) return 'component'
  return 'other'
}

/**
 * Normalise an LLM-provided path into a safe relative path: strips leading
 * slashes, drive letters, "." and ".." segments and unusual characters so a
 * ZIP can never write outside its folder.
 */
export function sanitizePath(path: string): string {
  const segments = path
    .replace(/^[a-zA-Z]:/, '')
    .split(/[\\/]+/)
    .map((s) => s.trim().replace(/[^\w.\-@ ]/g, ''))
    .filter((s) => s && s !== '.' && s !== '..' && !/^\.+$/.test(s))
  return segments.join('/')
}

function stripFence(chunk: string): string {
  let text = chunk.replace(/^\s*\n/, '').replace(/\s+$/, '')
  const open = text.match(/^\s*(`{3,}|~{3,})[^\n]*\n/)
  if (open) {
    const fence = open[1]
    text = text.slice(open[0].length)
    const closeIdx = text.lastIndexOf(`\n${fence}`)
    if (closeIdx >= 0) text = text.slice(0, closeIdx)
    else if (text.endsWith(fence)) text = text.slice(0, -fence.length)
  }
  return text.replace(/\s+$/, '') + '\n'
}

/** Parse an LLM response in the wire format into generated files. */
export function parseGeneratedFiles(response: string): GeneratedFile[] {
  const lines = response.replace(/\r\n?/g, '\n').split('\n')
  const chunks: Array<{ path: string; lines: string[] }> = []
  let current: { path: string; lines: string[] } | null = null
  let fence: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const header = !fence ? line.match(FILE_HEADER) : null
    if (header) {
      current = { path: header[1].trim(), lines: [] }
      chunks.push(current)
      continue
    }
    if (current) {
      const marker = trimmed.match(/^(`{3,}|~{3,})/)?.[1]
      if (marker && !fence) fence = marker
      else if (marker && fence && trimmed === fence) fence = null
      current.lines.push(line)
    }
  }

  const files: GeneratedFile[] = []
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const path = sanitizePath(chunk.path)
    if (!path || seen.has(path)) continue
    const content = stripFence(chunk.lines.join('\n'))
    if (!content.trim()) continue
    seen.add(path)
    files.push({ path, content, language: languageForPath(path), kind: kindForPath(path) })
  }
  return files
}

/** Serialise files into the wire format (used by the offline mock provider). */
export function formatFilesAsResponse(files: GeneratedFile[], preamble = ''): string {
  const body = files
    .map((f) => {
      const fence = f.content.includes('```') ? '~~~~' : '```'
      return `### FILE: ${f.path}\n${fence}${f.language}\n${f.content.replace(/\n$/, '')}\n${fence}`
    })
    .join('\n\n')
  return preamble ? `${preamble}\n\n${body}\n` : `${body}\n`
}
