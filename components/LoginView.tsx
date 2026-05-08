import React, { useState } from 'react';
import { useAuth } from './AuthProvider';

interface LoginViewProps {
  toolName?: string;
  logoUrl?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ toolName = 'Project Lara', logoUrl }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao autenticar.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0f172a] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-[#5B4DFF]/10 overflow-hidden flex items-center justify-center">
              {logoUrl ? <img src={logoUrl} alt={toolName} className="w-full h-full object-contain" /> : <span className="text-[#5B4DFF] font-bold">PL</span>}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{toolName}</h1>
          </div>
          <p className="text-sm text-gray-500">Faça login para continuar construindo dashboards.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-[#5B4DFF] focus:ring-2 focus:ring-[#5B4DFF]/20 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-[#5B4DFF] focus:ring-2 focus:ring-[#5B4DFF]/20 outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 rounded-2xl font-semibold text-white transition-colors ${
              isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#5B4DFF] hover:bg-[#4b3ae6]'
            }`}
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};
