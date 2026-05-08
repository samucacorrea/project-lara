import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const RadarChartWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => {
      const metricLabel = widget.dataConfig?.metricX || widget.dataConfig?.metric || 'Valor principal';
      const secondaryLabel = widget.dataConfig?.metricY || null;
      const hasSecondary = secondaryLabel && rows.some((row) => typeof row.valueY === 'number');

      return (
        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
          <RadarChart data={rows} margin={{ top: 12, right: 12, left: 12, bottom: 12 }}>
            <PolarGrid stroke="#eef2ff" />
            <PolarAngleAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value: number, name: string) => [Number(value).toLocaleString('pt-BR'), name]}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
            <Radar
              name={metricLabel}
              dataKey="value"
              stroke="#5B4DFF"
              fill="#5B4DFF"
              fillOpacity={0.28}
              strokeWidth={2}
            />
            {hasSecondary && (
              <Radar
                name={secondaryLabel ?? 'Série 2'}
                dataKey="valueY"
                stroke="#14b8a6"
                fill="#14b8a6"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      );
    }}
  </BaseWidget>
);
