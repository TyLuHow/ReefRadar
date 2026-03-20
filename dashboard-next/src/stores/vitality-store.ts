import { create } from 'zustand';

type VitalitySource = 'crossfader' | 'audio' | 'ml' | 'static' | 'default';

interface VitalityStore {
  target: number; // 0.0 - 1.0
  source: VitalitySource;
  setVitality: (value: number, source?: VitalitySource) => void;
}

export const useVitalityStore = create<VitalityStore>((set) => ({
  target: 0,
  source: 'default',
  setVitality: (value, source = 'default') =>
    set({ target: Math.max(0, Math.min(1, value)), source }),
}));
