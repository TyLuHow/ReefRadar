import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContractStampLine, formatContractStamp } from '@/features/contract';
import { installContractFetch, resetContractStore, setContractPin, readContractJson, type ContractFetchHandle } from './support/contract-fetch';
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
import threeClassStamped from '../fixtures/api/visualize-3class-stamped.json';

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

describe('AnalysisResults similar-site labels (REVIEW WR-17)', () => {
  it('states who assigned each similar site label instead of a bare status', () => {
    const result = {
      ...noCoordsResult,
      similar_sites: [
        {
          site_id: 'ind_H4',
          country: 'Indonesia',
          status: 'healthy',
          similarity: 0.8,
          label_source: 'marrs',
          label_source_name: 'MARRS (Mars Assisted Reef Restoration System)',
          label_original: 'Healthy (H)',
        },
        {
          site_id: 'irma_eastern_sambo',
          country: 'USA',
          status: 'unknown',
          similarity: 0.7,
          label_source: 'irma',
          label_original: undefined,
        },
      ],
    } as unknown as AnalysisResult;
    const { container } = render(<AnalysisResults result={result} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/label: Healthy \(H\) \(assigned by MARRS/);
    // Source known but the dataset assigns no label (irma): say so, never "not reported".
    expect(text).toMatch(/no health label assigned by Simmons/);
    expect(text).not.toMatch(/label source not reported/);
  });

  it('falls back to "label source not reported" only when there is no provenance at all', () => {
    const result = {
      ...noCoordsResult,
      similar_sites: [
        { site_id: 'legacy_1', country: 'Indonesia', status: 'healthy', similarity: 0.8 },
      ],
    } as unknown as AnalysisResult;
    const { container } = render(<AnalysisResults result={result} />);
    expect(container.textContent ?? '').toMatch(/label source not reported/);
  });

  it('uses the API-supplied source name for sites with no label (Irma / SanctSound)', () => {
    const result = {
      ...noCoordsResult,
      similar_sites: [
        {
          site_id: 'sanctsound_fk01',
          country: 'USA',
          status: 'unknown',
          similarity: 0.7,
          label_source: 'sanctsound',
          label_source_name: 'NOAA SanctSound',
          label_original: null,
        },
      ],
    } as unknown as AnalysisResult;
    const { container } = render(<AnalysisResults result={result} />);
    expect(container.textContent ?? '').toMatch(/no health label assigned by NOAA SanctSound/);
  });
});

describe('contract stamp line (CONTRACT-04)', () => {
  const stamp = readContractJson('contracts/bucket/v1/stamp.json') as {
    contract_version: number;
    dataset_version: string;
    model_version: string;
    preprocessing_spec_version: string;
  };
  let handle: ContractFetchHandle;
  let client: QueryClient;

  beforeEach(() => {
    handle = installContractFetch({ latest: 2 });
    client = new QueryClient();
    resetContractStore();
    setContractPin();
  });
  afterEach(() => {
    handle.restore();
    client.clear();
    resetContractStore();
  });

  const withClient = (ui: React.ReactElement) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;

  it('formatContractStamp never invents a version', () => {
    expect(formatContractStamp(stamp)).toBe('Contract v1');
    expect(formatContractStamp({ dataset_version: stamp.dataset_version })).toBe('pre-contract');
    expect(formatContractStamp({})).toBe('pre-contract');
    expect(formatContractStamp({ contract_version: null, dataset_version: null, model_version: null })).toBe(
      'pre-contract'
    );
  });

  it('formatContractStamp keeps pre-contract, uncovered and unavailable distinct (CR-01)', () => {
    const uncovered = { contract_version: null, dataset_version: null, model_version: 'newer-model-2027' };
    expect(formatContractStamp(uncovered)).toBe('Not covered by a published contract');
    expect(formatContractStamp({ ...uncovered, stamp_status: 'uncovered' })).not.toBe('pre-contract');
    expect(formatContractStamp({ contract_version: null, stamp_status: 'load_failed' })).toBe(
      'Version stamp unavailable'
    );
  });

  it('shows the model version for an uncovered result and never calls it pre-contract (CR-01)', async () => {
    render(
      withClient(
        <ContractStampLine
          contract_version={null}
          dataset_version={null}
          model_version="newer-model-2027"
          preprocessing_spec_version={null}
          stamp_status="uncovered"
        />
      )
    );
    const text = screen.getByTestId('contract-stamp').textContent ?? '';
    expect(text).toBe('Not covered by a published contract · newer-model-2027');
    expect(text).not.toMatch(/pre-contract/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handle.requests).toEqual([]);
  });

  it('says the stamp is unavailable when the classifier could not load it (CR-01)', () => {
    render(
      withClient(
        <ContractStampLine contract_version={null} model_version="newer-model-2027" stamp_status="load_failed" />
      )
    );
    const text = screen.getByTestId('contract-stamp').textContent ?? '';
    expect(text).toBe('Version stamp unavailable · newer-model-2027');
    expect(text).not.toMatch(/pre-contract/);
  });

  it('resolves exactly v1 while latest is v2 and shows the three stamped versions', async () => {
    render(withClient(<ContractStampLine {...stamp} />));
    await waitFor(() => expect(screen.getByTestId('contract-stamp').textContent).not.toMatch(/resolving/));
    const text = screen.getByTestId('contract-stamp').textContent ?? '';
    expect(text).toContain('Contract v1');
    expect(text).toContain('reefradar-reference-2026.10.0');
    expect(text).toContain('interim-real-only');
    expect(text).toContain('preproc-2026.10.0-as-deployed');
    expect(text).not.toMatch(/differs/);
    expect(handle.requests).toContain('contract/v1.json');
    expect(handle.requests).not.toContain('contract/latest.json');
  });

  it('says so when the result stamp disagrees with the resolved manifest', async () => {
    render(withClient(<ContractStampLine {...stamp} dataset_version="reefradar-reference-1999.01.0" />));
    await waitFor(() => expect(screen.getByTestId('contract-stamp').textContent).toMatch(/differs/));
    expect(screen.getByTestId('contract-stamp').textContent).toMatch(/dataset/);
  });

  it('says "not found" for a version the bucket does not hold', async () => {
    render(withClient(<ContractStampLine {...stamp} contract_version={9} />));
    await waitFor(() => expect(screen.getByTestId('contract-stamp').textContent).toBe('Contract v9 (not found)'));
  });

  it('labels an unstamped result pre-contract and makes no contract request', async () => {
    render(withClient(<ContractStampLine contract_version={null} dataset_version={null} />));
    expect(screen.getByTestId('contract-stamp').textContent).toBe('pre-contract');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handle.requests).toEqual([]);
  });

  it('AnalysisResults and ControlsPanel render the line for a stamped and an unstamped result', async () => {
    const stamped = threeClassStamped as unknown as AnalysisResult;
    const { unmount } = render(withClient(<AnalysisResults result={stamped} />));
    await waitFor(() => expect(screen.getByTestId('contract-stamp').textContent).toContain('Contract v1'));
    unmount();

    const panel = render(withClient(<ControlsPanel analysisData={stamped} />));
    await waitFor(() => expect(screen.getByTestId('contract-stamp').textContent).toContain('Contract v1'));
    expect(screen.getByText(/58% model probability/i)).toBeInTheDocument();
    panel.unmount();

    render(withClient(<AnalysisResults result={noCoordsResult} />));
    expect(screen.getByTestId('contract-stamp').textContent).toBe('pre-contract');
    expect(screen.getByText(/interim-real-only/i)).toBeInTheDocument();
  });
});
