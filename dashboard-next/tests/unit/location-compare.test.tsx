import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const setCrossfade = vi.fn();

vi.mock('@/components/experience/useLocationAudio', () => ({
  useLocationAudio: () => ({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    analyserNode: null,
    loadState: 'idle',
    handlePlayPause: vi.fn(),
    crossfade: 0.3,
    setCrossfade,
    activeBands: new Set(['low', 'mid', 'high']),
    toggleBand: vi.fn(),
    locations: [],
    selectedLocation: null,
    setSelectedLocation: vi.fn(),
    leftTrack: 'healthy',
    rightTrack: 'degraded',
    setLeftTrack: vi.fn(),
    setRightTrack: vi.fn(),
    setTracks: vi.fn(),
  }),
}));

import { LocationCompare } from '@/components/experience/LocationCompare';

describe('LocationCompare crossfader', () => {
  beforeEach(() => {
    setCrossfade.mockClear();
  });

  it('shows a static crossfader-slider at the hook value before any audio is loaded', () => {
    const { container } = render(<LocationCompare onGoLanding={() => {}} onGoDemo={() => {}} />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.classList.contains('crossfader-slider')).toBe(true);
    expect(slider.value).toBe('0.3');
    expect(slider.disabled).toBe(false);
  });

  it('moving the slider calls audio.setCrossfade exactly once and nothing else', () => {
    const { container } = render(<LocationCompare onGoLanding={() => {}} onGoDemo={() => {}} />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.7' } });
    expect(setCrossfade).toHaveBeenCalledTimes(1);
    expect(setCrossfade).toHaveBeenCalledWith(0.7);
    expect(screen.getByText('Crossfade')).toBeInTheDocument();
  });

  it('imports nothing from the client stores', () => {
    const file = path.resolve(__dirname, '../../src/components/experience/LocationCompare.tsx');
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/@\/stores/);
  });
});
