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
    renderBar();
    expect(group().querySelector('[data-class="restored_mid"]')).toBeNull();
    expect(group().querySelectorAll('[data-class]').length).toBe(3);
    expect(screen.getByText('Classes this model has: degraded, healthy, restored early.')).toBeInTheDocument();
  });

  it('draws a reading that holds only some of the model classes, without inventing a zero row', () => {
    renderBar({ probabilities: { healthy: 0.6, degraded: 0.4 } });
    expect(Array.from(group().querySelectorAll('[data-class]')).map((row) => row.getAttribute('data-class'))).toEqual(['healthy', 'degraded']);
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

describe('ProbabilityBar limits line when the evaluation is absent (B WR-05)', () => {
  it('says the model has not been tested on new sites when evaluation is undefined', () => {
    renderBar({ modelCard: { rows: 100, sites: ['ind_D2'], countries: ['Indonesia'] } });
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
  });

  it('says it when evaluation is explicitly undefined or null', () => {
    const { unmount } = renderBar({ modelCard: { ...MODEL_CARD, evaluation: undefined } });
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
    unmount();
    renderBar({ modelCard: { ...MODEL_CARD, evaluation: null } });
    expect(screen.getByText('It has not been tested on recordings from new sites.')).toBeInTheDocument();
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

describe('ProbabilityBar rejects a reading that is not a probability distribution (B WR-04)', () => {
  const invalid: Array<[string, Record<string, number>]> = [
    ['a NaN value', { healthy: Number.NaN, degraded: 0.27, restored_early: 0.15 }],
    ['an infinite value', { healthy: Number.POSITIVE_INFINITY, degraded: 0.27, restored_early: 0.15 }],
    ['a negative value', { healthy: 1.2, degraded: -0.2, restored_early: 0 }],
    ['a value above 1', { healthy: 1.5, degraded: 0, restored_early: 0 }],
    ['all zeros', { healthy: 0, degraded: 0, restored_early: 0 }],
    ['a total that is not 1', { healthy: 0.2, degraded: 0.2, restored_early: 0.2 }],
    ['a class the model does not have', { healthy: 0.58, degraded: 0.27, restored_early: 0.15, restored_mid: 0.5 }],
    ['a class name that is not a habitat status', { healthy: 0.58, degraded: 0.27, restored_early: 0.15, sandy: 0.1 }],
  ];

  it.each(invalid)('shows the could-not-be-shown state and no verdict for %s', (_name, probabilities) => {
    const { container } = renderBar({ probabilities });
    expect(screen.getByText('The model reading could not be shown.')).toBeInTheDocument();
    expect(container.querySelector('[data-invalid-reading]')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Model reading: class probabilities' })).toBeNull();
    expect(container.querySelector('[data-class]')).toBeNull();
    expect(container.querySelector('[data-percent]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/highest probability|matches the reference|differs from|NaN|Infinity|%/);
  });

  it('rejects the abstain state with an invalid reading too: nothing is drawn', () => {
    const { container } = renderBar({ abstain: {}, probabilities: { healthy: Number.NaN, degraded: 0.5, restored_early: 0.5 } });
    expect(screen.getByText('The model reading could not be shown.')).toBeInTheDocument();
    expect(container.querySelector('[data-bar]')).toBeNull();
  });

  it('accepts a reading that sums to 1 within rounding and does not renormalise it', () => {
    renderBar({ probabilities: { healthy: 0.33, degraded: 0.33, restored_early: 0.33 } });
    expect(group().querySelectorAll('[data-class]').length).toBe(3);
    expect(screen.queryByText('The model reading could not be shown.')).toBeNull();
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
