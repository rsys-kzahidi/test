import { clsx } from 'clsx'
import { CheckCircle2, Download, FolderDown, Package, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { useAppStore } from '../../store/appStore'
import { toKebabCase } from '../../utils/strings'
import { getGenerator } from '../generate/generators'
import { ScreenIcon } from '../screens/ScreenIcon'
import { CodeViewer } from './CodeViewer'
import { downloadZip } from './zipExport'

export function PreviewStep() {
  const { screens, results, previewScreenId, openPreview, setStep } = useAppStore()
  const [downloading, setDownloading] = useState<'all' | 'one' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ordered = screens.map((s) => results[s.id]).filter((r) => r?.status === 'done' && r.files.length > 0)
  const selected = ordered.find((r) => r.screenId === previewScreenId) ?? ordered[0]

  if (!selected) {
    return (
      <>
        <PageHeader title="Preview & export" />
        <EmptyState
          icon={<Package className="size-6" />}
          title="Nothing generated yet"
          action={
            <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => setStep('generate')}>
              Go to generation
            </Button>
          }
        >
          Generate code for at least one screen to preview and download it.
        </EmptyState>
      </>
    )
  }

  const download = async (scope: 'all' | 'one') => {
    setDownloading(scope)
    setError(null)
    try {
      if (scope === 'all') await downloadZip(ordered, screens)
      else await downloadZip([selected], screens, `${toKebabCase(selected.screenName)}.zip`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloading(null)
    }
  }

  const totalFiles = ordered.reduce((n, r) => n + r.files.length, 0)

  return (
    <>
      <PageHeader
        title="Preview & export"
        description={`${ordered.length} screen${ordered.length === 1 ? '' : 's'} · ${totalFiles} files generated. Browse each file, copy it, or download everything as a ZIP organised per screen.`}
        actions={
          <>
            <Button
              icon={<FolderDown className="size-4" />}
              loading={downloading === 'one'}
              onClick={() => void download('one')}
            >
              This screen
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={<Download className="size-4" />}
              loading={downloading === 'all'}
              onClick={() => void download('all')}
            >
              Download ZIP
            </Button>
          </>
        }
      />
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Generated screens" className="card h-fit p-2">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {ordered.map((r) => {
              const active = r.screenId === selected.screenId
              return (
                <li key={r.screenId}>
                  <button
                    type="button"
                    onClick={() => openPreview(r.screenId)}
                    aria-current={active ? 'true' : undefined}
                    className={clsx(
                      'flex w-full min-w-40 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition',
                      active
                        ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-500/10 dark:text-brand-200'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    <ScreenIcon name={r.screenName} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{r.screenName}</span>
                    <span className="text-[10px] tracking-wide text-slate-400 uppercase">{r.framework}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <section aria-label={`${selected.screenName} files`} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{selected.screenName}</h2>
            <Badge tone="brand">{getGenerator(selected.framework).label}</Badge>
            <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
              {selected.files.length} files
            </Badge>
            {selected.model && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                via {selected.provider} · {selected.model}
              </span>
            )}
          </div>
          <CodeViewer key={selected.screenId} files={selected.files} />
        </section>
      </div>
    </>
  )
}
