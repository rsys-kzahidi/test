import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/appStore'
import type { Screen } from '../../types'
import { cancelGeneration, isGenerationRunning, startGeneration } from './generationController'

vi.mock(import('../llm/llmService'), async (importOriginal) => ({
  ...(await importOriginal()),
  // Screens named "fast*" complete immediately; others stay in flight until aborted.
  createLLMClient: () => ({
    providerId: 'local',
    model: 'test',
    complete: (messages: Array<{ content: string }>, opts?: { signal?: AbortSignal }) =>
      messages.some((m) => m.content.includes('fast'))
        ? Promise.resolve('### FILE: a.ts\n```ts\nexport {}\n```')
        : new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
          ),
  }),
}))

const screen = (id: string): Screen => ({ id, name: id, description: '', fields: [], buttons: [], sections: [], rawText: '' })

describe('generationController', () => {
  afterEach(() => {
    cancelGeneration()
    useAppStore.getState().reset()
  })

  it('can still cancel a retry after the main run has finished', async () => {
    const [fast, slow] = [screen('fast'), screen('slow')]
    useAppStore.setState({ screens: [fast, slow], results: {} })
    const main = startGeneration([fast])
    const retry = startGeneration([slow])
    await main
    expect(useAppStore.getState().results.fast.status).toBe('done')
    expect(isGenerationRunning()).toBe(true)
    cancelGeneration()
    await retry
    expect(isGenerationRunning()).toBe(false)
    expect(useAppStore.getState().results.slow.error).toBe('Cancelled')
  })

  it('drops results for screens removed while generating', async () => {
    const a = screen('slow')
    useAppStore.setState({ screens: [a], results: {} })
    const run = startGeneration([a])
    useAppStore.getState().removeScreen('slow')
    cancelGeneration()
    await run
    expect(useAppStore.getState().results).toEqual({})
  })
})
