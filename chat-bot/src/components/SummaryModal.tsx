import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  FileDown,
  Zap,
  Cpu,
  Layers,
  ArrowRight,
  Plus,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  summarizerService,
  type SummarizeOptions,
  type SummarizerState,
  type EngineUsedType,
} from '../services/summarizer-service';
import type { AISummarizerType, AISummarizerLength } from '../types/ai';
import { stripMarkdown } from '../utils/markdown';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Array<{ sender: 'user' | 'ai'; text: string }>;
  uncompactedCount?: number;
  onCompressAndContinue?: () => Promise<unknown>;
  onNewChat?: () => void;
  isCompressing?: boolean;
  modelName?: string;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen,
  onClose,
  messages,
  uncompactedCount,
  onCompressAndContinue,
  onNewChat,
  isCompressing = false,
  modelName,
}) => {
  const [summaryType, setSummaryType] = useState<AISummarizerType>('key-points');
  const [summaryLength, setSummaryLength] = useState<AISummarizerLength>('medium');
  const [summaryContent, setSummaryContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<EngineUsedType | null>(null);
  const [engineState, setEngineState] = useState<SummarizerState>({
    status: 'mock',
    statusMessage: 'กำลังตรวจสอบ...',
    isNative: false,
  });

  const [regenerateCounter, setRegenerateCounter] = useState<number>(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll content area as new summary chunks stream in
  useEffect(() => {
    if (isLoading && contentContainerRef.current) {
      contentContainerRef.current.scrollTop = contentContainerRef.current.scrollHeight;
    }
  }, [summaryContent, isLoading]);

  // Check engine availability on mount
  useEffect(() => {
    let ignore = false;
    (async () => {
      const state = await summarizerService.checkAvailability();
      if (!ignore) {
        setEngineState(state);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Reactive summarization effect
  useEffect(() => {
    if (!isOpen) {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
      return;
    }

    if (messages.length === 0) {
      const emptyTimer = setTimeout(() => {
        setSummaryContent('ไม่มีข้อความในการสนทนาสำหรับการสรุป');
        setIsLoading(false);
      }, 0);
      return () => clearTimeout(emptyTimer);
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    let isCancelled = false;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setSummaryContent('');

      try {
        const options: SummarizeOptions = {
          type: summaryType,
          format: 'markdown',
          length: summaryLength,
          signal: controller.signal,
          onChunk: (chunk) => {
            if (!isCancelled) {
              setSummaryContent(chunk);
            }
          },
        };

        const result = await summarizerService.summarizeChat(messages, options);
        if (!isCancelled && !controller.signal.aborted) {
          setSummaryContent(result);
          setActiveEngine(summarizerService.getLastEngineUsed());
        }
      } catch (err: unknown) {
        if (!isCancelled && (err as Error)?.name !== 'AbortError') {
          console.error('Summarization failed:', err);
          setSummaryContent('เกิดข้อผิดพลาดในการสรุปเนื้อหา กรุณาลองใหม่อีกครั้ง');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      controller.abort();
      setIsLoading(false);
    };
  }, [isOpen, summaryType, summaryLength, messages, regenerateCounter]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!summaryContent) return;
    const plainText = stripMarkdown(summaryContent);
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!summaryContent) return;
    const blob = new Blob([summaryContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-summary-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  สรุปการสนทนา
                </h2>
                {activeEngine === 'native' || (!activeEngine && engineState.isNative) ? (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <Zap className="h-3 w-3" />
                    Chrome Summarizer
                  </span>
                ) : activeEngine === 'prompt-api' || (!activeEngine && engineState.status === 'fallback-prompt') ? (
                  <span className="flex items-center gap-1 rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                    <Cpu className="h-3 w-3" />
                    {modelName || 'Chrome Built-in AI'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    <Layers className="h-3 w-3" />
                    Mock Engine
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                ประมวลผลสรุปเนื้อหาบทสนทนา {messages.length} ข้อความ ด้วย AI บนอุปกรณ์ของคุณ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="ปิด"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Option Bar */}
        <div className="border-b border-slate-100 bg-white px-6 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Format / Type Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSummaryType('key-points')}
                className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                  summaryType === 'key-points'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 ประเด็นสำคัญ (Key Points)
              </button>
              <button
                type="button"
                onClick={() => setSummaryType('tl;dr')}
                className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                  summaryType === 'tl;dr'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📌 ใจความหลัก (TL;DR)
              </button>
              <button
                type="button"
                onClick={() => setSummaryType('headline')}
                className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                  summaryType === 'headline'
                    ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📰 หัวข้อ (Headline)
              </button>
            </div>

            {/* Length Selector */}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="text-[11px] font-medium">ความยาว:</span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                {(['short', 'medium', 'long'] as AISummarizerLength[]).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setSummaryLength(len)}
                    className={`rounded-md px-2 py-0.5 text-[11px] capitalize transition cursor-pointer ${
                      summaryLength === len
                        ? 'bg-white text-emerald-700 font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {len === 'short' ? 'สั้น' : len === 'medium' ? 'ปานกลาง' : 'ละเอียด'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div ref={contentContainerRef} className="flex-1 overflow-y-auto p-6 text-sm text-slate-700">
          {isLoading && !summaryContent ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-xs font-medium text-slate-500">กำลังประมวลผลสรุปเนื้อหาด้วย On-Device AI...</p>
            </div>
          ) : (
            <div className="relative min-h-[180px] rounded-xl bg-slate-50/70 p-4 border border-slate-200/60 leading-relaxed min-w-0 max-w-full break-words [overflow-wrap:anywhere] overflow-hidden">
              {summaryContent ? (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h3: ({ children }) => (
                      <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1.5">{children}</h3>
                    ),
                    p: ({ children }) => <p className="mb-2 last:mb-0 break-words [overflow-wrap:anywhere]">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1 min-w-0">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1 min-w-0">{children}</ol>,
                    li: ({ children }) => <li className="break-words [overflow-wrap:anywhere]">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                  }}
                >
                  {summaryContent}
                </Markdown>
              ) : (
                <div className="flex min-h-[150px] flex-col items-center justify-center text-center p-4 text-slate-500">
                  <p className="font-semibold text-slate-700 mb-1">ยังไม่มีข้อมูลสรุป</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    ข้อความอาจสั้นเกินไปหรือไม่พบเนื้อหาสำคัญสำหรับการสรุปผล กรุณาลองกดปุ่ม "สร้างใหม่" หรือพิมพ์ข้อความเพิ่มเติม
                  </p>
                </div>
              )}
              {isLoading && (
                <span className="inline-block h-4 w-1.5 ml-1 animate-pulse bg-emerald-500 align-middle rounded-full" />
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setRegenerateCounter((c) => c + 1)}
              disabled={isLoading || messages.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>สร้างใหม่</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!summaryContent || isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
              title="คัดลอกเป็นข้อความธรรมดา (Plain text)"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>คัดลอก</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!summaryContent || isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>ดาวน์โหลด</span>
            </button>
          </div>

          {/* Action Buttons: New Chat & Compress */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {onNewChat && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewChat();
                }}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition cursor-pointer"
                title="เริ่มการสนทนาในห้องแชทใหม่ (ระบบจะบันทึกประวัติแชทเดิมไว้ในแถบประวัติด้านข้าง)"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                <span>เริ่มแชทใหม่แทน</span>
              </button>
            )}

            {onCompressAndContinue && (
              <button
                type="button"
                onClick={async () => {
                  await onCompressAndContinue();
                  onClose();
                }}
                disabled={isCompressing || messages.length === 0 || uncompactedCount === 0}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-teal-700 active:scale-95 disabled:opacity-50 transition cursor-pointer disabled:cursor-not-allowed"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>
                  {isCompressing
                    ? 'กำลังบีบอัด...'
                    : uncompactedCount === 0
                    ? 'ประวัติทั้งหมดถูกบีบอัดแล้ว'
                    : uncompactedCount !== undefined && uncompactedCount > 0
                    ? `บีบอัดประวัติ (${uncompactedCount} ข้อความ) และสนทนาต่อ`
                    : 'บีบอัดประวัติและสนทนาต่อ'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
