import React from 'react';
import { ComparisonMode, DateFilterPreset, GlobalFilterState } from '../types';

interface PresetOption {
  key: DateFilterPreset;
  label: string;
}

interface GlobalDateFilterBarProps {
  presets: PresetOption[];
  value: GlobalFilterState;
  onPresetChange: (preset: DateFilterPreset) => void;
  onCustomDateChange: (field: 'start' | 'end', value: string) => void;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  onComparisonCustomDateChange: (field: 'start' | 'end', value: string) => void;
  onClearDimensionFilter?: () => void;
}

export const GlobalDateFilterBar: React.FC<GlobalDateFilterBarProps> = ({
  presets,
  value,
  onPresetChange,
  onCustomDateChange,
  onComparisonModeChange,
  onComparisonCustomDateChange,
  onClearDimensionFilter,
}) => {
  const hasActiveDimension =
    value.dimensionFilter &&
    value.dimensionFilter.value &&
    value.dimensionFilter.value !== 'all';

  const comparisonMode = value.comparison?.enabled ? value.comparison.mode : 'off';
  const comparisonRange = value.comparison?.customRange;

  return (
    <div className="px-8 pb-4 bg-[#F3F4F8]">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col gap-4 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex items-center gap-3 flex-1 w-full">
            <div className="text-sm font-semibold text-gray-600 whitespace-nowrap">Período:</div>
            <div className="flex gap-2 flex-wrap">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => onPresetChange(preset.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    value.preset === preset.key
                      ? 'bg-[#5B4DFF] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {value.preset === 'custom' && (
            <div className="flex items-center gap-3 w-full md:w-auto">
              <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
              <input
                type="date"
                value={value.dateRange.start}
                onChange={(event) => onCustomDateChange('start', event.target.value)}
                className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none"
              />
              <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
              <input
                type="date"
                value={value.dateRange.end}
                onChange={(event) => onCustomDateChange('end', event.target.value)}
                className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none"
              />
            </div>
          )}

          {value.preset !== 'custom' && (
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {new Date(value.dateRange.start).toLocaleDateString('pt-BR')} -{' '}
              {new Date(value.dateRange.end).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="text-sm font-semibold text-gray-600 whitespace-nowrap">Comparação:</div>
          <div className="flex flex-col md:flex-row gap-3 md:items-center flex-1">
            <select
              value={comparisonMode}
              onChange={(event) => onComparisonModeChange(event.target.value as ComparisonMode)}
              className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none md:min-w-[240px]"
            >
              <option value="off">Sem comparação</option>
              <option value="previous_period">Período anterior</option>
              <option value="previous_year">Mesmo período no ano anterior</option>
              <option value="custom">Período personalizado</option>
            </select>

            {comparisonMode === 'custom' && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
                <input
                  type="date"
                  value={comparisonRange?.start ?? ''}
                  onChange={(event) => onComparisonCustomDateChange('start', event.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none"
                />
                <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
                <input
                  type="date"
                  value={comparisonRange?.end ?? ''}
                  onChange={(event) => onComparisonCustomDateChange('end', event.target.value)}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:border-[#5B4DFF] outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {hasActiveDimension && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full self-start">
            <span className="font-semibold">Filtro ativo:</span>
            <span className="font-medium">
              {value.dimensionFilter?.dimension}: {value.dimensionFilter?.value}
            </span>
            {onClearDimensionFilter && (
              <button
                onClick={onClearDimensionFilter}
                className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-white border border-amber-200 text-amber-700 hover:bg-amber-100"
              >
                Limpar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
