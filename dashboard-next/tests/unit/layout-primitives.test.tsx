/**
 * Layout primitives (04-08, DS-05 / UI-SPEC A15): RLabel, Stat, AccentBlock, BandSection and the
 * instrument barrel. The accent block is the one place the direction's `--max-blocks` token is read
 * at runtime, so the count check is exercised against a surface that sets it inline.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccentBlock, BandSection, RLabel, Stat } from '@/features/instrument';
import * as instrument from '@/features/instrument';
import { Button } from '@/features/ui';

describe('RLabel', () => {
  it("kind 'reference' is a solid ink rule with the eyebrow REFERENCE LABEL", () => {
    const { container } = render(<RLabel kind="reference">Degraded reef</RLabel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-solid');
    expect(root.className).toContain('border-s');
    expect(root.className).toContain('border-ink');
    expect(screen.getByText('REFERENCE LABEL')).toBeInTheDocument();
    expect(screen.getByText('Degraded reef')).toBeInTheDocument();
    expect(screen.queryByText('MODEL READING')).toBeNull();
  });

  it("kind 'model' is a dashed ink rule with the eyebrow MODEL READING", () => {
    const { container } = render(<RLabel kind="model">healthy</RLabel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-dashed');
    expect(root.className).toContain('border-ink');
    expect(screen.getByText('MODEL READING')).toBeInTheDocument();
    expect(screen.queryByText('REFERENCE LABEL')).toBeNull();
  });

  it('tells the two apart by rule style and words, with the same colour', () => {
    const a = render(<RLabel kind="reference">x</RLabel>).container.firstElementChild as HTMLElement;
    const b = render(<RLabel kind="model">x</RLabel>).container.firstElementChild as HTMLElement;
    const colour = (n: HTMLElement) => n.className.split(/\s+/).filter((c) => c.startsWith('border-ink'));
    expect(colour(a)).toEqual(colour(b));
    expect(a.className).not.toContain('border-dashed');
    expect(b.className).not.toContain('border-solid');
  });
});

describe('Stat', () => {
  it('renders the value in the numeral face and size with the label beside it', () => {
    render(<Stat value={54} label="sites" />);
    const value = screen.getByText('54');
    expect(value.className).toContain('font-numeral');
    expect(value.className).toContain('text-numeral');
    expect(value.className).toContain('tabular');
    const label = screen.getByText('sites');
    expect(label.className).toContain('text-body');
    expect(label.className).toContain('max-w-[12ch]');
  });

  it('formats a number with grouping by default', () => {
    render(<Stat value={12345} label="windows" />);
    expect(screen.getByText('12,345')).toBeInTheDocument();
  });

  it('takes a custom formatter', () => {
    render(<Stat value={0.5} label="share" format={(n) => `${Math.round(n * 100)}%`} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows a dash, not an invented value, when the number is not finite', () => {
    render(<Stat value={Number.NaN} label="sites" />);
    expect(screen.queryByText('NaN')).toBeNull();
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('is typed to take a number, never a preformatted string', () => {
    // @ts-expect-error a string value is a type error: the value must be computed from data
    render(<Stat value="54" label="sites" />);
  });
});

describe('AccentBlock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders the accent surface with the lead, one sentence and the action', () => {
    const { container } = render(
      <AccentBlock lead="Have a recording of your own?" sentence="Place it among the references." action={<Button variant="inverse" tone="accent">Place a recording</Button>} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-accent-block');
    expect(root.className).toContain('bg-accent-block');
    expect(root.className).toContain('text-on-accent-block');
    expect(root.className).toContain('p-8');
    const lead = screen.getByText('Have a recording of your own?');
    expect(lead.className).toContain('type-display');
    expect(lead.className).toContain('text-h2');
    expect(screen.getByText('Place it among the references.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place a recording' })).toBeInTheDocument();
  });

  function surface(max: number | null, count: number) {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    return {
      errors,
      ui: (
        <div data-screen="probe" style={max === null ? undefined : ({ '--max-blocks': String(max) } as React.CSSProperties)}>
          {Array.from({ length: count }, (_, i) => (
            <AccentBlock key={i} lead={`Lead ${i}`} sentence="One sentence." action={<span>go</span>} />
          ))}
        </div>
      ),
    };
  }

  it('is silent when the screen holds no more blocks than --max-blocks allows', () => {
    const { errors, ui } = surface(1, 1);
    render(ui);
    expect(errors).not.toHaveBeenCalled();
  });

  it('logs once, with the count, when the screen holds more blocks than --max-blocks allows', () => {
    const { errors, ui } = surface(1, 2);
    render(ui);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]?.[0])).toContain('2');
  });

  it('allows as many blocks as the direction does (three here)', () => {
    const ok = surface(3, 3);
    render(ok.ui);
    expect(ok.errors).not.toHaveBeenCalled();
    const over = surface(3, 4);
    render(over.ui);
    expect(over.errors).toHaveBeenCalledTimes(1);
  });

  it('falls back to the instrument surface root when there is no [data-screen]', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div data-surface="instrument" style={{ '--max-blocks': '1' } as React.CSSProperties}>
        <AccentBlock lead="A" sentence="s" action={<span>go</span>} />
        <AccentBlock lead="B" sentence="s" action={<span>go</span>} />
      </div>,
    );
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no surface to measure against, or no --max-blocks token', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <AccentBlock lead="A" sentence="s" action={<span>go</span>} />
        <AccentBlock lead="B" sentence="s" action={<span>go</span>} />
      </div>,
    );
    const noToken = surface(null, 2);
    render(noToken.ui);
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not check in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { errors, ui } = surface(1, 2);
    render(ui);
    expect(errors).not.toHaveBeenCalled();
  });

  it('checks in a production build that sets the fixtures flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_DEV_FIXTURES', '1');
    const { errors, ui } = surface(1, 2);
    render(ui);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe('BandSection', () => {
  it('renders a full-bleed band with on-band text', () => {
    const { container } = render(<BandSection>body</BandSection>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe('SECTION');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('bg-band');
    expect(root.className).toContain('text-on-band');
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders an optional eyebrow and a display-xl headline', () => {
    render(<BandSection eyebrow="A real recording" headline="Listen first" />);
    expect(screen.getByText('A real recording').className).toContain('type-eyebrow');
    expect(screen.getByText('A real recording').className).toContain('text-on-band-muted');
    const headline = screen.getByRole('heading', { name: 'Listen first' });
    expect(headline.className).toContain('type-display');
    expect(headline.className).toContain('text-display-xl');
  });

  it('omits the eyebrow and headline when not given, and can render as another element', () => {
    const { container } = render(<BandSection as="div">only children</BandSection>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe('DIV');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.type-eyebrow')).toBeNull();
  });
});

describe('instrument barrel', () => {
  it('exports the four layout primitives and re-exports the dsp barrel', () => {
    expect(instrument.RLabel).toBeTypeOf('function');
    expect(instrument.Stat).toBeTypeOf('function');
    expect(instrument.AccentBlock).toBeTypeOf('function');
    expect(instrument.BandSection).toBeTypeOf('function');
    expect(instrument.computeSpectrogram).toBeTypeOf('function');
    expect(instrument.parseWavPcm16).toBeTypeOf('function');
    expect(instrument.SPECTROGRAM_SPEC).toBeDefined();
  });
});
