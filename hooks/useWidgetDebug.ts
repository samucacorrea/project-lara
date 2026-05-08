import { useEffect, useRef } from 'react';
import { useDebugNotifications } from '../components/DebugProvider';
import { httpRequest } from '../services/httpClient';

const DEBUG_MODE = (import.meta.env.VITE_DEBUG_MODE ?? 'false') === 'true';

interface WidgetDebugPayload {
  widgetId: string;
  type: string;
  sourceId?: string;
  tableName?: string;
  dimension?: string;
  metric?: string;
  metricY?: string;
  rows: number;
  status?: string;
  reason?: string;
}

export const useWidgetDebug = (payload: WidgetDebugPayload) => {
  const { addMessage } = useDebugNotifications();
  const previousSignature = useRef<string>('');

  useEffect(() => {
    if (!DEBUG_MODE) return;
    const signature = JSON.stringify(payload);
    if (previousSignature.current === signature) return;
    previousSignature.current = signature;

    const { widgetId, ...rest } = payload;
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[Widget] ${widgetId}`);
    // eslint-disable-next-line no-console
    console.table(rest);
    console.groupEnd();

    addMessage({
      level: 'info',
      message: `Widget ${payload.type}`,
      details: `Fonte: ${payload.tableName ?? 'n/d'} | Linhas: ${payload.rows}`,
    });
    httpRequest('/debug/logs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'widget',
        ...payload,
      }),
      label: 'WidgetLog',
    }).catch(() => {
      // swallow logging errors
    });
  }, [addMessage, payload]);
};
