import React from 'react';
import { Widget } from '../../types';

export const TextWidget: React.FC<{ widget: Widget }> = ({ widget }) => {
  const fontFamily = widget.style.contentFontFamily ?? widget.style.fontFamily ?? 'Inter, system-ui, sans-serif';
  const fontSize = widget.style.contentFontSize ?? widget.style.fontSize ?? 18;
  const color = widget.style.contentColor ?? widget.style.color ?? '#0f172a';
  const align = widget.style.contentTextAlign ?? widget.style.textAlign ?? 'left';
  const padding = widget.style.contentPadding ?? widget.style.padding ?? 16;

  return (
    <div className="h-full w-full overflow-hidden" style={{ padding }}>
      <div
        className="max-w-none break-words font-medium"
        style={{
          fontFamily,
          fontSize,
          color,
          textAlign: align as 'left' | 'center' | 'right',
          lineHeight: 1.5,
        }}
      >
        {widget.content || 'Double click para editar'}
      </div>
    </div>
  );
};
