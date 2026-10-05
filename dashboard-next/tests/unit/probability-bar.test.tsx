/**
 * ProbabilityBar (04-17, DS-05). The model's probabilities are shown as returned: integer
 * percentages that sum to 100 (toIntegerPercentages), ordered by raw probability, beside the
 * reference label with its assigner and the model's stated limits. Nothing here is a diagnosis. The
 * input is tests/fixtures/api/visualize-3class-stamped.json (healthy 0.58, degraded 0.27,
 * restored_early 0.15), read from disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProbabilityBar, type ProbabilityBarProps } from '@/features/instrument';

const STAMPED = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'api', 'visualize-3class-stamped.json'), 'utf8')) as {
  classification: { label: string; probabilities: Record<string, number> };
};
const PROBABILITIES = STAMPED.classification.probabilities;

const MODEL_CARD = { rows: 100, sites: ['ind_D2', 'ind_D3', 'ind_H4', 'ind_N1', 'ken_H1'], countries: ['Indonesia', 'Kenya'], evaluation: null };
const MODEL_CLASSES = ['degraded', 'healthy', 'restored_early'] as const;

function renderBar(props: Partial<ProbabilityBarProps> = {}) {
  return render(
    <ProbabilityBar
      probabilities={PROBABILITIES}
      modelClasses={MODEL_CLASSES}
      modelCard={MODEL_CARD}
      reference={{ status: 'healthy', assignedBy: 'MARRS research team (Williams, Jones et al. 2025)' }}
      {...props}
    />,
  );
}

const group = () => screen.getByRole('group', { name: 'Model reading: class probabilities' });

describe('ProbabilityBar rows', () => {
  it('orders rows by raw probability, descending, with integer percentages', () => {
    renderBar({ probabilities: { degraded: 0.27, restored_early: 0.15, healthy: 0.58 } });
    const rows = Array.from(group().querySelectorAll<HTMLElement>('[data-class]'));
    expect(rows.map((row) => row.getAttribute('data-class'))).toEqual(['healthy', 'degraded', 'restored_early']);
    expect(rows.map((row) => row.textContent)).toEqual(['Healthy58%', 'Degraded27%', 'Restored (early)15%']);
  });

  it('describes the group with a text summary of the same numbers', () => {
    renderBar();
    const describedBy = group().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Healthy 58%, degraded 27%, restored early 15%');
  });

  it('shows integer percentages that sum to 100 when the raw values do not round evenly', () => {
    renderBar({ probabilities: { degraded: 1 / 3, healthy: 1 / 3, restored_early: 1 / 3 } });
    const total = Array.from(group().querySelectorAll<HTMLElement>('[data-percent]')).reduce((sum, node) => sum + Number(node.getAttribute('data-percent')), 0);
    expect(total).toBe(100);
  });

  it('draws no fill for a zero probability and at least 2 px for any non-zero one', () => {
    renderBar({ probabilities: { degraded: 0.999, healthy: 0, restored_early: 0.001 } });
    const row = (name: string) => group().querySelector<HTMLElement>(`[data-class="${name}"]`) as HTMLElement;
    expect(row('healthy').querySelector('[data-bar-fill]')).toBeNull();
    const sliver = row('restored_early').querySelector<HTMLElement>('[data-bar-fill]');
    expect(sliver).not.toBeNull();
    expect(sliver?.style.minWidth).toBe('2px');
    expect(row('degraded').querySelector<HTMLElement>('[data-bar-fill]')?.style.minWidth).toBe('2px');
  });

  it('draws only the classes the model has and states them from the model card', () => {
    renderBar({ probabilities: { healthy: 0.58, degraded: 0.27, restored_early: 0.15, restored_mid: 0.5 } });
    expect(group().querySelector('[data-class="restored_mid"]')).toBeNull();
    expect(screen.getByText('Classes this model has: degraded, healthy, restored early.')).toBeInTheDocument();
  });

  it('marks the bars aria-hidden and the status marks as decoration', () => {
    renderBar();
    for (const bar of Array.from(group().querySelectorAll('[data-bar]'))) expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(group().querySelectorAll('svg[data-status]').length).toBe(3);
  });

  it('labels the header as the model reading, with its subtitle', () => {
    renderBar();
    expect(screen.getByText('MODEL READING')).toBeInTheDocument();
    expect(screen.getByText('Class probabilities as returned by the model')).toBeInTheDocument();
  });

  it('renders an optional note under the bars', () => {
    renderBar({ note: 'Test fixture, not a real analysis.' });
    expect(screen.getByText('Test fixture, not a real analysis.')).toBeInTheDocument();
  });
});

describe('ProbabilityBar reference label and verdict', () => {
  it('states a disagreement in a computed sentence', () => {
    renderBar({ probabilities: { degraded: 0.956, healthy: 0.03, restored_early: 0.014 } });
    expect(screen.getByText('Reference label: Healthy, assigned by MARRS research team (Williams, Jones et al. 2025).')).toBeInTheDocument();
    expect(screen.getByText("Model's highest probability: Degraded 96%.")).toBeInTheDocument();
    expect(screen.getByText("The model's highest probability, Degraded, differs from the reference label, Healthy.")).toBeInTheDocument();
  });

  it('states a match without implying confirmation', () => {
    renderBar();
    expect(screen.getByText("The model's highest probability, Healthy, matches the reference label.")).toBeInTheDocument();
    expect(screen.queryByText(/confirm|correct|verified/i)).toBeNull();
    // the limits line follows a match too
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
  });

  it('shows no comparison when there is no reference label', () => {
    renderBar({ reference: undefined });
    expect(screen.queryByText(/Reference label:/)).toBeNull();
    expect(screen.queryByText(/differs from|matches the reference/)).toBeNull();
  });
});

describe('ProbabilityBar limits line', () => {
  it('states what the model was trained on and that it has not been tested on new sites', () => {
    renderBar();
    expect(screen.getByText('This model was trained on 100 windows from 5 sites in Indonesia and Kenya.')).toBeInTheDocument();
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
  });

  it('computes singular and plural wording and a three-country list', () => {
    renderBar({ modelCard: { rows: 1, sites: ['ind_D2'], countries: ['Indonesia'], evaluation: null } });
    expect(screen.getByText('This model was trained on 1 window from 1 site in Indonesia.')).toBeInTheDocument();
    renderBar({ modelCard: { rows: 9, sites: ['a', 'b', 'c'], countries: ['Indonesia', 'Kenya', 'Mexico'], evaluation: null } });
    expect(screen.getByText('This model was trained on 9 windows from 3 sites in Indonesia, Kenya and Mexico.')).toBeInTheDocument();
  });

  it('does not claim the model is untested when an evaluation exists', () => {
    renderBar({ modelCard: { ...MODEL_CARD, evaluation: { accuracy: 0.5 } } });
    expect(screen.queryByText('It has not been tested on recordings from new sites.')).toBeNull();
    expect(screen.getByText('This model was trained on 100 windows from 5 sites in Indonesia and Kenya.')).toBeInTheDocument();
  });
});

describe('ProbabilityBar abstain', () => {
  it("says \"Can't tell\" with a hollow ring and the withheld-reading sentence", () => {
    renderBar({ abstain: {} });
    expect(screen.getByRole('heading', { name: "Can't tell" })).toBeInTheDocument();
    expect(
      screen.getByText('The model withheld a reading for this recording. Probabilities are shown as returned and are not a reading.'),
    ).toBeInTheDocument();
    const ring = group().querySelector('svg[data-shape="ring"]');
    expect(ring).not.toBeNull();
  });

  it('draws hatched bars and no habitat-status fill or class mark, and names no winner', () => {
    renderBar({ abstain: {} });
    const g = group();
    expect(g.getAttribute('data-abstain')).toBe('true');
    const fills = Array.from(g.querySelectorAll<HTMLElement>('[data-bar-fill]'));
    expect(fills.length).toBe(3);
    for (const fill of fills) {
      expect(fill.className).not.toMatch(/hab-/);
      expect(fill.getAttribute('data-hatched')).toBe('true');
    }
    // only the heading ring is a status mark; no class mark carries a class colour
    expect(Array.from(g.querySelectorAll('svg[data-status]')).map((s) => s.getAttribute('data-status'))).toEqual(['unknown']);
    expect(screen.queryByText(/highest probability/)).toBeNull();
  });

  it('prints the threshold sentence only when a threshold is given', () => {
    const { unmount } = renderBar({ abstain: {} });
    expect(screen.queryByText(/abstain threshold/)).toBeNull();
    unmount();
    renderBar({ abstain: { threshold: 0.6 } });
    expect(screen.getByText('No class reached the 60% abstain threshold.')).toBeInTheDocument();
  });

  it('still shows the reference label and the limits', () => {
    renderBar({ abstain: {} });
    expect(screen.getByText(/Reference label: Healthy, assigned by/)).toBeInTheDocument();
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
  });
});

describe('ProbabilityBar states', () => {
  it('loading shows three skeleton rows and the label', () => {
    renderBar({ state: 'loading' });
    const status = screen.getByRole('status');
    expect(within(status).getByText('Loading model reading…')).toBeInTheDocument();
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBe(3);
    expect(screen.queryByRole('group', { name: 'Model reading: class probabilities' })).toBeNull();
  });

  it('empty says there is no reading and when one appears', () => {
    renderBar({ state: 'empty', probabilities: {} });
    expect(screen.getByText('No model reading.')).toBeInTheDocument();
    expect(screen.getByText('A reading appears after the recording has been analysed.')).toBeInTheDocument();
  });

  it('an empty probabilities object is the empty state even in the default state', () => {
    renderBar({ probabilities: {} });
    expect(screen.getByText('No model reading.')).toBeInTheDocument();
  });

  it('error says what failed and that the recording and label are unaffected', () => {
    renderBar({ state: 'error' });
    expect(screen.getByText('The model reading could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('The recording and its reference label are unaffected.')).toBeInTheDocument();
  });
});
