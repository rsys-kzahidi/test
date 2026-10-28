import type { TargetFramework } from '../../../types'
import { angularGenerator } from './angular'
import { reactGenerator } from './react'
import type { FrameworkGenerator } from './types'

/**
 * Registry of target framework generators. To add a framework (e.g. Vue):
 * 1. add its id to `TargetFramework` in src/types,
 * 2. implement a `FrameworkGenerator` (see ./react.ts),
 * 3. register it here. The UI, prompts, mock provider and ZIP export pick it up automatically.
 */
export const FRAMEWORK_GENERATORS: Record<TargetFramework, FrameworkGenerator> = {
  react: reactGenerator,
  angular: angularGenerator,
}

export const FRAMEWORK_OPTIONS = Object.values(FRAMEWORK_GENERATORS).map((g) => ({ id: g.id, label: g.label }))

export function getGenerator(framework: TargetFramework): FrameworkGenerator {
  const generator = FRAMEWORK_GENERATORS[framework]
  if (!generator) throw new Error(`No generator registered for framework "${framework}"`)
  return generator
}

export type { FrameworkGenerator } from './types'
