import type { Screen, ScreenField } from '../../../types'
import { toCamelCase } from '../../../utils/strings'
import { fieldKeys, screenNames } from './types'

/** Normalised view of a screen used by the offline generators. */
export interface ScreenModel {
  fields: Array<ScreenField & { key: string }>
  /** Option lists for select fields, keyed by field key. */
  selects: Array<{ key: string; options: string[] }>
  columns: Array<{ key: string; label: string }>
  stats: string[]
  /** Layout sections not consumed by the table / stats widgets. */
  panels: string[]
  isList: boolean
  hasStats: boolean
}

const PEOPLE = ['Ava Thompson', 'Liam Patel', 'Sofia Garcia', 'Noah Kim', 'Mia Chen']
const STATUSES = ['Active', 'Pending', 'Inactive', 'Active', 'Prospect']
const DEFAULT_COLUMNS = ['Reference', 'Name', 'Status', 'Updated', 'Amount']
const LIST_RE = /\b(table|list|grid|records|history|results|directory)\b/i
const STATS_RE = /\b(cards?|kpis?|metrics?|stats|statistics|summary|tiles?)\b/i

function isoDate(i: number): string {
  return new Date(Date.UTC(2026, 0, 5 + i * 3)).toISOString().slice(0, 10)
}

/** Deterministic sample value for a column/field label at row `i`. */
export function sampleValue(label: string, i: number, statusOptions?: string[]): string | number {
  const l = label.toLowerCase()
  const person = PEOPLE[i % PEOPLE.length]
  if (/e-?mail/.test(l)) return `${person.toLowerCase().replace(' ', '.')}@example.com`
  if (/phone|mobile|tel/.test(l)) return `+1 555-01${String(10 + i).padStart(2, '0')}`
  if (/status|state|stage/.test(l)) {
    const opts = statusOptions?.length ? statusOptions : STATUSES
    return opts[i % opts.length]
  }
  if (/date|updated|created|time|due|deadline/.test(l)) return isoDate(i)
  if (/amount|value|price|revenue|total|cost|salary|budget|balance/.test(l))
    return Math.round(1249.5 * (i + 1) * 100) / 100
  if (/qty|quantity|count|units|age/.test(l)) return (i + 1) * 3
  if (/\bid\b|reference|ref\b|number|code|order/.test(l)) return `REF-${1001 + i}`
  if (/name|customer|user|owner|contact|assignee/.test(l)) return person
  if (/city|location/.test(l)) return ['Seattle', 'Austin', 'Denver', 'Boston', 'Chicago'][i % 5]
  return `${label} ${i + 1}`
}

function formValue(field: ScreenField, options: string[]): string | number | boolean {
  switch (field.type) {
    case 'password':
      return ''
    case 'checkbox':
      return false
    case 'select':
      return options[0] ?? ''
    case 'number': {
      const v = sampleValue(field.label, 0)
      return typeof v === 'number' ? v : 1
    }
    case 'date':
      return isoDate(0)
    case 'textarea':
      return ''
    default:
      if (/search|filter|keyword|query/i.test(field.label)) return ''
      return String(sampleValue(field.label, 0))
  }
}

function parenthesisedList(text: string): string[] {
  const m = text.match(/\(([^)]+)\)/)
  return m ? m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []
}

/** Analyse a screen into the widgets the offline generators render. */
export function analyseScreen(screen: Screen): ScreenModel {
  const keys = fieldKeys(screen.fields)
  const fields = screen.fields.map((f, i) => ({ ...f, key: keys[i] }))
  const selects = fields
    .filter((f) => f.type === 'select')
    .map((f) => ({ key: f.key, options: f.options?.length ? f.options : ['Option 1', 'Option 2', 'Option 3'] }))

  const panels: string[] = []
  let columnLabels: string[] | null = null
  let stats: string[] = []
  let isList = LIST_RE.test(screen.name)

  for (const section of screen.sections) {
    const colMatch = section.match(/columns?\s*[:-]?\s*(.+)$/i)
    if (colMatch && !columnLabels) {
      columnLabels = colMatch[1]
        .split(/,|;|\band\b/)
        .map((s) => s.trim())
        .filter(Boolean)
      isList = true
      continue
    }
    if (STATS_RE.test(section) && stats.length === 0) {
      const labels = parenthesisedList(section)
      stats = labels.length ? labels : ['Total', 'Active', 'Pending']
      continue
    }
    if (LIST_RE.test(section)) {
      isList = true
      continue
    }
    panels.push(section)
  }

  const labels = isList ? (columnLabels?.length ? columnLabels : DEFAULT_COLUMNS) : []
  const seen = new Set<string>()
  const columns = labels.map((label) => {
    let key = toCamelCase(label)
    while (seen.has(key)) key += '2'
    seen.add(key)
    return { key, label }
  })

  return { fields, selects, columns, stats, panels, isList, hasStats: stats.length > 0 }
}

/** Build the dummy JSON payload that the screen's mock API resolves with. */
export function buildMockData(screen: Screen): Record<string, unknown> {
  const model = analyseScreen(screen)
  const { endpoint } = screenNames(screen)
  const data: Record<string, unknown> = {
    screen: screen.name,
    endpoint,
    updatedAt: '2026-01-15T09:30:00.000Z',
  }

  if (model.fields.length) {
    const optionsByKey = Object.fromEntries(model.selects.map((s) => [s.key, s.options]))
    data.form = Object.fromEntries(
      model.fields.map((f) => [f.key, formValue(f, optionsByKey[f.key] ?? [])]),
    )
    if (model.selects.length) data.options = optionsByKey
  }

  if (model.hasStats) {
    data.stats = model.stats.map((label, i) => {
      const raw = sampleValue(label, i + 2)
      const value =
        typeof raw === 'number'
          ? raw.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : String((i + 1) * 128 + 14)
      return { label, value, trend: `${i % 2 === 0 ? '+' : '-'}${(2.4 + i * 1.3).toFixed(1)}%` }
    })
  }

  if (model.isList) {
    const statusField = model.selects.find((s) => /status|state|stage/i.test(s.key))
    data.columns = model.columns
    data.items = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      ...Object.fromEntries(model.columns.map((c) => [c.key, sampleValue(c.label, i, statusField?.options)])),
    }))
    data.total = 5
  }

  if (model.panels.length) {
    data.panels = model.panels.map((title) => ({
      title,
      body: `Sample content for "${title}" returned by ${endpoint}.`,
    }))
  }

  return data
}
