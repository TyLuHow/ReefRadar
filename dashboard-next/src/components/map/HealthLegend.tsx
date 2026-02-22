'use client';

const LEGEND_ITEMS = [
  { label: 'Healthy', color: '#00ffa3' },
  { label: 'Degraded', color: '#ff6b6b' },
  { label: 'Restored (Early)', color: '#ffd700' },
  { label: 'Restored (Mid)', color: '#00e5ff' },
];

interface HealthLegendProps {
  className?: string;
}

export function HealthLegend({ className }: HealthLegendProps) {
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '16px',
        zIndex: 10,
        background: 'rgba(3, 11, 26, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        padding: '12px 16px',
      }}
    >
      <p
        className="text-xs font-semibold mb-2 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Health Status
      </p>
      <div className="space-y-1.5">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
