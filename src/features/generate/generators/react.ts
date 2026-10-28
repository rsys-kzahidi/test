import type { GeneratedFile, Screen } from '../../../types'
import { escapeMarkup, escapeSingleQuoted } from '../../../utils/strings'
import { analyseScreen, buildMockData, type ScreenModel } from './mockData'
import { screenNames, type FrameworkGenerator, type ScreenNames } from './types'

function reactFiles(n: ScreenNames) {
  return {
    component: `${n.pascal}.tsx`,
    styles: `${n.pascal}.module.css`,
    api: `use${n.pascal}Data.ts`,
    mock: `${n.kebab}.mock.json`,
  }
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n')
}

function renderField(f: ScreenModel['fields'][number]): string {
  const label = escapeMarkup(f.label)
  const id = `field-${f.key}`
  switch (f.type) {
    case 'checkbox':
      return `<label className={styles.checkbox}>
  <input
    type="checkbox"
    name="${f.key}"
    checked={values.${f.key}}
    onChange={(e) => update('${f.key}', e.target.checked)}
  />
  <span>${label}</span>
</label>`
    case 'select':
      return `<label className={styles.field} htmlFor="${id}">
  <span>${label}</span>
  <select id="${id}" name="${f.key}" value={values.${f.key}} onChange={(e) => update('${f.key}', e.target.value)}>
    {data.options.${f.key}.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
</label>`
    case 'textarea':
      return `<label className={\`\${styles.field} \${styles.full}\`} htmlFor="${id}">
  <span>${label}</span>
  <textarea id="${id}" name="${f.key}" rows={4} value={values.${f.key}} onChange={(e) => update('${f.key}', e.target.value)} />
</label>`
    case 'number':
      return `<label className={styles.field} htmlFor="${id}">
  <span>${label}</span>
  <input id="${id}" type="number" name="${f.key}" value={values.${f.key}} onChange={(e) => update('${f.key}', Number(e.target.value))} />
</label>`
    default:
      return `<label className={styles.field} htmlFor="${id}">
  <span>${label}</span>
  <input id="${id}" type="${f.type}" name="${f.key}" value={values.${f.key}} onChange={(e) => update('${f.key}', e.target.value)}${f.type === 'password' ? ' autoComplete="current-password"' : ''} />
</label>`
  }
}

function renderButtons(buttons: string[], hasForm: boolean): string {
  const list = buttons.length ? buttons : ['Save']
  return list
    .map((b, i) => {
      const label = escapeMarkup(b)
      const action = escapeSingleQuoted(b)
      if (i === 0 && hasForm) {
        return `<button type="submit" className={styles.primary} disabled={busy}>
  ${label}
</button>`
      }
      return `<button type="button" className={${i === 0 ? 'styles.primary' : 'styles.secondary'}} disabled={busy} onClick={() => handleAction('${action}')}>
  ${label}
</button>`
    })
    .join('\n')
}

