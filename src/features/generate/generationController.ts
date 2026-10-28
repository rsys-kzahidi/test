import { frameworkFor, useAppStore } from '../../store/appStore'
import type { Screen } from '../../types'
import { createLLMClient } from '../llm/llmService'
import { runGenerationQueue } from './orchestrator'

/**
 * Module-level controller so a running generation survives navigation between
 * wizard steps and can still be cancelled.
 */
let controller: AbortController | null = null

export function isGenerationRunning(): boolean {
  return controller !== null && !controller.signal.aborted
}

/** Generate code for the given screens with the active provider. Errors are recorded per screen. */
export async function startGeneration(screens: Screen[]): Promise<void> {
  if (screens.length === 0) return
  const state = useAppStore.getState()
  const config = state.providers[state.activeProvider]
  const local = new AbortController()
  // Allow retries of single screens while others are still running by chaining signals.
  const parent = controller
  if (parent && !parent.signal.aborted) parent.signal.addEventListener('abort', () => local.abort(), { once: true })
  else controller = local

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
      resolveFramework: (s) => frameworkFor(s, useAppStore.getState().framework),
      onUpdate: (result) => useAppStore.getState().setResult(result),
    })
  } finally {
    if (controller === local) controller = null
  }
}

export function cancelGeneration(): void {
  controller?.abort()
  controller = null
}
