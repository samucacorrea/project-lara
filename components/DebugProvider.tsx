import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type DebugLevel = 'info' | 'success' | 'error';

export interface DebugMessage {
  id: string;
  level: DebugLevel;
  message: string;
  details?: string;
  timestamp: string;
}

interface DebugContextValue {
  debugEnabled: boolean;
  addMessage: (message: Omit<DebugMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
}

const DebugContext = createContext<DebugContextValue>({
  debugEnabled: false,
  addMessage: () => undefined,
  clearMessages: () => undefined,
});

const DEBUG_MODE = (import.meta.env.VITE_DEBUG_MODE ?? 'false') === 'true';

const randomId = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

export const DebugProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [panelPosition, setPanelPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 280 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const addMessage = useCallback((message: Omit<DebugMessage, 'id' | 'timestamp'>) => {
    if (!DEBUG_MODE) return;

    setMessages((prev) => {
      const next: DebugMessage[] = [
        ...prev,
        {
          ...message,
          id: randomId(),
          timestamp: new Date().toISOString(),
        },
      ];

      return next.slice(-20);
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const handleDragStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = (event.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      setPanelPosition((prev) => {
        const nextX = event.clientX - dragOffset.x;
        const nextY = event.clientY - dragOffset.y;
        const maxX = window.innerWidth - 380;
        const maxY = window.innerHeight - 180;
        return {
          x: Math.min(Math.max(16, nextX), maxX),
          y: Math.min(Math.max(16, nextY), maxY),
        };
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragOffset.x, dragOffset.y, isDragging]);

  const contextValue = useMemo(
    () => ({ debugEnabled: DEBUG_MODE, addMessage, clearMessages }),
    [addMessage, clearMessages]
  );

  return (
    <DebugContext.Provider value={contextValue}>
      {children}
      {DEBUG_MODE && messages.length > 0 && (
        <div
          className="fixed w-96 max-h-96 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 overflow-hidden z-[9999]"
          style={{ left: panelPosition.x, top: panelPosition.y }}
        >
          <div
            className={`flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onMouseDown={handleDragStart}
          >
            <strong className="text-sm">Debug Mode</strong>
            <button
              onClick={clearMessages}
              className="text-xs text-slate-300 hover:text-white transition-colors"
            >
              Limpar
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800 custom-scrollbar">
            {messages.map((message) => (
              <div key={message.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-xs mb-1 text-slate-400">
                  <span className="uppercase tracking-wide">
                    {message.level === 'error'
                      ? 'Erro'
                      : message.level === 'success'
                      ? 'Sucesso'
                      : 'Info'}
                  </span>
                  <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-white">{message.message}</p>
                {message.details && (
                  <pre className="mt-2 bg-slate-800/70 text-xs p-2 rounded-lg whitespace-pre-wrap text-slate-300">
                    {message.details}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </DebugContext.Provider>
  );
};

export const useDebugNotifications = () => useContext(DebugContext);
