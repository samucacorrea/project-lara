import { DateRange, GlobalFilterState } from '../types';

const parseDate = (value: string) => new Date(`${value}T00:00:00`);

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const resolveComparisonDateRange = (globalFilter: GlobalFilterState): DateRange | null => {
  const comparison = globalFilter.comparison;
  if (!comparison?.enabled || comparison.mode === 'off') {
    return null;
  }

  const currentStart = parseDate(globalFilter.dateRange.start);
  const currentEnd = parseDate(globalFilter.dateRange.end);

  if (Number.isNaN(currentStart.getTime()) || Number.isNaN(currentEnd.getTime()) || currentEnd < currentStart) {
    return null;
  }

  if (comparison.mode === 'custom') {
    const customRange = comparison.customRange;
    if (!customRange?.start || !customRange?.end) {
      return null;
    }
    return customRange;
  }

  if (comparison.mode === 'previous_year') {
    const start = new Date(currentStart);
    const end = new Date(currentEnd);
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
    return {
      start: formatDate(start),
      end: formatDate(end),
    };
  }

  const diffMs = currentEnd.getTime() - currentStart.getTime();
  const days = Math.floor(diffMs / 86400000) + 1;
  const comparisonEnd = new Date(currentStart);
  comparisonEnd.setDate(comparisonEnd.getDate() - 1);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setDate(comparisonStart.getDate() - (days - 1));

  return {
    start: formatDate(comparisonStart),
    end: formatDate(comparisonEnd),
  };
};
