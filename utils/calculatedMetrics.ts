import { CalculatedMetric } from '../types';

export const CALCULATED_METRIC_PREFIX = 'calc:';

const PLACEHOLDER_REGEX = /{{\s*([^}]+?)\s*}}/g;

export const extractMetricDependencies = (formula: string): string[] => {
  const deps = new Set<string>();
  const normalized = formula ?? '';
  Array.from(normalized.matchAll(PLACEHOLDER_REGEX)).forEach((match) => {
    const key = match[1]?.trim();
    if (key) {
      deps.add(key);
    }
  });
  return Array.from(deps);
};

export const isCalculatedMetricValue = (value?: string | null): value is string => {
  return Boolean(value && value.startsWith(CALCULATED_METRIC_PREFIX));
};

export const getCalculatedMetricKey = (value?: string | null): string | null => {
  if (!isCalculatedMetricValue(value ?? undefined)) return null;
  return value!.slice(CALCULATED_METRIC_PREFIX.length);
};

export const evaluateCalculatedMetric = (formula: string, context: Record<string, number>): number => {
  if (!formula) return 0;
  let injected = formula.replace(PLACEHOLDER_REGEX, (_, name) => {
    const key = name?.trim() ?? '';
    const numeric = Number(context[key] ?? 0);
    return Number.isFinite(numeric) ? numeric.toString() : '0';
  });

  const sanitized = injected.replace(/[^0-9+\-*/().%\s]/g, '');
  if (sanitized.trim() === '') {
    return 0;
  }

  try {
    const result = Function(`"use strict"; return (${sanitized});`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return result;
    }
    return 0;
  } catch {
    return 0;
  }
};

export const metricMatchesColumns = (
  metric: CalculatedMetric,
  availableColumns: { name: string }[]
): boolean => {
  const deps = extractMetricDependencies(metric.formula);
  if (deps.length === 0) return false;
  const names = availableColumns.map((c) => c.name.toLowerCase());
  return deps.every((dep) => names.includes(dep.toLowerCase()));
};
