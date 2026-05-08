import React, { useEffect, useMemo, useState } from 'react';
import { Database, X, Save } from 'lucide-react';
import { ColumnPayload, listColumnsForDataSourceTable, listTablesForDataSource, updateColumnsForDataSourceTable } from '../services/dataSourcesService';

const ROLE_OPTIONS = [
  { value: 'dimension', label: 'Dimensão' },
  { value: 'metric', label: 'Métrica' },
];

const SEMANTIC_OPTIONS = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Percentual' },
  { value: 'date', label: 'Data' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'id', label: 'Identificador' },
  { value: 'other', label: 'Outro' },
];

const isNumericType = (type?: string) => {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return ['int', 'integer', 'float', 'double', 'decimal', 'numeric', 'number'].some((key) => normalized.includes(key));
};

const isDateType = (type?: string) => {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return ['date', 'datetime', 'timestamp'].some((key) => normalized.includes(key));
};

type SchemaRow = ColumnPayload & { role: string; semantic_type: string };

interface DataSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataSourceId: string | null;
}

export const DataSchemaModal: React.FC<DataSchemaModalProps> = ({ isOpen, onClose, dataSourceId }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<SchemaRow[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !dataSourceId) return;
    setIsLoadingTables(true);
    setErrorMessage(null);
    listTablesForDataSource(dataSourceId)
      .then((list) => {
        setTables(list);
        setSelectedTable((prev) => prev || list[0] || '');
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar tabelas.');
        setTables([]);
      })
      .finally(() => setIsLoadingTables(false));
  }, [isOpen, dataSourceId]);

  useEffect(() => {
    if (!isOpen || !dataSourceId || !selectedTable) return;
    setIsLoadingColumns(true);
    setErrorMessage(null);
    listColumnsForDataSourceTable(dataSourceId, selectedTable)
      .then((list) => {
        const normalized = list.map((column) => {
          const role = column.role ?? (isNumericType(column.type) ? 'metric' : 'dimension');
          const semanticType = column.semantic_type ?? (isDateType(column.type) ? 'date' : isNumericType(column.type) ? 'number' : 'text');
          return {
            ...column,
            role,
            semantic_type: semanticType,
          };
        });
        setColumns(normalized);
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar colunas.');
        setColumns([]);
      })
      .finally(() => setIsLoadingColumns(false));
  }, [isOpen, dataSourceId, selectedTable]);

  const handleColumnChange = (index: number, patch: Partial<SchemaRow>) => {
    setColumns((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const handleSave = async () => {
    if (!dataSourceId || !selectedTable) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateColumnsForDataSourceTable(
        dataSourceId,
        selectedTable,
        columns.map((column) => ({
          name: column.name,
          role: column.role,
          semantic_type: column.semantic_type,
        }))
      );
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao salvar configuração.');
    } finally {
      setIsSaving(false);
    }
  };

  const ready = Boolean(dataSourceId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm">
      <div className="absolute left-1/2 top-1/2 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF0FF] text-[#5B4DFF]">
              <Database size={18} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Gerenciar dados</h3>
              <p className="text-xs text-gray-500">Defina o papel e o tipo semântico de cada coluna.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!ready && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Selecione uma fonte de dados no topo do dashboard para gerenciar as colunas.
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 uppercase">Tabela</label>
            <select
              value={selectedTable}
              onChange={(event) => setSelectedTable(event.target.value)}
              disabled={!ready || isLoadingTables}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              {tables.length === 0 && <option value="">Nenhuma tabela</option>}
              {tables.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-gray-100">
            <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr_0.6fr] gap-2 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
              <span>Coluna</span>
              <span>Tipo</span>
              <span>Papel</span>
              <span>Semântico</span>
            </div>
            {isLoadingColumns ? (
              <div className="p-6 text-sm text-gray-500">Carregando colunas...</div>
            ) : columns.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">Nenhuma coluna encontrada.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {columns.map((column, index) => (
                  <div key={column.name} className="grid grid-cols-[1.3fr_0.8fr_0.8fr_0.6fr] gap-2 px-4 py-3 text-sm">
                    <div className="font-medium text-gray-800">{column.name}</div>
                    <div className="text-xs text-gray-500">{column.type}</div>
                    <select
                      value={column.role}
                      onChange={(event) => handleColumnChange(index, { role: event.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={column.semantic_type}
                      onChange={(event) => handleColumnChange(index, { semantic_type: event.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                    >
                      {SEMANTIC_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!ready || !selectedTable || isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5B4DFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={16} />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};
