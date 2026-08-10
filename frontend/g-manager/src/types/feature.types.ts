export type FeatureFlagKey = 'REPORTS' | 'WORKFLOWS' | 'PWA_OFFLINE' | 'AI_ASSISTANT'
export interface FeatureFlagState { key: FeatureFlagKey; enabled: boolean; rolloutPercentage: number; owner: string; reviewBy: string; overridden: boolean; overrideExpiresAt: string | null; version: number | null }
