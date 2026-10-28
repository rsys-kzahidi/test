import express, { type Request, type Response } from 'express'

/**
 * Minimal LLM proxy. It lets the browser call OpenAI / Anthropic / a local LLM
 * without CORS issues and, when keys are configured in the server environment,
 * without ever exposing those keys to the browser.
 *
 * Upstream URLs are fixed by server configuration (never taken from the request)
 * so the proxy cannot be abused to reach arbitrary hosts.
 */
export interface ProxyEnv {
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE_URL?: string
  LOCAL_LLM_BASE_URL?: string
  LOCAL_LLM_API_KEY?: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<globalThis.Response>

const trim = (url: string) => url.replace(/\/+$/, '')

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

async function relay(res: Response, upstream: globalThis.Response): Promise<void> {
  const text = await upstream.text()
  res.status(upstream.status)
  res.type(upstream.headers.get('content-type') ?? 'application/json')
  res.send(text)
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: { message } })
}

export function createApp(env: ProxyEnv = process.env, fetchImpl: FetchLike = fetch) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2mb' }))

  const openaiBase = trim(env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
  const anthropicBase = trim(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1')
  const localBase = trim(env.LOCAL_LLM_BASE_URL || 'http://localhost:11434/v1')

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      serverKeys: { openai: !!env.OPENAI_API_KEY, anthropic: !!env.ANTHROPIC_API_KEY },
      localBaseUrl: localBase,
    })
  })

  app.post('/api/llm/openai/chat/completions', async (req, res) => {
    const auth = env.OPENAI_API_KEY ? 'Bearer ' + env.OPENAI_API_KEY : headerValue(req, 'authorization')
    if (!auth) return fail(res, 401, 'No OpenAI API key: set OPENAI_API_KEY in .env or provide one in Settings.')
    try {
      const upstream = await fetchImpl(`${openaiBase}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(req.body),
      })
      await relay(res, upstream)
    } catch (err) {
      fail(res, 502, `OpenAI upstream error: ${(err as Error).message}`)
    }
  })

  app.post('/api/llm/anthropic/messages', async (req, res) => {
    const key = env.ANTHROPIC_API_KEY || headerValue(req, 'x-api-key')
    if (!key) return fail(res, 401, 'No Anthropic API key: set ANTHROPIC_API_KEY in .env or provide one in Settings.')
    try {
      const upstream = await fetchImpl(`${anthropicBase}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': headerValue(req, 'anthropic-version') ?? '2023-06-01',
        },
        body: JSON.stringify(req.body),
      })
      await relay(res, upstream)
    } catch (err) {
      fail(res, 502, `Anthropic upstream error: ${(err as Error).message}`)
    }
  })

  app.post('/api/llm/local/chat/completions', async (req, res) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const auth = env.LOCAL_LLM_API_KEY ? 'Bearer ' + env.LOCAL_LLM_API_KEY : headerValue(req, 'authorization')
    if (auth) headers.Authorization = auth
    try {
      const upstream = await fetchImpl(`${localBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body),
      })
      await relay(res, upstream)
    } catch (err) {
      fail(res, 502, `Local LLM at ${localBase} is unreachable: ${(err as Error).message}`)
    }
  })

  return app
}
