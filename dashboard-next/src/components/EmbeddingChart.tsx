'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { AnalysisResult, STATUS_COLORS, ReefStatus } from '@/types';
import { formatStatus } from '@/lib/utils';

interface EmbeddingChartProps {
  result: AnalysisResult;
}

interface ChartDataPoint {
  x: number;
  y: number;
  name: string;
  status: ReefStatus;
  isUserSample: boolean;
}

export function EmbeddingChart({ result }: EmbeddingChartProps) {
  const { visualization, classification } = result;

  if (!visualization?.reference_sites || !visualization.coordinates) {
    return (
      <div className="glass-panel p-6">
        <p className="text-center" style={{ color: 'var(--text-muted)' }}>No visualization data available</p>
      </div>
    );
  }

  // Prepare data for the chart
  const referenceData: ChartDataPoint[] = visualization.reference_sites.map((site) => ({
    x: site.x,
    y: site.y,
    name: site.site_id,
    status: site.status,
    isUserSample: false,
  }));

  const userSample: ChartDataPoint = {
    x: visualization.coordinates.x,
    y: visualization.coordinates.y,
    name: 'Your Sample',
    status: classification?.label || 'healthy',
    isUserSample: true,
  };

  // Group reference sites by status
  const groupedData: Record<ReefStatus, ChartDataPoint[]> = {
    healthy: [],
    degraded: [],
    restored_early: [],
    restored_mid: [],
  };

  referenceData.forEach((point) => {
    if (groupedData[point.status]) {
      groupedData[point.status].push(point);
    }
  });

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          className="rounded-lg shadow-lg p-3"
          style={{ background: 'rgba(26, 23, 20, 0.95)', border: '1px solid var(--glass-border)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{data.name}</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Status: {formatStatus(data.status)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
            ({data.x.toFixed(3)}, {data.y.toFixed(3)})
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel p-6">
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Acoustic Embedding Space
      </h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        2D visualization of how your audio sample compares to reference sites
      </p>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(229, 225, 219, 0.1)" />
            <XAxis
              type="number"
              dataKey="x"
              name="x"
              tick={{ fontSize: 12, fill: '#a8a29e' }}
              label={{
                value: 'Acoustic Dimension 1',
                position: 'insideBottom',
                offset: -10,
                style: { fontSize: 12, fill: '#a8a29e' },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="y"
              tick={{ fontSize: 12, fill: '#a8a29e' }}
              label={{
                value: 'Acoustic Dimension 2',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#a8a29e' },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              formatter={(value) => <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{value}</span>}
            />

            {/* Reference site scatters by status */}
            {Object.entries(groupedData).map(([status, data]) => {
              if (data.length === 0) return null;
              return (
                <Scatter
                  key={status}
                  name={formatStatus(status)}
                  data={data}
                  fill={STATUS_COLORS[status as ReefStatus]}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STATUS_COLORS[status as ReefStatus]}
                      r={8}
                    />
                  ))}
                </Scatter>
              );
            })}

            {/* User sample */}
            <Scatter name="Your Sample" data={[userSample]} shape="star">
              <Cell
                fill={STATUS_COLORS[userSample.status]}
                stroke="#e5e1db"
                strokeWidth={2}
                r={12}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend explanation */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center text-sm">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center space-x-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{formatStatus(status)}</span>
          </div>
        ))}
        <div className="flex items-center space-x-2">
          <div className="text-lg" style={{ color: 'var(--text-primary)' }}>&#9733;</div>
          <span style={{ color: 'var(--text-secondary)' }}>Your Sample</span>
        </div>
      </div>
    </div>
  );
}
