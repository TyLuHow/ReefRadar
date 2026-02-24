import { RefObject, useEffect, useRef } from 'react';
import { BANDS, BandId } from './FrequencyBands';

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  alpha: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function average(arr: Uint8Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function useSpectrogramAnimation(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  state: 'idle' | 'playing' | 'analyzing',
  activeBands: Set<BandId>,
  audioAnalyser?: AnalyserNode | null
): void {
  // Use refs for mutable animation state so they persist across renders
  // without causing re-renders themselves
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const amplitudesRef = useRef<Record<BandId, number>>({
    low: BANDS.low.baseAmplitude,
    mid: BANDS.mid.baseAmplitude,
    high: BANDS.high.baseAmplitude,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let width = canvas.parentElement?.clientWidth || canvas.width;
    let height = canvas.parentElement?.clientHeight || canvas.height;

    // Handle DPR-aware canvas sizing
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
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        resizeCanvas(w, h);
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Initial size
    resizeCanvas(width, height);

    // Frequency data buffer for audio reactivity
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;
    if (audioAnalyser) {
      frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    }

    const particles = particlesRef.current;
    const amplitudes = amplitudesRef.current;

    // Particle config based on state
    function getMaxParticles(): number {
      switch (state) {
        case 'idle':
          return 40;
        case 'playing':
          return 80;
        case 'analyzing':
          return 55;
        default:
          return 40;
      }
    }

    function getSpawnRate(): number {
      switch (state) {
        case 'idle':
          return 0.3;
        case 'playing':
          return 0.8;
        case 'analyzing':
          return 0.5;
        default:
          return 0.3;
      }
    }

    function spawnParticle() {
      const colors = [BANDS.low.color, BANDS.mid.color, BANDS.high.color];
      const color = colors[Math.floor(Math.random() * colors.length)];
      particles.push({
        x: Math.random() * width,
        y: height * (0.7 + Math.random() * 0.3), // Bottom 30%
        size: 1 + Math.random() * 3,
        color,
        alpha: 0,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(0.2 + Math.random() * 0.6),
        life: 0,
        maxLife: 120 + Math.random() * 180, // 2-5 seconds at 60fps
      });
    }

    function updateParticles() {
      const maxParticles = getMaxParticles();
      const spawnRate = getSpawnRate();

      // Spawn new particles
      if (particles.length < maxParticles && Math.random() < spawnRate) {
        spawnParticle();
      }

      // Update existing particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;

        // Analyzing swirl effect
        if (state === 'analyzing') {
          p.vx += Math.sin(timeRef.current * 0.02 + p.y * 0.01) * 0.05;
        }

        // Fade in/out based on life progress
        const lifeProgress = p.life / p.maxLife;
        if (lifeProgress < 0.2) {
          p.alpha = lifeProgress / 0.2;
        } else if (lifeProgress > 0.7) {
          p.alpha = (1 - lifeProgress) / 0.3;
        } else {
          p.alpha = 1;
        }

        // Remove dead or off-screen particles
        if (p.life >= p.maxLife || p.y < 0 || p.x < -10 || p.x > width + 10) {
          particles.splice(i, 1);
        }
      }
    }

    function drawParticles() {
      for (const p of particles) {
        const alphaHex = Math.round(p.alpha * 255)
          .toString(16)
          .padStart(2, '0');
        const gradient = ctx!.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.size * 2
        );
        gradient.addColorStop(0, p.color + alphaHex);
        gradient.addColorStop(1, p.color + '00');
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx!.fillStyle = gradient;
        ctx!.fill();
      }
    }

    function drawBands() {
      const time = timeRef.current;

      // Update amplitudes toward targets
      if (audioAnalyser && frequencyData && state === 'playing') {
        audioAnalyser.getByteFrequencyData(frequencyData);
        const binCount = frequencyData.length;
        // Divide frequency bins into low/mid/high ranges
        const lowEnd = Math.min(50, binCount);
        const midEnd = Math.min(200, binCount);
        const highEnd = Math.min(500, binCount);

        const lowEnergy = average(frequencyData.slice(0, lowEnd)) / 128;
        const midEnergy = average(frequencyData.slice(lowEnd, midEnd)) / 128;
        const highEnergy = average(frequencyData.slice(midEnd, highEnd)) / 128;

        amplitudes.low = lerp(
          amplitudes.low,
          lowEnergy * BANDS.low.playingAmplitude,
          0.1
        );
        amplitudes.mid = lerp(
          amplitudes.mid,
          midEnergy * BANDS.mid.playingAmplitude,
          0.1
        );
        amplitudes.high = lerp(
          amplitudes.high,
          highEnergy * BANDS.high.playingAmplitude,
          0.1
        );
      } else {
        // Use preset amplitudes based on state
        const targetKey =
          state === 'idle' ? 'baseAmplitude' : 'playingAmplitude';
        amplitudes.low = lerp(amplitudes.low, BANDS.low[targetKey], 0.05);
        amplitudes.mid = lerp(amplitudes.mid, BANDS.mid[targetKey], 0.05);
        amplitudes.high = lerp(amplitudes.high, BANDS.high[targetKey], 0.05);
      }

      const bandIds: BandId[] = ['low', 'mid', 'high'];

      for (const bandId of bandIds) {
        const band = BANDS[bandId];
        const amplitude = amplitudes[bandId];
        const centerY = height * band.yPosition;
        const isActive = activeBands.has(bandId);
        const bandOpacity = isActive ? 1.0 : 0.2;

        // Compute Y for a given X using composite sine waves
        const computeY = (x: number): number =>
          centerY +
          amplitude *
            (Math.sin(x * band.frequency + time * band.speed) +
              0.5 *
                Math.sin(
                  x * band.frequency * 2.1 + time * band.speed * 1.3
                ));

        // Draw glow layer (thick, low opacity)
        ctx!.beginPath();
        ctx!.strokeStyle = band.color;
        ctx!.lineWidth = 4;
        ctx!.globalAlpha = 0.3 * bandOpacity;
        for (let x = 0; x <= width; x += 2) {
          const y = computeY(x);
          if (x === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();

        // Draw main line (thin, full opacity)
        ctx!.beginPath();
        ctx!.strokeStyle = band.color;
        ctx!.lineWidth = 2;
        ctx!.globalAlpha = 0.8 * bandOpacity;
        for (let x = 0; x <= width; x += 2) {
          const y = computeY(x);
          if (x === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
        ctx!.globalAlpha = 1.0;
      }
    }

    function animate() {
      timeRef.current += 0.016; // ~60fps increment
      ctx!.clearRect(0, 0, width, height);

      updateParticles();
      drawParticles();
      drawBands();

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [canvasRef, state, activeBands, audioAnalyser]);
}
