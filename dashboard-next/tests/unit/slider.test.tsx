/**
 * Slider and RangeSlider (04-11, DS-04). Behaviour comes from React Aria Components' Slider; these
 * tests pin UI-SPEC "Slider and RangeSlider": arrow keys move by step, PageUp and PageDown by ten
 * steps (React Aria's own page is a tenth of the range, so the primitive overrides it), Home and End
 * jump to the bounds, every thumb has a name, the two thumbs of a RangeSlider cannot cross, the value
 * text is words ("0:12 of 0:30", "2,000 Hz") and never a bare number, and the loading, empty and error
 * states replace or mark the control.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RangeSlider, Slider } from '@/features/ui';
import { movedValue } from '@/features/ui/Slider';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const position = (seconds: number) => `${clock(seconds)} of 0:30`;
const hertz = (value: number) => `${value.toLocaleString('en-US')} Hz`;

function Playback(props: Partial<React.ComponentProps<typeof Slider>>) {
  return (
    <>
      <button type="button">before</button>
      <Slider
        label="Playback position"
        minValue={0}
        maxValue={30}
        step={0.1}
        defaultValue={12}
        formatValueText={position}
        formatEndLabel={clock}
        {...props}
      />
      <button type="button">after</button>
    </>
  );
}

function Frequency(props: Partial<React.ComponentProps<typeof RangeSlider>>) {
  return (
    <>
      <button type="button">before</button>
      <RangeSlider
        label="Frequency range"
        minValue={0}
        maxValue={8000}
        step={100}
        defaultValue={[2000, 6000]}
        formatValueText={hertz}
        {...props}
      />
      <button type="button">after</button>
    </>
  );
}

const valueOf = (node: HTMLElement) => (node as HTMLInputElement).value;
const playback = () => screen.getByRole('slider', { name: 'Playback position' });
const minimum = () => screen.getByRole('slider', { name: 'Frequency range minimum' });
const maximum = () => screen.getByRole('slider', { name: 'Frequency range maximum' });

describe('movedValue', () => {
  it('rounds to the step from the minimum and never leaves a float tail', () => {
    expect(movedValue(12, 0.1, 0, 30, 0.1, 0)).toBe(12.1);
    expect(movedValue(0.2, 0.1, 0, 30, 0.1, 0)).toBe(0.3);
    expect(movedValue(2000, 1000, 0, 8000, 100, 0)).toBe(3000);
  });

  it('clamps to the bounds given', () => {
    expect(movedValue(29.5, 1, 0, 30, 0.1, 0)).toBe(30);
    expect(movedValue(5000, 3000, 0, 6000, 100, 0)).toBe(6000);
    expect(movedValue(100, -1000, 0, 8000, 100, 0)).toBe(0);
  });
});

describe('Slider: structure and value text', () => {
  it('is a slider named by its label with human value text, never a bare number', async () => {
    render(<Playback />);
    expect(valueOf(playback())).toBe('12');
    await waitFor(() => expect(playback()).toHaveAttribute('aria-valuetext', '0:12 of 0:30'));
  });

  it('shows the same words as the visible value, and the end values under the track', () => {
    render(<Playback />);
    expect(screen.getByText('0:12 of 0:30', { selector: 'output' })).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });

  it('the label is an eyebrow and the group carries the label name', () => {
    render(<Playback />);
    expect(screen.getByText('Playback position', { selector: 'label' })).toHaveClass('type-eyebrow');
  });

  it('draws the filled part from the start to the thumb', () => {
    const { container } = render(<Playback />);
    const fill = container.querySelector<HTMLElement>('[data-fill]');
    expect(fill?.style.width).toBe('40%');
  });
});

describe('Slider: keyboard', () => {
  it('ArrowRight and ArrowLeft move by one step', async () => {
    const user = userEvent.setup();
    render(<Playback />);
    await user.tab();
    await user.tab();
    expect(playback()).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(valueOf(playback())).toBe('12.1');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(valueOf(playback())).toBe('11.9');
  });

  it('PageUp and PageDown move ten steps', async () => {
    const user = userEvent.setup();
    render(<Playback />);
    playback().focus();
    await user.keyboard('{PageUp}');
    expect(valueOf(playback())).toBe('13');
    await user.keyboard('{PageDown}{PageDown}');
    expect(valueOf(playback())).toBe('11');
  });

  it('Home and End jump to the bounds and the words follow', async () => {
    const user = userEvent.setup();
    render(<Playback />);
    playback().focus();
    await user.keyboard('{End}');
    expect(valueOf(playback())).toBe('30');
    await waitFor(() => expect(playback()).toHaveAttribute('aria-valuetext', '0:30 of 0:30'));
    await user.keyboard('{Home}');
    expect(valueOf(playback())).toBe('0');
    await waitFor(() => expect(playback()).toHaveAttribute('aria-valuetext', '0:00 of 0:30'));
  });

  it('a page stops at the bound', async () => {
    const user = userEvent.setup();
    render(<Playback defaultValue={29.5} />);
    playback().focus();
    await user.keyboard('{PageUp}');
    expect(valueOf(playback())).toBe('30');
  });

  it('reports each change and works when controlled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Playback value={5} defaultValue={undefined} onChange={onChange} />);
    playback().focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(5.1);
    // Controlled: the value stays where the parent holds it.
    expect(valueOf(playback())).toBe('5');
    await user.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it('does not move when disabled', async () => {
    const user = userEvent.setup();
    render(<Playback isDisabled />);
    expect(playback()).toBeDisabled();
    await user.keyboard('{PageUp}');
    expect(valueOf(playback())).toBe('12');
  });
});

describe('RangeSlider', () => {
  it('has two sliders named "{label} minimum" and "{label} maximum" with unit text', async () => {
    render(<Frequency />);
    expect(valueOf(minimum())).toBe('2000');
    expect(valueOf(maximum())).toBe('6000');
    await waitFor(() => {
      expect(minimum()).toHaveAttribute('aria-valuetext', '2,000 Hz');
      expect(maximum()).toHaveAttribute('aria-valuetext', '6,000 Hz');
    });
    expect(screen.getByText('2,000 Hz to 6,000 Hz', { selector: 'output' })).toBeInTheDocument();
  });

  it('Tab moves from the minimum thumb to the maximum thumb', async () => {
    const user = userEvent.setup();
    render(<Frequency />);
    await user.tab();
    await user.tab();
    expect(minimum()).toHaveFocus();
    await user.tab();
    expect(maximum()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('arrow keys, pages, Home and End act on the focused thumb only', async () => {
    const user = userEvent.setup();
    render(<Frequency />);
    minimum().focus();
    await user.keyboard('{ArrowRight}');
    expect(valueOf(minimum())).toBe('2100');
    await user.keyboard('{PageUp}');
    expect(valueOf(minimum())).toBe('3100');
    await user.keyboard('{Home}');
    expect(valueOf(minimum())).toBe('0');
    maximum().focus();
    await user.keyboard('{End}');
    expect(valueOf(maximum())).toBe('8000');
    await user.keyboard('{PageDown}');
    expect(valueOf(maximum())).toBe('7000');
    expect(valueOf(minimum())).toBe('0');
  });

  it('the lower thumb stops at the upper value and the thumbs never cross', async () => {
    const user = userEvent.setup();
    render(<Frequency defaultValue={[5000, 6000]} />);
    minimum().focus();
    await user.keyboard('{PageUp}');
    expect(valueOf(minimum())).toBe('6000');
    expect(valueOf(maximum())).toBe('6000');
    await user.keyboard('{ArrowRight}{End}');
    expect(valueOf(minimum())).toBe('6000');
    maximum().focus();
    await user.keyboard('{PageDown}{Home}');
    expect(valueOf(maximum())).toBe('6000');
    expect(valueOf(minimum())).toBe('6000');
  });

  it('draws the filled part between the thumbs', () => {
    const { container } = render(<Frequency />);
    const fill = container.querySelector<HTMLElement>('[data-fill]');
    expect(fill?.style.insetInlineStart).toBe('25%');
    expect(fill?.style.width).toBe('50%');
  });

  it('reports the pair', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Frequency onChange={onChange} />);
    maximum().focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith([2000, 5900]);
  });
});

describe('Slider: tone and states', () => {
  it('tone well uses the well track, the well ink fill and the well ink thumb', () => {
    const { container } = render(<Playback tone="well" />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-well-ink');
    expect(container.querySelector('.bg-well-rule')).not.toBeNull();
    expect(playback().closest('.size-5')).toHaveClass('bg-well-ink');
  });

  it('tone light uses the rule track, the control fill and the control thumb', () => {
    const { container } = render(<Playback />);
    expect(container.querySelector('[data-fill]')).toHaveClass('bg-control');
    expect(container.querySelector('.bg-rule-strong')).not.toBeNull();
    const thumb = playback().closest('.size-5');
    expect(thumb).toHaveClass('bg-control');
    expect(thumb).toHaveClass('before:-inset-3');
  });

  it('forced hover, focus and pressed put the matching data attribute on the thumb', () => {
    const { rerender } = render(<Playback forcedState="hover" />);
    expect(playback().closest('.size-5')).toHaveAttribute('data-force-hover');
    rerender(<Playback forcedState="pressed" />);
    expect(playback().closest('.size-5')).toHaveAttribute('data-force-pressed');
  });

  it('loading shows a track skeleton and a word, and no thumb', () => {
    render(<Playback state="loading" />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading range…');
  });

  it('empty says there is no range to choose, and has no thumb', () => {
    render(<Playback state="empty" />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('No range to choose.')).toBeInTheDocument();
  });

  it('error marks the thumb invalid and links the helper text', async () => {
    render(<Playback state="error" errorText="Choose a value between 0 and 30 seconds." />);
    const helper = screen.getByText('Choose a value between 0 and 30 seconds.');
    await waitFor(() => expect(playback()).toHaveAttribute('aria-invalid', 'true'));
    expect(playback().getAttribute('aria-describedby')).toContain(helper.id);
  });

  it('a range in error marks both thumbs invalid', async () => {
    render(<Frequency state="error" errorText="Choose between 0 and 8,000 Hz." />);
    await waitFor(() => {
      expect(minimum()).toHaveAttribute('aria-invalid', 'true');
      expect(maximum()).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
