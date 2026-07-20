const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  register: (email: string, password: string) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getProfile: () => request('/auth/profile'),

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
