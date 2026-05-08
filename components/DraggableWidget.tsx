import React, { useMemo, useState, useRef } from 'react';
import { Widget } from '../types';
import { useScopedStyle } from '../hooks/useScopedStyle';

interface DraggableWidgetProps {
  widget: Widget;
  isSelected: boolean;
  isPreview: boolean;
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<Widget>) => void;
  children: React.ReactNode;
}

export const DraggableWidget: React.FC<DraggableWidgetProps> = ({
  widget,
  isSelected,
  isPreview,
  onSelect,
  onUpdate,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [, setResizeDir] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const scopeClass = useMemo(() => {
    const safeId = widget.id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `widget-scope-${safeId || widget.id.replace(/[^a-zA-Z0-9]/g, '') || 'widget'}`;
  }, [widget.id]);
  const hasAdvancedCss = Boolean(widget.advancedCss?.trim());
  const defaultChromeCss = useMemo(() => {
    if (!hasAdvancedCss) return '';
    const bg = widget.style.backgroundColor ?? 'transparent';
    const radius = widget.style.borderRadius ?? 0;
    let border = 'none';
    if (widget.style.borderWidth && widget.style.borderWidth > 0) {
      border = `${widget.style.borderWidth}px solid ${widget.style.borderColor ?? '#e2e8f0'}`;
    }
    const filter =
      widget.style.filter && widget.style.filter !== 'none'
        ? widget.style.filter
        : 'none';
    return `
.${scopeClass} {
  background-color: ${bg};
  border-radius: ${radius}px;
  border: ${border};
  filter: ${filter};
}
`;
  }, [
    hasAdvancedCss,
    scopeClass,
    widget.style.backgroundColor,
    widget.style.borderColor,
    widget.style.borderRadius,
    widget.style.borderWidth,
    widget.style.filter,
  ]);
  const scopedCss = useMemo(() => {
    if (!hasAdvancedCss) return null;
    const raw = widget.advancedCss?.trim() ?? '';
    const scoped = raw.replace(/\.this\b/g, `.${scopeClass}`);
    return `${defaultChromeCss}${scoped ? `\n${scoped}` : ''}`;
  }, [defaultChromeCss, hasAdvancedCss, widget.advancedCss, scopeClass]);

  useScopedStyle(scopeClass, scopedCss);

  // Drag Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPreview) return;
    e.stopPropagation();
    onSelect();
    
    if (e.button !== 0) return;

    setIsDragging(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = widget.style.x;
    const initialTop = widget.style.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      onUpdate(widget.id, {
        style: {
          ...widget.style,
          x: initialLeft + dx,
          y: initialTop + dy,
        }
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Resize Logic
  const handleResizeStart = (e: React.MouseEvent, dir: string) => {
    if (isPreview) return;
    e.stopPropagation();
    e.preventDefault(); 
    setIsResizing(true);
    setResizeDir(dir);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = widget.style.width;
    const startHeight = widget.style.height;
    const startLeft = widget.style.x;
    const startTop = widget.style.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startLeft;
      let newY = startTop;

      if (dir.includes('e')) newWidth = Math.max(50, startWidth + dx);
      if (dir.includes('s')) newHeight = Math.max(50, startHeight + dy);
      if (dir.includes('w')) {
        const proposedWidth = startWidth - dx;
        if (proposedWidth > 50) {
            newWidth = proposedWidth;
            newX = startLeft + dx;
        }
      }
      if (dir.includes('n')) {
        const proposedHeight = startHeight - dy;
        if (proposedHeight > 50) {
            newHeight = proposedHeight;
            newY = startTop + dy;
        }
      }

      onUpdate(widget.id, {
        style: {
          ...widget.style,
          width: newWidth,
          height: newHeight,
          x: newX,
          y: newY,
        }
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDir(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (e: React.MouseEvent) => {
      if (!isPreview) {
          e.stopPropagation();
      }
  };

  return (
    <div
      ref={widgetRef}
      className={`absolute group ${isSelected && !isPreview ? 'z-50' : 'z-10'}`}
      style={{
        left: widget.style.x,
        top: widget.style.y,
        width: widget.style.width,
        height: widget.style.height,
        cursor: isPreview ? 'default' : isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Widget Content Container */}
      <div 
        className={`w-full h-full overflow-hidden transition-all duration-200 ${scopeClass} ${
          !isPreview && isSelected 
            ? 'shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-2 ring-[#5B4DFF]' 
            : 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]'
        }`}
        style={
          hasAdvancedCss
            ? undefined
            : {
                backgroundColor: widget.style.backgroundColor ?? 'transparent',
                borderRadius: widget.style.borderRadius,
                border: widget.style.borderWidth
                  ? `${widget.style.borderWidth}px solid ${widget.style.borderColor}`
                  : 'none',
                filter:
                  widget.style.filter && widget.style.filter !== 'none'
                    ? widget.style.filter
                    : undefined,
              }
        }
      >
        {children}
      </div>

      {/* Resize Handles */}
      {!isPreview && isSelected && (
        <>
          {['nw', 'ne', 'se', 'sw'].map((dir) => (
            <div
              key={dir}
              onMouseDown={(e) => handleResizeStart(e, dir)}
              className={`absolute w-4 h-4 bg-white border-2 border-[#5B4DFF] rounded-full z-50 shadow-sm ${
                dir === 'nw' ? '-top-2 -left-2 cursor-nw-resize' :
                dir === 'ne' ? '-top-2 -right-2 cursor-ne-resize' :
                dir === 'se' ? '-bottom-2 -right-2 cursor-se-resize' :
                dir === 'sw' ? '-bottom-2 -left-2 cursor-sw-resize' : ''
              }`}
            />
          ))}
        </>
      )}
    </div>
  );
};
