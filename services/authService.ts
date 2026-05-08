import { httpRequest, httpUpload } from './httpClient';
import { User } from '../types';

interface LoginPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

export function login(payload: LoginPayload) {
  return httpRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'Login',
  });
}

export function fetchCurrentUser() {
  return httpRequest<User>('/auth/me', {
    method: 'GET',
    label: 'FetchCurrentUser',
  });
}

export function updateCurrentUser(payload: Partial<User> & { current_password?: string; password?: string }) {
  return httpRequest<User>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateCurrentUser',
  });
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  return httpUpload<{ avatar_url: string }>('/auth/me/avatar', form, {
    method: 'POST',
    label: 'UploadAvatar',
  });
}
