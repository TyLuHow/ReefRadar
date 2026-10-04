/**
 * Button and LinkButton (04-05, DS-04). Keyboard behaviour is exercised with user-event against the
 * real React Aria Components button; the class assertions pin the semantic-token utilities the
 * UI-SPEC "Button and LinkButton (base)" table names.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, LinkButton } from '@/features/ui';

describe('Button: keyboard and press', () => {
  it('Enter calls onPress once', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Space calls onPress once', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);
    await user.tab();
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a click calls onPress once', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Button: pending', () => {
  it('keeps the label, appends an ellipsis and sets aria-busy', () => {
    render(
      <Button isPending onPress={() => {}}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Save…');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('has no spinner or progress element', () => {
    render(<Button isPending>Save</Button>);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.querySelector('svg')).toBeNull();
  });

  it('does not call onPress on click or Enter', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Button isPending onPress={onPress}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    await user.click(button);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is not busy and has no ellipsis when not pending', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent(/^Save$/);
    expect(button).not.toHaveAttribute('aria-busy');
  });
});

describe('Button: disabled', () => {
  it('does not call onPress and carries data-disabled', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Button isDisabled onPress={onPress}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('data-disabled');
    expect(button).toBeDisabled();
  });
});

describe('Button: variants, tone and token classes', () => {
  it('primary (the default) carries bg-control and text-on-control', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-control', 'text-on-control');
  });

  it('secondary carries border-ink', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole('button')).toHaveClass('border', 'border-ink', 'text-ink');
  });

  it('quiet is an underlined accent text style with no fill', () => {
    render(<Button variant="quiet">Learn more</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('text-accent', 'underline');
    expect(button).not.toHaveClass('bg-control');
  });

  it('inverse carries bg-inverse and text-on-inverse', () => {
    render(<Button variant="inverse">Open</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-inverse', 'text-on-inverse');
  });

  it('icon is a 44 px square', () => {
    render(<Button variant="icon" aria-label="Close" />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('size-11');
  });

  it('every variant keeps the 44 px minimum on both axes', () => {
    for (const variant of ['primary', 'secondary', 'quiet', 'inverse'] as const) {
      const { unmount } = render(<Button variant={variant}>Label</Button>);
      expect(screen.getByRole('button')).toHaveClass('min-h-11', 'min-w-11');
      unmount();
    }
  });

  it('wraps long text instead of truncating and aligns it to the inline start', () => {
    render(<Button>{'A label long enough to need a second line on a narrow screen'}</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('whitespace-normal', 'text-start');
    expect(button.className).not.toMatch(/\btruncate\b|text-ellipsis|whitespace-nowrap/);
  });

  it.each([
    ['light', 'focus-state:focus-ring'],
    ['well', 'focus-state:focus-ring-well'],
    ['accent', 'focus-state:focus-ring-accent'],
  ] as const)('tone %s selects %s and never a box-shadow focus', (tone, focusClass) => {
    render(<Button tone={tone}>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass(focusClass);
    expect(button.className).not.toMatch(/\bshadow|\bring-/);
  });

  it('uses logical properties only: no left, right, ml, mr, pl, pr', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/(^|\s)(?:[\w:-]*:)?(?:ml|mr|pl|pr|left|right|text-left|text-right)(?:-|\s|$)/);
  });

  it('appends a consumer className and passes aria-label through', () => {
    render(
      <Button className="extra" aria-label="Save recording">
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save recording' });
    expect(button).toHaveClass('extra', 'bg-control');
  });

  it('the icon variant requires an aria-label at the type level', () => {
    // @ts-expect-error an icon button without an accessible name is a type error
    const missing = <Button variant="icon" />;
    expect(missing).toBeTruthy();
  });
});

describe('LinkButton', () => {
  it('renders an anchor with the given href', () => {
    render(<LinkButton href="/sites/">All sites</LinkButton>);
    const link = screen.getByRole('link', { name: 'All sites' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/sites/');
  });

  it('carries the same variant classes as Button', () => {
    render(
      <LinkButton href="/a/" variant="secondary">
        Go
      </LinkButton>,
    );
    expect(screen.getByRole('link')).toHaveClass('border-ink', 'min-h-11');
  });

  it('calls onPress on Enter', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <LinkButton href="#here" onPress={onPress}>
        Go
      </LinkButton>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
