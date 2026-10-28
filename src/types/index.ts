/**
 * Core domain types shared across the UI Coding Agent.
 */

/** Target UI frameworks the agent can generate code for. */
export type TargetFramework = 'react' | 'angular'

/** Input types that can be inferred for an extracted form field. */
export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'textarea'

export interface ScreenField {
  /** Human readable label, e.g. "Email address". */
  label: string
  /** Inferred (or explicitly specified) input type. */
  type: FieldType
  /** Options for `select` fields when present in the document. */
  options?: string[]
}

/** A single UI screen detected in an uploaded design document. */
export interface Screen {
  id: string
  /** Screen title, e.g. "Login". */
  name: string
  /** Free-form description of the screen's purpose. */
  description: string
  /** Layout sections / regions, e.g. "Header", "Summary cards", "Orders table". */
  sections: string[]
  fields: ScreenField[]
  /** Button / action labels, e.g. "Sign in". */
  buttons: string[]
  /** Raw text block the screen was extracted from (sent to the LLM as extra context). */
  rawText: string
  /** Name of the file the screen came from. */
  sourceFile?: string
  /** Per-screen framework override. Falls back to the global framework when undefined. */
  framework?: TargetFramework
}

/** Supported LLM provider identifiers. `mock` is the offline demo provider. */
export type ProviderId = 'openai' | 'anthropic' | 'local' | 'mock'

/** Configuration for a single LLM provider. Persisted to localStorage only. */
export interface LLMProviderConfig {
  id: ProviderId
  /** Display label. */
  label: string
  /** API key (never committed; entered by the user at runtime). Optional for local/mock. */
  apiKey?: string
  /** Model identifier, e.g. "gpt-4o" or "claude-3-5-sonnet-latest". */
  model: string
  /** Custom base URL. Required for `local` (e.g. http://localhost:11434/v1). */
  baseUrl?: string
  /** Route requests through the optional Express proxy in /server. */
  useProxy?: boolean
  temperature?: number
  maxTokens?: number
}

export type GeneratedFileKind = 'component' | 'template' | 'styles' | 'mock-data' | 'api-service' | 'other'

/** A single generated source file. */
export interface GeneratedFile {
  /** Path relative to the screen folder, e.g. "LoginScreen.tsx". */
  path: string
  /** Language used for syntax highlighting. */
  language: string
  kind: GeneratedFileKind
  content: string
}

export type GenerationStatus = 'queued' | 'generating' | 'done' | 'error'

/** Result of generating code for a single screen. */
export interface GenerationResult {
  screenId: string
  screenName: string
  framework: TargetFramework
  status: GenerationStatus
  files: GeneratedFile[]
  provider?: ProviderId
  model?: string
  error?: string
  /** Non-fatal issues, e.g. expected files the model did not return. */
  warnings?: string[]
  startedAt?: number
  finishedAt?: number
  /** Branding references the screen was generated with (font family / logo asset). */
  branding?: BrandingRefs
}

/** A logo image supplied by the user (or extracted from a document). */
export interface BrandLogo {
  /** `data:` URL of the image (png, svg or jpg). */
  dataUrl: string
  fileName: string
  mimeType: string
}

/** Branding confirmed by the user and applied consistently to every generated screen. */
export interface Branding {
  /** Font family name, e.g. "Inter". Undefined = framework default system font stack. */
  fontFamily?: string
  logo?: BrandLogo
}

/**
 * Prompt-safe branding references (no binary data) threaded through prompts and generators.
 * The logo itself is written to `assets/<logoAsset>` by the exporters.
 */
export interface BrandingRefs {
  fontFamily?: string
  /** Asset file name of the logo, e.g. "logo.png". Undefined = render a placeholder. */
  logoAsset?: string
}

/** Branding signals detected while parsing an uploaded document. */
export interface BrandingDetection {
  /** Whether an embedded image that looks like a logo was found (first page / header area). */
  logoDetected: boolean
  /** The logo image when it could be extracted from the document (DOCX only). */
  logoCandidate?: BrandLogo
  /** Dominant heading font family, when one could be determined. */
  fontFamily?: string
  /** `high` = a known font family was identified; `low` = a raw/unrecognised name was found. */
  fontConfidence: 'high' | 'low' | 'none'
  /** Document the signals came from. */
  sourceFile?: string
}

/** Wizard steps. */
export type StepId = 'upload' | 'review' | 'configure' | 'generate' | 'preview'
