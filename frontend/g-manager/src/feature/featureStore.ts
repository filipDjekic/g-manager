import { create } from 'zustand'
import type { FeatureFlagKey, FeatureFlagState } from '../types/feature.types'
const defaults: Record<FeatureFlagKey, boolean> = { REPORTS: true, WORKFLOWS: true, PWA_OFFLINE: true, AI_ASSISTANT: false }
interface FeatureState { flags: Record<FeatureFlagKey, boolean>; loaded: boolean; apply: (values: FeatureFlagState[]) => void; reset: () => void }
export const useFeatureStore = create<FeatureState>((set) => ({ flags: defaults, loaded: false,
  apply: (values) => set({ flags: { ...defaults, ...Object.fromEntries(values.map((value) => [value.key, value.enabled])) }, loaded: true }),
  reset: () => set({ flags: defaults, loaded: false }),
}))
