import React, { useMemo, useState } from 'react';
import { ColumnPayload } from '../services/dataSourcesService';
import { useCalculatedMetrics } from '../hooks/useCalculatedMetrics';
import { CalculatedMetricOutputFormat } from '../types';
import { extractMetricDependencies } from '../utils/calculatedMetrics';

interface CalculatedMetricManagerProps {
  availableColumns: ColumnPayload[];
}

const FORMAT_OPTIONS: { label: string; value: CalculatedMetricOutputFormat }[] = [
  { label: 'Número', value: 'number' },
  { label: 'Decimal', value: 'decimal' },
  { label: 'Percentual (%)', value: 'percent' },
  { label: 'Monetário (R$)', value: 'currency' },
];

export const CalculatedMetricManager: React.FC<CalculatedMetricManagerProps> = ({ availableColumns }) => {
  const { metrics, createMetric, deleteMetric } = useCalculatedMetrics();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [metricKey, setMetricKey] = useState('');
  const [formula, setFormula] = useState('');
  const [format, setFormat] = useState<CalculatedMetricOutputFormat>('number');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dependencies = useMemo(() => extractMetricDependencies(formula), [formula]);
  const normalizedColumns = useMemo(() => availableColumns.map((col) => col.name.toLowerCase()), [availableColumns]);
  const missingColumns = dependencies.filter((dep) => !normalizedColumns.includes(dep.toLowerCase()));

  const handleInsertColumn = (column: string) => {
    setFormula((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}{{${column}}}`);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !metricKey.trim() || !formula.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await createMetric({
        name: name.trim(),
        metricKey: metricKey.trim(),
        formula: formula.trim(),
        outputFormat: format,
      });
      setName('');
      setMetricKey('');
      setFormula('');
      setFormat('number');
      setIsOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar métrica.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Excluir esta métrica?')) return;
    try {
      await deleteMetric(id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao remover métrica.');
    }
  };

  return (
    <div className="p-4 border border-gray-200 rounded-2xl space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Métricas calculadas</p>
          <p className="text-[11px] text-gray-500">Disponíveis para todas as tabelas compatíveis.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:border-[#5B4DFF] hover:text-[#5B4DFF]"
        >
          {isOpen ? 'Fechar' : 'Nova métrica'}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#5B4DFF] outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Identificador</label>
              <input
                type="text"
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value)}
                placeholder="Ex: ctr_global"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#5B4DFF] outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Fórmula</label>
            <textarea
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Ex: ({{Cliques}} / {{Impressões}}) * 100"
              className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-sm font-mono focus:border-[#5B4DFF] outline-none"
              rows={4}
            />
              <p className="text-[11px] text-gray-500 mt-1">
                Utilize <code className="px-1 bg-gray-100 rounded">{'{{nome}}'}</code> para referenciar colunas. Clique nas colunas abaixo para inserir.
              </p>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Tipo de saída</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as CalculatedMetricOutputFormat)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#5B4DFF] outline-none"
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {availableColumns.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Colunas desta tabela</p>
              <div className="flex flex-wrap gap-2">
                {availableColumns.map((column) => (
                  <button
                    type="button"
                    key={column.name}
                    onClick={() => handleInsertColumn(column.name)}
                    className="text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-[#5B4DFF] hover:text-[#5B4DFF]"
                  >
                    {column.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-gray-500">Selecione uma tabela para visualizar as colunas disponíveis.</p>
          )}

          {dependencies.length > 0 && (
            <div className="text-[11px]">
              <p className="font-semibold text-gray-600 mb-1">Colunas detectadas:</p>
              <ul className="space-y-1">
                {dependencies.map((dep) => (
                  <li key={dep} className={missingColumns.includes(dep) ? 'text-red-500' : 'text-emerald-600'}>
                    {dep} {missingColumns.includes(dep) ? '(fora da tabela atual)' : '(disponível)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600"
              onClick={() => {
                setIsOpen(false);
                setName('');
                setMetricKey('');
                setFormula('');
                setFormat('number');
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#5B4DFF] text-white hover:bg-[#4c3ce6] disabled:opacity-60"
            >
              {isSaving ? 'Salvando...' : 'Salvar métrica'}
            </button>
          </div>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="border-t border-dashed border-gray-200 pt-3 mt-3 space-y-1">
          {metrics.map((metric) => (
            <div key={metric.id} className="flex items-center justify-between text-sm text-gray-600">
              <div>
                <p className="font-semibold text-slate-800">{metric.name}</p>
                <p className="text-[11px] text-gray-500">
                  {extractMetricDependencies(metric.formula)
                    .map((dep) => `{{${dep}}}`)
                    .join(', ')}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-red-500 hover:underline"
                onClick={() => handleDelete(metric.id)}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
