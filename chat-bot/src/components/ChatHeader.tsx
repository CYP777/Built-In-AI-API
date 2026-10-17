import React, { useState } from 'react';
import { Sliders, AlertCircle, RefreshCw, ShieldCheck, FileText } from 'lucide-react';
import type { AIStatus } from '../services/ai-service';

interface ChatHeaderProps {
  status: AIStatus;
  statusMessage: string;
  isMock?: boolean;
  modelName?: string;
  modelType?: string;
  onClearChat?: () => void;
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
        const displayLabel = modelName || 'Chrome Built-in AI';
        const tooltip = `โมเดล ${displayLabel}: ประมวลผลในเครื่องของคุณโดยตรง (Prompt API) - คลิกเพื่อดูการตั้งค่า`;

        return (
          <button
            type="button"
            onClick={onOpenSettings}
            title={tooltip}
            aria-label={`สถานะพร้อมใช้งาน: โมเดล ${displayLabel} (คลิกเพื่อดูการตั้งค่า)`}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 sm:px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-500/20 shadow-2xs hover:bg-emerald-500/20 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
            </span>
            <span className="tracking-tight text-xs">{displayLabel}</span>
          </button>
        );
      }
      case 'downloading':
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 sm:px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-500/20 shadow-2xs">
            <RefreshCw className="h-3 w-3 animate-spin text-amber-600 shrink-0" />
            <span className="hidden sm:inline">กำลังดาวน์โหลดโมเดล</span>
            <span className="sm:hidden text-[11px]">กำลังโหลด</span>
          </div>
        );
      case 'checking': {
        const displayLabel = modelName || 'Chrome Built-in AI';
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 sm:px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400 animate-pulse"></span>
            </span>
            <span className="tracking-tight hidden sm:inline">{displayLabel}</span>
            <span className="tracking-tight sm:hidden text-[11px]">ตรวจสอบ</span>
          </div>
        );
      }
      default:
        return (
          <button
            type="button"
            title={statusMessage}
            aria-label="ระบบอยู่ในโหมดจำลอง คลิกเพื่อดูวิธีเปิดใช้งานโมเดล"
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 sm:px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
            onClick={onOpenSettings}
          >
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>โหมดจำลอง</span>
          </button>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/90 bg-white/98 px-4 sm:px-6 backdrop-blur-xl shadow-xs">
      {/* Left: Brand */}
      <div className="flex items-center">
        <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
          AI Chatbot
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Built-in AI Status Badge & Re-check Status button */}
        <div className="flex items-center gap-1">
          <div>
            {getStatusBadge()}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isSpinning}
            aria-label="ตรวจสอบสถานะ Built-in AI ใหม่"
            title="ตรวจสอบสถานะ Built-in AI ใหม่"
            className="flex items-center justify-center p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-all active:scale-90 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {/* Policy button */}
        {onOpenPolicy && (
          <button
            type="button"
            onClick={onOpenPolicy}
            aria-label="ดูข้อกำหนดและนโยบายความปลอดภัย AI"
            title="ดูข้อกำหนดและนโยบายความปลอดภัย AI"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden md:inline">นโยบายความปลอดภัย</span>
          </button>
        )}

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="ตั้งค่าพารามิเตอร์โมเดล AI"
          title="ตั้งค่าพารามิเตอร์โมเดล AI"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <Sliders className="h-3.5 w-3.5 text-slate-600" />
          <span className="hidden md:inline">ตั้งค่าโมเดล</span>
        </button>

        {/* Summarize Chat button */}
        {onOpenSummary && (
          <button
            type="button"
            onClick={onOpenSummary}
            disabled={messagesCount === 0}
            aria-label="สรุปเนื้อหาบทสนทนา"
            title={messagesCount === 0 ? 'ยังไม่มีข้อความสำหรับการสรุป' : 'สรุปเนื้อหาบทสนทนาด้วย Summarizer API'}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 px-3 py-1.5 text-xs font-semibold shadow-2xs hover:border-emerald-500/40 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">สรุปบทสนทนา</span>
          </button>
        )}

      </div>
    </header>
  );
};
