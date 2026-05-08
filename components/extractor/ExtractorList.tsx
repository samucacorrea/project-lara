import React, { useEffect, useState } from 'react';
import { Play, Trash2, RefreshCw } from 'lucide-react';
import { httpRequest } from '../../services/httpClient';

interface ExtractorConnector {
  id: number;
  name: string;
  provider: string;
  auth_type: string;
  status: string;
  target_table: string;
  last_synced_at?: string | null;
}

interface ExtractorJob {
  id: number;
  status: string;
  rows_processed: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export const ExtractorList: React.FC = () => {
  const [connectors, setConnectors] = useState<ExtractorConnector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [jobs, setJobs] = useState<Record<number, ExtractorJob[]>>({});
  const [errors, setErrors] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<number | null>(null);

  const loadConnectors = async () => {
    try {
      setIsLoading(true);
      const data = await httpRequest<ExtractorConnector[]>('/extractors', { method: 'GET' });
      setConnectors(data);
      setErrors(null);
    } catch (error) {
      setErrors(error instanceof Error ? error.message : 'Falha ao carregar extratores.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobs = async (connectorId: number) => {
    try {
      const history = await httpRequest<ExtractorJob[]>(`/extractors/${connectorId}/jobs`, { method: 'GET' });
      setJobs((prev) => ({ ...prev, [connectorId]: history }));
    } catch (error) {
      console.error(error);
    }
  };

  const runConnector = async (connectorId: number) => {
    try {
      setIsRunning(connectorId);
      await httpRequest(`/extractors/${connectorId}/run`, { method: 'POST' });
      await Promise.all([loadConnectors(), loadJobs(connectorId)]);
    } catch (error) {
      setErrors(error instanceof Error ? error.message : 'Falha ao executar extrator.');
    } finally {
      setIsRunning(null);
    }
  };

  useEffect(() => {
    loadConnectors();
  }, []);

  return (
    <div className="p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm font-semibold text-[#5B4DFF] uppercase tracking-[0.3em]">Estratégias de dados</p>
          <h1 className="text-4xl font-black text-slate-900">Extrator</h1>
          <p className="text-sm text-gray-500 mt-2">Conecte Google Ads, GA4, Clarity, Meta, TikTok e outras fontes para gerar tabelas no seu DW.</p>
        </div>
        <button
          onClick={loadConnectors}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:border-[#5B4DFF] hover:text-[#5B4DFF]"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {errors && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{errors}</div>
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">Carregando conectores...</div>
      ) : connectors.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-12 text-center text-gray-500">
          <p className="text-lg font-medium">Nenhum extrator configurado ainda.</p>
          <p className="text-sm mt-2">Use a API ou futura interface para cadastrar integrações.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {connectors.map((connector) => (
            <div key={connector.id} className="bg-white border border-gray-100 rounded-3xl shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.3em]">{connector.provider}</p>
                  <h2 className="text-xl font-semibold text-slate-900">{connector.name}</h2>
                  <p className="text-xs text-gray-400 mt-1">Tabela alvo: {connector.target_table}</p>
                  {connector.last_synced_at && (
                    <p className="text-xs text-gray-400">Última sincronização: {new Date(connector.last_synced_at).toLocaleString('pt-BR')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 text-xs font-bold rounded-full border ${connector.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                    {connector.status.toUpperCase()}
                  </span>
                  <button
                    onClick={() => runConnector(connector.id)}
                    disabled={isRunning === connector.id}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5B4DFF] text-white text-sm font-semibold shadow hover:bg-[#4b3ae6] disabled:opacity-60"
                  >
                    <Play size={16} /> {isRunning === connector.id ? 'Executando...' : 'Executar agora'}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-[0.3em] mb-2">Execuções recentes</p>
                <div className="space-y-2">
                  {(jobs[connector.id] ?? []).length === 0 ? (
                    <button
                      onClick={() => loadJobs(connector.id)}
                      className="text-xs text-[#5B4DFF] font-medium"
                    >
                      Carregar histórico
                    </button>
                  ) : (
                    (jobs[connector.id] ?? []).map((job) => (
                      <div key={job.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-4 py-2">
                        <div>
                          <p className="font-medium text-gray-800">Job #{job.id}</p>
                          <p className="text-xs text-gray-500">
                            {job.status === 'completed' && `${job.rows_processed} linhas`} {job.status === 'failed' && job.error_message}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          job.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-600'
                            : job.status === 'failed'
                            ? 'bg-red-50 text-red-500'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {job.status.toUpperCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
