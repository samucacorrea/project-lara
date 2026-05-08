import React, { useMemo, useState } from 'react';
import { User } from '../types';
import { useAuth } from './AuthProvider';
import { uploadAvatar } from '../services/authService';

interface UserSettingsViewProps {
  onSaved?: (user: User) => void;
}

export const UserSettingsView: React.FC<UserSettingsViewProps> = ({ onSaved }) => {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSave = useMemo(() => {
    if (!user) return false;
    if (newPassword || confirmPassword || currentPassword) {
      return newPassword.length >= 6 && newPassword === confirmPassword && currentPassword.length > 0;
    }
    return true;
  }, [confirmPassword, currentPassword, newPassword, user]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingAvatar(true);
      setError(null);
      const response = await uploadAvatar(file);
      setAvatarUrl(response.avatar_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!canSave) {
      setError('Confira a senha e tente novamente.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Partial<User> & { current_password?: string; password?: string } = {
        name,
        email,
        phone: phone || null,
        avatar_url: avatarUrl || null,
      };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.password = newPassword;
      }
      const updated = await updateProfile(payload);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Perfil atualizado com sucesso.');
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900">Configurações do usuário</h1>
        <p className="text-sm text-gray-500 mt-1">Atualize seus dados pessoais e senha de acesso.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6 shadow-sm">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 text-sm">
                {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : 'Foto'}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Foto de perfil</label>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="text-sm" />
                {isUploadingAvatar && <p className="text-xs text-gray-500">Enviando foto...</p>}
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="Ou cole a URL da imagem"
                  className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Nome</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Telefone</label>
                <input
                  value={phone ?? ''}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 uppercase">Alterar senha</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Senha atual"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Nova senha (mín. 6)"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirmar senha"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}
          {success && <div className="text-sm text-green-600">{success}</div>}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={isSaving || !canSave}
              className="px-5 py-2.5 bg-[#5B4DFF] text-white rounded-xl shadow-sm hover:bg-[#4b3ae6] text-sm font-semibold disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
