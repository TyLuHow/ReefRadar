import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ProbabilityBars } from '@/components/charts';
import { ComparisonPanel } from '@/components/experience/ComparisonPanel';
import { ControlsPanel } from '@/components/experience/ControlsPanel';
import { AnalysisResults } from '@/components/AnalysisResults';
import { RegionWarning } from '@/components/dashboard/RegionWarning';
import { CaveatsFooter } from '@/components/experience/CaveatsFooter';
import { CaveatsBanner } from '@/components/dashboard/CaveatsBanner';
import type { AnalysisResult, RegionInfo } from '@/types';
import threeClassNoCoords from '../fixtures/api/visualize-3class-no-coords.json';
import threeClassInRegion from '../fixtures/api/visualize-3class-in-region.json';

const noCoordsResult = threeClassNoCoords as unknown as AnalysisResult;
const inRegionResult = threeClassInRegion as unknown as AnalysisResult;

describe('ProbabilityBars', () => {
  it('renders exactly three rows with integer percent labels summing to 100, and no restored_mid row', () => {
    const { classification } = threeClassNoCoords;
    render(
      <ProbabilityBars
        probabilities={classification.probabilities}
        highlightedStatus={classification.label as 'healthy'}
        animated={false}
      />
    );

    // Three rows (healthy, degraded, restored_early) -- no restored_mid.
    expect(screen.queryByText(/restored mid/i)).not.toBeInTheDocument();

    const percentLabels = screen.getAllByText(/^\d+%$/);
    expect(percentLabels).toHaveLength(3);

    const total = percentLabels.reduce(
      (sum, el) => sum + parseInt(el.textContent ?? '0', 10),
      0
    );
    expect(total).toBe(100);

    // Integer labels only -- no one-decimal values anywhere.
    for (const el of percentLabels) {
      expect(el.textContent).toMatch(/^\d+%$/);
    }
  });
});

describe('ComparisonPanel', () => {
  it('renders three class rows with integer percentages summing to 100 and no row for an absent class', () => {
    render(<ComparisonPanel analysisData={noCoordsResult} />);

    const heading = screen.getByText(/class probabilities \(model output\)/i);
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText('Restored (Mid)')).not.toBeInTheDocument();

    // Scope to the class-probabilities section (the similar-sites section
    // below also renders percentages, e.g. similarity scores).
    const section = heading.parentElement as HTMLElement;
    const percentLabels = within(section).getAllByText(/^\d+%$/);
    const total = percentLabels.reduce(
      (sum, el) => sum + parseInt(el.textContent ?? '0', 10),
      0
    );
    expect(total).toBe(100);
  });
});

describe('ControlsPanel headline', () => {
  it('reads "Most similar to <Label> reference recordings" and shows the top class integer percentage', () => {
    render(<ControlsPanel analysisData={noCoordsResult} />);

    expect(
      screen.getByText(/Most similar to Healthy reference recordings/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/58% model probability/i)).toBeInTheDocument();
  });
});

describe('AnalysisResults headline', () => {
  it('reads "Most similar to <Label> reference recordings", shows model_version, and omits the confidence-adjusted chip', () => {
    render(<AnalysisResults result={inRegionResult} />);

    expect(
      screen.getByText(/Most similar to Degraded reference recordings/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/model probability/i)).toBeInTheDocument();
    expect(screen.getAllByText('49%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/interim-real-only/i)).toBeInTheDocument();
    expect(screen.queryByText(/confidence adjusted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Geographic Limitation/i)).not.toBeInTheDocument();
  });
});

describe('RegionWarning', () => {
  it('says location not provided and names the training countries when coordinates_provided is false', () => {
    const region = noCoordsResult.classification!.region as RegionInfo;
    render(<RegionWarning region={region} />);

    expect(screen.getByText(/location not provided/i)).toBeInTheDocument();
    expect(screen.getByText(/Indonesia, Kenya/)).toBeInTheDocument();
  });

  it('names the detected region, says no training site is close, and says probabilities are unmodified when outside the training region', () => {
    const region: RegionInfo = {
      detected: 'GREAT_BARRIER_REEF',
      name: 'Great Barrier Reef',
      scope: 'specific',
      coordinates_provided: true,
      in_training_region: false,
      training_sites_in_region: 0,
      training_countries: ['Indonesia', 'Kenya'],
      in_training_distribution: false,
      confidence_adjusted: false,
    };
    render(<RegionWarning region={region} />);

    expect(screen.getByText(/Great Barrier Reef/)).toBeInTheDocument();
    expect(screen.getByText(/no\s+training site is close/i)).toBeInTheDocument();
    expect(screen.getByText(/raw output, unmodified/i)).toBeInTheDocument();
  });

  it('renders a soft informational note (not a warning, not validation) when in_training_region is true', () => {
    const region = {
      ...(inRegionResult.classification!.region as RegionInfo),
      nearest_training_site_km: 1.2,
      training_radius_km: 50,
    } as RegionInfo;
    const { container } = render(<RegionWarning region={region} />);
    expect(screen.getByText(/near the classifier.s training sites/i)).toBeInTheDocument();
    expect(container.textContent).toMatch(/not\s+validation/i);
    expect(container.textContent).toMatch(/1\.2 km/);
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it('falls back to detected === UNKNOWN / in_training_distribution for an old-shape region with no new fields', () => {
    const oldShapeRegion = {
      detected: 'UNKNOWN',
      name: 'Unknown Region',
      in_training_distribution: false,
      confidence_adjusted: true,
    } as RegionInfo;
    render(<RegionWarning region={oldShapeRegion} />);

    expect(screen.getByText(/location not provided/i)).toBeInTheDocument();
  });

  it('never mentions a percentage reduction of confidence or lists Australia/Maldives/Mexico as training countries', () => {
    const region: RegionInfo = {
      detected: 'GREAT_BARRIER_REEF',
      name: 'Great Barrier Reef',
      scope: 'specific',
      coordinates_provided: true,
      in_training_region: false,
      training_sites_in_region: 0,
      training_countries: ['Indonesia', 'Kenya'],
      in_training_distribution: false,
      confidence_adjusted: false,
    };
    const { container } = render(<RegionWarning region={region} />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toMatch(/reduced|adjusted by/i);
    expect(text).not.toMatch(/Australia|Maldives|Mexico/);
  });
});

describe('CaveatsFooter and CaveatsBanner', () => {
  it('neither mentions a percentage confidence reduction nor lists Australia/Maldives/Mexico as training countries', () => {
    const { container: footerContainer } = render(<CaveatsFooter />);
    fireEvent.click(within(footerContainer).getByText(/scientific caveats/i));
    const { container: bannerContainer } = render(<CaveatsBanner defaultExpanded />);

    for (const container of [footerContainer, bannerContainer]) {
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/reduced confidence|confidence.*reduced/i);
      expect(text).not.toMatch(/Australia|Maldives|Mexico/);
      expect(text).toMatch(/Indonesia, Kenya/);
    }
  });
});

describe('AnalysisResults similar sites', () => {
  it('says similarity is unavailable (with the reason) when the list is empty', () => {
    const result = {
      ...noCoordsResult,
      similar_sites: [],
      similar_sites_error: 'Reference embeddings could not be loaded, so similar-site comparison is unavailable.',
    } as AnalysisResult;
    render(<AnalysisResults result={result} />);
    expect(screen.getByText(/similar-site comparison is unavailable/i)).toBeInTheDocument();
  });
});
