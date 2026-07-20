'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface Source {
  pageNumber: number;
  excerpt: string;
  score: number;
}

interface MessageBubbleProps {
  role: string;
  content: string;
  sources?: Source[];
  timestamp: string;
}

export default function MessageBubble({ role, content, sources, timestamp }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{content}</p>
        ) : (
          <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {!isUser && sources && sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Sources</p>
            <div className="space-y-2">
              {sources.map((source, i) => (
                <div
                  key={i}
                  className="bg-gray-50 rounded-lg px-3 py-2 text-xs"
                >
                  <span className="font-medium text-primary-600">
                    Page {source.pageNumber}
                  </span>
                  <p className="text-gray-600 mt-1 line-clamp-2">
                    {source.excerpt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p
          className={`text-xs mt-2 ${
            isUser ? 'text-primary-200' : 'text-gray-400'
          }`}
        >
          {new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
