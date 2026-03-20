'use client';

import { useState } from 'react';
import { useVitalityStore } from '@/stores/vitality-store';

export default function VitalityDebugPanel() {
  const [value, setValue] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    useVitalityStore.getState().setVitality(v, 'crossfader');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-black/80 p-3 rounded-lg backdrop-blur">
      <label className="block text-xs text-white/70 mb-1">
        Vitality: {value.toFixed(2)}
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={handleChange}
        className="w-48 mb-2"
      />
      <div className="flex gap-1">
        <div className="w-6 h-6 bg-reef-primary" title="primary" />
        <div className="w-6 h-6 bg-reef-accent" title="accent" />
        <div className="w-6 h-6 bg-reef-secondary" title="secondary" />
        <div className="w-6 h-6 bg-reef-highlight" title="highlight" />
        <div className="w-6 h-6 bg-reef-bg border border-white/20" title="bg" />
        <div className="w-6 h-6 bg-reef-surface border border-white/20" title="surface" />
        <div className="w-6 h-6 bg-reef-text" title="text" />
        <div
          className="w-6 h-6 rounded-full shadow-lg"
          style={{ backgroundColor: 'var(--reef-glow)' }}
          title="glow"
        />
      </div>
    </div>
  );
}
