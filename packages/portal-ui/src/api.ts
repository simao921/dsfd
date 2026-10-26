export type PortalRole = 'admin' | 'client' | 'worker';

export type PortalUser = {
  id: string;
  role: PortalRole;
  username: string;
  full_name: string;
  enabled: boolean;
  password_change_required: boolean;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/+$/, '');

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_ORIGIN}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(typeof payload?.error === 'string' ? payload.error : 'Não foi possível concluir a operação.', response.status);
  }
  return payload as T;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}
