import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';
        const isSuccess = toast.type === 'success';

        let bgBorderColor = 'border-sky-300 bg-sky-50/95 text-sky-950 shadow-sky-900/10';
        let iconColor = 'text-sky-700';
        let IconComponent = Info;

        if (isError) {
          bgBorderColor = 'border-rose-300 bg-rose-50/95 text-rose-950 shadow-rose-900/10';
          iconColor = 'text-rose-700';
          IconComponent = AlertCircle;
        } else if (isWarning) {
          bgBorderColor = 'border-amber-300 bg-amber-50/95 text-amber-950 shadow-amber-900/10';
          iconColor = 'text-amber-700';
          IconComponent = AlertTriangle;
        } else if (isSuccess) {
          bgBorderColor = 'border-emerald-300 bg-emerald-50/95 text-emerald-950 shadow-emerald-900/10';
          iconColor = 'text-emerald-700';
          IconComponent = CheckCircle2;
        }

        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border p-3 text-xs shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${bgBorderColor}`}
          >
            <IconComponent className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
            <div className="flex-1 font-medium leading-relaxed select-text">
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="ปิดการแจ้งเตือน"
              className="shrink-0 -mr-1 -mt-1 inline-flex items-center justify-center min-h-[24px] min-w-[24px] p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-black/5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
