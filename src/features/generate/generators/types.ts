import type { BrandingRefs, GeneratedFile, GeneratedFileKind, Screen, ScreenField, TargetFramework } from '../../../types'
import { toCamelCase, toKebabCase, toPascalCase } from '../../../utils/strings'

/**
 * A framework generator knows (1) which files the LLM should produce for a screen
 * and (2) how to deterministically generate those files offline (demo mode).
 * Register new generators in ./index.ts.
 */
export interface FrameworkGenerator {
  id: TargetFramework
  label: string
  /** Files expected for a screen (path + short purpose), injected into the LLM prompt. */
  expectedFiles(screen: Screen): Array<{ path: string; kind: GeneratedFileKind; purpose: string }>
  /** Framework specific coding conventions injected into the LLM prompt. */
  promptGuidelines: string
  /** Framework specific instructions for applying the brand font and logo, injected into the LLM prompt. */
  brandingGuidelines(branding: BrandingRefs): string[]
  /**
   * Deterministic template-based generation used by the offline/mock provider.
   * `branding` threads the confirmed font family and logo asset into the output.
   */
  generateOffline(screen: Screen, branding?: BrandingRefs): GeneratedFile[]
}

/** Naming helpers shared by generators. */
export interface ScreenNames {
  pascal: string
  camel: string
  kebab: string
  endpoint: string
}

export function screenNames(screen: Screen): ScreenNames {
  const pascal = toPascalCase(screen.name)
  return {
    pascal,
    camel: toCamelCase(screen.name),
    kebab: toKebabCase(screen.name),
    endpoint: `/api/${toKebabCase(screen.name)}`,
  }
}

/** Unique, identifier-safe keys for each field (e.g. "emailAddress"). */
export function fieldKeys(fields: ScreenField[]): string[] {
  const used = new Set<string>()
  return fields.map((f) => {
    const base = toCamelCase(f.label)
    let key = base
    let i = 2
    while (used.has(key)) key = `${base}${i++}`
    used.add(key)
    return key
  })
}
