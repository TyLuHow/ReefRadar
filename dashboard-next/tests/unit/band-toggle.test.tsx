/**
 * BandToggle (04-15, DS-05).
 *
 * A multiple-selection ToggleGroup of frequency bands. These tests use test inputs for the bands
 * (the fixtures' bands are an equal three-way split, labelled as fixture bands); they prove the
 * computed rules: a band that starts at or above the recording's top frequency is disabled with
 * its reason, at least one band always stays on, and the states carry their copy.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BandToggle, bandLimitReason, formatBandRange, isBandAboveLimit } from '@/features/instrument';

const BANDS = [
  { id: 'low', label: 'Low', lowHz: 0, highHz: 2700 },
  { id: 'mid', label: 'Mid', lowHz: 2700, highHz: 5300 },
  { id: 'high', label: 'High', lowHz: 8000, highHz: 12000 },
];

function Harness({
  initial = ['low'],
  onChange,
  ...rest
}: { initial?: string[]; onChange?: (keys: Set<string>) => void } & Partial<React.ComponentProps<typeof BandToggle>>) {
  const [selected, setSelected] = useState(new Set(initial));
  return (
    <BandToggle
      bands={BANDS}
      nyquistHz={8000}
      selectedKeys={selected}
      onSelectionChange={(keys) => {
        setSelected(keys);
        onChange?.(keys);
      }}
      {...rest}
    />
  );
}

describe('band helpers', () => {
  it('a band at or above the top frequency is above the limit; one that starts below it is not', () => {
    expect(isBandAboveLimit({ lowHz: 8000 }, 8000)).toBe(true);
    expect(isBandAboveLimit({ lowHz: 9000 }, 8000)).toBe(true);
    expect(isBandAboveLimit({ lowHz: 7999 }, 8000)).toBe(false);
    expect(isBandAboveLimit({ lowHz: 0 }, 8000)).toBe(false);
  });

  it('writes the reason in kHz', () => {
    expect(bandLimitReason(8000)).toBe("Above this recording's 8 kHz limit.");
    expect(bandLimitReason(11025)).toBe("Above this recording's 11 kHz limit.");
    expect(bandLimitReason(22050)).toBe("Above this recording's 22.1 kHz limit.");
  });

  it('writes a range as "{low} to {high} kHz"', () => {
    expect(formatBandRange(0, 2700)).toBe('0 to 2.7 kHz');
    expect(formatBandRange(2700, 5300)).toBe('2.7 to 5.3 kHz');
    expect(formatBandRange(5333.33, 8000)).toBe('5.3 to 8 kHz');
  });
});

describe('BandToggle: anatomy', () => {
  it('is a group named "Frequency bands to play" with one pressed segment per selected band', () => {
    render(<Harness initial={['low', 'mid']} />);
    const group = screen.getByRole('toolbar', { name: 'Frequency bands to play' });
    const low = within(group).getByRole('button', { name: /^Low/ });
    const mid = within(group).getByRole('button', { name: /^Mid/ });
    const high = within(group).getByRole('button', { name: /^High/ });
    expect(low).toHaveAttribute('aria-pressed', 'true');
    expect(mid).toHaveAttribute('aria-pressed', 'true');
    expect(high).toHaveAttribute('aria-pressed', 'false');
  });

  it('each segment shows its label and its range', () => {
    render(<Harness />);
    expect(screen.getByText('0 to 2.7 kHz')).toBeInTheDocument();
    expect(screen.getByText('2.7 to 5.3 kHz')).toBeInTheDocument();
    expect(screen.getByText('8 to 12 kHz')).toBeInTheDocument();
  });

  it('prints the help text', () => {
    render(<Harness />);
    expect(screen.getByText('Playing the selected bands. At least one band stays on.')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Frequency bands to play' })).toHaveAttribute('aria-describedby');
  });
});

describe('BandToggle: selection', () => {
  it('pressing another band adds it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /^Mid/ }));
    expect([...(onChange.mock.calls.at(-1)?.[0] as Set<string>)].sort()).toEqual(['low', 'mid']);
    expect(screen.getByRole('button', { name: /^Mid/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('with one band selected, toggling it off keeps it on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={['low']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /^Low/ }));
    for (const [keys] of onChange.mock.calls) expect((keys as Set<string>).size).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Low/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('with two selected, one can be turned off and the other then stays on', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['low', 'mid']} />);
    await user.click(screen.getByRole('button', { name: /^Mid/ }));
    expect(screen.getByRole('button', { name: /^Mid/ })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: /^Low/ }));
    expect(screen.getByRole('button', { name: /^Low/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('BandToggle: a band above the recording limit', () => {
  it('is disabled, says why in its text and in a tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const high = screen.getByRole('button', { name: /^High/ });
    expect(high).toBeDisabled();
    expect(high).toHaveTextContent("Above this recording's 8 kHz limit.");
    await user.hover(high.parentElement as HTMLElement);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent("Above this recording's 8 kHz limit.");
  });

  it('is never reported as selected, even if the caller selected it', () => {
    render(<Harness initial={['low', 'high']} />);
    expect(screen.getByRole('button', { name: /^High/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('forceDisabled disables a band with the given reason (fixtures only)', () => {
    render(
      <Harness
        bands={BANDS.slice(0, 2)}
        forceDisabled={{ id: 'mid', reason: 'Disabled for review: no fixture band lies above this recording\'s 8 kHz limit.' }}
      />,
    );
    const mid = screen.getByRole('button', { name: /^Mid/ });
    expect(mid).toBeDisabled();
    expect(mid).toHaveTextContent('Disabled for review');
  });
});

describe('BandToggle: states', () => {
  it('loading shows three skeleton segments and the label', () => {
    const { container } = render(<Harness state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading bands…');
    expect(container.querySelectorAll('[aria-hidden="true"].h-11')).toHaveLength(3);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('empty is text only', () => {
    render(<Harness state="empty" />);
    expect(screen.getByText('No bands are defined for this recording.')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('no bands at all reads as empty', () => {
    render(<Harness bands={[]} />);
    expect(screen.getByText('No bands are defined for this recording.')).toBeInTheDocument();
  });

  it('error uses the Error primitive and says playback continues', () => {
    render(<Harness state="error" />);
    expect(screen.getByText('Band filter is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Playback continues without filtering.')).toBeInTheDocument();
  });
});

describe('BandToggle: forced state', () => {
  it('draws hover on one segment for review', () => {
    render(<Harness forced={{ id: 'mid', state: 'hover' }} />);
    expect(screen.getByRole('button', { name: /^Mid/ })).toHaveAttribute('data-force-hover');
    expect(screen.getByRole('button', { name: /^Low/ })).not.toHaveAttribute('data-force-hover');
  });
});
