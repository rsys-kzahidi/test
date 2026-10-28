import type { GeneratedFile, Screen } from '../../../types'
import { escapeMarkup, escapeSingleQuoted } from '../../../utils/strings'
import { analyseScreen, buildMockData, type ScreenModel } from './mockData'
import { screenNames, type FrameworkGenerator, type ScreenNames } from './types'

function angularFiles(n: ScreenNames) {
  return {
    component: `${n.kebab}.component.ts`,
    template: `${n.kebab}.component.html`,
    styles: `${n.kebab}.component.scss`,
    service: `${n.kebab}.service.ts`,
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
      return `<label class="checkbox">
  <input type="checkbox" name="${f.key}" [(ngModel)]="d.form.${f.key}" />
  <span>${label}</span>
</label>`
    case 'select':
      return `<label class="field" for="${id}">
  <span>${label}</span>
  <select id="${id}" name="${f.key}" [(ngModel)]="d.form.${f.key}">
    <option *ngFor="let option of d.options.${f.key}" [value]="option">{{ option }}</option>
  </select>
</label>`
    case 'textarea':
      return `<label class="field full" for="${id}">
  <span>${label}</span>
  <textarea id="${id}" name="${f.key}" rows="4" [(ngModel)]="d.form.${f.key}"></textarea>
</label>`
    default:
      return `<label class="field" for="${id}">
  <span>${label}</span>
  <input id="${id}" type="${f.type}" name="${f.key}" [(ngModel)]="d.form.${f.key}" />
</label>`
  }
}

