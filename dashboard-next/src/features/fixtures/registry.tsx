import type { ComponentType } from 'react';
import type { FixtureGroup, FixtureSectionMeta } from './parts/FixtureSection';
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
  define(SPECTROGRAM_META, SpectrogramSection),
  define(PROVENANCE_META, ProvenanceSection),
  define(DATA_TABLE_META, DataTableSection),
  define(STATES_META, StatesSection),
  define(NUMERALS_META, NumeralsSection),
];
