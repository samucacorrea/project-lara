import React from 'react';
import { DateFilterPreset, GlobalFilterState } from '../types';

interface PresetOption {
  key: DateFilterPreset;
  label: string;
}

interface GlobalDateFilterBarProps {
  presets: PresetOption[];
  value: GlobalFilterState;
  onPresetChange: (preset: DateFilterPreset) => void;
  onCustomDateChange: (field: 'start' | 'end', value: string) => void;
  onClearDimensionFilter?: () => void;
}

export const GlobalDateFilterBar: React.FC<GlobalDateFilterBarProps> = ({
  presets,
  value,
  onPresetChange,
  onCustomDateChange,
  onClearDimensionFilter,
}) => {
  const hasActiveDimension =
    value.dimensionFilter &&
    value.dimensionFilter.value &&
    value.dimensionFilter.value !== 'all';

  return (
    <div className="px-8 pb-4 bg-[#F3F4F8]">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col md:flex-row gap-4 p-4 items-center">
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

        {hasActiveDimension && (
          <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full">
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
