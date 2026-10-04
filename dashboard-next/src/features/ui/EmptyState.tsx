import clsx from 'clsx';
import { Button, LinkButton } from './Button';

/**
 * EmptyState (DS-05, UI-SPEC "Empty, Error, Loading (state primitives)").
 *
 * Copy pattern: "{What is missing}. {What to do next}." in sentence case, no exclamation marks, no
 * icon. `block` is a dashed strong-rule box; `inline` is a rule above and no box, for use inside
 * panels. The optional action is a secondary button (or a link that looks like one).
 */

export type EmptyStateAction = { label: string; onPress: () => void } | { label: string; href: string };

export interface EmptyStateProps {
  variant?: 'block' | 'inline';
  /** What is missing, as a sentence ("No recordings match these filters."). */
  title: string;
  /** What to do next ("Clear a filter to see more."). */
  body: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ variant = 'block', title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'text-start',
        variant === 'block' ? 'border border-dashed border-rule-strong p-6' : 'border-t border-rule pt-4',
        className,
      )}
    >
      <p className="text-body font-semibold text-ink">{title}</p>
      <p className="text-body text-muted">{body}</p>
      {action ? (
        <div className="mt-4">
          {'href' in action ? (
            <LinkButton variant="secondary" href={action.href}>
              {action.label}
            </LinkButton>
          ) : (
            <Button variant="secondary" onPress={action.onPress}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
