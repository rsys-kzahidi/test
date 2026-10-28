import type { LLMProviderConfig, ProviderId } from '../../types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

/**
 * Provider-agnostic LLM client. The generation pipeline only depends on this
 * interface, so switching providers never changes the pipeline.
 */
export interface LLMClient {
  readonly providerId: ProviderId
  readonly model: string
  /** Send a chat conversation and resolve with the assistant's text reply. */
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ProviderDependencies {
  fetch?: FetchLike
}

/** Static description of a provider, used by the factory and the settings UI. */
export interface ProviderDefinition {
  id: ProviderId
  label: string
  description: string
  /** Suggested models (users may also type a custom model name). */
  models: string[]
  defaultConfig: LLMProviderConfig
  requiresApiKey: boolean
  requiresBaseUrl: boolean
  /** Base URL used when not proxied and no custom base URL is set. */
  defaultBaseUrl?: string
  /** Path on the optional Express proxy (see /server). Undefined when not proxyable. */
  proxyPath?: string
  createClient(config: LLMProviderConfig, deps: Required<ProviderDependencies>): LLMClient
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export class LLMError extends Error {
  readonly provider: ProviderId
  readonly status?: number

  constructor(provider: ProviderId, message: string, status?: number) {
    super(message)
    this.name = 'LLMError'
    this.provider = provider
    this.status = status
  }
}
