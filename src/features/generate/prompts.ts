import type { Screen, TargetFramework } from '../../types'
import type { ChatMessage } from '../llm/types'
import { getGenerator } from './generators'

/** Tag wrapping the machine-readable screen spec inside the user prompt. */
export const SPEC_TAG = 'screen-spec'

/** Payload embedded in every prompt (also consumed by the offline mock provider). */
export interface ScreenSpecPayload {
  framework: TargetFramework
  screen: Pick<Screen, 'name' | 'description' | 'sections' | 'fields' | 'buttons'>
}

export function buildSystemPrompt(framework: TargetFramework): string {
  const generator = getGenerator(framework)
  return `You are a senior front-end engineer acting as a UI coding agent.
You convert UI screen descriptions extracted from design documents into production-quality ${generator.label} code.

Requirements:
- ${generator.promptGuidelines}
- Every screen MUST include a dummy JSON file representing the API response the screen consumes, and an API layer that "calls" an endpoint but resolves with that dummy JSON after a simulated latency, so it can later be swapped for a real backend.
- Render every listed field, button and layout section. Keep the design clean, modern and responsive.
- Use TypeScript with strict types. Do not use external UI component libraries.

Output format (STRICT):
- Output ONLY the files, no explanations before or after.
- Each file starts with a header line "### FILE: <relative path>" followed by ONE fenced code block containing the complete file content.
- Use exactly the file names you are given.`
}

export function buildUserPrompt(screen: Screen, framework: TargetFramework): string {
  const generator = getGenerator(framework)
  const payload: ScreenSpecPayload = {
    framework,
    screen: {
      name: screen.name,
      description: screen.description,
      sections: screen.sections,
      fields: screen.fields,
      buttons: screen.buttons,
    },
  }
  const files = generator
    .expectedFiles(screen)
    .map((f) => `- ${f.path} — ${f.purpose}`)
    .join('\n')

  return `Generate the ${generator.label} implementation for the screen "${screen.name}".

Files to produce:
${files}

Structured screen specification:
<${SPEC_TAG}>
${JSON.stringify(payload, null, 2)}
</${SPEC_TAG}>

Original text extracted from the design document:
"""
${screen.rawText.slice(0, 4000)}
"""`
}

export function buildGenerationMessages(screen: Screen, framework: TargetFramework): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(framework) },
    { role: 'user', content: buildUserPrompt(screen, framework) },
  ]
}

/** Extract the embedded screen spec from a prompt (used by the offline mock provider). */
export function extractScreenSpec(prompt: string): ScreenSpecPayload | null {
  const m = prompt.match(new RegExp(`<${SPEC_TAG}>([\\s\\S]*?)</${SPEC_TAG}>`))
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]) as ScreenSpecPayload
    if (!parsed?.screen?.name || !parsed.framework) return null
    return parsed
  } catch {
    return null
  }
}
