'use client';

import { EmptyState, ErrorState, LONG_WAIT_MS, LoadingState, Skeleton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Empty, Error and Loading (DS-05): the three state primitives, with the copy written to the
 * UI-SPEC pattern "{what is missing or failed}. {what to do next}." Errors are marked by words, the
 * bar and the eyebrow, never an icon or red. The error cells carry no request id: no committed
 * fixture under tests/fixtures/api holds a real one, so showing one would invent it (the unit test
 * in state-primitives.test.tsx covers the request-id path). The Retry and Clear filters actions do
 * nothing here, because there is nothing to retry or clear on a review page.
 */

export const STATES_META: FixtureSectionMeta = {
  slug: 'states',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'Empty, Error, Loading',
  contract:
    'An empty state says what is missing and what to do next. An error says what failed and what to do next, with no icon and no red. A loading state is skeleton blocks with a visible label, and after 8 s it says the wait is longer than usual.',
  data: 'No data: copy is from UI-SPEC "Copywriting Contract"; no request-id cell, because no file in tests/fixtures/api contains a request id',
};

function noop() {
  /* a review page has nothing to retry or clear */
}

function RecordingSkeleton() {
  return (
    <>
      <Skeleton on="panel" className="h-24 w-full" />
      <Skeleton on="panel" className="h-4 w-2/3" />
    </>
  );
}

export function StatesSection() {
  return (
    <FixtureSection {...STATES_META}>
      <StateCell primitive="states" state="empty-block">
        <EmptyState title="No rows match." body="Clear the filters to see all rows." action={{ label: 'Clear filters', onPress: noop }} />
      </StateCell>
      <StateCell primitive="states" state="empty-inline" note="Used inside a panel: a rule above, no box.">
        <EmptyState variant="inline" title="No rows match." body="Clear the filters to see all rows." action={{ label: 'Clear filters', onPress: noop }} />
      </StateCell>
      <StateCell primitive="states" state="error-on-load" note="Replaces content on load, so it is a status region.">
        <ErrorState announce="status" title="The table could not be loaded." body="Reload the page to try again." onRetry={noop} />
      </StateCell>
      <StateCell
        primitive="states"
        state="error-after-action"
        note="Appears after a user action, so it is an alert region. In use, focus moves to its heading; it is not moved here so this page keeps its own focus."
      >
        <ErrorState
          announce="alert"
          title="Audio could not be loaded."
          body="Check your connection, then try again."
          onRetry={noop}
          link={{ label: 'Methods and limits', href: '#states' }}
        />
      </StateCell>
      <StateCell
        primitive="states"
        state="loading"
        note="After 8 s this label changes to the long-wait wording, as it does in use."
      >
        <LoadingState label="Loading recording…">
          <RecordingSkeleton />
        </LoadingState>
      </StateCell>
      <StateCell primitive="states" state="loading-long-wait" forced note={`Long wait shown through elapsedMs=${LONG_WAIT_MS} instead of waiting.`}>
        <LoadingState label="Loading recording…" elapsedMs={LONG_WAIT_MS}>
          <RecordingSkeleton />
        </LoadingState>
      </StateCell>
    </FixtureSection>
  );
}
