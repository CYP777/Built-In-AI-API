import React, { useState } from 'react';
import { Bot, Sliders, AlertCircle, RefreshCw, ShieldCheck, FileText, PanelLeft } from 'lucide-react';
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
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
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
  onToggleSidebar,
  isSidebarOpen = false,
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
        const tooltip = 'โมเดล On-Device บนเครื่อง: ประมวลผลในเครื่องของคุณโดยตรง (Prompt API)';

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
        const displayLabel = modelName || 'Chrome Built-in AI';
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
            <span>โหมดจำลอง</span>
          </button>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 sm:px-6 backdrop-blur-md">
      {/* Left: Sidebar Toggle & Brand */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'ซ่อนประวัติการแชท' : 'ดูประวัติการแชท'}
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 shadow-2xs hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition active:scale-95 cursor-pointer"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/15">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
              AI Chatbot
            </h1>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
            โมเดล On-Device (CPU/GPU) บน Notebook &amp; Laptop
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Built-in AI Status Badge & Re-check Status button */}
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
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden md:inline">นโยบาย AI</span>
          </button>
        )}

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="ตั้งค่าโมเดล"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition active:scale-95 cursor-pointer"
        >
          <Sliders className="h-3.5 w-3.5 text-slate-500" />
          <span className="hidden md:inline">ตั้งค่า</span>
        </button>

        {/* Summarize Chat button */}
        {onOpenSummary && (
          <button
            type="button"
            onClick={onOpenSummary}
            disabled={messagesCount === 0}
            title={messagesCount === 0 ? 'ยังไม่มีข้อความสำหรับการสรุป' : 'สรุปเนื้อหาบทสนทนา (Summarizer API)'}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/70 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs hover:border-emerald-300 hover:bg-emerald-100/80 transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:hover:bg-emerald-50/70 disabled:hover:text-emerald-800 disabled:hover:border-emerald-200/90 disabled:cursor-not-allowed"
          >
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">สรุปแชท</span>
          </button>
        )}

      </div>
    </header>
  );
};
