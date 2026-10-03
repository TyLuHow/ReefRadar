'use client';

import { useState, type CSSProperties, type FocusEvent } from 'react';
import type { Site } from '@/types';
import { siteMarkerLabel } from './SiteMarker';

interface SiteListProps {
  sites: Site[];
  selectedSiteId: string | null;
  /** `opener` is the button that was activated, so the owner can return focus to it. */
  onSelect: (site: Site, opener: HTMLElement) => void;
}

// Visually hidden but still in the accessibility tree and still focusable.
const HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// While keyboard focus is inside the list it becomes a visible, scrollable panel.
const OPEN_STYLE: CSSProperties = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  zIndex: 30,
  maxHeight: '60%',
  maxWidth: '280px',
  overflowY: 'auto',
  background: 'rgba(26, 23, 20, 0.95)',
  border: '1px solid rgba(229, 225, 219, 0.15)',
  borderRadius: '8px',
  padding: '8px',
};

/**
 * Keyboard and screen-reader path to every site on the monitoring map (WR-03, WCAG 2.1.1 and
 * 1.1.1). The map's circles are canvas pixels with no focus stops, so this list is the
 * accessible alternative: one button per site, the same label as the /sites markers, and
 * activating one selects the site exactly as a click on its circle does.
 *
 * It stays visually hidden for pointer users and appears as an overlay while a keyboard user
 * is inside it, so the page's resting appearance is unchanged.
 */
export function SiteList({ sites, selectedSiteId, onSelect }: SiteListProps) {
  const [visible, setVisible] = useState(false);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false);
  };

  return (
    <div
      role="group"
      aria-label="Monitoring sites"
      onFocus={() => setVisible(true)}
      onBlur={handleBlur}
      style={visible ? OPEN_STYLE : HIDDEN_STYLE}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sites.map((site) => {
          const selected = site.site_id === selectedSiteId;
          return (
            <li key={site.site_id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={(event) => onSelect(site, event.currentTarget)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: selected ? '#e9dcc9' : '#e5e1db',
                  background: selected ? 'rgba(205, 133, 63, 0.25)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {siteMarkerLabel(site)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
