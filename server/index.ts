import { createApp } from './app.ts'

// Load variables from .env when present (Node >= 20.12).
try {
  process.loadEnvFile()
} catch {
  // no .env file — rely on the real environment
}

const port = Number(process.env.PORT ?? 8787)
// Bind to localhost by default: this proxy is meant for local development only.
const host = process.env.HOST ?? '127.0.0.1'

createApp().listen(port, host, () => {
  console.log(`UI Coding Agent proxy listening on http://${host}:${port}`)
  console.log(
    `Server-side keys → OpenAI: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}, Anthropic: ${process.env.ANTHROPIC_API_KEY ? 'yes' : 'no'}`,
  )
})
