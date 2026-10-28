import { Cpu, FileUp, ListChecks, Package, Sparkles, type LucideIcon } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { StepId } from '../types'

export interface StepDefinition {
  id: StepId
  label: string
  description: string
  icon: LucideIcon
}

export const STEPS: StepDefinition[] = [
  { id: 'upload', label: 'Upload', description: 'PDF or Word design docs', icon: FileUp },
  { id: 'review', label: 'Review Screens', description: 'Edit the extracted outline', icon: ListChecks },
  { id: 'configure', label: 'Configure LLM', description: 'OpenAI, Claude or local', icon: Cpu },
  { id: 'generate', label: 'Generate', description: 'Create UI code per screen', icon: Sparkles },
  { id: 'preview', label: 'Preview & Export', description: 'Browse code, download ZIP', icon: Package },
]

/** Whether a step can be opened given the current state. */
export function useStepAvailability(): Record<StepId, boolean> {
  const screens = useAppStore((s) => s.screens.length)
  const results = useAppStore((s) => s.results)
  const hasDone = Object.values(results).some((r) => r.status === 'done')
  return { upload: true, review: true, configure: true, generate: screens > 0, preview: hasDone }
}
