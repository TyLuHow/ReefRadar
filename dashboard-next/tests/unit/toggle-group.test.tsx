/**
 * ToggleGroup, ToggleGroupItem and ToggleButton (04-05, DS-04).
 *
 * ARIA pattern React Aria Components emits (recorded here and asserted below):
 * - selectionMode "single": the group is role="radiogroup", each segment is role="radio" with
 *   aria-checked (aria-pressed is removed).
 * - selectionMode "multiple": the group is role="toolbar", each segment is a button with aria-pressed.
 * - The group is one Tab stop; the arrow keys move focus between segments; Space toggles.
 */
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToggleButton, ToggleGroup, ToggleGroupItem } from '@/features/ui';

function ThreeSegments(props: Partial<React.ComponentProps<typeof ToggleGroup>>) {
  return (
    <>
      <button type="button">before</button>
      <ToggleGroup aria-label="Direction" selectionMode="single" {...props}>
        <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
        <ToggleGroupItem id="nocturne">Nocturne</ToggleGroupItem>
        <ToggleGroupItem id="poster">Poster</ToggleGroupItem>
      </ToggleGroup>
      <button type="button">after</button>
    </>
  );
}

describe('ToggleGroup: ARIA pattern', () => {
  it('single selection is a radiogroup of radios with aria-checked', () => {
    render(<ThreeSegments defaultSelectedKeys={['nocturne']} />);
    expect(screen.getByRole('radiogroup', { name: 'Direction' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios[0]).not.toHaveAttribute('aria-pressed');
  });

  it('multiple selection is a toolbar of buttons with aria-pressed', () => {
    render(<ThreeSegments selectionMode="multiple" defaultSelectedKeys={['atlas', 'poster']} />);
    expect(screen.getByRole('toolbar', { name: 'Direction' })).toBeInTheDocument();
    const buttons = ['Atlas', 'Nocturne', 'Poster'].map((name) => screen.getByRole('button', { name }));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    for (const b of buttons) expect(b).not.toHaveAttribute('aria-checked');
  });
});

describe('ToggleGroup: keyboard', () => {
  it('Tab enters the group once, the arrow keys move between segments and Tab leaves it', async () => {
    const user = userEvent.setup();
    render(<ThreeSegments />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();
    await user.tab();
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radios[1]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radios[2]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(radios[1]).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('Space toggles the focused segment', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<ThreeSegments onSelectionChange={onSelectionChange} />);
    await user.tab();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');
    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect([...(onSelectionChange.mock.calls[0]![0] as Set<string>)]).toEqual(['nocturne']);
  });

  it('single selection moves the selection to the newly pressed segment', async () => {
    const user = userEvent.setup();
    render(<ThreeSegments defaultSelectedKeys={['atlas']} />);
    await user.click(screen.getByRole('radio', { name: 'Poster' }));
    expect(screen.getByRole('radio', { name: 'Poster' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Atlas' })).toHaveAttribute('aria-checked', 'false');
  });

  it('works controlled', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [keys, setKeys] = useState<Set<string>>(new Set(['atlas']));
      return (
        <ToggleGroup
          aria-label="Direction"
          selectionMode="single"
          selectedKeys={keys}
          onSelectionChange={(next) => setKeys(new Set([...next].map(String)))}
        >
          <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
          <ToggleGroupItem id="poster">Poster</ToggleGroupItem>
        </ToggleGroup>
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole('radio', { name: 'Poster' }));
    expect(screen.getByRole('radio', { name: 'Poster' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ToggleGroup: disallowEmptySelection', () => {
  it('multiple selection keeps the last selected segment on when it is toggled', async () => {
    const user = userEvent.setup();
    render(<ThreeSegments selectionMode="multiple" disallowEmptySelection defaultSelectedKeys={['atlas']} />);
    const atlas = screen.getByRole('button', { name: 'Atlas' });
    await user.click(atlas);
    expect(atlas).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' ');
    expect(atlas).toHaveAttribute('aria-pressed', 'true');
  });

  it('multiple selection toggles a segment off while another stays on', async () => {
    const user = userEvent.setup();
    render(<ThreeSegments selectionMode="multiple" disallowEmptySelection defaultSelectedKeys={['atlas', 'poster']} />);
    await user.click(screen.getByRole('button', { name: 'Atlas' }));
    expect(screen.getByRole('button', { name: 'Atlas' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Poster' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ToggleGroup: token classes', () => {
  it('light tone: selected carries bg-control and text-on-control, unselected has the ink outline', () => {
    render(<ThreeSegments defaultSelectedKeys={['atlas']} />);
    const [atlas, nocturne] = screen.getAllByRole('radio');
    expect(atlas).toHaveClass('data-selected:bg-control', 'data-selected:text-on-control');
    expect(atlas).toHaveAttribute('data-selected');
    expect(nocturne).toHaveClass('border', 'border-ink', 'text-ink', 'bg-transparent');
    expect(nocturne).not.toHaveAttribute('data-selected');
  });

  it('well tone: selected uses bg-well-ink and text-well, unselected uses border-well-rule', () => {
    render(<ThreeSegments tone="well" defaultSelectedKeys={['atlas']} />);
    const [atlas, nocturne] = screen.getAllByRole('radio');
    expect(atlas).toHaveClass('data-selected:bg-well-ink', 'data-selected:text-well');
    expect(nocturne).toHaveClass('border-well-rule', 'text-well-ink');
    expect(nocturne).not.toHaveClass('border-ink');
    expect(atlas).not.toHaveClass('data-selected:bg-control');
  });

  it('segments keep 44 px, wrap, share edges and use logical properties and an outline focus', () => {
    render(<ThreeSegments />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('min-h-11', 'whitespace-normal', '-ms-px', 'first:ms-0', 'first:rounded-s-control', 'last:rounded-e-control');
      expect(radio).toHaveClass('focus-state:focus-ring-inset');
      expect(radio.className).not.toMatch(/(^|\s)(?:[\w-]+:)*(?:shadow|ring|ml|mr|pl|pr)(?:-|\s|$)/);
    }
  });

  it('well tone uses the well focus ring', () => {
    render(<ThreeSegments tone="well" />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveClass('focus-state:focus-ring-well');
  });

  it('a disabled segment is skipped for presses and carries data-disabled', async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup aria-label="Direction" selectionMode="single">
        <ToggleGroupItem id="atlas">Atlas</ToggleGroupItem>
        <ToggleGroupItem id="poster" isDisabled>
          Poster
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const poster = screen.getByRole('radio', { name: 'Poster' });
    expect(poster).toHaveAttribute('data-disabled');
    await user.click(poster);
    expect(poster).toHaveAttribute('aria-checked', 'false');
  });
});

describe('ToggleGroup: invalid state', () => {
  it('isInvalid sets aria-invalid on the group and renders the helper text', () => {
    render(<ThreeSegments isInvalid helperText="Choose a direction." />);
    const group = screen.getByRole('radiogroup', { name: 'Direction' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    const helper = screen.getByText('Choose a direction.');
    expect(helper).toBeInTheDocument();
    expect(group.getAttribute('aria-describedby')).toBe(helper.id);
  });

  it('is not invalid by default', () => {
    render(<ThreeSegments helperText="Pick one." />);
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-invalid');
  });
});

describe('ToggleButton', () => {
  it('toggles aria-pressed on Space', async () => {
    const user = userEvent.setup();
    render(<ToggleButton>Reduced motion</ToggleButton>);
    const button = screen.getByRole('button', { name: 'Reduced motion' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.tab();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles aria-pressed on click and reports the change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleButton onChange={onChange}>Reduced motion</ToggleButton>);
    const button = screen.getByRole('button');
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is a 44 px secondary-style control with the selected treatment', () => {
    render(<ToggleButton defaultSelected>Reduced motion</ToggleButton>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-h-11', 'border', 'border-ink', 'data-selected:bg-control', 'data-selected:text-on-control', 'focus-state:focus-ring');
    expect(button).toHaveAttribute('data-selected');
  });

  it('well tone uses the well tokens', () => {
    render(<ToggleButton tone="well">Reduced motion</ToggleButton>);
    expect(screen.getByRole('button')).toHaveClass('border-well-rule', 'text-well-ink', 'data-selected:bg-well-ink', 'focus-state:focus-ring-well');
  });
});
