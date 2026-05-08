import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';

interface ChartWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const GaugeWidget: React.FC<ChartWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => {
      const total = rows.reduce((sum, row) => sum + row.value, 0);
      const max = 10000;
      const percentage = Math.min(100, (total / max) * 100);
      const gaugeData = [{ value: percentage }, { value: 100 - percentage }];

      const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
      const fontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 28;
      const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
      const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'center';
      const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

      return (
        <div
          className="flex flex-col items-center justify-center h-full relative w-full"
          style={{
            padding,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="70%"
                startAngle={180}
                endAngle={0}
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={0}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#5B4DFF" />
                <Cell fill="#e2e8f0" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            className="absolute bottom-4 w-full"
            style={{ textAlign: align as 'left' | 'center' | 'right' }}
          >
            <div
              style={{
                fontFamily,
                fontSize,
                color,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {Math.round(percentage)}%
            </div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Goal Reached</div>
          </div>
        </div>
      );
    }}
  </BaseWidget>
);
