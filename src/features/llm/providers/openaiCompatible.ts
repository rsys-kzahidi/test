import type { LLMProviderConfig } from '../../../types'
import { LLMError, type ChatMessage, type CompletionOptions, type FetchLike, type LLMClient } from '../types'
import { errorFromResponse, safeFetch } from './http'

export interface OpenAICompatibleOptions {
  baseUrl: string
  /** OpenAI's API uses `max_completion_tokens`; most local servers still expect `max_tokens`. */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

/**
 * Client for any OpenAI-style `/chat/completions` endpoint. Used by the OpenAI
 * provider and by the Local provider (Ollama, LM Studio, vLLM, llama.cpp server…).
 */
export function createOpenAICompatibleClient(
  config: LLMProviderConfig,
  fetchImpl: FetchLike,
  options: OpenAICompatibleOptions,
): LLMClient {
  return {
    providerId: config.id,
    model: config.model,
    async complete(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<string> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey

      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: opts.temperature ?? config.temperature ?? 0.2,
      }
      const maxTokens = opts.maxTokens ?? config.maxTokens
      if (maxTokens) body[options.maxTokensParam] = maxTokens

      const url = `${options.baseUrl}/chat/completions`
      const res = await safeFetch(config.id, fetchImpl, url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      if (!res.ok) throw await errorFromResponse(config.id, res)

      const json = (await res.json()) as ChatCompletionResponse
      const content = json.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new LLMError(config.id, 'Unexpected response: no message content in choices[0].')
      }
      return content
    },
  }
}
