import { clsx } from 'clsx'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, PageHeader, ProgressBar, Segmented } from '../../components/ui'
import { frameworkFor, useAppStore } from '../../store/appStore'
import type { GenerationStatus } from '../../types'
import { PROVIDERS, validateProviderConfig } from '../llm/llmService'
import { cancelGeneration, startGeneration } from './generationController'
import { FRAMEWORK_OPTIONS, getGenerator } from './generators'

const STATUS: Record<GenerationStatus | 'idle', { icon: LucideIcon; label: string; className: string }> = {
  idle: { icon: Clock, label: 'Not started', className: 'text-slate-400' },
  queued: { icon: Clock, label: 'Queued', className: 'text-slate-400' },
  generating: { icon: Loader2, label: 'Generating…', className: 'animate-spin text-brand-500' },
  done: { icon: CheckCircle2, label: 'Done', className: 'text-emerald-500' },
  error: { icon: AlertCircle, label: 'Error', className: 'text-red-500' },
}

function duration(start?: number, end?: number): string | null {
  if (!start || !end) return null
  return `${((end - start) / 1000).toFixed(1)}s`
}

export function GenerateStep() {
  const { screens, results, framework, setFramework, activeProvider, providers, setStep, clearResults, openPreview } =
    useAppStore()
  const config = providers[activeProvider]
  const configError = validateProviderConfig(config)

  const statuses = screens.map((s) => results[s.id]?.status)
  const running = statuses.some((s) => s === 'queued' || s === 'generating')
  const finished = statuses.filter((s) => s === 'done' || s === 'error').length
  const done = statuses.filter((s) => s === 'done').length
  const failed = statuses.filter((s) => s === 'error').length
  const progress = screens.length ? (finished / screens.length) * 100 : 0
  const pending = screens.filter((s) => results[s.id]?.status !== 'done')

  const generateAll = () => {
    clearResults()
    void startGeneration(screens)
  }

  return (
    <>
      <PageHeader
        title="Generate code"
        description="Each screen is sent to the active LLM with its extracted structure. You get a component, styles, a dummy JSON response and a mock API layer per screen."
        actions={
          <Segmented label="Target framework" value={framework} options={FRAMEWORK_OPTIONS} onChange={setFramework} />
        }
      />

      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <Cpu className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {PROVIDERS[activeProvider].label} <span className="font-normal text-slate-500">· {config.model}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {configError ? (
                  <span className="text-amber-600 dark:text-amber-400">{configError}</span>
                ) : (
                  <>
                    {screens.length} screens · {done} done{failed ? ` · ${failed} failed` : ''}
                  </>
                )}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep('configure')}>
              Change
            </Button>
          </div>
          {running ? (
            <Button variant="secondary" icon={<Square className="size-4" />} onClick={cancelGeneration}>
              Cancel
            </Button>
          ) : (
            <>
              {failed > 0 && (
                <Button
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => void startGeneration(pending)}
                  disabled={!!configError}
                >
                  Retry failed ({failed})
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                icon={<Sparkles className="size-4" />}
                onClick={generateAll}
                disabled={!!configError || screens.length === 0}
              >
                {finished > 0 ? 'Regenerate all' : 'Generate all screens'}
              </Button>
            </>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <ProgressBar value={progress} label="Overall generation progress" />
          <span className="w-12 shrink-0 text-right text-xs font-medium text-slate-500 tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <ul className="card divide-y divide-slate-200 dark:divide-slate-800" aria-live="polite">
        {screens.map((screen) => {
          const result = results[screen.id]
          const status = result?.status ?? 'idle'
          const meta = STATUS[status]
          const Icon = meta.icon
          const fw = result?.framework ?? frameworkFor(screen, framework)
          const files = result?.files.length ? result.files.map((f) => f.path) : getGenerator(fw).expectedFiles(screen).map((f) => f.path)
          return (
            <li key={screen.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <Icon className={clsx('size-5 shrink-0', meta.className)} aria-label={meta.label} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{screen.name}</p>
                  <Badge tone="brand">{getGenerator(fw).label}</Badge>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {meta.label}
                    {duration(result?.startedAt, result?.finishedAt) && ` · ${duration(result?.startedAt, result?.finishedAt)}`}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{files.join('  ·  ')}</p>
                {status === 'done' &&
                  result?.warnings?.map((w) => (
                    <p key={w} className="mt-1 text-xs break-words text-amber-600 dark:text-amber-400">
                      {w}
                    </p>
                  ))}
                {result?.error && (
                  <p className="mt-1 text-xs break-words text-red-600 dark:text-red-400" role="alert">
                    {result.error}
                  </p>
                )}
              </div>
              {(status === 'error' || (status === 'done' && !!result?.warnings?.length)) && (
                <Button
                  size="sm"
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => void startGeneration([screen])}
                  disabled={!!configError}
                >
                  Retry
                </Button>
              )}
              {status === 'done' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Eye className="size-3.5" />}
                  onClick={() => openPreview(screen.id)}
                >
                  View code
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-8 flex justify-end">
        <Button
          variant="primary"
          size="lg"
          disabled={done === 0}
          onClick={() => setStep('preview')}
          icon={<ArrowRight className="size-4" />}
        >
          Preview & export
        </Button>
      </div>
    </>
  )
}
