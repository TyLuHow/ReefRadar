import type { ComponentType } from 'react';
import type { FixtureGroup } from './parts/FixtureSection';

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

export const FIXTURE_SECTIONS: readonly FixtureSectionDef[] = [];
