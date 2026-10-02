// Map components - use dynamic import to avoid SSR issues
// Example: const MiniMap = dynamic(() => import('@/components/maps').then(m => m.MiniMap), { ssr: false })

export { MiniMap } from './MiniMap';
export { SiteMarker, createMarkerIcon } from './SiteMarker';
