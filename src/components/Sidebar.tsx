import { clsx } from 'clsx'
import { Check, Code2, Cpu, Moon, Sun } from 'lucide-react'
import { PROVIDERS } from '../features/llm/llmService'
import { useAppStore } from '../store/appStore'
import type { StepId } from '../types'
import { STEPS, useStepAvailability } from './steps'

/** Whether a step is complete (shows a check mark). */
function useStepCompletion(): Record<StepId, boolean> {
  const { screens, uploads, results, activeProvider, connection } = useAppStore()
  const all = Object.values(results)
  return {
    upload: uploads.some((u) => u.status === 'parsed') || screens.length > 0,
    review: screens.length > 0 && all.length > 0,
    configure: activeProvider === 'mock' || connection[activeProvider]?.state === 'ok',
    generate: all.length > 0 && all.every((r) => r.status === 'done'),
    preview: false,
  }
}

export function Sidebar() {
  const { step, setStep, theme, toggleTheme, activeProvider, providers } = useAppStore()
  const available = useStepAvailability()
  const complete = useStepCompletion()
  const provider = providers[activeProvider]
  const currentIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r lg:border-b-0 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
          <Code2 className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold">UI Coding Agent</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Design docs → working UI</p>
        </div>
      </div>

      <nav aria-label="Wizard steps" className="flex-1 overflow-x-auto px-3 lg:overflow-visible">
        <ol className="flex gap-1 pb-3 lg:flex-col lg:pb-0">
          {STEPS.map((s, i) => {
            const active = s.id === step
            const done = complete[s.id] && !active
            const Icon = s.icon
            return (
              <li key={s.id} className="relative">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={clsx(
                      'absolute top-12 left-[1.85rem] hidden h-4 w-px lg:block',
                      i < currentIndex ? 'bg-brand-400' : 'bg-slate-200 dark:bg-slate-700',
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  disabled={!available[s.id]}
                  aria-current={active ? 'step' : undefined}
                  className={clsx(
                    'group flex w-full min-w-44 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                    active
                      ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  <span
                    className={clsx(
                      'grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-semibold',
                      active
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : done
                          ? 'border-emerald-500/40 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900',
                    )}
                  >
                    {done ? <Check className="size-4" aria-label="completed" /> : <Icon className="size-4" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      <span className="text-slate-400">{i + 1}.</span> {s.label}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{s.description}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="hidden space-y-3 border-t border-slate-200 p-4 lg:block dark:border-slate-800">
        <button
          type="button"
          onClick={() => setStep('configure')}
          className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          <Cpu className="size-4 text-brand-500" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-500 dark:text-slate-400">Active LLM</span>
            <span className="block truncate text-sm font-medium">
              {PROVIDERS[activeProvider].label} · {provider.model}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span>{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
          {theme === 'dark' ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
        </button>
      </div>
    </aside>
  )
}
