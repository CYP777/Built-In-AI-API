import React, { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
}

function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    // Remove code block backticks
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers (#, ##, ...)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold and italic (**, *, __, _)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough (~~)
    .replace(/~~(.*?)~~/g, '$1')
    // Remove blockquote symbol (> )
    .replace(/^>\s+/gm, '')
    // Remove links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove horizontal lines
    .replace(/^([-*_]){3,}\s*$/gm, '')
    .trim();
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.sender === 'user';

  const handleCopy = () => {
    const plainText = stripMarkdown(message.text);
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex w-full gap-3 py-3 transition-opacity duration-300 min-w-0 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Bubble Container */}
      <div
        className={`group relative max-w-[85%] sm:max-w-[75%] min-w-0 rounded-2xl px-4 py-3 text-sm shadow-xs break-words [overflow-wrap:anywhere] ${
          isUser
            ? 'bg-emerald-600 text-white rounded-br-xs'
            : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-xs shadow-slate-100'
        }`}
      >
        {/* Message Text with Markdown */}
        {message.text && (
          <div className="space-y-1 min-w-0 max-w-full">
            <div
              className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${
                isUser ? 'text-white' : 'text-slate-800'
              }`}
            >
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children, ...props }) => (
                    <pre
                      className={`max-w-full overflow-x-auto rounded-xl p-3 my-2 text-xs font-mono leading-relaxed ${
                        isUser ? 'bg-emerald-800/90 text-emerald-50' : 'bg-slate-900 text-slate-100'
                      }`}
                      {...props}
                    >
                      {children}
                    </pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className && typeof children === 'string' && !children.includes('\n');
                    return isInline ? (
                      <code
                        className={`rounded px-1.5 py-0.5 text-xs font-mono break-all ${
                          isUser ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className="font-mono text-xs break-all" {...props}>
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => (
                    <p className="leading-relaxed mb-2 last:mb-0 break-words [overflow-wrap:anywhere]">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-5 my-2 space-y-1 break-words">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-5 my-2 space-y-1 break-words">{children}</ol>
                  ),
                  li: ({ children }) => <li className="leading-relaxed break-words">{children}</li>,
                  table: ({ children }) => (
                    <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-slate-300/80 shadow-xs">
                      <table className="min-w-full border-collapse text-left text-xs">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead
                      className={
                        isUser
                          ? 'bg-emerald-700/80 text-white font-semibold'
                          : 'bg-slate-100 text-slate-700 font-semibold'
                      }
                    >
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody
                      className={
                        isUser ? 'divide-y divide-emerald-500/30' : 'divide-y divide-slate-200 bg-white'
                      }
                    >
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr
                      className={
                        isUser ? 'hover:bg-emerald-700/40 transition' : 'hover:bg-slate-50/80 transition'
                      }
                    >
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th
                      className={`border px-3 py-2 font-semibold ${
                        isUser ? 'border-emerald-500/40 text-white' : 'border-slate-300 text-slate-800'
                      }`}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td
                      className={`border px-3 py-2 ${
                        isUser ? 'border-emerald-500/40 text-emerald-50' : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      {children}
                    </td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote
                      className={`border-l-4 pl-3 my-2 italic ${
                        isUser ? 'border-emerald-300 text-emerald-100' : 'border-emerald-500 text-slate-600'
                      }`}
                    >
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`underline underline-offset-2 break-all ${
                        isUser ? 'text-white font-medium' : 'text-emerald-600 hover:text-emerald-700'
                      }`}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.text}
              </Markdown>
            </div>
            {message.isStreaming && (
              <span className="inline-block h-4 w-1.5 ml-1 animate-pulse bg-emerald-500 align-middle rounded-full" />
            )}
          </div>
        )}

        {/* Message Footer: Timestamp and Copy */}
        <div
          className={`mt-2 flex items-center justify-between gap-3 text-[11px] opacity-70 ${
            isUser ? 'text-emerald-100' : 'text-slate-400'
          }`}
        >
          <span>{message.timestamp}</span>

          {!isUser && message.text && (
            <button
              onClick={handleCopy}
              title="คัดลอกข้อความ"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-slate-100 hover:text-slate-700"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-600">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>คัดลอก</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
