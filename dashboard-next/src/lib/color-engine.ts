/**
 * Pure HSL color interpolation engine for reef vitality system.
 *
 * Takes a vitality score (0.0-1.0) and produces 8 HSL color strings
 * with per-token stagger thresholds and directional hue interpolation.
 * Zero side effects -- all output via return value.
 */

export interface ReefColors {
  primary: string;
  accent: string;
  secondary: string;
  highlight: string;
  bg: string;
  surface: string;
  glow: string;
  text: string;
}

// --- Degraded endpoints (vitality = 0.0) ---
// [H, S, L]
const DEG_PRIMARY: [number, number, number] = [30, 59, 53];
const DEG_ACCENT: [number, number, number] = [359, 34, 63];
const DEG_SECONDARY: [number, number, number] = [36, 42, 85];
const DEG_HIGHLIGHT: [number, number, number] = [43, 89, 38];
const DEG_BG: [number, number, number] = [30, 13, 9];
const DEG_SURFACE: [number, number, number] = [24, 7, 14];
const DEG_TEXT: [number, number, number] = [36, 16, 88];

// --- Healthy endpoints (vitality = 1.0) ---
const HLT_PRIMARY: [number, number, number] = [175, 80, 50];
const HLT_ACCENT: [number, number, number] = [320, 75, 55];
const HLT_SECONDARY: [number, number, number] = [220, 70, 45];
const HLT_HIGHLIGHT: [number, number, number] = [45, 85, 60];
const HLT_BG: [number, number, number] = [210, 38, 8];
const HLT_SURFACE: [number, number, number] = [210, 30, 12];
const HLT_TEXT: [number, number, number] = [180, 20, 92];

// --- Stagger thresholds ---
const THRESHOLD_PRIMARY = 0.2;
const THRESHOLD_GLOW = 0.2;
const THRESHOLD_TEXT = 0.3;
const THRESHOLD_ACCENT = 0.4;
const THRESHOLD_HIGHLIGHT = 0.7;
const THRESHOLD_SECONDARY = 0.7;
const THRESHOLD_BG = 0.0;
const THRESHOLD_SURFACE = 0.0;

// --- Glow alpha endpoints ---
const GLOW_ALPHA_DEGRADED = 0.2;
const GLOW_ALPHA_HEALTHY = 0.5;

/**
 * Interpolates between two HSL colors with directional hue control.
 * Returns an `hsl(H, S%, L%)` string.
 */
