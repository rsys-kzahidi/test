import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ChevronDown, FormInput, LayoutPanelTop, MousePointerClick, Plus, Trash2, X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { FieldType, Screen, ScreenField, TargetFramework } from '../../types'
import { parseField } from '../upload/detectScreens'
import { FRAMEWORK_OPTIONS } from '../generate/generators'
import { ScreenIcon } from './ScreenIcon'

const FIELD_TYPES: FieldType[] = ['text', 'email', 'password', 'number', 'tel', 'date', 'select', 'checkbox', 'textarea']

function ChipInput({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState('')
  const submit = () => {
    if (value.trim()) onAdd(value.trim())
    setValue('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 pl-2.5 dark:border-slate-700">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-28 bg-transparent py-0.5 text-xs outline-none placeholder:text-slate-400"
      />
      <button type="button" onClick={submit} className="rounded-full p-1 text-slate-400 hover:text-brand-600" aria-label={placeholder}>
        <Plus className="size-3" />
      </button>
    </span>
  )
}

function Chip({ children, onRemove, tone }: { children: ReactNode; onRemove: () => void; tone: 'field' | 'button' | 'section' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium ring-1 ring-inset',
        tone === 'field' && 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/30',
        tone === 'button' && 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/30',
        tone === 'section' && 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
      )}
    >
      {children}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 opacity-60 hover:opacity-100" aria-label="Remove">
        <X className="size-3" />
      </button>
    </span>
  )
}

export interface ScreenCardProps {
  screen: Screen
  index: number
  total: number
  globalFramework: TargetFramework
  onChange: (patch: Partial<Screen>) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}

export function ScreenCard({ screen, index, total, globalFramework, onChange, onRemove, onMove }: ScreenCardProps) {
  const [showRaw, setShowRaw] = useState(false)

  const updateField = (i: number, patch: Partial<ScreenField>) =>
    onChange({ fields: screen.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <article className="card flex flex-col gap-4 p-5" aria-label={`Screen ${index + 1}: ${screen.name}`}>
      <header className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/15 to-fuchsia-500/15 text-brand-600 dark:text-brand-300">
          <ScreenIcon name={screen.name} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`name-${screen.id}`}>
            Screen name
          </label>
          <input
            id={`name-${screen.id}`}
            value={screen.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full rounded-md bg-transparent px-1 py-0.5 text-base font-semibold outline-none hover:bg-slate-100 focus:bg-slate-100 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
          />
          {screen.sourceFile && (
            <p className="truncate px-1 text-xs text-slate-500 dark:text-slate-400">from {screen.sourceFile}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" onClick={onRemove} aria-label={`Delete screen ${screen.name}`}>
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      <div>
        <label className="label" htmlFor={`desc-${screen.id}`}>
          Description
        </label>
        <textarea
          id={`desc-${screen.id}`}
          rows={3}
          value={screen.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="input resize-y"
        />
      </div>

      <div>
        <p className="label flex items-center gap-1.5">
          <FormInput className="size-3.5" aria-hidden /> Fields ({screen.fields.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {screen.fields.map((f, i) => (
            <Chip key={`${f.label}-${i}`} tone="field" onRemove={() => onChange({ fields: screen.fields.filter((_, j) => j !== i) })}>
              {f.label}
              <select
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                aria-label={`Type of field ${f.label}`}
                className="ml-0.5 cursor-pointer rounded bg-transparent text-[10px] uppercase opacity-70 outline-none"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Chip>
          ))}
          <ChipInput
            placeholder="Add field"
            onAdd={(v) => {
              const field = parseField(v)
              if (field) onChange({ fields: [...screen.fields, field] })
            }}
          />
        </div>
      </div>

      <div>
        <p className="label flex items-center gap-1.5">
          <MousePointerClick className="size-3.5" aria-hidden /> Buttons ({screen.buttons.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {screen.buttons.map((b, i) => (
            <Chip key={`${b}-${i}`} tone="button" onRemove={() => onChange({ buttons: screen.buttons.filter((_, j) => j !== i) })}>
              {b}
            </Chip>
          ))}
          <ChipInput placeholder="Add button" onAdd={(v) => onChange({ buttons: [...screen.buttons, v] })} />
        </div>
      </div>

      <div>
        <p className="label flex items-center gap-1.5">
          <LayoutPanelTop className="size-3.5" aria-hidden /> Layout sections ({screen.sections.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {screen.sections.map((s, i) => (
            <Chip key={`${s}-${i}`} tone="section" onRemove={() => onChange({ sections: screen.sections.filter((_, j) => j !== i) })}>
              {s}
            </Chip>
          ))}
          <ChipInput placeholder="Add section" onAdd={(v) => onChange({ sections: [...screen.sections, v] })} />
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Framework
          <select
            className="input w-auto py-1 text-xs"
            value={screen.framework ?? ''}
            onChange={(e) => onChange({ framework: (e.target.value || undefined) as TargetFramework | undefined })}
          >
            <option value="">Default ({FRAMEWORK_OPTIONS.find((o) => o.id === globalFramework)?.label})</option>
            {FRAMEWORK_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {screen.rawText && (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Extracted text <ChevronDown className={clsx('size-3.5 transition', showRaw && 'rotate-180')} />
          </button>
        )}
      </footer>
      {showRaw && (
        <pre className="max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-xs whitespace-pre-wrap text-slate-600 dark:bg-slate-950 dark:text-slate-400">
          {screen.rawText}
        </pre>
      )}
    </article>
  )
}
