import type { BrandingRefs, GeneratedFile, GenerationResult, Screen, TargetFramework } from '../../types'
import type { LLMClient } from '../llm/types'
import { parseGeneratedFiles } from './fileFormat'
import { getGenerator } from './generators'
import { buildGenerationMessages } from './prompts'

export interface GenerateScreenOptions {
  client: LLMClient
  framework: TargetFramework
  /** Confirmed font family / logo asset applied to the generated screen. */
  branding?: BrandingRefs
  signal?: AbortSignal
}

/** Generate the files for a single screen through the provider-agnostic client. */
export async function generateScreen(screen: Screen, options: GenerateScreenOptions): Promise<GeneratedFile[]> {
  const messages = buildGenerationMessages(screen, options.framework, options.branding)
  const response = await options.client.complete(messages, { signal: options.signal })
  const files = parseGeneratedFiles(response)
  if (files.length === 0) {
    throw new Error(
      'The model response did not contain any files in the expected "### FILE: <path>" format. Try again or use a more capable model.',
    )
  }
  return files
}

/** Expected files (by file name) that are absent from a generation result. */
export function findMissingFiles(screen: Screen, framework: TargetFramework, files: GeneratedFile[]): string[] {
  const baseName = (path: string) => path.split('/').pop()!.toLowerCase()
  const produced = new Set(files.map((f) => baseName(f.path)))
  return getGenerator(framework)
    .expectedFiles(screen)
    .map((f) => f.path)
    .filter((path) => !produced.has(baseName(path)))
}

export interface RunQueueOptions {
  client: LLMClient
  resolveFramework: (screen: Screen) => TargetFramework
  onUpdate: (result: GenerationResult) => void
  /** Return false to skip a queued screen (e.g. it was deleted meanwhile). */
  isActive?: (screen: Screen) => boolean
  concurrency?: number
  signal?: AbortSignal
  branding?: BrandingRefs
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

/**
 * Generate several screens with bounded concurrency, reporting per-screen
 * status transitions (queued → generating → done | error) via `onUpdate`.
 */
export async function runGenerationQueue(screens: Screen[], options: RunQueueOptions): Promise<GenerationResult[]> {
  const { client, resolveFramework, onUpdate, signal, isActive, branding } = options
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const results: GenerationResult[] = screens.map((s) => ({
    screenId: s.id,
    screenName: s.name,
    framework: resolveFramework(s),
    status: 'queued',
    files: [],
    provider: client.providerId,
    model: client.model,
    ...(branding ? { branding } : {}),
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
      if (isActive && !isActive(screen)) {
        results[index] = { ...base, status: 'error', error: 'Skipped (screen removed)', finishedAt: Date.now() }
        continue
      }
      const startedAt = Date.now()
      onUpdate({ ...base, status: 'generating', startedAt })
      try {
        const files = await generateScreen(screen, { client, framework: base.framework, branding, signal })
        const missing = findMissingFiles(screen, base.framework, files)
        const warnings = missing.length ? [`Model did not return: ${missing.join(', ')}`] : undefined
        results[index] = { ...base, status: 'done', files, warnings, startedAt, finishedAt: Date.now() }
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