function componentSource(screen: Screen, n: ScreenNames, m: ScreenModel): string {
  const files = reactFiles(n)
  const hasForm = m.fields.length > 0
  const primary = escapeSingleQuoted(screen.buttons[0] ?? 'Save')
  const buttons = renderButtons(screen.buttons, hasForm)

  const body: string[] = []
  if (m.hasStats) {
    body.push(`<div className={styles.stats}>
  {data.stats.map((stat) => (
    <article key={stat.label} className={styles.statCard}>
      <span className={styles.statLabel}>{stat.label}</span>
      <strong className={styles.statValue}>{stat.value}</strong>
      <span className={stat.trend.startsWith('-') ? styles.trendDown : styles.trendUp}>{stat.trend}</span>
    </article>
  ))}
</div>`)
  }
  if (hasForm) {
    body.push(`<form className={styles.form} onSubmit={handleSubmit} noValidate>
  <div className={styles.grid}>
${indent(m.fields.map(renderField).join('\n'), 4)}
  </div>
  <div className={styles.actions}>
${indent(buttons, 4)}
  </div>
</form>`)
  }
  if (m.isList) {
    body.push(`<div className={styles.tableWrapper}>
  <table className={styles.table}>
    <thead>
      <tr>
        {data.columns.map((column) => (
          <th key={column.key} scope="col">
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {data.items.map((item) => (
        <tr key={item.id}>
          {data.columns.map((column) => (
            <td key={column.key}>{String(item[column.key as keyof typeof item])}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
  <p className={styles.muted}>Showing {data.items.length} of {data.total} records</p>
</div>`)
  }
  if (m.panels.length) {
    body.push(`<div className={styles.panels}>
  {data.panels.map((panel) => (
    <article key={panel.title} className={styles.panel}>
      <h2>{panel.title}</h2>
      <p>{panel.body}</p>
    </article>
  ))}
</div>`)
  }
  if (!hasForm) {
    body.push(`<div className={styles.actions}>
${indent(buttons, 2)}
</div>`)
  }

  const formState = hasForm
    ? `
  const [form, setForm] = useState<${n.pascal}Form | null>(null)
  const values = form ?? data?.form

  function update<K extends keyof ${n.pascal}Form>(key: K, value: ${n.pascal}Form[K]) {
    if (!values) return
    setForm({ ...values, [key]: value })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleAction('${primary}')
  }
`
    : ''

  const imports = hasForm
    ? `import { useState, type FormEvent } from 'react'`
    : `import { useState } from 'react'`
  const typeImport = hasForm ? `, type ${n.pascal}Form` : ''
  const payload = hasForm ? 'values' : 'undefined'
  const guard = hasForm ? 'if (!data || !values) return null' : 'if (!data) return null'

  return `${imports}
import styles from './${files.styles}'
import { perform${n.pascal}Action, use${n.pascal}Data${typeImport} } from './${files.api.replace(/\.ts$/, '')}'

/**
 * ${screen.name.replace(/\*\//g, '* /')}
 * ${screen.description.replace(/\*\//g, '* /')}
 *
 * Data is loaded through use${n.pascal}Data(), which currently resolves with
 * ${files.mock} after a simulated network delay.
 */
export default function ${n.pascal}() {
  const { data, loading, error, reload } = use${n.pascal}Data()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
${formState}
  async function handleAction(action: string) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await perform${n.pascal}Action(action, ${payload})
      setMessage(result.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        Loading ${escapeMarkup(screen.name)}…
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <p>{error}</p>
        <button type="button" className={styles.secondary} onClick={reload}>
          Retry
        </button>
      </div>
    )
  }

  ${guard}

  return (
    <section className={styles.screen} aria-labelledby="${n.kebab}-title">
      <header className={styles.header}>
        <h1 id="${n.kebab}-title">${escapeMarkup(screen.name)}</h1>
        <p className={styles.muted}>${escapeMarkup(screen.description)}</p>
      </header>

${indent(body.join('\n\n'), 6)}

      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
    </section>
  )
}
`
}

function apiSource(screen: Screen, n: ScreenNames, hasForm: boolean): string {
  const files = reactFiles(n)
  const constName = `${n.kebab.replace(/-/g, '_').toUpperCase()}_ENDPOINT`
  return `import { useCallback, useEffect, useState } from 'react'
import mockData from './${files.mock}'

/** Real endpoint for the "${screen.name.replace(/"/g, "'")}" screen. */
export const ${constName} = '${n.endpoint}'

/**
 * While true, requests resolve with ${files.mock} after MOCK_LATENCY_MS.
 * Flip to false once the real backend endpoint is available.
 */
const USE_MOCK = true
const MOCK_LATENCY_MS = 600

export type ${n.pascal}Data = typeof mockData
${hasForm ? `export type ${n.pascal}Form = ${n.pascal}Data['form']\n` : ''}
export interface ActionResult {
  ok: boolean
  message: string
}

function simulateLatency<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
}

/** GET ${n.endpoint} */
export async function fetch${n.pascal}(signal?: AbortSignal): Promise<${n.pascal}Data> {
  if (USE_MOCK) return simulateLatency(mockData)
  const res = await fetch(${constName}, { signal })
  if (!res.ok) throw new Error(\`GET \${${constName}} failed with status \${res.status}\`)
  return (await res.json()) as ${n.pascal}Data
}

/** POST ${n.endpoint}/actions — invoked by the screen's buttons. */
export async function perform${n.pascal}Action(action: string, payload?: unknown): Promise<ActionResult> {
  if (USE_MOCK) return simulateLatency({ ok: true, message: \`"\${action}" completed (mock API)\` })
  const res = await fetch(\`\${${constName}}/actions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  if (!res.ok) throw new Error(\`POST \${${constName}}/actions failed with status \${res.status}\`)
  return (await res.json()) as ActionResult
}

/** React hook wiring the screen to its (mock) API. */
export function use${n.pascal}Data() {
  const [data, setData] = useState<${n.pascal}Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetch${n.pascal}(signal)
      if (!signal?.aborted) setData(result)
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { data, loading, error, reload: () => void load() }
}
`
}

