import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CalculatedMetric, CalculatedMetricPayload } from '../types';
import {
  listCalculatedMetrics,
  createCalculatedMetric,
  updateCalculatedMetric,
  deleteCalculatedMetric,
} from '../services/calculatedMetricsService';

interface CalculatedMetricsContextValue {
  metrics: CalculatedMetric[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createMetric: (payload: CalculatedMetricPayload) => Promise<CalculatedMetric>;
  updateMetric: (id: number, payload: CalculatedMetricPayload) => Promise<CalculatedMetric>;
  deleteMetric: (id: number) => Promise<void>;
}

const CalculatedMetricsContext = createContext<CalculatedMetricsContextValue | undefined>(undefined);

export const CalculatedMetricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<CalculatedMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listCalculatedMetrics();
      setMetrics(list);
    } catch (error) {
      console.error('Erro ao carregar métricas calculadas', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createMetric = useCallback(async (payload: CalculatedMetricPayload) => {
    const created = await createCalculatedMetric(payload);
    setMetrics((prev) => [...prev, created]);
    return created;
  }, []);

  const updateMetricAction = useCallback(async (id: number, payload: CalculatedMetricPayload) => {
    const updated = await updateCalculatedMetric(id, payload);
    setMetrics((prev) => prev.map((metric) => (metric.id === id ? updated : metric)));
    return updated;
  }, []);

  const deleteMetricAction = useCallback(async (id: number) => {
    await deleteCalculatedMetric(id);
    setMetrics((prev) => prev.filter((metric) => metric.id !== id));
  }, []);

  const value = useMemo(
    () => ({ metrics, isLoading, refresh, createMetric, updateMetric: updateMetricAction, deleteMetric: deleteMetricAction }),
    [metrics, isLoading, refresh, createMetric, updateMetricAction, deleteMetricAction]
  );

  return <CalculatedMetricsContext.Provider value={value}>{children}</CalculatedMetricsContext.Provider>;
};

export const useCalculatedMetricsContext = () => {
  const ctx = useContext(CalculatedMetricsContext);
  if (!ctx) {
    throw new Error('useCalculatedMetricsContext deve ser usado dentro de CalculatedMetricsProvider');
  }
  return ctx;
};
