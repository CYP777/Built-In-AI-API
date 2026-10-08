import React from 'react';
import { X, Sliders, HelpCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  topK: number;
  setTopK: (k: number) => void;
  onSaveAndReset: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  setSystemPrompt,
  temperature,
  setTemperature,
  topK,
  setTopK,
  onSaveAndReset,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <Sliders className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-slate-800 text-base">ตั้งค่าโมเดล AI (Prompt Settings)</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              System Prompt (บทบาทของ AI)
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="เช่น: คุณคือผู้ช่วยเขียนโค้ด React ที่เป็นมิตรและตอบคำถามอย่างกระชับ..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-100 transition resize-none text-slate-700"
            />
            <p className="text-[12px] text-slate-400">
              กำหนดบทบาทและลักษณะการตอบของ AI ในระหว่างการสนทนา
            </p>
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Temperature (ความคิดสร้างสรรค์): <span className="text-emerald-600 font-bold">{temperature}</span>
              </label>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>0.0 (แม่นยำ/แน่นอน)</span>
              <span>1.0 (สร้างสรรค์/หลากหลาย)</span>
            </div>
          </div>

          {/* Top-K */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Top-K: <span className="text-emerald-600 font-bold">{topK}</span>
              </label>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              จำกัดจำนวนคำที่เป็นไปได้ที่โมเดลจะพิจารณา (สำหรับ Chrome 154+ แนะนำค่า Top-K: 1 และ Temperature: 0 เพื่อรองรับระบบ MTP)
            </p>
          </div>

          {/* Built-in AI Guide Box */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <HelpCircle className="h-4 w-4 text-emerald-500" />
              <span>วิธีเปิดใช้งาน Chrome Built-in AI (Prompt API)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-500 pl-1 leading-relaxed">
              <li>ใช้ <strong>Google Chrome</strong> (เวอร์ชัน 138 ขึ้นไป)</li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#prompt-api</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> → เลือก <strong>Enabled</strong> (สำหรับส่งรูปภาพ)</li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#gemma4-for-built-in-ai</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#optimization-guide-debug-logs</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#enable-experimental-web-platform-features</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://components</code> → กด <strong>Check for update</strong> ที่ Optimization Guide On DeviceModels Manifest</li>
            </ol>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-3.5">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60 transition"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => {
              onSaveAndReset();
              onClose();
            }}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
          >
            บันทึกและเริ่มเซสชันใหม่
          </button>
        </div>
      </div>
    </div>
  );
};
