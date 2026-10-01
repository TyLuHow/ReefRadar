/**
 * Shared route-state table for e2e/axe/visual specs (01-08, D-21/D-22).
 *
 * Mirrors the 11 states captured in the pre-truth baseline
 * (tests/e2e/baseline-live.spec.ts) so route, axe and visual suites all
 * exercise the same surface the baseline was captured against.
 */

export interface StateDef {
  name: string;
  path: string;
}

export interface WidthDef {
  label: string;
  width: number;
  height: number;
}

export const STATES: StateDef[] = [
  { name: 'landing', path: '/' },
  { name: 'about', path: '/about/' },
  { name: 'sites', path: '/sites/' },
  { name: 'dashboard', path: '/dashboard/' },
  { name: 'analyze', path: '/dashboard/analyze/' },
  { name: 'compare', path: '/dashboard/compare/' },
  { name: 'map', path: '/dashboard/map/' },
  { name: 'experience', path: '/experience/' },
  { name: 'experience-demo', path: '/experience/?mode=demo' },
  { name: 'experience-compare', path: '/experience/?mode=compare' },
  { name: 'experience-sample', path: '/experience/?sample=idn_healthy_dawn' },
];

export const WIDTHS: WidthDef[] = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '390', width: 390, height: 844 },
];
