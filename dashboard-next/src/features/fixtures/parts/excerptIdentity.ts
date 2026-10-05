import type { CompareRowIdentity } from '@/features/instrument';
import { HABITAT_STATUSES, type HabitatStatus } from '@/features/ui';
import type { AudioExcerpt } from '@/lib/audio-manifest';

/**
 * Turns a committed manifest excerpt into what CompareRow and ClipCard show about it (04-16). Every
 * field is the manifest's own: the dataset's label text, definition and assigner, the recorder-clock
 * time and the RMS level. A status that is not one of the five habitat statuses becomes `unknown`
 * (the mark's hollow ring), never a guess. Shared by the compare and clip-card fixtures sections and
 * their tests so none of them types a label or a level by hand.
 */

export function excerptStatus(excerpt: AudioExcerpt): HabitatStatus {
  const status = excerpt.label?.status;
  return (HABITAT_STATUSES as readonly string[]).includes(status ?? '') ? (status as HabitatStatus) : 'unknown';
}

export function excerptIdentity(excerpt: AudioExcerpt): CompareRowIdentity {
  return {
    siteId: excerpt.site_id,
    status: excerptStatus(excerpt),
    label: excerpt.label?.label_original ?? 'Unlabelled',
    definition: excerpt.label?.label_definition ?? 'No definition recorded for this recording.',
    assignedBy: excerpt.label?.label_assigned_by ?? 'not recorded',
    recordedAt: excerpt.recorded_at_recorder_clock,
    rmsDbfs: excerpt.rms_dbfs,
  };
}
