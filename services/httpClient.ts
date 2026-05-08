const RAW_API_BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080';
const API_BASE =
  typeof window === 'undefined'
    ? RAW_API_BASE
    : (() => {
        try {
          const configured = new URL(RAW_API_BASE, window.location.origin);
          const isLocalHostConfigured = ['localhost', '127.0.0.1'].includes(configured.hostname);
          const isRunningRemotely = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

          if (isLocalHostConfigured && isRunningRemotely) {
            configured.hostname = window.location.hostname;
          }

          if (!configured.port) {
            configured.port = configured.protocol === 'https:' ? '443' : '80';
          }

          return configured.toString().replace(/\/$/, '');
        } catch {
          return RAW_API_BASE.replace(/\/$/, '');
        }
      })();
const DEBUG_MODE = (import.meta.env.VITE_DEBUG_MODE ?? 'false') === 'true';

type HttpOptions = RequestInit & { label?: string };

let authToken: string | null = null;

export function setHttpAuthToken(token: string | null) {
  authToken = token;
}

export async function httpRequest<T>(path: string, options?: HttpOptions): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, '')}${path}`;
  const start = performance.now();

  if (DEBUG_MODE) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[HTTP] ${options?.method ?? 'GET'} ${options?.label ?? path}`);
    // eslint-disable-next-line no-console
    console.log('URL:', url);
    if (options?.body) {
      try {
        // eslint-disable-next-line no-console
        console.log('Payload:', JSON.parse(options.body as string));
      } catch {
        // eslint-disable-next-line no-console
        console.log('Payload (raw):', options.body);
      }
    }
    console.groupEnd();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value as string;
      });
    } else {
      Object.assign(headers, options.headers as Record<string, string>);
    }
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (DEBUG_MODE) {
    const duration = (performance.now() - start).toFixed(1);
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[HTTP] Response ${options?.method ?? 'GET'} ${options?.label ?? path} (${duration}ms)`);
    // eslint-disable-next-line no-console
    console.log('Status:', response.status);
    // eslint-disable-next-line no-console
    console.log('Body:', payload);
    console.groupEnd();
  }

  if (!response.ok) {
    const errorMessage = payload?.message ?? 'Erro ao comunicar com o backend.';
    throw Object.assign(new Error(errorMessage), { details: payload });
  }

  return payload as T;
}

export async function httpUpload<T>(path: string, formData: FormData, options?: Omit<HttpOptions, 'body'>): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, '')}${path}`;

  const headers: Record<string, string> = {};
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value as string;
      });
    } else {
      Object.assign(headers, options.headers as Record<string, string>);
    }
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    method: options?.method ?? 'POST',
    headers,
    body: formData,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage = payload?.message ?? 'Erro ao comunicar com o backend.';
    throw Object.assign(new Error(errorMessage), { details: payload });
  }

  return payload as T;
}
