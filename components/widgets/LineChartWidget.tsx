import React from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const LineChartWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => {
      const metricLabel = widget.dataConfig?.metricX || widget.dataConfig?.metric || 'Valor principal';
      const secondaryLabel = widget.dataConfig?.metricY || null;
      const hasSecondary = secondaryLabel && rows.some((row) => typeof row.valueY === 'number');
      const useSecondaryAxis = (widget.dataConfig?.lineSecondaryAxis ?? false) && hasSecondary;
      const sortedRows = [...rows].sort((a, b) => {
        const toDateValue = (value: string): number | null => {
          if (!value) return null;
          if (value.toLowerCase() === 'total') return Number.POSITIVE_INFINITY;
          if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
          }
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
            const [day, month, year] = value.split('/').map((part) => Number(part));
            if (!day || !month || !year) return null;
            return new Date(year, month - 1, day).getTime();
          }
          const parsed = Date.parse(value);
          return Number.isFinite(parsed) ? parsed : null;
        };

        const toNumericValue = (value: string): number | null => {
          if (!value) return null;
          const numeric = Number(value.replace(',', '.'));
          return Number.isFinite(numeric) ? numeric : null;
        };

        const aLabel = String(a.label ?? '');
        const bLabel = String(b.label ?? '');
        const aDate = toDateValue(aLabel);
        const bDate = toDateValue(bLabel);
        if (aDate !== null && bDate !== null) {
          return aDate - bDate;
        }
        const aNum = toNumericValue(aLabel);
        const bNum = toNumericValue(bLabel);
        if (aNum !== null && bNum !== null) {
          return aNum - bNum;
        }
        return aLabel.localeCompare(bLabel, 'pt-BR');
      });

      return (
        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
          <LineChart data={sortedRows} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical stroke="#eef2ff" />
            <XAxis
              dataKey="label"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#CBD5F5', strokeWidth: 1 }}
              tick={{ fill: '#94a3b8' }}
              dy={10}
            />
            <YAxis
              width={48}
              fontSize={11}
              tickLine={{ stroke: '#CBD5F5' }}
              axisLine={{ stroke: '#CBD5F5', strokeWidth: 1 }}
              tick={{ fill: '#94a3b8' }}
              tickFormatter={(value) => value.toLocaleString('pt-BR')}
              yAxisId="left"
            />
            {useSecondaryAxis && (
              <YAxis
                width={48}
                orientation="right"
                fontSize={11}
                tickLine={{ stroke: '#5EEAD4' }}
                axisLine={{ stroke: '#5EEAD4', strokeWidth: 1 }}
                tick={{ fill: '#0f766e' }}
                tickFormatter={(value) => value.toLocaleString('pt-BR')}
                yAxisId="right"
              />
            )}
            <Tooltip
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value: number, name: string) => [value.toLocaleString('pt-BR'), name]}
            />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="value"
              name={metricLabel}
              stroke="#5B4DFF"
              strokeWidth={3}
              dot={{ strokeWidth: 2, fill: '#5B4DFF' }}
              activeDot={{ r: 6 }}
              yAxisId="left"
            />
            {hasSecondary && (
              <Line
                type="monotone"
                dataKey="valueY"
                name={secondaryLabel ?? 'Série 2'}
                stroke="#14b8a6"
                strokeWidth={3}
                dot={{ strokeWidth: 2, fill: '#14b8a6' }}
                activeDot={{ r: 6 }}
                yAxisId={useSecondaryAxis ? 'right' : 'left'}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      );
    }}
  </BaseWidget>
);
