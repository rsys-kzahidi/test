import { describe, expect, it, vi } from 'vitest'
import type { LLMProviderConfig } from '../../types'
import { createLLMClient, defaultProviderConfigs, testProviderConnection, validateProviderConfig } from './llmService'
import { createMockClient } from './providers/mock'
import { LLMError, type FetchLike } from './types'
import { buildGenerationMessages } from '../generate/prompts'
import { parseGeneratedFiles } from '../generate/fileFormat'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn<FetchLike>(async () => jsonResponse(body, status))
}

const defaults = defaultProviderConfigs()
const messages = [
  { role: 'system' as const, content: 'Be concise.' },
  { role: 'user' as const, content: 'Hello' },
]

describe('createLLMClient – OpenAI', () => {
  const config: LLMProviderConfig = { ...defaults.openai, apiKey: 'test-openai-key', model: 'gpt-4o' }

  it('calls the chat completions endpoint and returns the message content', async () => {
    const fetch = mockFetch({ choices: [{ message: { content: 'Hi there' } }] })
    const client = createLLMClient(config, { fetch })
    await expect(client.complete(messages, { maxTokens: 100 })).resolves.toBe('Hi there')

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init!.headers as Record<string, string>).Authorization).toBe(['Bearer', config.apiKey].join(' '))
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({ model: 'gpt-4o', messages, max_completion_tokens: 100 })
  })

  it('routes through the proxy without requiring a browser API key', async () => {
    const fetch = mockFetch({ choices: [{ message: { content: 'ok' } }] })
    const client = createLLMClient({ ...config, apiKey: '', useProxy: true }, { fetch })
    await client.complete(messages)
    expect(fetch.mock.calls[0][0]).toBe('/api/llm/openai/chat/completions')
    expect((fetch.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('throws an LLMError with the API error message on HTTP failures', async () => {
    const fetch = mockFetch({ error: { message: 'Incorrect API key provided' } }, 401)
    const client = createLLMClient(config, { fetch })
    const err = await client.complete(messages).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LLMError)
    expect((err as LLMError).status).toBe(401)
    expect((err as LLMError).message).toMatch(/Incorrect API key provided.*Check that your API key is valid/)
  })

  it('wraps network/CORS failures with an actionable message', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = createLLMClient(config, { fetch })
    await expect(client.complete(messages)).rejects.toThrow(/Route through local proxy/)
  })
})

describe('createLLMClient – Anthropic', () => {
  it('maps system messages and parses text content blocks', async () => {
    const fetch = mockFetch({ content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'Claude' }] })
    const client = createLLMClient({ ...defaults.anthropic, apiKey: 'test-anthropic-key' }, { fetch })
    await expect(client.complete(messages)).resolves.toBe('Hello Claude')

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-anthropic-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(String(init!.body))
    expect(body.system).toBe('Be concise.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(body.model).toBe('claude-3-5-sonnet-latest')
    expect(body.max_tokens).toBe(4096)
  })
})

describe('createLLMClient – Local LLM', () => {
  it('uses the custom base URL and an OpenAI-compatible payload', async () => {
    const fetch = mockFetch({ choices: [{ message: { content: 'local reply' } }] })
    const client = createLLMClient(
      { ...defaults.local, baseUrl: 'http://localhost:1234/v1/', model: 'qwen2.5-coder', maxTokens: 512 },
      { fetch },
    )
    await expect(client.complete(messages)).resolves.toBe('local reply')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:1234/v1/chat/completions')
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(JSON.parse(String(init!.body))).toMatchObject({ model: 'qwen2.5-coder', max_tokens: 512 })
  })
})

describe('validation & connection test', () => {
  it('validates required settings per provider', () => {
    expect(validateProviderConfig({ ...defaults.openai, apiKey: '' })).toMatch(/API key/)
    expect(validateProviderConfig({ ...defaults.openai, apiKey: '', useProxy: true })).toBeNull()
    expect(validateProviderConfig({ ...defaults.local, baseUrl: '' })).toMatch(/base URL/)
    expect(validateProviderConfig({ ...defaults.local, baseUrl: 'ftp://x' })).toMatch(/http/)
    expect(validateProviderConfig({ ...defaults.local, model: ' ' })).toMatch(/model/)
    expect(validateProviderConfig(defaults.mock)).toBeNull()
    expect(() => createLLMClient({ ...defaults.anthropic, apiKey: '' })).toThrow(LLMError)
  })

  it('reports success and failure of a connection test', async () => {
    const ok = await testProviderConnection(
      { ...defaults.openai, apiKey: 'k' },
      { fetch: mockFetch({ choices: [{ message: { content: 'OK' } }] }) },
    )
    expect(ok.ok).toBe(true)
    expect(ok.message).toMatch(/Connected to OpenAI/)

    const bad = await testProviderConnection(
      { ...defaults.local },
      { fetch: mockFetch({ error: 'model "llama3.1" not found' }, 404) },
    )
    expect(bad).toMatchObject({ ok: false })
    expect(bad.message).toMatch(/not found.*Check the base URL and model name/)
  })
})

describe('offline mock provider', () => {
  it('answers generation prompts in the same file format as a real LLM', async () => {
    const client = createMockClient(defaults.mock, { latencyMs: 0 })
    const screen = {
      id: 's1',
      name: 'Login',
      description: 'Sign in',
      sections: [],
      fields: [{ label: 'Email', type: 'email' as const }],
      buttons: ['Sign in'],
      rawText: 'Login',
    }
    const response = await client.complete(buildGenerationMessages(screen, 'angular'))
    const files = parseGeneratedFiles(response)
    expect(files.map((f) => f.path)).toEqual([
      'login.component.ts',
      'login.component.html',
      'login.component.scss',
      'login.service.ts',
      'login.mock.json',
    ])
    await expect(client.complete([{ role: 'user', content: 'ping' }])).resolves.toMatch(/OK/)
  })
})
