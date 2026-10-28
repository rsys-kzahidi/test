import type { LLMProviderConfig, Screen } from '../../../types'
import { formatFilesAsResponse } from '../../generate/fileFormat'
import { getGenerator } from '../../generate/generators'
import { extractScreenSpec } from '../../generate/prompts'
import type { ChatMessage, CompletionOptions, LLMClient } from '../types'

export interface MockClientOptions {
  /** Simulated latency range in ms. Use 0 in tests. */
  latencyMs?: number
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * Offline "LLM" used for demos and tests. It reads the structured screen spec
 * embedded in the prompt and answers in exactly the same wire format a real
 * model is asked to use, so the full pipeline (prompt → response → parsing →
 * preview → ZIP) runs without any API key.
 */
export function createMockClient(config: LLMProviderConfig, options: MockClientOptions = {}): LLMClient {
  const latency = options.latencyMs ?? 900
  return {
    providerId: 'mock',
    model: config.model,
    async complete(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<string> {
      if (latency > 0) await sleep(latency * (0.6 + Math.random() * 0.8), opts.signal)
      const prompt = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const spec = extractScreenSpec(prompt)
      if (!spec) return 'OK — offline demo provider is ready.'

      const screen: Screen = {
        id: 'mock',
        rawText: '',
        name: spec.screen.name,
        description: spec.screen.description ?? '',
        sections: spec.screen.sections ?? [],
        fields: spec.screen.fields ?? [],
        buttons: spec.screen.buttons ?? [],
      }
      const files = getGenerator(spec.framework).generateOffline(screen, spec.branding)
      return formatFilesAsResponse(files)
    },
  }
}
