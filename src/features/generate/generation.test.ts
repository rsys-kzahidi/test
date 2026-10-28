import { describe, expect, it, vi } from 'vitest'
import type { GenerationResult } from '../../types'
import { detectScreens } from '../upload/detectScreens'
import { SAMPLE_DOCUMENT_TEXT } from '../upload/fixtures/sampleDesign'
import { createMockClient } from '../llm/providers/mock'
import { defaultProviderConfigs } from '../llm/llmService'
import type { LLMClient } from '../llm/types'
import { formatFilesAsResponse, kindForPath, parseGeneratedFiles, sanitizePath } from './fileFormat'
import { FRAMEWORK_GENERATORS } from './generators'
import { buildMockData } from './generators/mockData'
import { runGenerationQueue } from './orchestrator'
import { buildUserPrompt, extractScreenSpec } from './prompts'

const screens = detectScreens(SAMPLE_DOCUMENT_TEXT)

describe('file wire format', () => {
  it('round-trips files and tolerates prose around them', () => {
    const files = FRAMEWORK_GENERATORS.react.generateOffline(screens[0])
    const parsed = parseGeneratedFiles(`Sure! Here you go:\n\n${formatFilesAsResponse(files)}\nLet me know!`)
    expect(parsed.map((f) => f.path)).toEqual(files.map((f) => f.path))
    expect(parsed.map((f) => f.content)).toEqual(files.map((f) => f.content))
    expect(parsed.map((f) => f.kind)).toEqual(['component', 'styles', 'api-service', 'mock-data'])
  })

  it('accepts bold headers and sanitizes unsafe paths', () => {
    const parsed = parseGeneratedFiles('**FILE: `/../src/App.tsx`**\n```tsx\nconst a = 1\n```')
    expect(parsed).toEqual([{ path: 'src/App.tsx', language: 'tsx', kind: 'component', content: 'const a = 1\n' }])
    expect(sanitizePath('C:\\..\\a/./b.ts')).toBe('a/b.ts')
    expect(kindForPath('rapid-form.component.ts')).toBe('component')
    expect(kindForPath('orders.service.ts')).toBe('api-service')
  })
})

describe('offline generators', () => {
  it('build mock data that matches the screen structure', () => {
    const dashboard = buildMockData(screens[1]) as Record<string, unknown>
    expect(dashboard.stats).toHaveLength(4)
    expect(dashboard.items).toHaveLength(5)
    expect(dashboard.options).toEqual({ dateRange: ['Last 7 days', 'Last 30 days', 'This quarter', 'This year'] })

    const customers = buildMockData(screens[2]) as { columns: Array<{ label: string }>; items: Array<Record<string, unknown>> }
    expect(customers.columns.map((c) => c.label)).toEqual(['Name', 'Email', 'Phone', 'Status', 'Lifetime value'])
    expect(customers.items[0]).toMatchObject({ name: 'Ava Thompson', status: 'Active' })
  })

  it.each(['react', 'angular'] as const)('generates component, styles, mock JSON and API service for %s', (fw) => {
    for (const screen of screens) {
      const files = FRAMEWORK_GENERATORS[fw].generateOffline(screen)
      const kinds = new Set(files.map((f) => f.kind))
      expect(kinds).toEqual(new Set(fw === 'react' ? ['component', 'styles', 'api-service', 'mock-data'] : ['component', 'template', 'styles', 'api-service', 'mock-data']))
      const json = files.find((f) => f.kind === 'mock-data')!
      expect(() => JSON.parse(json.content)).not.toThrow()
      const api = files.find((f) => f.kind === 'api-service')!
      expect(api.content).toMatch(/mock\.json'/)
      expect(api.content).toMatch(/600/)
    }
  })
})

describe('prompts', () => {
  it('embed a machine-readable spec that can be extracted again', () => {
    const prompt = buildUserPrompt(screens[3], 'angular')
    expect(prompt).toContain('create-order.component.html')
    expect(extractScreenSpec(prompt)).toMatchObject({ framework: 'angular', screen: { name: 'Create Order' } })
  })
})

describe('runGenerationQueue', () => {
  it('reports progress per screen and completes with the mock provider', async () => {
    const updates: GenerationResult[] = []
    const client = createMockClient(defaultProviderConfigs().mock, { latencyMs: 0 })
    const results = await runGenerationQueue(screens, {
      client,
      resolveFramework: (s) => (s.name === 'Login' ? 'angular' : 'react'),
      onUpdate: (r) => updates.push(r),
    })
    expect(results.every((r) => r.status === 'done')).toBe(true)
    expect(results[0].framework).toBe('angular')
    expect(results[0].files).toHaveLength(5)
    expect(results[1].files).toHaveLength(4)
    expect(results.every((r) => !r.warnings)).toBe(true)
    const statuses = updates.filter((u) => u.screenId === screens[0].id).map((u) => u.status)
    expect(statuses).toEqual(['queued', 'generating', 'done'])
  })

  it('warns about expected files the model did not return', async () => {
    const client: LLMClient = {
      providerId: 'local',
      model: 'llama3.1',
      complete: vi.fn().mockResolvedValue('### FILE: Login.tsx\n```tsx\nexport default function Login() {}\n```'),
    }
    const [result] = await runGenerationQueue([screens[0]], { client, resolveFramework: () => 'react', onUpdate: () => {} })
    expect(result.status).toBe('done')
    expect(result.warnings).toEqual(['Model did not return: Login.module.css, useLoginData.ts, login.mock.json'])
  })

  it('marks screens as failed when the provider errors or returns no files', async () => {
    const client: LLMClient = {
      providerId: 'openai',
      model: 'gpt-4o',
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValueOnce('I cannot help with that.'),
    }
    const results = await runGenerationQueue(screens.slice(0, 2), {
      client,
      resolveFramework: () => 'react',
      onUpdate: () => {},
      concurrency: 1,
    })
    expect(results.map((r) => r.status)).toEqual(['error', 'error'])
    expect(results[0].error).toBe('HTTP 500')
    expect(results[1].error).toMatch(/expected "### FILE/)
  })
})
