import type { LLMProviderConfig, ProviderId } from '../../types'
import { createAnthropicClient } from './providers/anthropic'
import { resolveBaseUrl } from './providers/http'
import { createMockClient } from './providers/mock'
import { createOpenAICompatibleClient } from './providers/openaiCompatible'
import {
  LLMError,
  type ConnectionTestResult,
  type LLMClient,
  type ProviderDefinition,
  type ProviderDependencies,
} from './types'

/**
 * Provider registry. To add a provider, add its id to `ProviderId` and register
 * a `ProviderDefinition` here — the settings UI renders a card for every entry.
 */
export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  mock: {
    id: 'mock',
    label: 'Offline demo',
    description: 'Template-based generator that runs entirely in the browser. No API key needed.',
    models: ['offline-template-v1'],
    defaultConfig: { id: 'mock', label: 'Offline demo', model: 'offline-template-v1' },
    requiresApiKey: false,
    requiresBaseUrl: false,
    createClient: (config) => createMockClient(config),
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models via the OpenAI Chat Completions API.',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.1', 'gpt-4.1-mini'],
    defaultConfig: { id: 'openai', label: 'OpenAI', model: 'gpt-4o', apiKey: '', maxTokens: 4096 },
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    proxyPath: '/api/llm/openai',
    createClient: (config, deps) =>
      createOpenAICompatibleClient(config, deps.fetch, {
        baseUrl: resolveBaseUrl(config, PROVIDERS.openai),
        maxTokensParam: 'max_completion_tokens',
      }),
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude models via the Anthropic Messages API.',
    models: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest', 'claude-sonnet-4-0', 'claude-3-5-haiku-latest'],
    defaultConfig: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      model: 'claude-3-5-sonnet-latest',
      apiKey: '',
      maxTokens: 4096,
    },
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    proxyPath: '/api/llm/anthropic',
    createClient: (config, deps) =>
      createAnthropicClient(config, deps.fetch, resolveBaseUrl(config, PROVIDERS.anthropic)),
  },
  local: {
    id: 'local',
    label: 'Local LLM',
    description: 'Any OpenAI-compatible server: Ollama, LM Studio, vLLM, llama.cpp…',
    models: ['llama3.1', 'qwen2.5-coder', 'codellama', 'mistral', 'deepseek-coder-v2'],
    defaultConfig: {
      id: 'local',
      label: 'Local LLM',
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      maxTokens: 4096,
    },
    requiresApiKey: false,
    requiresBaseUrl: true,
    proxyPath: '/api/llm/local',
    createClient: (config, deps) =>
      createOpenAICompatibleClient(config, deps.fetch, {
        baseUrl: resolveBaseUrl(config, PROVIDERS.local),
        maxTokensParam: 'max_tokens',
      }),
  },
}

export const PROVIDER_ORDER: ProviderId[] = ['mock', 'openai', 'anthropic', 'local']

export function defaultProviderConfigs(): Record<ProviderId, LLMProviderConfig> {
  return Object.fromEntries(PROVIDER_ORDER.map((id) => [id, { ...PROVIDERS[id].defaultConfig }])) as Record<
    ProviderId,
    LLMProviderConfig
  >
}

/** Returns a human readable validation error, or null when the config is usable. */
export function validateProviderConfig(config: LLMProviderConfig): string | null {
  const def = PROVIDERS[config.id]
  if (!def) return `Unknown provider "${config.id}".`
  if (!config.model?.trim()) return 'Please choose a model.'
  // API keys may live on the proxy server instead of the browser.
  if (def.requiresApiKey && !config.useProxy && !config.apiKey?.trim()) return 'An API key is required.'
  if (def.requiresBaseUrl && !config.useProxy) {
    const url = config.baseUrl?.trim()
    if (!url) return 'A base URL is required (e.g. http://localhost:11434/v1).'
    try {
      const parsed = new URL(url)
      if (!/^https?:$/.test(parsed.protocol)) return 'Base URL must start with http:// or https://.'
    } catch {
      return 'Base URL is not a valid URL.'
    }
  }
  return null
}

/** Create a provider-agnostic client for the given configuration. */
export function createLLMClient(config: LLMProviderConfig, deps: ProviderDependencies = {}): LLMClient {
  const def = PROVIDERS[config.id]
  if (!def) throw new LLMError(config.id, `Unknown provider "${config.id}".`)
  const error = validateProviderConfig(config)
  if (error) throw new LLMError(config.id, error)
  const fetchImpl = deps.fetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
  return def.createClient(config, { fetch: fetchImpl })
}

/** Send a tiny prompt to verify credentials, base URL and model. */
export async function testProviderConnection(
  config: LLMProviderConfig,
  deps: ProviderDependencies = {},
): Promise<ConnectionTestResult> {
  const started = Date.now()
  try {
    const client = createLLMClient(config, deps)
    const reply = await client.complete(
      [
        { role: 'system', content: 'You are a connectivity check. Reply with the single word OK.' },
        { role: 'user', content: 'ping' },
      ],
      { maxTokens: 16, temperature: 0 },
    )
    const latencyMs = Date.now() - started
    return {
      ok: true,
      latencyMs,
      message: `Connected to ${PROVIDERS[config.id].label} (${config.model}) in ${latencyMs} ms — replied "${reply.trim().slice(0, 40)}".`,
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
