import React, { useEffect, useState } from 'react';
import { X, Globe2, Lock, Copy } from 'lucide-react';

interface SaveReportModalProps {
  isOpen: boolean;
  defaultName: string;
  defaultIsPublic: boolean;
  isSaving: boolean;
  shareUrl?: string | null;
  onCancel: () => void;
  onConfirm: (values: { name: string; isPublic: boolean }) => void;
}

export const SaveReportModal: React.FC<SaveReportModalProps> = ({
  isOpen,
  defaultName,
  defaultIsPublic,
  isSaving,
  shareUrl,
  onCancel,
  onConfirm,
}) => {
  const [name, setName] = useState(defaultName);
  const [isPublic, setIsPublic] = useState(defaultIsPublic);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(defaultName);
    setIsPublic(defaultIsPublic);
    setCopied(false);
  }, [defaultIsPublic, defaultName, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onConfirm({ name: name.trim(), isPublic });
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-white/60">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold">Guardar</p>
            <h2 className="text-xl font-bold text-gray-900">Salvar dashboard</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:border-gray-300 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-800">Nome do relatório</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Desempenho trimestral"
              className="w-full rounded-2xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition px-4 py-3 text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-800">Visibilidade</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 cursor-pointer transition ${
                  isPublic
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 text-indigo-600 font-semibold">
                  <Globe2 size={18} />
                  Público
                </div>
                <p className="text-xs text-gray-500">
                  Qualquer pessoa com o link pode visualizar este dashboard, mesmo sem login.
                </p>
                <input
                  type="radio"
                  className="sr-only"
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                />
              </label>

              <label
                className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 cursor-pointer transition ${
                  !isPublic
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 text-indigo-600 font-semibold">
                  <Lock size={18} />
                  Privado
                </div>
                <p className="text-xs text-gray-500">
                  Apenas usuários autenticados com permissão no seu e-mail podem visualizar.
                </p>
                <input
                  type="radio"
                  className="sr-only"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                />
              </label>
            </div>
          </div>

          {shareUrl ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-4 bg-gray-50/60">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 mb-2">
                Link atual
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 text-xs text-gray-700 break-all bg-white rounded-xl px-3 py-2 border border-gray-200">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
                >
                  <Copy size={16} />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto rounded-2xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 transition"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isSaving ? 'Guardando…' : 'Guardar dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
