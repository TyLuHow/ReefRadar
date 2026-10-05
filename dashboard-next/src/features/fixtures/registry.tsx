import type { ComponentType } from 'react';
import type { FixtureGroup, FixtureSectionMeta } from './parts/FixtureSection';
import { BAND_TOGGLE_META, BandToggleSection } from './sections/BandToggleSection';
import { BUTTON_META, ButtonSection } from './sections/ButtonSection';
import { COMMAND_PALETTE_META, CommandPaletteSection } from './sections/CommandPaletteSection';
import { DATA_TABLE_META, DataTableSection } from './sections/DataTableSection';
import { DIALOG_META, DialogSection } from './sections/DialogSection';
import { LISTBOX_META, ListboxSection } from './sections/ListboxSection';
import { NUMERALS_META, NumeralsSection } from './sections/NumeralsSection';
import { PROVENANCE_META, ProvenanceSection } from './sections/ProvenanceSection';
import { SHEET_META, SheetSection } from './sections/SheetSection';
import { SLIDER_META, SliderSection } from './sections/SliderSection';
import { SPECTROGRAM_META, SpectrogramSection } from './sections/SpectrogramSection';
import { SPECTROGRAM_SCALE_META, SpectrogramScaleSection } from './sections/SpectrogramScaleSection';
import { STATES_META, StatesSection } from './sections/StatesSection';
import { STATUS_PALETTE_META, StatusPaletteSection } from './sections/StatusPaletteSection';
import { TABLE_META, TableSection } from './sections/TableSection';
import { TOGGLE_GROUP_META, ToggleGroupSection } from './sections/ToggleGroupSection';
import { TOKENS_META, TokensSection } from './sections/TokensSection';
import { TOOLTIP_META, TooltipSection } from './sections/TooltipSection';
import { TRANSPORT_META, TransportSection } from './sections/TransportSection';
import { WINDOW_STRIP_META, WindowStripSection } from './sections/WindowStripSection';
// 04-18
import { LEGEND_META, LegendSection } from './sections/LegendSection';
import { PROBABILITY_BAR_META, ProbabilityBarSection } from './sections/ProbabilityBarSection';
import { STATUS_BAND_META, StatusBandSection } from './sections/StatusBandSection';

/**
 * The /dev/fixtures sections in UI-SPEC "Section order". Every primitive plan appends its section
 * here and its slug to slugs.ts, in that order; tests/unit/fixtures-registry.test.ts keeps both
 * lists equal and in order.
 */
export interface FixtureSectionDef {
  slug: string;
  title: string;
  group: FixtureGroup;
  kind: string;
  Component: ComponentType;
}

function define({ slug, title, group, kind }: FixtureSectionMeta, Component: ComponentType): FixtureSectionDef {
  return { slug, title, group, kind, Component };
}

export const FIXTURE_SECTIONS: readonly FixtureSectionDef[] = [
  define(TOKENS_META, TokensSection),
  define(STATUS_PALETTE_META, StatusPaletteSection),
  define(SPECTROGRAM_SCALE_META, SpectrogramScaleSection),
  define(BUTTON_META, ButtonSection),
  define(DIALOG_META, DialogSection),
  define(SHEET_META, SheetSection),
  define(LISTBOX_META, ListboxSection),
  define(TABLE_META, TableSection),
  define(SLIDER_META, SliderSection),
  define(TOGGLE_GROUP_META, ToggleGroupSection),
  define(TOOLTIP_META, TooltipSection),
  define(COMMAND_PALETTE_META, CommandPaletteSection),
  define(TRANSPORT_META, TransportSection),
  define(SPECTROGRAM_META, SpectrogramSection),
  define(WINDOW_STRIP_META, WindowStripSection),
  define(BAND_TOGGLE_META, BandToggleSection),
  define(PROVENANCE_META, ProvenanceSection),
  // 04-18 (UI-SPEC order: probability-bar, data-table, legend, status-band)
  define(PROBABILITY_BAR_META, ProbabilityBarSection),
  define(DATA_TABLE_META, DataTableSection),
  // 04-18
  define(LEGEND_META, LegendSection),
  define(STATUS_BAND_META, StatusBandSection),
  define(STATES_META, StatesSection),
  define(NUMERALS_META, NumeralsSection),
];
