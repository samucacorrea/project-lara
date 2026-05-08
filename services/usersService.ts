import { User } from '../types';
import { httpRequest } from './httpClient';

export async function listUsers() {
  return httpRequest<User[]>('/users', {
    method: 'GET',
    label: 'ListUsers',
  });
}

export async function createUser(payload: { name: string; email: string; password: string; role: User['role'] }) {
  return httpRequest<User>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
    label: 'CreateUser',
  });
}

export async function updateUser(id: number, payload: Partial<User> & { password?: string }) {
  return httpRequest<User>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    label: 'UpdateUser',
  });
}

export async function deleteUser(id: number) {
  await httpRequest<void>(`/users/${id}`, {
    method: 'DELETE',
    label: 'DeleteUser',
  });
}
