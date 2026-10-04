import type { ComponentType } from 'react';
import type { FixtureGroup, FixtureSectionMeta } from './parts/FixtureSection';
import { STATUS_PALETTE_META, StatusPaletteSection } from './sections/StatusPaletteSection';
import { TOKENS_META, TokensSection } from './sections/TokensSection';

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
];
