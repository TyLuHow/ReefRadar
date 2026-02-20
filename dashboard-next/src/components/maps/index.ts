// Map components - use dynamic import to avoid SSR issues
// Example: const WorldMap = dynamic(() => import('@/components/maps').then(m => m.WorldMap), { ssr: false })

export { WorldMap } from './WorldMap';
export { MiniMap } from './MiniMap';
export { SiteMarker, createMarkerIcon } from './SiteMarker';
