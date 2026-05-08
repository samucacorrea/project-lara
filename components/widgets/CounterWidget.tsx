import React, { useEffect, useMemo, useState } from 'react';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';
import { formatMetricValue } from '../../utils/numberFormat';

interface CounterWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const CounterWidget: React.FC<CounterWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => <CounterContent widget={widget} rows={rows} />}
  </BaseWidget>
);

const CounterContent: React.FC<{
  widget: Widget;
  rows: { label: string; value: number }[];
}> = ({ widget, rows }) => {
  const target = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows]);
  const duration = widget.dataConfig?.counterDuration ?? 2000;
  const loop = widget.dataConfig?.counterLoop ?? false;
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let rafId: number;

    const animate = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setValue(progress * target);
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else if (loop) {
        start = null;
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, loop]);

  const formatConfig = {
    format: widget.dataConfig?.valueFormat,
    decimalPlaces: widget.dataConfig?.decimalPlaces,
    currencySymbol: widget.dataConfig?.currencySymbol,
  };
  const formattedValue = formatMetricValue(value, formatConfig);
  const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'center';
  const fontSize =
    widget.style.contentFontSize ?? widget.style.fontSize ?? Math.max(widget.style.height * 0.12 || 0, 32);
  const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
  const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
  const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

  const alignToFlex: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };
  const justify = alignToFlex[align] ?? 'center';

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{
        justifyContent: 'center',
        alignItems: justify,
        textAlign: align as 'left' | 'center' | 'right',
        padding,
      }}
    >
      <div
        style={{
          fontSize,
          fontFamily,
          color,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        {formattedValue}
      </div>
    </div>
  );
};
