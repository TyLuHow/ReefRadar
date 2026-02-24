export type BandId = 'low' | 'mid' | 'high';

export interface BandConfig {
  id: BandId;
  label: string;
  range: string;
  color: string;
  baseAmplitude: number;
  playingAmplitude: number;
  frequency: number;
  speed: number;
  yPosition: number; // Fraction from top (0-1)
}

export const BANDS: Record<BandId, BandConfig> = {
  low: {
    id: 'low',
    label: 'Fish Calls',
    range: '50-1000 Hz',
    color: '#cd853f', // Ochre
    baseAmplitude: 30,
    playingAmplitude: 80,
    frequency: 0.002,
    speed: 0.5,
    yPosition: 0.6,
  },
  mid: {
    id: 'mid',
    label: 'Grazing Sounds',
    range: '1-4 kHz',
    color: '#c08081', // Dusty Rose
    baseAmplitude: 20,
    playingAmplitude: 60,
    frequency: 0.004,
    speed: 0.8,
    yPosition: 0.5,
  },
  high: {
    id: 'high',
    label: 'Snapping Shrimp',
    range: '4-20 kHz',
    color: '#e9dcc9', // Pale Gold
    baseAmplitude: 15,
    playingAmplitude: 50,
    frequency: 0.008,
    speed: 1.2,
    yPosition: 0.4,
  },
};

export const BAND_IDS: BandId[] = ['low', 'mid', 'high'];
export const ALL_BANDS = new Set<BandId>(BAND_IDS);
