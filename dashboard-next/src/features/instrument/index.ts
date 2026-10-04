/**
 * The instrument's public surface (DS-05, 04-08). Application code imports from
 * '@/features/instrument' only. This barrel holds the layout primitives the expressive boards use
 * (RLabel, Stat, AccentBlock, BandSection) and re-exports the DSP core, so a consumer needs one
 * import path. Later plans add Transport, Spectrogram and the rest here.
 * Nothing under src/features may import '@/components' (the feature fence).
 */
export { RLabel } from './RLabel';
export type { RLabelKind, RLabelProps } from './RLabel';
export { Stat } from './Stat';
export type { StatProps } from './Stat';
export { AccentBlock } from './AccentBlock';
export type { AccentBlockProps } from './AccentBlock';
export { BandSection } from './BandSection';
export type { BandSectionProps } from './BandSection';
export * from './dsp';
