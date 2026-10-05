'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { stripSpec, type StripPoint } from '@/features/charts';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import type { ProbeSite } from '@/features/map';
import { HABITAT_STATUSES, LoadingState, STATUS_BG_CLASS, STATUS_LABELS, Skeleton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Token wiring probe (DS-01, success criterion 1, 04-20). One token family drives three consumers
 * at once: five swatches painted by the Tailwind utilities, a tile-free MapLibre map whose circle
 * paint is built from the resolved tokens, and a StripPlot whose marks are painted with var()
 * strings. Add `?tok=--dir-hab-healthy:%23B00020` to the URL and all three change; switch the
 * Direction and the map is updated with setPaintProperty (no setStyle flash). The map and the plot
 * show real contract sites; nothing here is invented.
 */

export const TOKEN_PROBE_META: FixtureSectionMeta = {
  slug: 'token-probe',
  group: 'Probe',
  kind: 'Probe',
  title: 'Token wiring probe',
  contract:
    'One token, three consumers: CSS utilities, Observable Plot marks and the MapLibre style. Add ?tok=--dir-hab-healthy:%23B00020 to the URL to change one token.',
  data: 'contracts/bucket/v1/sites.json (site_id, status, latitude, longitude, projection) through useReferenceSites; token values from src/styles/tokens.css read by features/ui/tokens.ts',
};

const MEASURE = 'Position on component 1 of the reference projection';

const TokenProbeMap = dynamic(() => import('@/features/map').then((module) => module.TokenProbeMap), {
  ssr: false,
  loading: () => (
    <LoadingState label="Loading map…">
      <Skeleton on="panel" className="h-[320px] w-full" />
    </LoadingState>
  ),
});

const StripPlot = dynamic(() => import('@/features/charts').then((module) => module.StripPlot), {
  ssr: false,
  loading: () => (
    <LoadingState label="Loading plot…">
      <Skeleton on="panel" className="h-[220px] w-full" />
    </LoadingState>
  ),
});

function probeSites(sites: readonly ContractSite[]): ProbeSite[] {
  return sites.map((site) => ({ site_id: site.site_id, status: site.status, latitude: site.latitude, longitude: site.longitude }));
}

function stripPoints(sites: readonly ContractSite[]): StripPoint[] {
  return sites
    .filter((site) => site.reference_role === 'acoustic_reference' && site.projection !== null)
    .map((site) => ({ id: site.site_id, status: site.status, value: site.projection!.x }));
}

function Swatches() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
      {HABITAT_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-2">
          <span data-probe-swatch={status} className={`${STATUS_BG_CLASS[status]} border-ink inline-block size-10 border`} />
          <span className="text-small text-ink">{STATUS_LABELS[status]}</span>
        </li>
      ))}
    </ul>
  );
}

function Probe() {
  const sites = useReferenceSites();
  const data = sites.data;
  const map = useMemo(() => (data ? probeSites(data) : []), [data]);
  const spec = useMemo(() => (data ? stripSpec(stripPoints(data), { measureLabel: MEASURE }) : undefined), [data]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="type-eyebrow text-muted mb-2">Swatches (CSS utilities)</p>
        <Swatches />
      </div>
      <div>
        <p className="type-eyebrow text-muted mb-2">Map (MapLibre paint from the resolved tokens)</p>
        {data ? <TokenProbeMap sites={map} /> : <Skeleton on="panel" className="h-[320px] w-full" />}
        <p className="text-small text-muted mt-2">{data ? `${map.length} sites from contract v${sites.version ?? '?'}, one circle each.` : 'Loading sites…'}</p>
      </div>
      <div>
        <p className="type-eyebrow text-muted mb-2">Chart (Observable Plot marks painted with var())</p>
        <StripPlot spec={spec} />
      </div>
    </div>
  );
}

export function TokenProbeSection() {
  return (
    <FixtureSection {...TOKEN_PROBE_META}>
      <StateCell primitive="token-probe" state="default" span="full">
        <Probe />
      </StateCell>
    </FixtureSection>
  );
}
