import type { LLMProviderConfig } from '../../../types'
import { LLMError, type ChatMessage, type CompletionOptions, type FetchLike, type LLMClient } from '../types'
import { errorFromResponse, safeFetch } from './http'

export const ANTHROPIC_API_VERSION = '2023-06-01'

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
}

/** Client for Anthropic's Messages API (`POST /v1/messages`). */
export function createAnthropicClient(
  config: LLMProviderConfig,
  fetchImpl: FetchLike,
  baseUrl: string,
): LLMClient {
  return {
    providerId: config.id,
    model: config.model,
    async complete(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<string> {
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
      const conversation = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }))

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_API_VERSION,
        // Required by Anthropic for direct browser (CORS) access with a user-supplied key.
        'anthropic-dangerous-direct-browser-access': 'true',
      }
      if (config.apiKey) headers['x-api-key'] = config.apiKey

      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: opts.maxTokens ?? config.maxTokens ?? 4096,
        temperature: opts.temperature ?? config.temperature ?? 0.2,
        messages: conversation,
      }
      if (system) body.system = system

      const res = await safeFetch(config.id, fetchImpl, `${baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      if (!res.ok) throw await errorFromResponse(config.id, res)

      const json = (await res.json()) as MessagesResponse
      const text = (json.content ?? [])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('')
      if (!text) throw new LLMError(config.id, 'Unexpected response: no text content returned.')
      return text
    },
  }
}
