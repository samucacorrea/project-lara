import React from 'react';
import { Widget, GlobalFilterState } from '../../types';
import { BaseWidget } from './BaseWidget';
import { CARD_ICON_MAP } from './cardIcons';
import { formatMetricValue } from '../../utils/numberFormat';

interface CardWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  shareSlug?: string;
}

export const CardWidget: React.FC<CardWidgetProps> = ({ widget, globalFilter, shareSlug }) => (
  <BaseWidget widget={widget} globalFilter={globalFilter} shareSlug={shareSlug}>
    {({ rows }) => {
      const value = rows.reduce((sum, row) => sum + row.value, 0);
      const metaValue = widget.dataConfig?.meta;
      const targetValue = typeof metaValue === 'number' && !Number.isNaN(metaValue) ? metaValue : null;
      const progress = targetValue && targetValue > 0 ? Math.min(value / targetValue, 1) : 1;
      const circleRadius = 52;
      const circumference = 2 * Math.PI * circleRadius;
      const dashOffset = circumference * (1 - progress);
      const label = widget.dataConfig?.cardLabel || 'Orders';
      const iconKey = widget.dataConfig?.cardIcon || 'bag';
      const iconSrc = CARD_ICON_MAP[iconKey] ?? CARD_ICON_MAP.bag;
      const formattedValue = formatMetricValue(value, {
        format: widget.dataConfig?.valueFormat,
        decimalPlaces: widget.dataConfig?.decimalPlaces,
        currencySymbol: widget.dataConfig?.currencySymbol,
      });

      const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
      const fontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 32;
      const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
      const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'left';
      const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

      const alignToJustify: Record<string, 'flex-start' | 'center' | 'flex-end'> = {
        left: 'flex-start',
        center: 'center',
        right: 'flex-end',
      };

      return (
        <div
          className="flex items-center gap-6 w-full"
          style={{
            paddingLeft: padding,
            paddingRight: padding,
            justifyContent: alignToJustify[align] ?? 'flex-start',
          }}
        >
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 120 120" className="absolute inset-0">
              <circle cx="60" cy="60" r={circleRadius} stroke="#eef2ff" strokeWidth="12" fill="none" />
              <circle
                cx="60"
                cy="60"
                r={circleRadius}
                stroke="#5B4DFF"
                strokeWidth="12"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center">
                <img src={iconSrc} alt={label} className="w-7 h-7" />
              </div>
            </div>
          </div>
          <div style={{ textAlign: align }}>
            <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
            <p
              style={{
                fontFamily,
                fontSize,
                color,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {formattedValue}
            </p>
            <p className="text-xs font-medium text-emerald-500 mt-1 flex items-center gap-1">
              
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </p>
          </div>
        </div>
      );
    }}
  </BaseWidget>
);
