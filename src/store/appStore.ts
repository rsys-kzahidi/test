import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultProviderConfigs } from '../features/llm/llmService'
import type {
  GenerationResult,
  LLMProviderConfig,
  ProviderId,
  Screen,
  StepId,
  TargetFramework,
} from '../types'

export type UploadStatus = 'parsing' | 'parsed' | 'error'

export interface UploadedDocument {
  id: string
  name: string
  size: number
  status: UploadStatus
  screenCount?: number
  error?: string
}

export type ConnectionStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; message: string }
  | { state: 'error'; message: string }

export type Theme = 'dark' | 'light'

interface AppState {
  step: StepId
  theme: Theme
  uploads: UploadedDocument[]
  screens: Screen[]
  framework: TargetFramework
  activeProvider: ProviderId
  providers: Record<ProviderId, LLMProviderConfig>
  connection: Partial<Record<ProviderId, ConnectionStatus>>
  results: Record<string, GenerationResult>
  /** Screen selected in the preview step. */
  previewScreenId: string | null

  setStep: (step: StepId) => void
  toggleTheme: () => void
  upsertUpload: (doc: UploadedDocument) => void
  removeUpload: (id: string) => void
  addScreens: (screens: Screen[]) => void
  updateScreen: (id: string, patch: Partial<Screen>) => void
  removeScreen: (id: string) => void
  moveScreen: (id: string, direction: -1 | 1) => void
  clearScreens: () => void
  setFramework: (framework: TargetFramework) => void
  setActiveProvider: (id: ProviderId) => void
  updateProvider: (id: ProviderId, patch: Partial<LLMProviderConfig>) => void
  setConnection: (id: ProviderId, status: ConnectionStatus) => void
  setResult: (result: GenerationResult) => void
  clearResults: () => void
  openPreview: (screenId: string | null) => void
  reset: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      step: 'upload',
      theme: 'dark',
      uploads: [],
      screens: [],
      framework: 'react',
      activeProvider: 'mock',
      providers: defaultProviderConfigs(),
      connection: {},
      results: {},
      previewScreenId: null,

      setStep: (step) => set({ step }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      upsertUpload: (doc) =>
        set((s) => {
          const exists = s.uploads.some((u) => u.id === doc.id)
          return { uploads: exists ? s.uploads.map((u) => (u.id === doc.id ? doc : u)) : [...s.uploads, doc] }
        }),
      removeUpload: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),
      addScreens: (screens) => set((s) => ({ screens: [...s.screens, ...screens] })),
      updateScreen: (id, patch) =>
        set((s) => ({ screens: s.screens.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)) })),
      removeScreen: (id) =>
        set((s) => {
          const results = { ...s.results }
          delete results[id]
          return { screens: s.screens.filter((sc) => sc.id !== id), results }
        }),
      moveScreen: (id, direction) =>
        set((s) => {
          const i = s.screens.findIndex((sc) => sc.id === id)
          const j = i + direction
          if (i < 0 || j < 0 || j >= s.screens.length) return {}
          const screens = [...s.screens]
          ;[screens[i], screens[j]] = [screens[j], screens[i]]
          return { screens }
        }),
      clearScreens: () => set({ screens: [], uploads: [], results: {} }),
      setFramework: (framework) => set({ framework }),
      setActiveProvider: (activeProvider) => set({ activeProvider }),
      updateProvider: (id, patch) =>
        set((s) => ({
          providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } },
          connection: { ...s.connection, [id]: { state: 'idle' } },
        })),
      setConnection: (id, status) => set((s) => ({ connection: { ...s.connection, [id]: status } })),
      setResult: (result) =>
        set((s) =>
          // Ignore late updates for screens that were removed while generating.
          s.screens.some((sc) => sc.id === result.screenId)
            ? { results: { ...s.results, [result.screenId]: result } }
            : {},
        ),
      clearResults: () => set({ results: {} }),
      openPreview: (previewScreenId) => set({ previewScreenId, step: 'preview' }),
      reset: () => set({ step: 'upload', uploads: [], screens: [], results: {} }),
    }),
    {
      name: 'ui-coding-agent',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only preferences + provider settings are persisted (API keys stay in this browser's localStorage).
      partialize: (s) => ({
        theme: s.theme,
        framework: s.framework,
        activeProvider: s.activeProvider,
        providers: s.providers,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const defaults = defaultProviderConfigs()
        const providers = { ...defaults }
        for (const id of Object.keys(defaults) as ProviderId[]) {
          providers[id] = { ...defaults[id], ...(p.providers?.[id] ?? {}), id }
        }
        return { ...current, ...p, providers }
      },
    },
  ),
)

/** Effective framework for a screen (per-screen override or the global default). */
export function frameworkFor(screen: Screen, global: TargetFramework): TargetFramework {
  return screen.framework ?? global
}