export function lerpHSL(
  fromH: number,
  fromS: number,
  fromL: number,
  toH: number,
  toS: number,
  toL: number,
  t: number,
  hueDirection: 'cw' | 'ccw' | 'shortest'
): string {
  const s = fromS + (toS - fromS) * t;
  const l = fromL + (toL - fromL) * t;

  let h: number;
  if (hueDirection === 'cw') {
    const delta = ((toH - fromH) + 360) % 360;
    h = (fromH + delta * t) % 360;
  } else if (hueDirection === 'ccw') {
    const delta = ((fromH - toH) + 360) % 360;
    h = (fromH - delta * t + 360) % 360;
  } else {
    // shortest arc
    const cw = ((toH - fromH) + 360) % 360;
    const ccw = ((fromH - toH) + 360) % 360;
    if (cw <= ccw) {
      h = (fromH + cw * t) % 360;
    } else {
      h = (fromH - ccw * t + 360) % 360;
    }
  }

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * Computes per-token effective vitality given a raw vitality and threshold.
 * Returns 0 when raw <= threshold, scales linearly to 1 above threshold.
 */
export function effectiveVitality(raw: number, threshold: number): number {
  if (threshold >= 1) return 0;
  return Math.min(Math.max((raw - threshold) / (1 - threshold), 0), 1);
}

/**
 * Interpolates HSL with alpha channel. Returns `hsla(H, S%, L%, A)`.
 */
function lerpHSLA(
  fromH: number,
  fromS: number,
  fromL: number,
  fromA: number,
  toH: number,
  toS: number,
  toL: number,
  toA: number,
  t: number,
  hueDirection: 'cw' | 'ccw' | 'shortest'
): string {
  const s = fromS + (toS - fromS) * t;
  const l = fromL + (toL - fromL) * t;
  const a = fromA + (toA - fromA) * t;

  let h: number;
  if (hueDirection === 'cw') {
    const delta = ((toH - fromH) + 360) % 360;
    h = (fromH + delta * t) % 360;
  } else if (hueDirection === 'ccw') {
    const delta = ((fromH - toH) + 360) % 360;
    h = (fromH - delta * t + 360) % 360;
  } else {
    const cw = ((toH - fromH) + 360) % 360;
    const ccw = ((fromH - toH) + 360) % 360;
    if (cw <= ccw) {
      h = (fromH + cw * t) % 360;
    } else {
      h = (fromH - ccw * t + 360) % 360;
    }
  }

  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${parseFloat(a.toFixed(3))})`;
}

/**
 * Special interpolation for the secondary token (bone -> blue).
 * Avoids ugly green/purple mid-states by:
 * - Keeping saturation low until effective vitality > 0.6
 * - Snapping hue to 220 when effective vitality > 0.5
 * - Ramping saturation quickly toward 70% after 0.6
 */
function computeSecondary(t: number): string {
  const fromH = DEG_SECONDARY[0]; // 36
  const fromS = DEG_SECONDARY[1]; // 42
  const fromL = DEG_SECONDARY[2]; // 85
  const toS = HLT_SECONDARY[1]; // 70
  const toL = HLT_SECONDARY[2]; // 45

  // Lightness interpolates linearly
  const l = fromL + (toL - fromL) * t;

  // Hue snaps to target when past halfway (saturation still low enough to hide jump)
  const h = t > 0.5 ? HLT_SECONDARY[0] : fromH;

  // Saturation stays near degraded until t > 0.6, then ramps quickly
  let s: number;
  if (t <= 0.6) {
    // Ease down slightly from 42 toward 30 (desaturating during transition)
    s = fromS - (fromS - 30) * (t / 0.6);
  } else {
    // Ramp from 30 to target 70 in the remaining 0.4
    const rampT = (t - 0.6) / 0.4;
    s = 30 + (toS - 30) * rampT;
  }

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * Main color computation function.
 * Takes raw vitality (0.0-1.0) and returns 8 HSL color strings,
 * each with its own stagger threshold and hue interpolation direction.
 */
export function computeReefColors(vitality: number): ReefColors {
  // Clamp input
  const v = Math.max(0, Math.min(1, vitality));

  // Per-token effective vitality (applies stagger thresholds)
  const tPrimary = effectiveVitality(v, THRESHOLD_PRIMARY);
  const tGlow = effectiveVitality(v, THRESHOLD_GLOW);
  const tAccent = effectiveVitality(v, THRESHOLD_ACCENT);
  const tText = effectiveVitality(v, THRESHOLD_TEXT);
  const tHighlight = effectiveVitality(v, THRESHOLD_HIGHLIGHT);
  const tSecondary = effectiveVitality(v, THRESHOLD_SECONDARY);
  const tBg = effectiveVitality(v, THRESHOLD_BG);
  const tSurface = effectiveVitality(v, THRESHOLD_SURFACE);

  return {
    primary: lerpHSL(
      DEG_PRIMARY[0], DEG_PRIMARY[1], DEG_PRIMARY[2],
      HLT_PRIMARY[0], HLT_PRIMARY[1], HLT_PRIMARY[2],
      tPrimary, 'cw'
    ),
    accent: lerpHSL(
      DEG_ACCENT[0], DEG_ACCENT[1], DEG_ACCENT[2],
      HLT_ACCENT[0], HLT_ACCENT[1], HLT_ACCENT[2],
      tAccent, 'ccw'
    ),
    secondary: computeSecondary(tSecondary),
    highlight: lerpHSL(
      DEG_HIGHLIGHT[0], DEG_HIGHLIGHT[1], DEG_HIGHLIGHT[2],
      HLT_HIGHLIGHT[0], HLT_HIGHLIGHT[1], HLT_HIGHLIGHT[2],
      tHighlight, 'cw'
    ),
    bg: lerpHSL(
      DEG_BG[0], DEG_BG[1], DEG_BG[2],
      HLT_BG[0], HLT_BG[1], HLT_BG[2],
      tBg, 'cw'
    ),
    surface: lerpHSL(
      DEG_SURFACE[0], DEG_SURFACE[1], DEG_SURFACE[2],
      HLT_SURFACE[0], HLT_SURFACE[1], HLT_SURFACE[2],
      tSurface, 'cw'
    ),
    glow: lerpHSLA(
      DEG_PRIMARY[0], DEG_PRIMARY[1], DEG_PRIMARY[2], GLOW_ALPHA_DEGRADED,
      HLT_PRIMARY[0], HLT_PRIMARY[1], HLT_PRIMARY[2], GLOW_ALPHA_HEALTHY,
      tGlow, 'cw'
    ),
    text: lerpHSL(
      DEG_TEXT[0], DEG_TEXT[1], DEG_TEXT[2],
      HLT_TEXT[0], HLT_TEXT[1], HLT_TEXT[2],
      tText, 'cw'
    ),
  };
}
