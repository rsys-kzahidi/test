import { clsx } from 'clsx'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Eye,
  EyeOff,
  Loader2,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, PageHeader } from '../../components/ui'
import { useAppStore, type ConnectionStatus } from '../../store/appStore'
import type { ProviderId } from '../../types'
import { PROVIDER_ORDER, PROVIDERS, testProviderConnection, validateProviderConfig } from './llmService'

const ICONS: Record<ProviderId, LucideIcon> = {
  mock: Zap,
  openai: Sparkles,
  anthropic: Bot,
  local: Server,
}

function StatusBadge({ status }: { status?: ConnectionStatus }) {
  switch (status?.state) {
    case 'testing':
      return (
        <Badge tone="brand" icon={<Loader2 className="size-3 animate-spin" />}>
          Testing…
        </Badge>
      )
    case 'ok':
      return (
        <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>
          Connected
        </Badge>
      )
    case 'error':
      return (
        <Badge tone="danger" icon={<AlertCircle className="size-3" />}>
          Failed
        </Badge>
      )
    default:
      return (
        <Badge icon={<CircleDashed className="size-3" />}>
          Not tested
        </Badge>
      )
  }
}

function ProviderCard({ id }: { id: ProviderId }) {
  const def = PROVIDERS[id]
  const { providers, activeProvider, setActiveProvider, updateProvider, connection, setConnection } = useAppStore()
  const config = providers[id]
  const status = connection[id]
  const active = activeProvider === id
  const [showKey, setShowKey] = useState(false)
  const Icon = ICONS[id]
  const validation = validateProviderConfig(config)
  const listId = `models-${id}`

  const test = async () => {
    setConnection(id, { state: 'testing' })
    const result = await testProviderConnection(config)
    setConnection(id, result.ok ? { state: 'ok', message: result.message } : { state: 'error', message: result.message })
  }

  return (
    <article
      className={clsx(
        'card flex flex-col gap-4 p-5 transition',
        active ? 'ring-2 ring-brand-500 dark:ring-brand-400' : 'hover:border-slate-300 dark:hover:border-slate-700',
      )}
      aria-label={`${def.label} provider`}
    >
      <header className="flex items-start gap-3">
        <div
          className={clsx(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{def.label}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
        </div>
        {id !== 'mock' && <StatusBadge status={status} />}
      </header>

      {id === 'mock' ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          Generates complete React/Angular screens, dummy JSON and mock API services from deterministic templates.
          Perfect for demos — no keys or network required.
        </p>
      ) : (
        <div className="grid gap-3">
          {(def.requiresApiKey || id === 'local') && (
            <div>
              <label className="label" htmlFor={`key-${id}`}>
                API key {!def.requiresApiKey && <span className="normal-case">(optional)</span>}
              </label>
              <div className="relative">
                <input
                  id={`key-${id}`}
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={id === 'openai' ? 'sk-…' : id === 'anthropic' ? 'sk-ant-…' : 'Not required for Ollama'}
                  className="input pr-10 font-mono"
                  value={config.apiKey ?? ''}
                  onChange={(e) => updateProvider(id, { apiKey: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor={`model-${id}`}>
              Model
            </label>
            <input
              id={`model-${id}`}
              list={listId}
              className="input"
              value={config.model}
              onChange={(e) => updateProvider(id, { model: e.target.value })}
            />
            <datalist id={listId}>
              {def.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label" htmlFor={`url-${id}`}>
              Base URL {!def.requiresBaseUrl && <span className="normal-case">(optional override)</span>}
            </label>
            <input
              id={`url-${id}`}
              className="input font-mono"
              placeholder={def.defaultBaseUrl ?? 'http://localhost:11434/v1'}
              value={config.baseUrl ?? ''}
              disabled={config.useProxy}
              onChange={(e) => updateProvider(id, { baseUrl: e.target.value })}
            />
            {config.useProxy ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                The proxy forwards to the upstream URL configured in the server's <code>.env</code>.
              </p>
            ) : (
              id === 'local' && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ollama: <code>http://localhost:11434/v1</code> · LM Studio: <code>http://localhost:1234/v1</code>
                </p>
              )
            )}
          </div>

          {def.proxyPath && (
            <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-600"
                checked={!!config.useProxy}
                onChange={(e) => updateProvider(id, { useProxy: e.target.checked })}
              />
              <span>
                Route through local proxy <code className="text-xs">{def.proxyPath}</code>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Avoids CORS and keeps keys server-side (run <code>npm run server</code>; keys from <code>.env</code>).
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      {status && (status.state === 'ok' || status.state === 'error') && (
        <p
          role="status"
          className={clsx(
            'rounded-lg p-2.5 text-xs break-words',
            status.state === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
          )}
        >
          {status.message}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        {id !== 'mock' ? (
          <Button
            size="sm"
            onClick={test}
            loading={status?.state === 'testing'}
            disabled={!!validation}
            title={validation ?? undefined}
            icon={<Zap className="size-3.5" />}
          >
            Test connection
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant={active ? 'primary' : 'secondary'}
          onClick={() => setActiveProvider(id)}
          aria-pressed={active}
          icon={active ? <CheckCircle2 className="size-3.5" /> : undefined}
        >
          {active ? 'Active provider' : 'Use this provider'}
        </Button>
      </footer>
      {validation && id !== 'mock' && <p className="-mt-2 text-xs text-amber-600 dark:text-amber-400">{validation}</p>}
    </article>
  )
}

export function SettingsStep() {
  const { activeProvider, providers, setStep, screens } = useAppStore()
  const activeError = validateProviderConfig(providers[activeProvider])

  return (
    <>
      <PageHeader
        title="Configure LLM provider"
        description="Choose which model generates your code. The pipeline is provider-agnostic — switch at any time without changing anything else."
      />
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/5 dark:text-brand-200">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Settings, including API keys, are stored only in this browser&apos;s localStorage and sent directly to the
          provider you choose (or to your local proxy). Nothing is hard-coded or committed.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {PROVIDER_ORDER.map((id) => (
          <ProviderCard key={id} id={id} />
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-end gap-4">
        {activeError && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {PROVIDERS[activeProvider].label}: {activeError}
          </p>
        )}
        <Button
          variant="primary"
          size="lg"
          disabled={!!activeError || screens.length === 0}
          onClick={() => setStep('generate')}
          icon={<ArrowRight className="size-4" />}
        >
          Continue to generation
        </Button>
      </div>
    </>
  )
}
