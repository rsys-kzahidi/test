import { frameworkFor, useAppStore } from '../../store/appStore'
import type { Screen } from '../../types'
import { createLLMClient } from '../llm/llmService'
import { toBrandingRefs } from './generators/branding'
import { runGenerationQueue } from './orchestrator'

/**
 * Module-level controllers (one per run, e.g. "generate all" plus single-screen
 * retries) so running generations survive navigation between wizard steps and
 * can all be cancelled.
 */
const controllers = new Set<AbortController>()

export function isGenerationRunning(): boolean {
  return controllers.size > 0
}

/** Generate code for the given screens with the active provider. Errors are recorded per screen. */
export async function startGeneration(screens: Screen[]): Promise<void> {
  if (screens.length === 0) return
  const state = useAppStore.getState()
  const config = state.providers[state.activeProvider]
  const local = new AbortController()
  controllers.add(local)

  try {
    let client
    try {
      client = createLLMClient(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      for (const screen of screens) {
        state.setResult({
          screenId: screen.id,
          screenName: screen.name,
          framework: frameworkFor(screen, state.framework),
          status: 'error',
          files: [],
          error: message,
        })
      }
      return
    }

    await runGenerationQueue(screens, {
      client,
      concurrency: 2,
      signal: local.signal,
      branding: toBrandingRefs(state.branding),
      resolveFramework: (s) => frameworkFor(s, useAppStore.getState().framework),
      onUpdate: (result) => useAppStore.getState().setResult(result),
      isActive: (s) => useAppStore.getState().screens.some((sc) => sc.id === s.id),
    })
  } finally {
    controllers.delete(local)
  }
}

export function cancelGeneration(): void {
  for (const c of controllers) c.abort()
  controllers.clear()
}
