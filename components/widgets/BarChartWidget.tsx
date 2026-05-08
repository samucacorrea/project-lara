import React from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const BarChartWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => (
      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={180}>
        <BarChart data={rows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} dy={10} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} />
          <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          <Bar dataKey="value" fill="#5B4DFF" radius={[6, 6, 6, 6]} barSize={30} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </BaseWidget>
);
