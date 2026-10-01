import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProbabilityBars } from '@/components/charts';
import threeClassNoCoords from '../fixtures/api/visualize-3class-no-coords.json';

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
