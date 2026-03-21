import { RefObject, useEffect, useRef } from 'react';
import { useVitalityStore } from '@/stores/vitality-store';

const MAX_PARTICLES = 150;

interface PoolParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
  hue: number;
  saturation: number;
  lightness: number;
}

function createPool(size: number): PoolParticle[] {
  const pool: PoolParticle[] = [];
  for (let i = 0; i < size; i++) {
    pool[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      alpha: 0,
      maxAlpha: 0,
      life: 0,
      maxLife: 0,
      hue: 0,
      saturation: 0,
      lightness: 0,
    };
  }
  return pool;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resetParticle(
  p: PoolParticle,
  vitality: number,
  width: number,
  height: number
): void {
  p.active = true;
  p.x = Math.random() * width;
  p.y = height * (0.7 + Math.random() * 0.3);
  p.vy = -(lerp(0.3, 1.5, vitality));
  p.vx = (Math.random() - 0.5) * 0.3;
  p.size = lerp(2, 6, vitality * Math.random());
  p.maxAlpha = lerp(0.2, 0.8, vitality);
  p.alpha = 0;
  p.life = 0;
  p.maxLife = 120 + Math.random() * 180;

  // Color: degraded = muted ochre-brown, healthy = teal/magenta
  if (vitality < 0.3) {
    p.hue = 30;
    p.saturation = 40;
    p.lightness = 45;
  } else {
    p.hue = Math.random() < 0.6 ? 175 : 320;
    p.saturation = lerp(40, 80, vitality);
    p.lightness = lerp(45, 55, vitality);
  }
}

function spawnParticles(
  pool: PoolParticle[],
  vitality: number,
  width: number,
  height: number
): void {
  const targetCount = Math.round(lerp(5, 150, vitality));

  // Count active particles without allocation
  let activeCount = 0;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].active) activeCount++;
  }

  const deficit = targetCount - activeCount;
  const spawnsThisFrame = Math.min(deficit, 3);

  let spawned = 0;
  for (let i = 0; i < pool.length && spawned < spawnsThisFrame; i++) {
    if (!pool[i].active) {
      resetParticle(pool[i], vitality, width, height);
      spawned++;
    }
  }
}

function updateParticles(
  pool: PoolParticle[],
  vitality: number,
  time: number,
  width: number,
  height: number
): void {
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    p.life++;
    p.y += p.vy;
    p.x += p.vx + Math.sin(time * 0.02 + p.y * 0.01) * 0.3;

    // Life curve: fade-in 0-20%, full 20-70%, fade-out 70-100%
    const lifeProgress = p.life / p.maxLife;
    if (lifeProgress < 0.2) {
      p.alpha = (lifeProgress / 0.2) * p.maxAlpha;
    } else if (lifeProgress > 0.7) {
      p.alpha = ((1 - lifeProgress) / 0.3) * p.maxAlpha;
    } else {
      p.alpha = p.maxAlpha;
    }

    // Deactivate dead or off-screen particles (no splice)
    if (p.life >= p.maxLife || p.y < -10) {
      p.active = false;
    }
  }

  // Replenish
  spawnParticles(pool, vitality, width, height);
}

function drawCaustics(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vitality: number,
  time: number
): void {
  // Per user decision: invisible below 0.3 threshold
  if (vitality <= 0.3) return;

  // Ramp from 0 at vitality=0.3 to 0.15 at vitality=1.0 (CAUS-02)
  const intensity = (vitality - 0.3) / 0.7;
  const maxAlpha = 0.15 * intensity;

  // Screen blend for additive light effect (CAUS-03)
  ctx.globalCompositeOperation = 'screen';

  // Grid-based rendering with 40px cells (Pitfall 6: not too fine)
  const cellSize = 40;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);

  // Phase shift ~0.5 deg/frame = ~0.00873 rad/frame for slow shimmer (user decision)
  const phase = time * 0.00873;

  // Pre-compute the base color string once per frame (Pitfall 5: no per-cell allocation)
  // Teal-tinted white: hsla(180, 30%, 80%, {alpha})
  // We'll vary alpha per cell, but bucket to reduce unique strings

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;

      // 3 overlapping sine waves with different frequencies (CAUS-01)
      // Frequencies chosen for organic, non-repeating pattern
      const v1 = Math.sin(cx * 0.02 + cy * 0.015 + phase);
      const v2 = Math.sin(cx * 0.013 - cy * 0.01 + phase * 1.3);
      const v3 = Math.sin(cx * 0.009 + cy * 0.022 + phase * 0.7);
      const combined = (v1 + v2 + v3) / 3; // -1..1
      const brightness = (combined + 1) / 2; // 0..1

      // Only draw bright patches (above 0.5 threshold for organic gaps)
      if (brightness > 0.5) {
        const alpha = (brightness - 0.5) * 2 * maxAlpha;
        // Round alpha to nearest 0.01 to reduce unique string creation
        const roundedAlpha = Math.round(alpha * 100) / 100;
        ctx.fillStyle = `hsla(180, 30%, 80%, ${roundedAlpha})`;
        ctx.fillRect(
          col * cellSize,
          row * cellSize,
          cellSize,
          cellSize
        );
      }
    }
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, pool: PoolParticle[]): void {
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    // Bucket alpha to nearest 0.05 to reduce unique color strings
    const bucketedAlpha = Math.round(p.alpha * 20) / 20;
    if (bucketedAlpha <= 0) continue;

    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      p.size * 2
    );
    gradient.addColorStop(
      0,
      `hsla(${p.hue}, ${Math.round(p.saturation)}%, ${Math.round(p.lightness)}%, ${bucketedAlpha})`
    );
    gradient.addColorStop(1, `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, 0)`);

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

/**
 * Drives the full-viewport particle background.
 * Reads vitality from zustand store via getState() (no React subscription).
 * Uses a pre-allocated object pool of 150 particles for zero GC pressure.
 */
export function useBackgroundCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>
): void {
  const poolRef = useRef<PoolParticle[]>(createPool(MAX_PARTICLES));
  const timeRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    // Guard against double-start (React StrictMode)
    if (runningRef.current) return;
    runningRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) {
      runningRef.current = false;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      runningRef.current = false;
      return;
    }

    let rafId: number;
    let width = canvas.parentElement?.clientWidth || canvas.width;
    let height = canvas.parentElement?.clientHeight || canvas.height;

    // DPR-aware canvas sizing
    function resizeCanvas(w: number, h: number) {
      const dpr = window.devicePixelRatio || 1;
      width = w;
      height = h;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ResizeObserver for responsive canvas
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        resizeCanvas(w, h);
      }
    });

    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    // Initial size
    resizeCanvas(width, height);

    const pool = poolRef.current;

    function animate() {
      const vitality = useVitalityStore.getState().target;
      timeRef.current += 1;

      ctx!.clearRect(0, 0, width, height);

      updateParticles(pool, vitality, timeRef.current, width, height);

      // Layer 1: Caustics (screen blend, behind particles)
      drawCaustics(ctx!, width, height, vitality, timeRef.current);

      // Layer 2: Particles (source-over, on top of caustics)
      ctx!.globalCompositeOperation = 'source-over';
      drawParticles(ctx!, pool);

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      runningRef.current = false;
    };
  }, [canvasRef]);
}
