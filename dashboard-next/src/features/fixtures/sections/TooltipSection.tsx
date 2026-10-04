'use client';

import { Button, Tooltip, TooltipSurface } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Tooltip (DS-04): the live tooltip on a focusable trigger, and the two open states drawn through
 * TooltipSurface beside a trigger forced into hover or focus. A tooltip only repeats information
 * that is also on the page, so the trigger label here carries the full meaning on its own.
 */

export const TOOLTIP_META: FixtureSectionMeta = {
  slug: 'tooltip',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Tooltip',
  contract:
    'Opens after 300 ms of hover or at once on keyboard focus; closes on blur, pointer leave and Escape. It only repeats or supplements what the page already says, because touch devices never show one. No arrow.',
  data: 'No data: the trigger and tooltip text are static strings written for this review',
};

const TOOLTIP_TEXT = 'Assigned by the dataset authors, not by the model.';

export function TooltipSection() {
  return (
    <FixtureSection {...TOOLTIP_META}>
      <StateCell primitive="tooltip" state="closed" note="A live trigger: hover it, or press Tab to focus it.">
        <Tooltip content={TOOLTIP_TEXT}>
          <Button variant="secondary" data-testid="tooltip-live-trigger">
            Reference label
          </Button>
        </Tooltip>
      </StateCell>
      <StateCell primitive="tooltip" state="open-on-hover" forced note="Drawn with TooltipSurface beside a trigger in its hover state.">
        <div className="flex flex-col items-start gap-2">
          <TooltipSurface>{TOOLTIP_TEXT}</TooltipSurface>
          <Button variant="secondary" data-force-hover="">
            Reference label
          </Button>
        </div>
      </StateCell>
      <StateCell primitive="tooltip" state="open-on-focus" forced note="Drawn with TooltipSurface beside a trigger in its focus state.">
        <div className="flex flex-col items-start gap-2">
          <TooltipSurface>{TOOLTIP_TEXT}</TooltipSurface>
          <Button variant="secondary" data-force-focus="">
            Reference label
          </Button>
        </div>
      </StateCell>
    </FixtureSection>
  );
}
