import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteCard } from '@/components/SiteCard';
import { SitePopup } from '@/components/map/SitePopup';
import type { Site } from '@/types';
import sitesFixture from '../fixtures/api/sites.json';

// D-17/TRUTH-09: site label provenance rendered on SiteCard and SitePopup
// from real /sites fields, not guessed from the site id.

function findSite(siteId: string): Site {
  const site = sitesFixture.sites.find((s) => s.site_id === siteId);
  if (!site) throw new Error(`Fixture missing site ${siteId}`);
  return site as unknown as Site;
}

const MARRS_HEALTHY = findSite('aus_H1');
const BORA_BORA_TOURIST = findSite('borabora_tourist');
const IRMA_WESTERN_DRY_ROCKS = findSite('irma_western_dry_rocks');
const SANCTSOUND_SITE = findSite('sanctsound_fk01');
const KEN_D3 = findSite('ken_D3');

// Old-shape site predating label provenance fields (D-17) -- must not crash.
const OLD_SHAPE_SITE: Site = {
  site_id: 'legacy_site',
  country: 'Indonesia',
  status: 'healthy',
};

describe('SiteCard label provenance', () => {
  it('shows the MARRS label, who assigned it, and its definition', () => {
    render(<SiteCard site={MARRS_HEALTHY} expanded />);
    expect(screen.getByText(/assigned by/i)).toBeInTheDocument();
    expect(screen.getByText(/Healthy \(H\)/)).toBeInTheDocument();
    expect(screen.getByText(/MARRS research team/i)).toBeInTheDocument();
    expect(screen.getByText(/Least disturbed reef habitat/i)).toBeInTheDocument();
  });

  it('shows the Bora-Bora tourist site as Unknown status with its original disturbance-context term', () => {
    render(<SiteCard site={BORA_BORA_TOURIST} expanded />);
    expect(screen.getAllByText(/Unknown/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/tourist \(assigned by/i)).toBeInTheDocument();
    expect(screen.getByText(/use\/disturbance context/i)).toBeInTheDocument();
  });

  it('shows the Irma Western Dry Rocks site as Unknown status with its period text', () => {
    render(<SiteCard site={IRMA_WESTERN_DRY_ROCKS} expanded />);
    expect(screen.getAllByText(/Unknown/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Hurricane Irma made landfall/i)).toBeInTheDocument();
  });

  it('shows that a SanctSound site has no health status assigned upstream', () => {
    render(<SiteCard site={SANCTSOUND_SITE} expanded />);
    expect(screen.getByText(/assigns no health status to its monitoring sites upstream/i)).toBeInTheDocument();
  });

  it('shows the ken_D3 label note', () => {
    render(<SiteCard site={KEN_D3} expanded />);
    expect(screen.getByText(/MARRS site-map KML labels the same point/i)).toBeInTheDocument();
  });

  it('no longer guesses a site type from the id or renders per-status biological claims', () => {
    render(<SiteCard site={MARRS_HEALTHY} expanded />);
    expect(screen.queryByText('Site Type:')).not.toBeInTheDocument();
    expect(screen.queryByText(/fish communities/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/snapping shrimp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/soundscapes approaching healthy/i)).not.toBeInTheDocument();
  });

  it('falls back to "Label: <formatted status>" for an old-shape site with no provenance fields, without crashing', () => {
    render(<SiteCard site={OLD_SHAPE_SITE} expanded />);
    expect(screen.getByText('Label: Healthy')).toBeInTheDocument();
  });
});

describe('SitePopup label provenance', () => {
  it('shows the same one-line "Label: ... (assigned by ...)" as SiteCard', () => {
    render(<SitePopup site={MARRS_HEALTHY} onClose={() => {}} />);
    expect(screen.getByText(/Label: Healthy \(H\) \(assigned by MARRS research team/i)).toBeInTheDocument();
  });

  it('falls back to "Label: <formatted status>" for an old-shape site without crashing', () => {
    render(<SitePopup site={OLD_SHAPE_SITE} onClose={() => {}} />);
    expect(screen.getByText('Label: Healthy')).toBeInTheDocument();
  });
});
