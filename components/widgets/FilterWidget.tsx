import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Widget, GlobalFilterState } from '../../types';
import { Filter as FilterIcon } from 'lucide-react';
import { useWidgetDebug } from '../../hooks/useWidgetDebug';
import { useDimensionOptions } from '../../hooks/useDimensionOptions';

interface FilterWidgetProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  onDimensionFilterChange?: (dimension: string, value: string) => void;
  shareSlug?: string;
}

export const FilterWidget: React.FC<FilterWidgetProps> = ({
  widget,
  globalFilter,
  onDimensionFilterChange,
  shareSlug,
}) => {
  const dimension = widget.dataConfig?.dimension || '';
  const readyForData =
    Boolean(widget.dataConfig?.sourceId) && Boolean(widget.dataConfig?.tableName) && Boolean(dimension);

  const dimensionFilter =
    globalFilter.dimensionFilter && globalFilter.dimensionFilter.dimension !== dimension
      ? globalFilter.dimensionFilter
      : undefined;

  const { options, isLoading, error } = useDimensionOptions({
    enabled: readyForData,
    sourceId: widget.dataConfig?.sourceId,
    table: widget.dataConfig?.tableName,
    dimension,
    dateRange: globalFilter.dateRange,
    dateColumn: widget.dataConfig?.dateColumn ?? 'Data',
    shareSlug,
    dimensionFilter,
  });

  useWidgetDebug({
    widgetId: widget.id,
    type: widget.type,
    sourceId: widget.dataConfig?.sourceId,
    tableName: widget.dataConfig?.tableName,
    dimension,
    metric: dimension,
    rows: options.length,
    status: readyForData
      ? isLoading
        ? 'loading'
        : error
        ? 'error'
        : options.length > 0
        ? 'rendered'
        : 'empty'
      : 'missing_config',
    reason: error ?? undefined,
  });

  if (!readyForData) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-red-500 bg-red-50 rounded-xl border border-dashed border-red-200">
        <p>Configure uma dimensão para este filtro.</p>
        <p className="text-xs text-red-400 mt-1">Verifique a fonte, tabela e coluna.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p>Carregando dados…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-red-500 bg-red-50 rounded-xl border border-dashed border-red-200">
        <p>Erro ao carregar dados.</p>
        <p className="text-xs text-red-400 mt-1">{error}</p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <p>Nenhum dado encontrado para este filtro.</p>
        <p className="text-xs text-gray-400 mt-1">Ajuste o período ou selecione outra dimensão.</p>
      </div>
    );
  }

  return (
    <FilterWidgetContent
      widget={widget}
      globalFilter={globalFilter}
      onDimensionFilterChange={onDimensionFilterChange}
      options={options}
    />
  );
};

interface FilterWidgetContentProps {
  widget: Widget;
  globalFilter: GlobalFilterState;
  onDimensionFilterChange?: (dimension: string, value: string) => void;
  options: string[];
}

