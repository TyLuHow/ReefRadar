'use client';

const LEGEND_ITEMS = [
  { label: 'Healthy', color: '#cd853f' },
  { label: 'Degraded', color: '#6b6560' },
  { label: 'Restored (Early)', color: '#8b7355' },
  { label: 'Restored (Mid)', color: '#c08081' },
  { label: 'Unknown', color: '#a8a29e' },
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
        background: 'rgba(26, 23, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(229, 225, 219, 0.1)',
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
