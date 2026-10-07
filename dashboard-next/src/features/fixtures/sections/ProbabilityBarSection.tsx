'use client';

import { useModelVersion, useReferenceSites, type ContractSite, type ModelVersion } from '@/features/contract';
import { ProbabilityBar, type ProbabilityBarModelCard, type ProbabilityBarReference } from '@/features/instrument';
import { ErrorState, LoadingState, Skeleton } from '@/features/ui';
import { FIXTURE_ANALYSIS, STAMPED_TEST_ANALYSIS, type FixtureAnalysis } from '../data/analysis';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * ProbabilityBar (DS-05). The default cell is a real analysis: the live reading of the ind_H1 excerpt
 * (captured once, read-only; see data/analysis.ts) beside ind_H1's reference label, assigner and the
 * model card from the contract. The model's top class disagrees with the reference label there, and
 * the computed sentence says so. The agree cell uses the committed stamped test fixture against the
 * label of its closest real contract site, and says "Test fixture, not a real analysis." The abstain
 * cell is a forced state on the real ind_H1 probabilities: the interim model has no abstain threshold,
 * so no threshold sentence is shown and the cell says "State forced for review". The partial-classes
 * cell shows the reading alone with the model card's classes (Restored (mid) is a reference label, not
 * a model output, so it is never drawn). Loading, empty and error draw no analysis; the model card
 * handed to them is never rendered.
 */

export const PROBABILITY_BAR_META: FixtureSectionMeta = {
  slug: 'probability-bar',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'ProbabilityBar',
  contract:
    'The model\'s probabilities as returned, as integer percentages that sum to 100, beside the reference label with who assigned it, a computed sentence on whether they differ, and the model\'s stated limits. When the model withholds a reading the bar says "Can\'t tell" and draws neutral hatching with no class colour.',
  data: `${FIXTURE_ANALYSIS.file} (analysis ${FIXTURE_ANALYSIS.analysisId}, ${FIXTURE_ANALYSIS.note}); ${STAMPED_TEST_ANALYSIS.file} (${STAMPED_TEST_ANALYSIS.analysisId}); contract sites.json through useReferenceSites (${FIXTURE_ANALYSIS.siteId} and ${STAMPED_TEST_ANALYSIS.siteId} reference labels and assigners); model card through useModelVersion (classes, training, evaluation)`,
};

/** Handed to the states that draw no reading; never rendered there. */
const UNUSED_MODEL_CARD: ProbabilityBarModelCard = { rows: 0, sites: [], countries: [], evaluation: null };

function noop() {
  /* a review page has nothing to retry */
}

/** The class count as a word for small numbers, so the copy follows the model card instead of a typed "three". */
function countWord(count: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][count] ?? String(count);
}

function modelCardOf(model: ModelVersion): ProbabilityBarModelCard {
  return { rows: model.training.rows, sites: model.training.sites, countries: model.training.countries, evaluation: model.evaluation };
}

function referenceOf(sites: readonly ContractSite[], siteId: string): ProbabilityBarReference | undefined {
  const site = sites.find((candidate) => candidate.site_id === siteId);
  return site ? { status: site.status, assignedBy: site.label_assigned_by } : undefined;
}

function DataCells() {
  const sites = useReferenceSites();
  const model = useModelVersion();

  if (sites.data !== undefined && model.data !== undefined) {
    const card = modelCardOf(model.data);
    const classes = model.data.classes;
    const reference = (analysis: FixtureAnalysis) => referenceOf(sites.data ?? [], analysis.siteId);
    const stamped = STAMPED_TEST_ANALYSIS;
    const real = FIXTURE_ANALYSIS;

    return (
      <>
        <StateCell
          primitive="probability-bar"
          state="default"
          note={`Reading of analysis ${real.analysisId} against the reference label of ${real.siteId}.`}
        >
          <ProbabilityBar
            probabilities={real.probabilities}
            modelClasses={classes}
            reference={reference(real)}
            modelCard={card}
            note={real.note}
          />
        </StateCell>
        <StateCell
          primitive="probability-bar"
          state="agree"
          note={`The stamped test fixture's top class against the label of its closest reference site, ${stamped.siteId}.`}
        >
          <ProbabilityBar
            probabilities={stamped.probabilities}
            modelClasses={classes}
            reference={reference(stamped)}
            modelCard={card}
            note={stamped.note}
          />
        </StateCell>
        <StateCell
          primitive="probability-bar"
          state="abstain"
          forced
          note={`Real probabilities of analysis ${real.analysisId}. The interim model has no abstain threshold, so none is stated.`}
        >
          <ProbabilityBar
            probabilities={real.probabilities}
            modelClasses={classes}
            reference={reference(real)}
            modelCard={card}
            abstain={{}}
            note={real.note}
          />
        </StateCell>
        <StateCell
          primitive="probability-bar"
          state="partial-classes"
          note={`The reading alone. The model has ${countWord(classes.length)} classes; Restored (mid) is a reference label, not a model output, so it is not drawn.`}
        >
          <ProbabilityBar probabilities={real.probabilities} modelClasses={classes} modelCard={card} note={real.note} />
        </StateCell>
      </>
    );
  }

  const failed = sites.error ?? model.error;
  if (failed !== null && failed !== undefined) {
    return (
      <StateCell primitive="probability-bar" state="data-error">
        <ErrorState
          announce="status"
          title="The contract could not be loaded."
          body="Try again, or reload the page."
          onRetry={() => {
            void Promise.all([sites.refetch(), model.refetch()]);
          }}
        />
      </StateCell>
    );
  }

  return (
    <StateCell primitive="probability-bar" state="data-loading">
      <LoadingState label="Loading the contract…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function ProbabilityBarSection() {
  return (
    <FixtureSection {...PROBABILITY_BAR_META}>
      <DataCells />
      <StateCell primitive="probability-bar" state="loading" note="No analysis is drawn in this state.">
        <ProbabilityBar probabilities={{}} modelClasses={[]} modelCard={UNUSED_MODEL_CARD} state="loading" />
      </StateCell>
      <StateCell primitive="probability-bar" state="empty" note="No analysis is drawn in this state.">
        <ProbabilityBar probabilities={{}} modelClasses={[]} modelCard={UNUSED_MODEL_CARD} state="empty" />
      </StateCell>
      <StateCell primitive="probability-bar" state="error" note="No analysis is drawn in this state.">
        <ProbabilityBar probabilities={{}} modelClasses={[]} modelCard={UNUSED_MODEL_CARD} state="error" onRetry={noop} />
      </StateCell>
    </FixtureSection>
  );
}
