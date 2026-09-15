const PROXY_BASE = '/api/proxy';

const REQUEST_TIMEOUT_MS = 30000;

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  headers['Accept'] = 'application/json';
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be starting up — please try again in a moment.');
    }
    throw new Error('Cannot reach the server. Please try again later.');
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/auth';
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/documents/upload', { method: 'POST', body: formData });
  },

  getDocuments: () => request('/documents'),

  getDocument: (id: string) => request(`/documents/${id}`),

  deleteDocument: (id: string) =>
    request(`/documents/${id}`, { method: 'DELETE' }),

  queryDocument: (question: string, documentId: string) =>
    request('/query', {
      method: 'POST',
      body: JSON.stringify({ question, documentId }),
    }),

  getChatHistory: (documentId: string) =>
    request(`/query/${documentId}/history`),
};

export const auth = {
  login: async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? 'Login failed.');
    return data;
  },

  register: async (email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? 'Registration failed.');
    return data;
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
  },

  me: async () => {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.user ?? null;
  },
};