function renderButtons(buttons: string[], hasForm: boolean): string {
  const list = buttons.length ? buttons : ['Save']
  return list
    .map((b, i) => {
      const label = escapeMarkup(b)
      const action = escapeSingleQuoted(b).replace(/"/g, '&quot;')
      if (i === 0 && hasForm) {
        return `<button type="submit" class="primary" [disabled]="busy">${label}</button>`
      }
      return `<button type="button" class="${i === 0 ? 'primary' : 'secondary'}" [disabled]="busy" (click)="onAction('${action}')">${label}</button>`
    })
    .join('\n')
}

function templateSource(screen: Screen, n: ScreenNames, m: ScreenModel): string {
  const hasForm = m.fields.length > 0
  const primary = escapeSingleQuoted(screen.buttons[0] ?? 'Save').replace(/"/g, '&quot;')
  const buttons = renderButtons(screen.buttons, hasForm)
  const body: string[] = []

  if (m.hasStats) {
    body.push(`<div class="stats">
  <article class="stat-card" *ngFor="let stat of d.stats">
    <span class="stat-label">{{ stat.label }}</span>
    <strong class="stat-value">{{ stat.value }}</strong>
    <span [class.trend-down]="stat.trend.startsWith('-')" class="trend">{{ stat.trend }}</span>
  </article>
</div>`)
  }
  if (hasForm) {
    body.push(`<form class="form" (ngSubmit)="onAction('${primary}')" novalidate>
  <div class="grid">
${indent(m.fields.map(renderField).join('\n'), 4)}
  </div>
  <div class="actions">
${indent(buttons, 4)}
  </div>
</form>`)
  }
  if (m.isList) {
    body.push(`<div class="table-wrapper">
  <table>
    <thead>
      <tr>
        <th scope="col" *ngFor="let column of d.columns">{{ column.label }}</th>
      </tr>
    </thead>
    <tbody>
      <tr *ngFor="let item of d.items">
        <td *ngFor="let column of d.columns">{{ cell(item, column.key) }}</td>
      </tr>
    </tbody>
  </table>
  <p class="muted">Showing {{ d.items.length }} of {{ d.total }} records</p>
</div>`)
  }
  if (m.panels.length) {
    body.push(`<div class="panels">
  <article class="panel" *ngFor="let panel of d.panels">
    <h2>{{ panel.title }}</h2>
    <p>{{ panel.body }}</p>
  </article>
</div>`)
  }
  if (!hasForm) {
    body.push(`<div class="actions">
${indent(buttons, 2)}
</div>`)
  }

  return `<div class="state" *ngIf="loading" role="status" aria-live="polite">Loading ${escapeMarkup(screen.name)}…</div>

<div class="state" *ngIf="!loading && error" role="alert">
  <p>{{ error }}</p>
  <button type="button" class="secondary" (click)="load()">Retry</button>
</div>

<section class="screen" *ngIf="!loading && !error && data as d" aria-labelledby="${n.kebab}-title">
  <header class="header">
    <h1 id="${n.kebab}-title">${escapeMarkup(screen.name)}</h1>
    <p class="muted">${escapeMarkup(screen.description)}</p>
  </header>

${indent(body.join('\n\n'), 2)}

  <p class="message" *ngIf="message" role="status">{{ message }}</p>
</section>
`
}

function componentSource(screen: Screen, n: ScreenNames, m: ScreenModel): string {
  const f = angularFiles(n)
  const hasForm = m.fields.length > 0
  const cellHelper = m.isList
    ? `
  cell(item: object, key: string): unknown {
    return (item as Record<string, unknown>)[key]
  }
`
    : ''
  return `import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
${hasForm ? "import { FormsModule } from '@angular/forms'\n" : ''}import { ${n.pascal}Service, type ${n.pascal}Data } from './${f.service.replace(/\.ts$/, '')}'

/**
 * ${screen.name.replace(/\*\//g, '* /')}
 * ${screen.description.replace(/\*\//g, '* /')}
 */
@Component({
  selector: 'app-${n.kebab}',
  standalone: true,
  imports: [CommonModule${hasForm ? ', FormsModule' : ''}],
  templateUrl: './${f.template}',
  styleUrls: ['./${f.styles}'],
})
export class ${n.pascal}Component implements OnInit {
  private readonly api = inject(${n.pascal}Service)

  data: ${n.pascal}Data | null = null
  loading = true
  busy = false
  error: string | null = null
  message: string | null = null

  ngOnInit(): void {
    this.load()
  }

  load(): void {
    this.loading = true
    this.error = null
    this.api.get${n.pascal}().subscribe({
      next: (data) => {
        this.data = data
        this.loading = false
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Failed to load data'
        this.loading = false
      },
    })
  }

  onAction(action: string): void {
    this.busy = true
    this.message = null
    this.api.performAction(action, ${hasForm ? 'this.data?.form' : 'undefined'}).subscribe({
      next: (result) => {
        this.message = result.message
        this.busy = false
      },
      error: (err: unknown) => {
        this.message = err instanceof Error ? err.message : 'Something went wrong'
        this.busy = false
      },
    })
  }
${cellHelper}}
`
}

function serviceSource(screen: Screen, n: ScreenNames): string {
  const f = angularFiles(n)
  return `import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, delay, of } from 'rxjs'
import mockData from './${f.mock}'

export type ${n.pascal}Data = typeof mockData

export interface ActionResult {
  ok: boolean
  message: string
}

/** Real endpoint for the "${screen.name.replace(/"/g, "'")}" screen. */
export const ${n.kebab.replace(/-/g, '_').toUpperCase()}_ENDPOINT = '${n.endpoint}'

/**
 * Data access for the ${screen.name.replace(/\*\//g, '* /')} screen.
 * While USE_MOCK is true every call resolves with ${f.mock} after a simulated delay,
 * so the UI is already wired to the API layer. Flip it once the backend exists.
 * Requires provideHttpClient() in your app config and "resolveJsonModule": true in tsconfig.
 */
@Injectable({ providedIn: 'root' })
export class ${n.pascal}Service {
  private readonly http = inject(HttpClient)
  private readonly useMock = true
  private readonly latencyMs = 600
  private readonly endpoint = ${n.kebab.replace(/-/g, '_').toUpperCase()}_ENDPOINT

  /** GET ${n.endpoint} */
  get${n.pascal}(): Observable<${n.pascal}Data> {
    if (this.useMock) return of(structuredClone(mockData)).pipe(delay(this.latencyMs))
    return this.http.get<${n.pascal}Data>(this.endpoint)
  }

  /** POST ${n.endpoint}/actions */
  performAction(action: string, payload?: unknown): Observable<ActionResult> {
    if (this.useMock) {
      return of({ ok: true, message: \`"\${action}" completed (mock API)\` }).pipe(delay(this.latencyMs))
    }
    return this.http.post<ActionResult>(\`\${this.endpoint}/actions\`, { action, payload })
  }
}
`
}

const ANGULAR_STYLES = `:host {
  display: block;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #0f172a;

  --border: #e2e8f0;
  --muted: #64748b;
  --primary: #4f46e5;
}

.screen {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
}

.muted {
  color: var(--muted);
  margin: 0;
}

.state {
  display: grid;
  place-items: center;
  gap: 0.75rem;
  min-height: 240px;
  color: var(--muted);
}

%card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.05);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;

  .stat-card {
    @extend %card;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .stat-value {
    font-size: 1.5rem;
  }

  .trend {
    color: #16a34a;
    font-size: 0.85rem;

    &.trend-down {
      color: #dc2626;
    }
  }
}

.form {
  @extend %card;
  margin-top: 1.5rem;
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

  &.full {
    grid-column: 1 / -1;
  }

  input,
  select,
  textarea {
    font: inherit;
    font-weight: 400;
    padding: 0.6rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;

    &:focus {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }
  }
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

button {
  font: inherit;
  font-weight: 600;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;

  &:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  &.primary {
    background: var(--primary);
    color: #fff;
  }

  &.secondary {
    background: #fff;
    border-color: #cbd5e1;
  }
}

.table-wrapper {
  margin-top: 1.5rem;
  overflow-x: auto;

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid var(--border);
  }

  th,
  td {
    text-align: left;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
  }

  th {
    background: #f8fafc;
    font-weight: 600;
  }
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;

  .panel {
    @extend %card;

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    p {
      margin: 0;
      color: var(--muted);
    }
  }
}

.message {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #eef2ff;
  color: #3730a3;
}
`

export const angularGenerator: FrameworkGenerator = {
  id: 'angular',
  label: 'Angular',
  promptGuidelines: [
    'Angular 17+ standalone component (selector app-<kebab-name>) written in TypeScript, using templateUrl and styleUrls.',
    'Template in <name>.component.html (CommonModule directives / FormsModule ngModel are fine), styles in SCSS.',
    'An @Injectable({ providedIn: "root" }) service in <name>.service.ts that imports the mock JSON and returns it as an Observable with rxjs delay() while a useMock flag is true; otherwise uses HttpClient against an exported endpoint constant.',
    'Handle loading, error (with retry) and empty states. Use semantic, accessible HTML (labels, scope, aria attributes).',
  ].join('\n- '),
  expectedFiles(screen) {
    const f = angularFiles(screenNames(screen))
    return [
      { path: f.component, kind: 'component', purpose: 'Standalone Angular component class' },
      { path: f.template, kind: 'template', purpose: 'Component HTML template' },
      { path: f.styles, kind: 'styles', purpose: 'Component SCSS styles' },
      { path: f.service, kind: 'api-service', purpose: 'Injectable API service resolving the mock JSON with simulated latency' },
      { path: f.mock, kind: 'mock-data', purpose: 'Dummy JSON API response consumed by the screen' },
    ]
  },
  generateOffline(screen: Screen): GeneratedFile[] {
    const n = screenNames(screen)
    const m = analyseScreen(screen)
    const f = angularFiles(n)
    return [
      { path: f.component, language: 'typescript', kind: 'component', content: componentSource(screen, n, m) },
      { path: f.template, language: 'html', kind: 'template', content: templateSource(screen, n, m) },
      { path: f.styles, language: 'scss', kind: 'styles', content: ANGULAR_STYLES },
      { path: f.service, language: 'typescript', kind: 'api-service', content: serviceSource(screen, n) },
      {
        path: f.mock,
        language: 'json',
        kind: 'mock-data',
        content: `${JSON.stringify(buildMockData(screen), null, 2)}\n`,
      },
    ]
  },
}
