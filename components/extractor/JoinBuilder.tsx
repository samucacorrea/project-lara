import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listColumnsForDataSourceTable, listTablesForDataSource } from '../../services/dataSourcesService';
import { DataSource, JoinConfig, JoinType } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

type JoinBuilderProps = {
  dataSources: DataSource[];
  activeDataSourceId?: string | null;
  joinConfig: JoinConfig;
  onChange: (next: JoinConfig) => void;
};

type ColumnOption = { name: string; type: string };

type TableState = {
  name: string;
  alias?: string;
  date_column?: string;
};

type JoinState = {
  left_table: string;
  left_column: string;
  right_table: string;
  right_column: string;
  type: JoinType;
};

const emptyJoin: JoinState = {
  left_table: '',
  left_column: '',
  right_table: '',
  right_column: '',
  type: 'left',
};

const normalizeConfig = (config: JoinConfig): JoinConfig => ({
  primary_table: config.primary_table,
  tables: Array.isArray(config.tables) ? config.tables : [],
  joins: Array.isArray(config.joins)
    ? config.joins.map((join) => ({
        left_table: join.left_table ?? '',
        left_column: join.left_column ?? '',
        right_table: join.right_table ?? '',
        right_column: join.right_column ?? '',
        type: join.type ?? 'left',
      }))
    : [],
});

