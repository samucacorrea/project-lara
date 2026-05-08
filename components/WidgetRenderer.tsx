import React from 'react';
import { Widget, GlobalFilterState } from '../types';
import { BarChartWidget } from './widgets/BarChartWidget';
import { LineChartWidget } from './widgets/LineChartWidget';
import { RadarChartWidget } from './widgets/RadarChartWidget';
import { FunnelChartWidget } from './widgets/FunnelChartWidget';
import { GaugeWidget } from './widgets/GaugeWidget';
import { CardWidget } from './widgets/CardWidget';
import { TableWidget } from './widgets/TableWidget';
import { CounterWidget } from './widgets/CounterWidget';
import { FilterWidget } from './widgets/FilterWidget';

interface WidgetRendererProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  onDimensionFilterChange?: (dimension: string, value: string) => void;
  shareSlug?: string;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  widget,
  globalFilter,
  onDimensionFilterChange,
  shareSlug,
}) => {
  const baseFontFamily = widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
  const containerPadding = widget.style.padding ?? 16;
  const titleFontFamily = widget.style.titleFontFamily ?? baseFontFamily;
  const contentFontFamily = widget.style.contentFontFamily ?? baseFontFamily;
  const titleAlign = widget.style.titleAlign ?? widget.style.textAlign ?? 'left';
  const contentAlign = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'left';
  const bodyPadding = widget.style.contentPadding ?? containerPadding;

  const content = (() => {
    switch (widget.type) {
      case 'bar_chart':
        return <BarChartWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'line_chart':
        return <LineChartWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'radar_chart':
        return <RadarChartWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'funnel_chart':
      case 'funnel':
        return <FunnelChartWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'gauge':
        return <GaugeWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'table':
        return <TableWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'counter':
        return <CounterWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'card':
        return <CardWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug} />;
      case 'filter':
        return (
          <FilterWidget
            widget={widget}
            globalFilter={globalFilter}
            onDimensionFilterChange={onDimensionFilterChange}
            shareSlug={shareSlug}
          />
        );
      case 'text':
        const textColor = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
        const textFontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 18;
        const textFamily = widget.style.contentFontFamily ?? contentFontFamily;
        return (
          <div
            className="w-full h-full"
            style={{
              padding: containerPadding,
              fontFamily: textFamily,
              fontSize: textFontSize,
              color: textColor,
              textAlign: contentAlign,
              lineHeight: 1.5,
            }}
          >
            {widget.content || 'Duplo clique para editar'}
          </div>
        );
      case 'image':
        return (
          <img
            src={widget.content || 'https://placehold.co/400x300/F3F4F8/A0AEC0?text=Image'}
            alt="Widget"
            className="w-full h-full object-cover pointer-events-none select-none"
            style={{ borderRadius: widget.style.borderRadius ?? 16 }}
          />
        );
      default:
        return <div className="p-4 text-sm text-gray-400">Widget não suportado.</div>;
    }
  })();

  const shouldWrapChrome = !['text', 'image', 'card', 'filter'].includes(widget.type);

  if (!shouldWrapChrome) {
    return content;
  }

  const titleStyle: React.CSSProperties = {
    fontFamily: titleFontFamily,
    color: widget.style.titleColor ?? '#0f172a',
    fontSize: widget.style.titleFontSize ?? 16,
    marginBottom: widget.style.titleMarginBottom ?? 4,
    textAlign: titleAlign,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: contentFontFamily,
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: titleAlign,
  };

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    padding: bodyPadding,
    color: widget.style.contentColor ?? widget.style.color ?? '#0f172a',
    fontFamily: contentFontFamily,
    fontSize: widget.style.contentFontSize ?? widget.style.fontSize ?? 13,
    textAlign: contentAlign,
    display: 'flex',
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="border-b border-slate-100"
        style={{ padding: containerPadding, paddingBottom: containerPadding / 1.5, textAlign: titleAlign }}
      >
        <p className="font-semibold truncate" style={titleStyle}>
          {widget.title || 'Widget sem título'}
        </p>
        {widget.dataConfig?.tableName && (
          <p className="truncate" style={subtitleStyle}>
            Fonte: {widget.dataConfig.tableName}
          </p>
        )}
      </div>
      <div style={bodyStyle}>
        <div className="w-full h-full">{content}</div>
      </div>
    </div>
  );
};
