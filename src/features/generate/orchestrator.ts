import type { GeneratedFile, GenerationResult, Screen, TargetFramework } from '../../types'
import type { LLMClient } from '../llm/types'
import { parseGeneratedFiles } from './fileFormat'
import { buildGenerationMessages } from './prompts'

export interface GenerateScreenOptions {
  client: LLMClient
  framework: TargetFramework
  signal?: AbortSignal
}

/** Generate the files for a single screen through the provider-agnostic client. */
export async function generateScreen(screen: Screen, options: GenerateScreenOptions): Promise<GeneratedFile[]> {
  const messages = buildGenerationMessages(screen, options.framework)
  const response = await options.client.complete(messages, { signal: options.signal })
  const files = parseGeneratedFiles(response)
  if (files.length === 0) {
    throw new Error(
      'The model response did not contain any files in the expected "### FILE: <path>" format. Try again or use a more capable model.',
    )
  }
  return files
}

export interface RunQueueOptions {
  client: LLMClient
  resolveFramework: (screen: Screen) => TargetFramework
  onUpdate: (result: GenerationResult) => void
  concurrency?: number
  signal?: AbortSignal
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

/**
 * Generate several screens with bounded concurrency, reporting per-screen
 * status transitions (queued → generating → done | error) via `onUpdate`.
 */
export async function runGenerationQueue(screens: Screen[], options: RunQueueOptions): Promise<GenerationResult[]> {
  const { client, resolveFramework, onUpdate, signal } = options
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const results: GenerationResult[] = screens.map((s) => ({
    screenId: s.id,
    screenName: s.name,
    framework: resolveFramework(s),
    status: 'queued',
    files: [],
    provider: client.providerId,
    model: client.model,
  }))
  results.forEach((r) => onUpdate({ ...r }))

  let next = 0
  const worker = async () => {
    while (next < screens.length) {
      const index = next++
      const screen = screens[index]
      const base = results[index]
      if (signal?.aborted) {
        results[index] = { ...base, status: 'error', error: 'Cancelled', finishedAt: Date.now() }
        onUpdate(results[index])
        continue
      }
      const startedAt = Date.now()
      onUpdate({ ...base, status: 'generating', startedAt })
      try {
        const files = await generateScreen(screen, { client, framework: base.framework, signal })
        results[index] = { ...base, status: 'done', files, startedAt, finishedAt: Date.now() }
      } catch (err) {
        const error = isAbort(err) ? 'Cancelled' : err instanceof Error ? err.message : String(err)
        results[index] = { ...base, status: 'error', error, startedAt, finishedAt: Date.now() }
      }
      onUpdate(results[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, screens.length) }, worker))
  return results
}
