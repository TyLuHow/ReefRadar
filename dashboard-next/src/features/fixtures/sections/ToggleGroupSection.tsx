'use client';

import { Skeleton, ToggleGroup, ToggleGroupItem } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * ToggleGroup (DS-04): the segmented control in every UI-SPEC state. The options are the three
 * direction names, the real options of the switcher this route is reviewed with. Hover, focus and
 * pressed are forced with the data-force-* attributes on one segment; the disabled segment and the
 * invalid group are props applied to the same real options, and every such cell says so.
 */

export const TOGGLE_GROUP_META: FixtureSectionMeta = {
  slug: 'toggle-group',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'ToggleGroup',
  contract:
    'Single selection is a radio group, multiple selection a toolbar of pressed buttons. One Tab stop, arrow keys move between segments, Space or Enter toggles. The well variant sits inside wells and bands.',
  data: 'No data: options are the direction names Atlas, Nocturne, Poster; states are forced with data-force-* attributes, isDisabled and isInvalid',
};

function Options({ posterDisabled = false }: { posterDisabled?: boolean }) {
  return (
    <>
      <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
      <ToggleGroupItem id="nocturne">Nocturne</ToggleGroupItem>
      <ToggleGroupItem id="poster" isDisabled={posterDisabled}>
        Poster
      </ToggleGroupItem>
    </>
  );
}

export function ToggleGroupSection() {
  return (
    <FixtureSection {...TOGGLE_GROUP_META}>
      <StateCell primitive="toggle-group" state="default">
        <ToggleGroup aria-label="Direction, default" selectionMode="single">
          <Options />
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="hover" forced note="Applied to the Nocturne segment.">
        <ToggleGroup aria-label="Direction, hover" selectionMode="single">
          <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
          <ToggleGroupItem id="nocturne" data-force-hover="">
            Nocturne
          </ToggleGroupItem>
          <ToggleGroupItem id="poster">Poster</ToggleGroupItem>
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="focus" forced note="Applied to the Nocturne segment.">
        <ToggleGroup aria-label="Direction, focus" selectionMode="single">
          <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
          <ToggleGroupItem id="nocturne" data-force-focus="">
            Nocturne
          </ToggleGroupItem>
          <ToggleGroupItem id="poster">Poster</ToggleGroupItem>
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="pressed" forced note="Applied to the Nocturne segment.">
        <ToggleGroup aria-label="Direction, pressed" selectionMode="single">
          <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
          <ToggleGroupItem id="nocturne" data-force-pressed="">
            Nocturne
          </ToggleGroupItem>
          <ToggleGroupItem id="poster">Poster</ToggleGroupItem>
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="selected">
        <ToggleGroup aria-label="Direction, selected" selectionMode="single" defaultSelectedKeys={['nocturne']}>
          <Options />
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="disabled-segment" forced note="The Poster segment is disabled.">
        <ToggleGroup aria-label="Direction, one segment disabled" selectionMode="single" defaultSelectedKeys={['atlas']}>
          <Options posterDisabled />
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="loading">
        <div role="status" aria-busy="true">
          <div className="flex">
            <Skeleton on="panel" className="h-11 w-24" />
            <Skeleton on="panel" className="ms-px h-11 w-24" />
            <Skeleton on="panel" className="ms-px h-11 w-24" />
          </div>
          <p className="text-small text-muted mt-2">Loading options…</p>
        </div>
      </StateCell>
      <StateCell primitive="toggle-group" state="empty">
        <p className="text-body text-muted">No options.</p>
      </StateCell>
      <StateCell primitive="toggle-group" state="error" forced note="Invalid is applied to a group with nothing selected.">
        <ToggleGroup aria-label="Direction, invalid" selectionMode="multiple" isInvalid helperText="Choose at least one option.">
          <Options />
        </ToggleGroup>
      </StateCell>
      <StateCell primitive="toggle-group" state="well-variant" note="Inside a well; the selected segment takes the well ink.">
        <div className="bg-well p-5">
          <ToggleGroup aria-label="Direction, well" tone="well" selectionMode="single" defaultSelectedKeys={['atlas']}>
            <Options />
          </ToggleGroup>
        </div>
      </StateCell>
    </FixtureSection>
  );
}
