export type NumberFormatKind = 'number' | 'decimal' | 'currency' | 'percent';

export interface NumberFormatConfig {
  format?: NumberFormatKind;
  decimalPlaces?: number;
  currencySymbol?: string;
}

const clampDecimals = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.min(Math.max(0, Math.round(value)), 6);
};

const ensureNumber = (value: number): number => {
  if (Number.isFinite(value)) return value;
  const fallback = Number(value);
  return Number.isFinite(fallback) ? fallback : 0;
};

export const formatMetricValue = (value: number, config?: NumberFormatConfig) => {
  const safeValue = ensureNumber(value);
  const format = config?.format ?? 'number';
  const decimals = clampDecimals(config?.decimalPlaces);
  const currencySymbol = config?.currencySymbol || 'R$';

  switch (format) {
    case 'currency':
      return `${currencySymbol}\u00a0${safeValue.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals ?? 2,
        maximumFractionDigits: decimals ?? 2,
      })}`;
    case 'percent':
      return `${safeValue.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals ?? 1,
        maximumFractionDigits: decimals ?? 1,
      })}%`;
    case 'decimal':
      return safeValue.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals ?? 2,
        maximumFractionDigits: decimals ?? 2,
      });
    case 'number':
    default:
      return safeValue.toLocaleString('pt-BR', {
        maximumFractionDigits: decimals ?? 0,
      });
  }
};
