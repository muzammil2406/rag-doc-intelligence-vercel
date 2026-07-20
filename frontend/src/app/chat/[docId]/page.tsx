'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import ChatInterface from '@/components/ChatInterface';

interface Document {
  id: string;
  filename: string;
  status: string;
}

export default function ChatPage() {
  const params = useParams();
  const docId = params.docId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    const fetchDocument = async () => {
      try {
        const doc = await api.getDocument(docId);
        setDocument(doc);
        if (doc.status !== 'ready') {
          setError('Document is still processing. Please wait...');
          const poll = setInterval(async () => {
            try {
              const updated = await api.getDocument(docId);
              if (updated.status === 'ready') {
                setDocument(updated);
                setError('');
                clearInterval(poll);
              } else if (updated.status === 'error') {
                setError('Document processing failed.');
                clearInterval(poll);
              }
            } catch {
              clearInterval(poll);
            }
          }, 2000);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [docId, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">
                {document?.filename || 'Document'}
              </h1>
              <p className="text-xs text-gray-500">Chat with your document</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              Ready
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <ChatInterface documentId={docId} documentName={document?.filename || 'document'} />
      </div>
    </div>
  );
}
