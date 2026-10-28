import { Moon, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { STEPS } from './components/steps'
import { ProgressBar } from './components/ui'
import { GenerateStep } from './features/generate/GenerateStep'
import { SettingsStep } from './features/llm/SettingsStep'
import { PreviewStep } from './features/preview/PreviewStep'
import { ReviewStep } from './features/screens/ReviewStep'
import { UploadStep } from './features/upload/UploadStep'
import { useAppStore } from './store/appStore'

export default function App() {
  const step = useAppStore((s) => s.step)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const index = STEPS.findIndex((s) => s.id === step)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-6xl items-center gap-4">
            <p className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
              Step {index + 1} of {STEPS.length} · <span className="text-slate-800 dark:text-slate-200">{STEPS[index].label}</span>
            </p>
            <ProgressBar value={((index + 1) / STEPS.length) * 100} label="Wizard progress" />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 lg:hidden dark:hover:bg-slate-800"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
        <div key={step} className="mx-auto max-w-6xl animate-fade-in px-6 py-8">
          {step === 'upload' && <UploadStep />}
          {step === 'review' && <ReviewStep />}
          {step === 'configure' && <SettingsStep />}
          {step === 'generate' && <GenerateStep />}
          {step === 'preview' && <PreviewStep />}
        </div>
      </main>
    </div>
  )
}