const REACT_STYLES = `.screen {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #0f172a;
}

.header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.muted {
  color: #64748b;
  margin: 0;
}

.state {
  display: grid;
  place-items: center;
  gap: 0.75rem;
  min-height: 240px;
  color: #64748b;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.statCard,
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.05);
}

.statCard {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.statLabel {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.statValue {
  font-size: 1.5rem;
}

.trendUp {
  color: #16a34a;
  font-size: 0.85rem;
}

.trendDown {
  color: #dc2626;
  font-size: 0.85rem;
}

.form {
  margin-top: 1.5rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  font-weight: 500;
}

.full {
  grid-column: 1 / -1;
}

.field input,
.field select,
.field textarea {
  font: inherit;
  font-weight: 400;
  padding: 0.6rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.primary,
.secondary {
  font: inherit;
  font-weight: 600;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
}

.primary {
  background: #4f46e5;
  color: #fff;
}

.primary:hover {
  background: #4338ca;
}

.secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.6;
  cursor: progress;
}

.tableWrapper {
  margin-top: 1.5rem;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.table th,
.table td {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.9rem;
}

.table th {
  background: #f8fafc;
  font-weight: 600;
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.panel h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.panel p {
  margin: 0;
  color: #64748b;
}

.message {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #eef2ff;
  color: #3730a3;
}
`

export const reactGenerator: FrameworkGenerator = {
  id: 'react',
  label: 'React',
  promptGuidelines: [
    'React 18 function component written in TypeScript (.tsx), default export.',
    'Styles in a CSS Module (<Name>.module.css) imported as `styles` — no external UI libraries.',
    'Data access through a custom hook + async API functions in use<Name>Data.ts.',
    'The API module must import the mock JSON file and resolve it after a simulated latency (setTimeout) while a USE_MOCK flag is true; otherwise call fetch() on an exported endpoint constant.',
    'Handle loading, error (with retry) and empty states. Use semantic, accessible HTML (labels, scope, aria attributes).',
  ].join('\n- '),
  expectedFiles(screen) {
    const f = reactFiles(screenNames(screen))
    return [
      { path: f.component, kind: 'component', purpose: 'React component rendering the screen' },
      { path: f.styles, kind: 'styles', purpose: 'CSS module with the screen styles' },
      { path: f.api, kind: 'api-service', purpose: 'API functions + React hook resolving the mock JSON with simulated latency' },
      { path: f.mock, kind: 'mock-data', purpose: 'Dummy JSON API response consumed by the screen' },
    ]
  },
  generateOffline(screen: Screen): GeneratedFile[] {
    const n = screenNames(screen)
    const m = analyseScreen(screen)
    const f = reactFiles(n)
    return [
      { path: f.component, language: 'tsx', kind: 'component', content: componentSource(screen, n, m) },
      { path: f.styles, language: 'css', kind: 'styles', content: REACT_STYLES },
      { path: f.api, language: 'typescript', kind: 'api-service', content: apiSource(screen, n, m.fields.length > 0) },
      {
        path: f.mock,
        language: 'json',
        kind: 'mock-data',
        content: `${JSON.stringify(buildMockData(screen), null, 2)}\n`,
      },
    ]
  },
}
