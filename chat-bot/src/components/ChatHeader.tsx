import React, { useState } from 'react';
import { Bot, Sliders, SquarePen, AlertCircle, RefreshCw, ShieldCheck, FileText } from 'lucide-react';
import type { AIStatus } from '../services/ai-service';

interface ChatHeaderProps {
  status: AIStatus;
  statusMessage: string;
  isMock?: boolean;
  modelName?: string;
  modelType?: 'gemini-nano' | 'gemma';
  onClearChat: () => void;
  onOpenSettings: () => void;
  onRefreshStatus: () => void;
  onOpenPolicy?: () => void;
  onOpenSummary?: () => void;
  messagesCount?: number;
  contextTokenUsage?: {
    tokensSoFar: number;
    maxTokens: number;
    percentage: number;
  };
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  status,
  statusMessage,
  modelName,
  modelType,
  onClearChat,
  onOpenSettings,
  onRefreshStatus,
  onOpenPolicy,
  onOpenSummary,
  messagesCount = 0,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);

  const handleRefresh = async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    try {
      await Promise.resolve(onRefreshStatus());
    } finally {
      setTimeout(() => {
        setIsSpinning(false);
      }, 700);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'available': {
        const displayLabel = modelName || (modelType === 'gemma' ? 'Gemma 4 (GPU)' : 'Gemini Nano (GPU)');
        const tooltip =
          modelType === 'gemma'
            ? 'โมเดล On-Device บนเครื่อง: Gemma 4 (รันผ่าน GPU)'
            : 'โมเดล On-Device บนเครื่อง: Gemini Nano (รันผ่าน GPU nano_v3_gpu)';

        return (
          <div
            title={tooltip}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-500/20 shadow-2xs"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
            </span>
            <span className="tracking-tight">{displayLabel}</span>
          </div>
        );
      }
      case 'downloading':
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-500/20 shadow-2xs">
            <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
            <span>กำลังดาวน์โหลดโมเดล</span>
          </div>
        );
      case 'checking': {
        const displayLabel = modelName || (modelType === 'gemma' ? 'Gemma 4 (GPU)' : 'Gemini Nano (GPU)');
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400"></span>
            </span>
            <span className="tracking-tight">{displayLabel}</span>
          </div>
        );
      }
      default:
        return (
          <button
            type="button"
            title={statusMessage}
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer"
            onClick={onOpenSettings}
          >
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            <span>โหมดจำลอง (Mock Demo)</span>
          </button>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 sm:px-6 backdrop-blur-md">
      {/* Left: Brand / Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/15">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
              AI Chatbot
            </h1>
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-500/20">
              Built-in AI
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
            {modelType === 'gemma'
              ? 'แชทบอทประมวลผลด้วยโมเดล Gemma ภายในเครื่อง (GPU)'
              : 'แชทบอทประมวลผลด้วยโมเดล Gemini Nano ภายในเครื่อง (GPU)'}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Gemini Nano Status Badge & Re-check Status button */}
        <div className="flex items-center gap-1">
          <div className="hidden sm:block">
            {getStatusBadge()}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isSpinning}
            title="ตรวจสอบสถานะ Built-in AI ใหม่"
            className="flex items-center justify-center p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100/70 rounded-lg transition active:scale-90 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {/* Policy button */}
        {onOpenPolicy && (
          <button
            type="button"
            onClick={onOpenPolicy}
            title="ดูข้อตกลงและนโยบายความปลอดภัย AI"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">นโยบาย AI</span>
          </button>
        )}

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="ตั้งค่าโมเดล"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95"
        >
          <Sliders className="h-3.5 w-3.5 text-slate-500" />
          <span className="hidden sm:inline">ตั้งค่า</span>
        </button>

        {/* Summarize Chat button */}
        {onOpenSummary && (
          <button
            type="button"
            onClick={onOpenSummary}
            disabled={messagesCount === 0}
            title={messagesCount === 0 ? 'ยังไม่มีข้อความสำหรับการสรุป' : 'สรุปเนื้อหาบทสนทนา (Summarizer API)'}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-teal-300 hover:bg-teal-50/70 hover:text-teal-700 disabled:opacity-40 disabled:hover:bg-white/70 disabled:hover:text-slate-700 disabled:hover:border-slate-200/80 transition active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            <FileText className="h-3.5 w-3.5 text-teal-600" />
            <span className="hidden sm:inline">สรุปแชท</span>
          </button>
        )}

        {/* New Chat */}
        <button
          type="button"
          onClick={onClearChat}
          title="เริ่มบทสนทนาใหม่ (รีเซ็ตบริบท)"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-emerald-300 hover:bg-emerald-50/70 hover:text-emerald-700 transition active:scale-95 cursor-pointer"
        >
          <SquarePen className="h-3.5 w-3.5 text-emerald-600" />
          <span className="hidden sm:inline">แชทใหม่</span>
        </button>
      </div>
    </header>
  );
};
