import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type ProxyEnv } from './app.ts'

let server: Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

async function start(env: ProxyEnv, upstream: ReturnType<typeof vi.fn>) {
  server = createApp(env, upstream as never).listen(0, '127.0.0.1')
  await new Promise((r) => server!.once('listening', r))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

describe('LLM proxy', () => {
  it('forwards OpenAI requests with the server-side key', async () => {
    const upstream = vi.fn(async () => Response.json({ choices: [{ message: { content: 'hi' } }] }))
    const base = await start({ OPENAI_API_KEY: 'server-key' }, upstream)
    const res = await fetch(`${base}/api/llm/openai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ choices: [{ message: { content: 'hi' } }] })
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe(['Bearer', 'server-key'].join(' '))
    expect(JSON.parse(String(init.body))).toEqual({ model: 'gpt-4o', messages: [] })
  })

  it('rejects Anthropic requests without any key', async () => {
    const upstream = vi.fn()
    const base = await start({}, upstream)
    const res = await fetch(`${base}/api/llm/anthropic/messages`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('relays upstream errors and uses the configured local base URL', async () => {
    const upstream = vi.fn(async () => Response.json({ error: 'model not found' }, { status: 404 }))
    const base = await start({ LOCAL_LLM_BASE_URL: 'http://gpu-box:1234/v1/' }, upstream)
    const res = await fetch(`${base}/api/llm/local/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"model":"x"}',
    })
    expect(res.status).toBe(404)
    expect((upstream.mock.calls[0] as unknown as [string])[0]).toBe('http://gpu-box:1234/v1/chat/completions')
  })
})
