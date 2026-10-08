import React from 'react';
import { Bot, Sliders, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import type { AIStatus } from '../services/ai-service';

interface ChatHeaderProps {
  status: AIStatus;
  statusMessage: string;
  isMock?: boolean;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onRefreshStatus: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  status,
  statusMessage,
  onClearChat,
  onOpenSettings,
  onRefreshStatus,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'available':
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gemini Nano On-Device</span>
          </div>
        );
      case 'downloading':
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200">
            <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
            <span>กำลังดาวน์โหลดโมเดล</span>
          </div>
        );
      case 'checking':
        return (
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
            <RefreshCw className="h-3 w-3 animate-spin text-slate-500" />
            <span>ตรวจสอบระบบ...</span>
          </div>
        );
      default:
        return (
          <div
            title={statusMessage}
            className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200 cursor-pointer"
            onClick={onOpenSettings}
          >
            <AlertCircle className="h-3 w-3 text-amber-600" />
            <span>โหมดจำลอง (Mock Demo)</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-md">
      {/* Left: Brand / Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-tr from-green-600 via-emerald-600 to-green-600 text-white shadow-md shadow-emerald-100">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
              AI Chatbot
            </h1>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-100">
              Built-in AI
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
            แชทบอทประมวลผลด้วยโมเดล Gemini ภายในเครื่อง
          </p>
        </div>
      </div>

      {/* Center / Right: Status and Action Buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          {getStatusBadge()}
        </div>

        {/* Refresh status */}
        <button
          onClick={onRefreshStatus}
          title="ตรวจสอบสถานะ Built-in AI ใหม่"
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="ตั้งค่าโมเดล"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <Sliders className="h-3.5 w-3.5 text-slate-500" />
          <span className="hidden sm:inline">ตั้งค่า</span>
        </button>

        {/* Clear Chat */}
        <button
          onClick={onClearChat}
          title="ล้างข้อความทั้งหมด"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ล้างแชท</span>
        </button>
      </div>
    </header>
  );
};
