export interface RegionBounds {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  zoom: number;
}

export const REGIONS: RegionBounds[] = [
  { id: 'global', name: 'Global View', center: { lat: 0, lon: 80 }, zoom: 2 },
  { id: 'indonesia', name: 'Indonesia', center: { lat: -2.5, lon: 118 }, zoom: 5 },
  { id: 'gbr', name: 'Great Barrier Reef', center: { lat: -18, lon: 147 }, zoom: 6 },
  { id: 'kenya', name: 'Kenya Coast', center: { lat: -3, lon: 40 }, zoom: 8 },
  { id: 'maldives', name: 'Maldives', center: { lat: 4, lon: 73 }, zoom: 7 },
  { id: 'mexico', name: 'Mesoamerican Reef', center: { lat: 18.5, lon: -87 }, zoom: 7 },
  { id: 'florida', name: 'Florida Keys', center: { lat: 24.55, lon: -81.5 }, zoom: 9 },
  { id: 'pacific', name: 'South Pacific', center: { lat: -16.5, lon: -151.7 }, zoom: 8 },
];
