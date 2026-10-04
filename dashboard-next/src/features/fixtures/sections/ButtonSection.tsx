'use client';

import { Button, LinkButton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Button and LinkButton (DS-04): every variant and state in UI-SPEC "Button and LinkButton (base)".
 * Hover, focus and pressed are applied through the data-force-* attributes the state variants in
 * tokens.css answer to, so a reviewer sees them without holding a pointer; the cell says so. The
 * labels are the actions the product ships ("Retry", "Close", "Place a recording").
 */

export const BUTTON_META: FixtureSectionMeta = {
  slug: 'button',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Button',
  contract:
    'A press target with a 44 px floor. Primary, secondary, quiet, inverse and icon-only variants; hover, focus, pressed, disabled and pending states; a link that looks like a button is still an anchor. A long label wraps, it never truncates.',
  data: 'No data: labels are the actions listed in UI-SPEC "Copywriting Contract"; states are forced with data-force-hover, data-force-focus and data-force-pressed',
};

function CloseGlyph() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

export function ButtonSection() {
  return (
    <FixtureSection {...BUTTON_META}>
      <StateCell primitive="button" state="default">
        <Button>Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="hover" forced>
        <Button data-force-hover="">Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="focus" forced>
        <Button data-force-focus="">Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="pressed" forced>
        <Button data-force-pressed="">Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="disabled" forced>
        <Button isDisabled>Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="pending" note="The label stays, an ellipsis follows it, aria-busy is set and presses are ignored. No spinner.">
        <Button isPending>Retry</Button>
      </StateCell>
      <StateCell primitive="button" state="long-label" note="The label wraps onto a second line inside a narrow box.">
        <Button className="max-w-40">Open site and sources</Button>
      </StateCell>
      <StateCell primitive="button" state="icon-only" note="44 by 44, accessible name from aria-label.">
        <Button variant="icon" aria-label="Close">
          <CloseGlyph />
        </Button>
      </StateCell>
      <StateCell primitive="button" state="inverse" note="On an accent-block surface, with the accent focus ring.">
        <div className="bg-accent-block p-6">
          <Button variant="inverse" tone="accent">
            Place a recording
          </Button>
        </div>
      </StateCell>
      <StateCell primitive="button" state="secondary">
        <Button variant="secondary">Clear filters</Button>
      </StateCell>
      <StateCell primitive="button" state="quiet">
        <Button variant="quiet">Methods and limits</Button>
      </StateCell>
      <StateCell primitive="button" state="link-button" note="An anchor in the DOM, drawn as a button.">
        <LinkButton href="#button" variant="secondary">
          Methods and limits
        </LinkButton>
      </StateCell>
    </FixtureSection>
  );
}
