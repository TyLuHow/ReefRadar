import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProbabilityBars } from '@/components/charts';
import { ComparisonPanel } from '@/components/experience/ComparisonPanel';
import { ControlsPanel } from '@/components/experience/ControlsPanel';
import { AnalysisResults } from '@/components/AnalysisResults';
import type { AnalysisResult } from '@/types';
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
