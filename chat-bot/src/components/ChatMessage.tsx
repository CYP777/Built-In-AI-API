import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Layers, ChevronDown, X, Download, ZoomIn, Sparkles, ExternalLink, ShieldCheck, AlertTriangle, Music } from 'lucide-react';
import { cleanCompressedSummary } from '../services/summarizer-service';
import { stripMarkdown } from '../utils/markdown';
import type { ImageAttachment, AudioAttachment } from '../types/ai';

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  isCompressedContext?: boolean;
  isCompacted?: boolean;
  hasProfanity?: boolean;
  isSafetyAdvisory?: boolean;
  imageAttachment?: ImageAttachment;
  imageAttachments?: ImageAttachment[];
  audioAttachment?: AudioAttachment;
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

function extractNodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join('');
  if (React.isValidElement(node) && node.props && (node.props as { children?: React.ReactNode }).children) {
    return extractNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

const CodeBlock: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = extractNodeText(children).replace(/\n$/, '');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3.5 rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-950 text-slate-100 shadow-md shadow-black/15 group/code">
      {/* Header bar with decorative macOS dots and language badge */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80 bg-slate-900/90 text-xs text-slate-400 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          {language && (
            <span className="font-mono text-[11px] font-semibold text-slate-300 ml-1.5 uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label="คัดลอกโค้ดนี้"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          title="คัดลอกโค้ดนี้"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">คัดลอกแล้ว</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>คัดลอกโค้ด</span>
            </>
          )}
        </button>
      </div>

      {/* Pre code content */}
      <pre className="overflow-x-auto p-4 text-[13px] font-mono leading-relaxed text-slate-100 selection:bg-emerald-500/30">
        <code>{children}</code>
      </pre>
    </div>
  );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<ImageAttachment | null>(null);
  const isUser = message.sender === 'user';

  const allImages = useMemo(() => {
    if (message.imageAttachments && message.imageAttachments.length > 0) {
      return message.imageAttachments;
    }
    return message.imageAttachment ? [message.imageAttachment] : [];
  }, [message.imageAttachments, message.imageAttachment]);

  // Handle Escape key to close image lightbox and prevent background scroll
  useEffect(() => {
    if (!isLightboxOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLightboxOpen]);

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
            aria-expanded={isExpanded}
            className="flex items-center gap-2 bg-white/95 px-3.5 sm:px-4 py-1 text-slate-700 rounded-full border border-slate-300/90 shadow-2xs shrink-0 hover:bg-slate-50 hover:border-slate-400/80 transition cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title={isExpanded ? 'คลิกเพื่อพับเก็บสรุป' : 'คลิกเพื่อแสดงสรุป'}
          >
            <Layers className="h-3.5 w-3.5 text-emerald-700" />
            <span className="text-xs font-semibold tracking-wider text-slate-800">
              Conversation compacted
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${
                isExpanded ? 'rotate-180 text-emerald-700' : ''
              }`}
            />
          </button>
          <div className="h-px flex-1 bg-slate-300/80" />
        </div>

        {/* Compressed Summary Text - Collapsible, completely seamless, NO background, NO border */}
        {isExpanded && message.text && (() => {
          const cleanedText = cleanCompressedSummary(message.text);
          return (
            <div className="my-2.5 px-2 sm:px-4 py-1 text-xs text-slate-600 leading-relaxed min-w-0 max-w-full wrap-break-word">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600 mb-2 min-w-0">
                <span className="text-emerald-800 font-semibold min-w-0">
                  สรุปบริบทเดิมที่บันทึกลงหน่วยความจำ:
                </span>
              </div>
              <div className="min-w-0 max-w-full text-slate-600 leading-relaxed wrap-break-word space-y-1.5">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h3: ({ children }) => (
                      <h3 className="text-xs font-bold text-slate-700 mt-2 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-1.5 last:mb-0 wrap-break-word leading-relaxed text-slate-600">
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
                      <li className="wrap-break-word leading-relaxed">{children}</li>
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

  // User Message
  if (isUser) {
    return (
      <div
        className={`flex w-full justify-end py-2 min-w-0 transition-opacity duration-200 ${
          message.isCompacted ? 'opacity-80 hover:opacity-100' : ''
        }`}
      >
        <div className="group relative max-w-[85%] sm:max-w-[75%] min-w-0 rounded-2xl rounded-tr-xs bg-linear-to-br from-emerald-600 via-emerald-600 to-teal-700 text-white px-4 py-3 text-sm shadow-sm shadow-emerald-700/10 leading-relaxed wrap-break-word">
          {/* Profanity Warning Badge */}
          {message.hasProfanity && (
            <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-700/80 text-rose-100 text-[11px] font-semibold border border-rose-400/40 shadow-2xs">
              <AlertTriangle className="h-3 w-3 text-rose-200 shrink-0" />
              <span>ตรวจพบคำไม่สุภาพ</span>
            </div>
          )}

          {/* Attached Audio Preview if available */}
          {message.audioAttachment && (
            <div className="mb-2.5 rounded-xl border border-white/25 bg-black/20 p-2.5 backdrop-blur-xs text-xs text-white max-w-sm">
              <div className="flex items-center gap-2 mb-1.5 min-w-0">
                <Music className="h-4 w-4 text-emerald-300 shrink-0" />
                <span className="font-semibold truncate flex-1 text-white/95">
                  {message.audioAttachment.name}
                </span>
                <span className="text-[10px] text-emerald-100/80 shrink-0 font-mono">
                  {(message.audioAttachment.size / 1024).toFixed(1)} KB
                  {message.audioAttachment.duration ? ` • ${Math.round(message.audioAttachment.duration)}s` : ''}
                </span>
              </div>
              <audio
                controls
                src={message.audioAttachment.url}
                className="w-full h-8 rounded-lg accent-emerald-500"
              />
            </div>
          )}

          {/* Attached Images Preview if available */}
          {allImages.length > 0 && (
            <div
              className={`mb-2.5 grid gap-2 ${
                allImages.length === 1
                  ? 'grid-cols-1 max-w-sm'
                  : allImages.length === 2
                  ? 'grid-cols-2 max-w-md'
                  : 'grid-cols-2 sm:grid-cols-3 max-w-lg'
              }`}
            >
              {allImages.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setActiveLightboxImage(img);
                    setIsLightboxOpen(true);
                  }}
                  className={`group/img block relative overflow-hidden rounded-xl border border-white/20 bg-slate-900/30 hover:border-white/50 hover:shadow-md transition cursor-zoom-in text-left ${
                    allImages.length === 1 ? 'aspect-video w-full max-h-64' : 'aspect-4/3 w-full'
                  }`}
                  title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full rounded-xl object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-black/70 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 shadow-sm">
                      <ZoomIn className="w-3.5 h-3.5" />
                      ดูภาพเต็ม
                    </span>
                  </div>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-xs">
                    <span className="truncate">{img.name}</span>
                    <span className="shrink-0 opacity-80">
                      {(img.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Message Text */}
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.text}
          </div>

          {/* Timestamp */}
          <div className="mt-1 flex items-center justify-end text-[10px] text-emerald-50 font-medium tracking-tight">
            <span>{message.timestamp}</span>
          </div>
        </div>

        {/* Lightbox Modal */}
        {isLightboxOpen &&
          typeof document !== 'undefined' &&
          allImages.length > 0 &&
          createPortal(
            (() => {
              const activeImg = activeLightboxImage || allImages[0];
              if (!activeImg) return null;

              return (
                <div
                  className="fixed inset-0 z-100 flex flex-col items-center justify-between bg-black/90 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-150 select-none"
                  onClick={() => setIsLightboxOpen(false)}
                >
                  <div
                    className="w-full max-w-5xl flex items-center justify-between py-2 px-3 text-white text-sm shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 truncate max-w-md">
                      <span className="font-semibold text-white/90 truncate">
                        {activeImg.name}
                      </span>
                      <span className="text-xs text-white/60 shrink-0">
                        ({(activeImg.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={activeImg.url}
                        download={activeImg.name}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white text-xs font-medium transition cursor-pointer"
                        title="ดาวน์โหลดรูปภาพนี้"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">ดาวน์โหลด</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setIsLightboxOpen(false)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition cursor-pointer"
                        title="ปิด (Esc)"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div
                    className="flex-1 flex items-center justify-center p-2 min-h-0 max-w-full overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={activeImg.url}
                      alt={activeImg.name}
                      className="max-h-[82vh] max-w-[92vw] object-contain rounded-xl shadow-2xl cursor-default"
                    />
                  </div>
                  <div
                    className="py-1 text-center text-xs text-white/50 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    คลิกบริเวณพื้นหลังหรือกด Esc เพื่อปิด
                  </div>
                </div>
              );
            })(),
            document.body
          )}
      </div>
    );
  }

  // AI Assistant Message (Modern Canvas / Workstation Layout)
  return (
    <div
      className={`group/ai flex w-full justify-start py-3.5 min-w-0 transition-opacity duration-200 border-b border-slate-100/70 last:border-b-0 ${
        message.isCompacted ? 'opacity-80 hover:opacity-100' : ''
      }`}
    >
      <div className="w-full min-w-0 space-y-2.5">
        {/* Assistant Header: Avatar + Model Badge + Timestamp + Copy Button */}
        <div className="flex items-center justify-between gap-2 select-none">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-linear-to-tr from-emerald-600 to-teal-500 text-white shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-900 tracking-tight">
              ผู้ช่วย AI
            </span>
            <span className="text-[11px] text-slate-600 ml-1">
              {message.timestamp}
            </span>
          </div>

          {/* Copy Button (discreet, accessible) */}
          {message.text && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label="คัดลอกข้อความคำตอบ"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="คัดลอกข้อความคำตอบ"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-700" />
                  <span className="text-emerald-700 font-semibold">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>คัดลอกข้อความ</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Safety Advisory Banner if triggered */}
        {message.isSafetyAdvisory && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 text-xs font-semibold border border-amber-200 shadow-2xs">
            <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
            <span>คำแนะนำด้านความปลอดภัย (Content Safety Advisory)</span>
          </div>
        )}

        {/* Thinking / Typing state before first token arrives */}
        {!message.text && message.isStreaming && (
          <div className="flex items-center gap-2.5 py-2 text-slate-600 select-none animate-in fade-in duration-200">
            <span className="text-xs font-medium text-slate-700">กำลังประมวลผลคำตอบ...</span>
            <div className="flex items-center gap-1 ml-0.5">
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce will-change-transform"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce will-change-transform"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce will-change-transform"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}

        {/* Fallback when AI response is empty and finished */}
        {!message.text && !message.isStreaming && (
          <div className="py-2 text-xs text-slate-600 italic">
            (ไม่มีข้อความตอบกลับจากระบบ)
          </div>
        )}

        {/* Message Content: Clean Canvas Typography */}
        {message.text && (
          <div
            className={`min-w-0 max-w-full text-slate-800 text-[14px] sm:text-[14.5px] leading-relaxed wrap-break-word ${
              message.isSafetyAdvisory
                ? 'rounded-2xl border border-amber-200/90 bg-amber-50/50 p-4'
                : ''
            }`}
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 mt-4 mb-2 tracking-tight first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-3.5 mb-1.5 tracking-tight first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xs sm:text-sm font-bold text-slate-800 mt-3 mb-1 first:mt-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="leading-relaxed mb-2.5 last:mb-0 wrap-break-word">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 my-2 space-y-1.5 wrap-break-word">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 my-2 space-y-1.5 wrap-break-word">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed wrap-break-word">{children}</li>
                ),
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children, ...props }) => {
                  const isInline =
                    !className && typeof children === 'string' && !children.includes('\n');
                  return isInline ? (
                    <code
                      className="rounded-md border border-slate-200/90 bg-slate-100/90 px-1.5 py-0.5 text-[12.5px] font-mono text-emerald-800 font-medium break-all"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <CodeBlock className={className}>{children}</CodeBlock>
                  );
                },
                table: ({ children }) => (
                  <div className="my-3.5 max-w-full overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                    <table className="min-w-full border-collapse text-left text-xs">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200/80">
                    {children}
                  </thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {children}
                  </tbody>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-emerald-50/30 transition-colors">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="px-3.5 py-2.5 font-semibold text-slate-800 tracking-tight">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-3.5 py-2.5 text-slate-700 leading-relaxed">{children}</td>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-2.5 text-slate-800 text-[13.5px] leading-relaxed shadow-2xs font-normal">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => {
                  const cleanHref = href?.trim() || '';
                  const normalizedHref =
                    cleanHref &&
                    !/^https?:\/\//i.test(cleanHref) &&
                    !cleanHref.startsWith('mailto:') &&
                    !cleanHref.startsWith('/') &&
                    !cleanHref.startsWith('#')
                      ? `https://${cleanHref}`
                      : cleanHref;

                  return (
                    <a
                      href={normalizedHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-baseline gap-1 text-emerald-700 hover:text-emerald-800 underline underline-offset-2 break-all font-medium transition"
                    >
                      <span>{children}</span>
                      <ExternalLink className="inline-block h-3 w-3 shrink-0 opacity-70 translate-y-0.5" />
                    </a>
                  );
                },
              }}
            >
              {message.text}
            </Markdown>

            {message.isStreaming && (
              <span className="inline-block h-4 w-1.5 ml-1 animate-pulse bg-emerald-500 align-middle rounded-full will-change-opacity" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
