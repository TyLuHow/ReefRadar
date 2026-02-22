'use client';

import { useState, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import ReactMapGL from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Site, ReefStatus } from '@/types';
import { SitePopup } from './SitePopup';

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW_STATE = {
  latitude: -4.5,
  longitude: 100,
  zoom: 4,
  pitch: 30,
  bearing: 0,
};

const STATUS_COLORS_RGB: Record<ReefStatus, [number, number, number]> = {
  healthy: [0, 255, 163],
  degraded: [255, 107, 107],
  restored_early: [255, 215, 0],
  restored_mid: [0, 229, 255],
};

interface ReefMapProps {
  sites: Site[];
  selectedSite?: Site | null;
  onSiteSelect?: (site: Site | null) => void;
  className?: string;
  height?: string;
}

export function ReefMap({
  sites,
  selectedSite: externalSelectedSite,
  onSiteSelect,
  className,
  height = '600px',
}: ReefMapProps) {
  const [internalSelectedSite, setInternalSelectedSite] =
    useState<Site | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);

  const selectedSite =
    externalSelectedSite !== undefined
      ? externalSelectedSite
      : internalSelectedSite;

  const handleSelect = useCallback(
    (site: Site | null) => {
      if (onSiteSelect) {
        onSiteSelect(site);
      } else {
        setInternalSelectedSite(site);
      }
    },
    [onSiteSelect],
  );

  // Sites with valid coordinates
  const validSites = useMemo(
    () =>
      sites.filter(
        (s) => s.latitude !== undefined && s.longitude !== undefined,
      ),
    [sites],
  );

  const layers = useMemo(() => {
    // Glow layer (larger, semi-transparent)
    const glowLayer = new ScatterplotLayer<Site>({
      id: 'sites-glow',
      data: validSites,
      getPosition: (d: Site) => [d.longitude!, d.latitude!],
      getRadius: 2000,
      getFillColor: (d: Site) => {
        const rgb = STATUS_COLORS_RGB[d.status] || [136, 136, 136];
        return [rgb[0], rgb[1], rgb[2], 80] as [
          number,
          number,
          number,
          number,
        ];
      },
      radiusMinPixels: 12,
      radiusMaxPixels: 40,
      pickable: false,
    });

    // Core layer (smaller, full opacity)
    const coreLayer = new ScatterplotLayer<Site>({
      id: 'sites-core',
      data: validSites,
      getPosition: (d: Site) => [d.longitude!, d.latitude!],
      getRadius: (d: Site) =>
        hoveredSiteId === d.site_id || selectedSite?.site_id === d.site_id
          ? 1200
          : 800,
      getFillColor: (d: Site) => {
        const rgb = STATUS_COLORS_RGB[d.status] || [136, 136, 136];
        return [rgb[0], rgb[1], rgb[2], 230] as [
          number,
          number,
          number,
          number,
        ];
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 24,
      pickable: true,
      onClick: (info: { object?: Site }) => {
        if (info.object) {
          handleSelect(info.object);
        }
      },
      onHover: (info: { object?: Site }) => {
        setHoveredSiteId(info.object?.site_id ?? null);
      },
      updateTriggers: {
        getRadius: [hoveredSiteId, selectedSite?.site_id],
      },
    });

    return [glowLayer, coreLayer];
  }, [validSites, hoveredSiteId, selectedSite, handleSelect]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        height,
        width: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
        getCursor={({ isHovering }: { isHovering: boolean }) =>
          isHovering ? 'pointer' : 'grab'
        }
      >
        <ReactMapGL mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Selected site popup */}
      {selectedSite && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}
        >
          <SitePopup
            site={selectedSite}
            onClose={() => handleSelect(null)}
          />
        </div>
      )}
    </div>
  );
}