export const JoinBuilder: React.FC<JoinBuilderProps> = ({
  dataSources,
  activeDataSourceId,
  joinConfig,
  onChange,
}) => {
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [columnsByTable, setColumnsByTable] = useState<Record<string, ColumnOption[]>>({});
  const [loadingTables, setLoadingTables] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);

  const normalizedConfig = useMemo(() => normalizeConfig(joinConfig), [joinConfig]);

  const activeSource = useMemo(
    () => dataSources.find((source) => source.id === String(activeDataSourceId)),
    [dataSources, activeDataSourceId]
  );

  const refreshTables = useCallback(async () => {
    if (!activeDataSourceId) {
      setAvailableTables([]);
      return;
    }
    setLoadingTables(true);
    setTablesError(null);
    try {
      const tables = await listTablesForDataSource(String(activeDataSourceId));
      setAvailableTables(tables);
    } catch (error) {
      console.error(error);
      setTablesError('Não foi possível carregar as tabelas da fonte selecionada.');
      setAvailableTables([]);
    } finally {
      setLoadingTables(false);
    }
  }, [activeDataSourceId]);

  const ensureColumns = useCallback(
    async (tableName: string) => {
      if (!activeDataSourceId || !tableName || columnsByTable[tableName]) return;
      try {
        const columns = await listColumnsForDataSourceTable(String(activeDataSourceId), tableName);
        setColumnsByTable((prev) => ({ ...prev, [tableName]: columns }));
      } catch (error) {
        console.error(error);
        setColumnsByTable((prev) => ({ ...prev, [tableName]: [] }));
      }
    },
    [activeDataSourceId, columnsByTable]
  );

  useEffect(() => {
    void refreshTables();
  }, [refreshTables]);

  useEffect(() => {
    normalizedConfig.tables.forEach((table) => {
      void ensureColumns(table.name);
    });
  }, [normalizedConfig.tables, ensureColumns]);

  const selectedTables = normalizedConfig.tables.map((table) => table.name);
  const selectableTables = availableTables.filter((table) => !selectedTables.includes(table));

  const updateTables = (nextTables: TableState[]) => {
    onChange({
      ...normalizedConfig,
      tables: nextTables,
    });
  };

  const updateJoins = (nextJoins: JoinState[]) => {
    onChange({
      ...normalizedConfig,
      joins: nextJoins,
    });
  };

  const handleAddTable = (tableName: string) => {
    if (!tableName) return;
    const nextTables = [...normalizedConfig.tables, { name: tableName }];
    updateTables(nextTables);
    void ensureColumns(tableName);
    if (!normalizedConfig.primary_table) {
      onChange({
        ...normalizedConfig,
        primary_table: tableName,
        tables: nextTables,
      });
    }
  };

  const handleRemoveTable = (index: number) => {
    const nextTables = normalizedConfig.tables.filter((_, idx) => idx !== index);
    const removed = normalizedConfig.tables[index];
    const nextJoins = normalizedConfig.joins.filter(
      (join) => join.left_table !== removed?.name && join.right_table !== removed?.name
    );
    const nextPrimary = normalizedConfig.primary_table === removed?.name ? undefined : normalizedConfig.primary_table;
    onChange({
      ...normalizedConfig,
      tables: nextTables,
      joins: nextJoins,
      primary_table: nextPrimary,
    });
  };

  const handleJoinChange = (index: number, patch: Partial<JoinState>) => {
    const nextJoins = normalizedConfig.joins.map((join, idx) =>
      idx === index ? { ...join, ...patch } : join
    );
    updateJoins(nextJoins);
  };

  const handleAddJoin = () => {
    updateJoins([...normalizedConfig.joins, { ...emptyJoin }]);
  };

  const joinTableOptions = normalizedConfig.tables.map((table) => table.name);

  return (
    <div className="min-h-screen px-8 py-10">
      <div className="max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#5B4DFF]">Construtor</p>
            <h1 className="text-2xl font-semibold text-gray-900">Modelagem de dados</h1>
            <p className="text-sm text-gray-500 mt-1">
              Conecte tabelas diferentes criando uma chave principal para cruzar métricas e dimensões.
            </p>
          </div>
        </div>

        <div className="mt-6 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Fonte ativa</p>
              <p className="text-xs text-gray-500">
                {activeSource ? `${activeSource.name} (${activeSource.type})` : 'Selecione uma fonte no topo do dashboard.'}
              </p>
            </div>
            <button
              className="text-sm text-[#5B4DFF] font-medium"
              onClick={refreshTables}
              disabled={!activeDataSourceId || loadingTables}
            >
              Recarregar tabelas
            </button>
          </div>

          {tablesError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {tablesError}
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
              value=""
              onChange={(event) => handleAddTable(event.target.value)}
              disabled={!activeDataSourceId || loadingTables || selectableTables.length === 0}
            >
              <option value="">Adicionar tabela...</option>
              {selectableTables.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
            <button
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500"
              disabled
            >
              {loadingTables ? 'Carregando...' : `${availableTables.length} tabelas`}
            </button>
          </div>

          {normalizedConfig.tables.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Tabelas selecionadas</p>
                <select
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={normalizedConfig.primary_table ?? ''}
                  onChange={(event) =>
                    onChange({
                      ...normalizedConfig,
                      primary_table: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">Definir tabela principal</option>
                  {normalizedConfig.tables.map((table) => (
                    <option key={table.name} value={table.name}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </div>

              {normalizedConfig.tables.map((table, index) => {
                const columns = columnsByTable[table.name] ?? [];
                return (
                  <div
                    key={`${table.name}-${index}`}
                    className="rounded-2xl border border-gray-100 bg-[#F9FAFE] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{table.name}</p>
                        <p className="text-xs text-gray-500">Configuração específica da tabela.</p>
                      </div>
                      <button
                        className="text-sm text-red-500 flex items-center gap-2"
                        onClick={() => handleRemoveTable(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500">Alias (opcional)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                          value={table.alias ?? ''}
                          onChange={(event) => {
                            const nextTables = normalizedConfig.tables.map((item, idx) =>
                              idx === index ? { ...item, alias: event.target.value } : item
                            );
                            updateTables(nextTables);
                          }}
                          placeholder="Ex: vendas"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500">Coluna de data</label>
                        <select
                          className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                          value={table.date_column ?? ''}
                          onChange={(event) => {
                            const nextTables = normalizedConfig.tables.map((item, idx) =>
                              idx === index ? { ...item, date_column: event.target.value || undefined } : item
                            );
                            updateTables(nextTables);
                          }}
                        >
                          <option value="">Não usar filtro de data</option>
                          {columns.map((column) => (
                            <option key={column.name} value={column.name}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Relacionamentos</p>
              <p className="text-xs text-gray-500">
                Defina como as tabelas serão conectadas. Você pode deixar vazio se usar tabelas isoladas.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-[#5B4DFF] px-4 py-2 text-sm font-medium text-white"
              onClick={handleAddJoin}
              disabled={joinTableOptions.length < 2}
            >
              <Plus className="w-4 h-4" />
              Adicionar join
            </button>
          </div>

          {normalizedConfig.joins.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
              Nenhum join configurado. Selecione pelo menos duas tabelas para habilitar.
            </div>
          )}

          <div className="mt-4 space-y-4">
            {normalizedConfig.joins.map((join, index) => (
              <div
                key={`join-${index}`}
                className="rounded-2xl border border-gray-100 bg-[#F9FAFE] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Join {index + 1}</p>
                  <button
                    className="text-sm text-red-500"
                    onClick={() => updateJoins(normalizedConfig.joins.filter((_, idx) => idx !== index))}
                  >
                    Remover
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Tabela A</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={join.left_table}
                      onChange={(event) => {
                        const nextTable = event.target.value;
                        handleJoinChange(index, { left_table: nextTable, left_column: '' });
                        void ensureColumns(nextTable);
                      }}
                    >
                      <option value="">Selecione</option>
                      {joinTableOptions.map((table) => (
                        <option key={table} value={table}>
                          {table}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Coluna A</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={join.left_column}
                      onChange={(event) => handleJoinChange(index, { left_column: event.target.value })}
                      disabled={!join.left_table}
                    >
                      <option value="">Selecione</option>
                      {(columnsByTable[join.left_table] ?? []).map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Tipo</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={join.type}
                      onChange={(event) => handleJoinChange(index, { type: event.target.value as JoinType })}
                    >
                      <option value="left">Left join</option>
                      <option value="inner">Inner join</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Tabela B</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={join.right_table}
                      onChange={(event) => {
                        const nextTable = event.target.value;
                        handleJoinChange(index, { right_table: nextTable, right_column: '' });
                        void ensureColumns(nextTable);
                      }}
                    >
                      <option value="">Selecione</option>
                      {joinTableOptions.map((table) => (
                        <option key={table} value={table}>
                          {table}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Coluna B</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={join.right_column}
                      onChange={(event) => handleJoinChange(index, { right_column: event.target.value })}
                      disabled={!join.right_table}
                    >
                      <option value="">Selecione</option>
                      {(columnsByTable[join.right_table] ?? []).map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
