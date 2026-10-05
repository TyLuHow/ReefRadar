/**
 * Crossfader (04-16, DS-05). The kit Slider named "Mix between A and B" with value words, arrows of
 * 5 and pages of 20. Controlled: the value is a position in [0, 1].
 */
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Crossfader } from '@/features/instrument';

function Harness({ initial = 0.5, onChange }: { initial?: number; onChange?: (value: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Crossfader
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const slider = () => screen.getByRole('slider', { name: 'Mix between A and B' });

describe('Crossfader', () => {
  it('is a slider named "Mix between A and B" at 50% A, 50% B by default', async () => {
    render(<Harness />);
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '50% A, 50% B'));
    expect(slider()).toHaveAttribute('min', '0');
    expect(slider()).toHaveAttribute('max', '100');
  });

  it('writes the value as words', async () => {
    render(<Harness initial={0.7} />);
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '30% A, 70% B'));
  });

  it('arrow keys step 5', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    slider().focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '45% A, 55% B'));
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '55% A, 45% B'));
    expect(onChange).toHaveBeenLastCalledWith(0.45);
  });

  it('PageUp and PageDown step 20 and stop at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    slider().focus();
    await user.keyboard('{PageUp}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '30% A, 70% B'));
    await user.keyboard('{PageDown}{PageDown}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '70% A, 30% B'));
    await user.keyboard('{PageDown}{PageDown}{PageDown}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '100% A, 0% B'));
    await user.keyboard('{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '0% A, 100% B'));
  });

  it('Home and End go to the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    slider().focus();
    await user.keyboard('{End}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '0% A, 100% B'));
    await user.keyboard('{Home}');
    await waitFor(() => expect(slider()).toHaveAttribute('aria-valuetext', '100% A, 0% B'));
  });

  it('a disabled crossfader does not move on the page keys', () => {
    const onChange = vi.fn();
    render(<Crossfader value={0.5} onChange={onChange} isDisabled />);
    expect(slider()).toBeDisabled();
    slider().dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the A and B letters are decorative', () => {
    const { container } = render(<Harness />);
    const letters = Array.from(container.querySelectorAll('[aria-hidden="true"]')).filter((el) => ['A', 'B'].includes(el.textContent ?? ''));
    expect(letters.map((el) => el.textContent)).toEqual(['A', 'B']);
  });
});
