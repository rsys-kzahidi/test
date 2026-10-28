import { clsx } from 'clsx'
import { Check, Copy, FileCode2, FileJson, Palette, PlugZap, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAppStore } from '../../store/appStore'
import type { GeneratedFile, GeneratedFileKind } from '../../types'

SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('jsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('javascript', typescript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('less', css)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('html', markup)
SyntaxHighlighter.registerLanguage('markdown', markdown)

const KIND_ICON: Record<GeneratedFileKind, LucideIcon> = {
  component: FileCode2,
  template: FileCode2,
  styles: Palette,
  'mock-data': FileJson,
  'api-service': PlugZap,
  other: FileCode2,
}

const KIND_LABEL: Record<GeneratedFileKind, string> = {
  component: 'Component',
  template: 'Template',
  styles: 'Styles',
  'mock-data': 'Mock data',
  'api-service': 'API service',
  other: 'File',
}

export function CodeViewer({ files }: { files: GeneratedFile[] }) {
  const theme = useAppStore((s) => s.theme)
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const file = files[Math.min(active, files.length - 1)]

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  if (!file) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content)
      setCopied(true)
    } catch {
      // Clipboard may be unavailable (insecure context); fall back to a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = file.content
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      setCopied(true)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 pr-2 dark:border-slate-800 dark:bg-slate-900">
        <div role="tablist" aria-label="Generated files" className="flex min-w-0 overflow-x-auto">
          {files.map((f, i) => {
            const Icon = KIND_ICON[f.kind]
            const selected = i === active
            return (
              <button
                key={f.path}
                type="button"
                role="tab"
                id={`tab-${i}`}
                aria-selected={selected}
                aria-controls="code-panel"
                onClick={() => setActive(i)}
                title={`${KIND_LABEL[f.kind]} · ${f.path}`}
                className={clsx(
                  'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 font-mono text-xs transition',
                  selected
                    ? 'border-brand-500 bg-white text-slate-900 dark:bg-slate-950 dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {f.path}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={`Copy ${file.path} to clipboard`}
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div id="code-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="max-h-[65vh] overflow-auto text-[13px]">
        <SyntaxHighlighter
          language={file.language}
          style={theme === 'dark' ? oneDark : oneLight}
          showLineNumbers
          customStyle={{ margin: 0, borderRadius: 0, background: 'transparent', padding: '1rem' }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        >
          {file.content}
        </SyntaxHighlighter>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>{KIND_LABEL[file.kind]}</span>
        <span>
          {file.content.split('\n').length - 1} lines · {file.language}
        </span>
      </div>
    </div>
  )
}