const FilterWidgetContent: React.FC<FilterWidgetContentProps> = ({
  widget,
  globalFilter,
  onDimensionFilterChange,
  options,
}) => {
  const filterDimension = widget.dataConfig?.dimension || 'dimension';
  const activeFilter =
    globalFilter.dimensionFilter && globalFilter.dimensionFilter.dimension === filterDimension
      ? globalFilter.dimensionFilter
      : undefined;
  const isMulti = widget.dataConfig?.multiSelectFilter ?? false;
  const selected = activeFilter?.value ?? 'all';
  const selectedValues = selected === 'all' ? [] : selected.split('|').filter(Boolean);
  const normalizedOptions = useMemo(
    () => options.filter((option) => option && option.trim() !== ''),
    [options]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const filteredOptions = useMemo(() => {
    if (!search.trim()) {
      return normalizedOptions;
    }
    const term = search.toLowerCase();
    return normalizedOptions.filter((option) => option.toLowerCase().includes(term));
  }, [normalizedOptions, search]);

  const updatePanelPosition = () => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPanelRect({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePanelPosition();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEvents = () => updatePanelPosition();
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('resize', handleEvents);
    window.addEventListener('scroll', handleEvents, true);
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('resize', handleEvents);
      window.removeEventListener('scroll', handleEvents, true);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  const applySelection = (values: string[]) => {
    const nextValue = values.length ? values.join('|') : 'all';
    onDimensionFilterChange?.(filterDimension, nextValue);
  };

  const handleSingleSelect = (value: string) => {
    setIsOpen(false);
    applySelection(value === 'all' ? [] : [value]);
  };

  const toggleMultiValue = (value: string) => {
    const exists = selectedValues.includes(value);
    const updated = exists ? selectedValues.filter((item) => item !== value) : [...selectedValues, value];
    applySelection(updated);
  };

  const clearSelection = () => {
    if (!selectedValues.length) return;
    applySelection([]);
  };

  const truncateValue = (value: string) => (value.length > 32 ? `${value.slice(0, 29)}…` : value);

  const summaryText = (() => {
    if (!selectedValues.length) return 'Todos';
    if (selectedValues.length <= 2) {
      return selectedValues.map(truncateValue).join(', ');
    }
    return `${selectedValues.length} selecionados`;
  })();

  return (
    <div className="w-full h-full flex flex-col justify-center p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#EEF2FF] text-[#5B4DFF] flex items-center justify-center shadow-sm">
          <FilterIcon size={18} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">{widget.title || 'Novo filtro'}</p>
          <div className="mt-2">
            <button
              type="button"
              ref={anchorRef}
              className="w-full flex items-center gap-3 text-sm text-slate-800 font-semibold bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-[#5B4DFF]/20 focus:border-[#5B4DFF] h-11 px-4 min-w-0"
              onClick={() => setIsOpen((prev) => !prev)}
            >
              <span className="flex-1 text-left truncate">{summaryText}</span>
              <svg
                className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="#1E293B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {isOpen &&
              ReactDOM.createPortal(
                <>
                  <div className="fixed inset-0 z-40" onMouseDown={() => setIsOpen(false)} aria-hidden="true" />
                  <div
                    className="absolute z-50 bg-white rounded-2xl border border-slate-100 shadow-2xl p-3"
                    style={{
                      top: panelRect.top,
                      left: panelRect.left,
                      width: panelRect.width || (anchorRef.current?.offsetWidth ?? 280),
                    }}
                  >
                    <div className="flex items-center bg-slate-100 rounded-xl px-3 mb-3">
                      <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M9.583 15C12.6986 15 15.2083 12.4903 15.2083 9.37499C15.2083 6.25968 12.6986 3.74999 9.583 3.74999C6.46769 3.74999 3.95801 6.25968 3.95801 9.37499C3.95801 12.4903 6.46769 15 9.583 15Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M16.0415 16.0417L13.7085 13.7084"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 py-2 focus:outline-none"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    {!isMulti && (
                      <button
                        type="button"
                        onClick={() => handleSingleSelect('all')}
                        className={`w-full text-left text-sm px-3 py-2 rounded-lg ${
                          selected === 'all' ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        Todos
                      </button>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredOptions.map((option) => {
                        const checked = isMulti ? selectedValues.includes(option) : selected === option;
                        return (
                          <label
                            key={option}
                            className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg cursor-pointer ${
                              checked ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type={isMulti ? 'checkbox' : 'radio'}
                              checked={checked}
                              onChange={() => (isMulti ? toggleMultiValue(option) : handleSingleSelect(option))}
                              className="form-checkbox h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="flex-1 truncate">{option}</span>
                          </label>
                        );
                      })}

                      {filteredOptions.length === 0 && (
                        <p className="text-sm text-slate-400 px-3 py-2">Nada encontrado</p>
                      )}
                    </div>

                    {isMulti && (
                      <div className="flex items-center justify-between mt-3">
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Limpar seleção
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsOpen(false)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Fechar
                        </button>
                      </div>
                    )}
                  </div>
                </>,
                document.body
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
