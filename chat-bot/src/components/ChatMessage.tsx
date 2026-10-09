import React, { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Layers, ChevronDown } from 'lucide-react';
import { cleanCompressedSummary } from '../services/summarizer-service';
import { stripMarkdown } from '../utils/markdown';

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  isCompressedContext?: boolean;
  isCompacted?: boolean;
  compressionStats?: {
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    percentageSaved: number;
  };
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const isUser = message.sender === 'user';

  const handleCopy = () => {
    const plainText = stripMarkdown(message.text);
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.isCompressedContext) {
    return (
      <div className="my-5 w-full max-w-4xl mx-auto px-1 sm:px-2 animate-in fade-in duration-200">
        {/* Visible Horizontal Divider: ──────────────── Conversation compacted ──────────────── */}
        <div className="flex items-center gap-3 my-3 w-full min-w-0 select-none" role="separator" aria-label="Conversation compacted">
          <div className="h-px flex-1 bg-slate-300/80" />

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-2 bg-white/95 px-3.5 sm:px-4 py-1 text-slate-700 rounded-full border border-slate-300/90 shadow-2xs shrink-0 hover:bg-slate-50 hover:border-slate-400/80 transition cursor-pointer select-none"
            title={isExpanded ? 'คลิกเพื่อพับเก็บสรุป' : 'คลิกเพื่อแสดงสรุป'}
          >
            <Layers className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold tracking-wider text-slate-800">
              Conversation compacted
            </span>
            {message.compressionStats && (
              <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                -{message.compressionStats.percentageSaved}%
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                isExpanded ? 'rotate-180 text-emerald-600' : ''
              }`}
            />
          </button>

          <div className="h-px flex-1 bg-slate-300/80" />
        </div>

        {/* Compressed Summary Text - Collapsible, completely seamless, NO background, NO border */}
        {isExpanded && message.text && (() => {
          const cleanedText = cleanCompressedSummary(message.text);
          return (
            <div className="my-2.5 px-2 sm:px-4 py-1 text-xs text-slate-600 leading-relaxed min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-400 mb-2 min-w-0">
                <span className="text-emerald-700/90 font-semibold min-w-0">
                  📌 สรุปบริบทเดิมที่บันทึกลงหน่วยความจำ:
                </span>
                {message.compressionStats && (
                  <span className="font-mono text-slate-400 text-[10px] shrink-0">
                    ลดลง {message.compressionStats.savedTokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
              <div className="min-w-0 max-w-full text-slate-600 leading-relaxed break-words [overflow-wrap:anywhere] space-y-1.5">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h3: ({ children }) => (
                      <h3 className="text-xs font-bold text-slate-700 mt-2 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-1.5 last:mb-0 break-words [overflow-wrap:anywhere] leading-relaxed text-slate-600">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-4 space-y-1 my-1 text-slate-600 min-w-0">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-4 space-y-1 my-1 text-slate-600 min-w-0">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="break-words [overflow-wrap:anywhere] leading-relaxed">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-800">{children}</strong>
                    ),
                    table: ({ children }) => (
                      <div className="my-1.5 text-xs text-slate-600 space-y-1">{children}</div>
                    ),
                    tr: ({ children }) => (
                      <div className="flex flex-wrap items-baseline gap-2 py-0.5">{children}</div>
                    ),
                    th: ({ children }) => (
                      <span className="font-semibold text-slate-700">{children}</span>
                    ),
                    td: ({ children }) => (
                      <span className="text-slate-600">{children}</span>
                    ),
                  }}
                >
                  {cleanedText}
                </Markdown>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div
      className={`flex w-full gap-3 py-3 transition-opacity duration-300 min-w-0 ${
        isUser ? 'justify-end' : 'justify-start'
      } ${message.isCompacted ? 'opacity-80 hover:opacity-100 transition-opacity' : ''}`}
    >
      {/* Bubble Container */}
      <div
        className={`group relative max-w-[88%] sm:max-w-[78%] min-w-0 rounded-2xl px-4.5 py-3.5 text-sm shadow-xs break-words [overflow-wrap:anywhere] leading-relaxed transition-all ${
          isUser
            ? 'bg-emerald-600 text-white rounded-br-xs shadow-sm shadow-emerald-600/10'
            : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-xs shadow-sm shadow-slate-100/80'
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
