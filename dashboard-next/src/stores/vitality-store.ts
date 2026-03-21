import { create } from 'zustand';

type VitalitySource = 'crossfader' | 'audio' | 'ml' | 'static' | 'default';

export type ReefBandId = 'ambient' | 'fish' | 'grazing' | 'shrimp';

export interface BandEnergy {
  ambient: number; // 0-1
  fish: number; // 0-1
  grazing: number; // 0-1
  shrimp: number; // 0-1
}

interface VitalityStore {
  target: number; // 0.0 - 1.0
  source: VitalitySource;
  bandEnergy: BandEnergy;
  activeBands: Set<ReefBandId>;
  setVitality: (value: number, source?: VitalitySource) => void;
  setBandEnergy: (energy: BandEnergy) => void;
  setActiveBands: (bands: Set<ReefBandId>) => void;
}

export const useVitalityStore = create<VitalityStore>((set) => ({
  target: 0,
  source: 'default',
  bandEnergy: { ambient: 0, fish: 0, grazing: 0, shrimp: 0 },
  activeBands: new Set<ReefBandId>(['ambient', 'fish', 'grazing', 'shrimp']),
  setVitality: (value, source = 'default') =>
    set({ target: Math.max(0, Math.min(1, value)), source }),
  setBandEnergy: (energy) => set({ bandEnergy: energy }),
  setActiveBands: (bands) => set({ activeBands: bands }),
}));
