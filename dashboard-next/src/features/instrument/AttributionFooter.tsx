import { formatCitation, getCitation } from '@/lib/citations';
import { doiUrl, safeHttpsUrl } from './safe-url';

/**
 * AttributionFooter (DS-05, UI-SPEC "Expressive Compositions", Footer): "Audio: {citation}. {licence}."
 * with the DOI as a link. Attribution appears wherever audio or derived data appears, so every
 * composition ends with this.
 *
 * The text is the canonical citations module's own APA string with its trailing URL removed (the DOI
 * link follows as a link), so no author, title or licence is typed here (T-04-21-01). Links go through
 * `safeHttpsUrl`; an unsafe or absent URL is shown as text instead (T-04-21-02). An unknown id throws,
 * so a typo can never print an invented citation.
 */

export interface AttributionFooterProps {
  /** A key of src/data/citations.json. Defaults to the MARRS dataset every committed recording comes from. */
  citationId?: string;
  className?: string;
}

const LINK = 'underline underline-offset-4 hover:no-underline';

export function AttributionFooter({ citationId = 'marrs', className }: AttributionFooterProps) {
  const record = getCitation(citationId);
  const text = formatCitation(citationId, 'apa').replace(/\s*https?:\/\/\S+$/, '');
  const doiHref = record.doi ? safeHttpsUrl(doiUrl(record.doi)) : undefined;
  const licenceHref = safeHttpsUrl(record.licence_url);

  return (
    <footer className={className}>
      <p className="text-small text-muted">
        {`Audio: ${text} `}
        {licenceHref ? (
          <a href={licenceHref} className={LINK}>
            {record.licence}
          </a>
        ) : (
          record.licence
        )}
        {'. '}
        {doiHref && record.doi ? (
          <a href={doiHref} className={LINK}>
            {`doi.org/${record.doi}`}
          </a>
        ) : null}
      </p>
    </footer>
  );
}
