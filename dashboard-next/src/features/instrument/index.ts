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
export { DataTable } from './DataTable';
export type { DataTableColumn, DataTableProps, DataTableState } from './DataTable';
export { ProvenanceChip, provenanceChipText } from './ProvenanceChip';
export type { ProvenanceChipKind, ProvenanceChipProps } from './ProvenanceChip';
export { WhyPanel, WhyPanelBody, WhyPanelContent, WhyPanelSurface, whyPanelDataFromSite } from './WhyPanel';
export type { WhyPanelBodyProps, WhyPanelData, WhyPanelKind, WhyPanelProps, WhyPanelState, WhyPanelSurfaceProps } from './WhyPanel';
export { doiUrl, safeHttpsUrl } from './safe-url';
export * from './dsp';
export { SCROLL_PLAYHEAD_FRACTION, backingStoreSize, frequencyTicks, playheadX, scrollSourceRect, timeTickStep, timeTicks } from './playhead';
export type { PlayMode, SourceRect } from './playhead';
export { clearClipCache, isClipPath, loadClip, useClipSpectrogram } from './useClipSpectrogram';
export type { ClipSpectrogram, LoadedClip } from './useClipSpectrogram';
export { ColourBar, formatDb } from './ColourBar';
export type { ColourBarProps } from './ColourBar';
export { Spectrogram, spectrogramCaption } from './Spectrogram';
export type {
  SpectrogramBand,
  SpectrogramCaption,
  SpectrogramHandle,
  SpectrogramProps,
  SpectrogramState,
  SpectrogramVariant,
} from './Spectrogram';
export { WAVEFORM_RANGE, Waveform, waveformEnvelope } from './Waveform';
export type { WaveformProps } from './Waveform';
export { UnequalLengthError, createAudioEngine, equalPowerGains, isAudioSupported } from './audio-engine';
export type { AudioEngine, AudioEngineOptions, PlayOptions } from './audio-engine';
