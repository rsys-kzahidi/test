import type { LLMProviderConfig, ProviderId } from '../../../types'
import { LLMError, type FetchLike } from '../types'

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Resolve the base URL for a provider, honouring the proxy flag and custom base URLs. */
export function resolveBaseUrl(
  config: LLMProviderConfig,
  defaults: { defaultBaseUrl?: string; proxyPath?: string },
): string {
  if (config.useProxy && defaults.proxyPath) return defaults.proxyPath
  const url = config.baseUrl?.trim() || defaults.defaultBaseUrl
  if (!url) throw new LLMError(config.id, 'A base URL is required for this provider.')
  return trimTrailingSlash(url)
}

/** Extract a readable error message from a failed HTTP response. */
export async function errorFromResponse(provider: ProviderId, res: Response): Promise<LLMError> {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      detail =
        (typeof json.error === 'string' ? json.error : json.error?.message) ?? json.message ?? text
    } catch {
      detail = text
    }
  } catch {
    // ignore body read errors
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ' Check that your API key is valid.'
      : res.status === 404
        ? ' Check the base URL and model name.'
        : res.status === 429
          ? ' Rate limit or quota exceeded.'
          : ''
  const message = `${provider} request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : '.'}${hint}`
  return new LLMError(provider, message, res.status)
}

/** fetch() wrapper that converts network/CORS failures into actionable LLMErrors. */
export async function safeFetch(
  provider: ProviderId,
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof Error && err.name === 'AbortError') throw err
    const reason = err instanceof Error ? err.message : String(err)
    throw new LLMError(
      provider,
      `Could not reach ${url} (${reason}). If this is a CORS error, enable "Route through local proxy" ` +
        'in Settings and run `npm run server`, or allow this origin on your local LLM server.',
    )
  }
}
