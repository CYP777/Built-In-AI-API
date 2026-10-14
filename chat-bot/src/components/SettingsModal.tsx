import React, { useMemo } from 'react';
import { X, Sliders, HelpCircle, ShieldAlert } from 'lucide-react';
import { estimateTokens } from '../services/ai-service';
import { SteppedRangeSlider } from './SteppedRangeSlider';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  topK: number;
  setTopK: (k: number) => void;
  onSaveAndReset: () => void;
  messagesCount?: number;
  conversationChars?: number;
  onOpenPolicy?: () => void;
  activeModelName?: string;
  isProfanityFilterEnabled?: boolean;
  setIsProfanityFilterEnabled?: (enabled: boolean) => void;
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
  activeModelName,
  isProfanityFilterEnabled = true,
  setIsProfanityFilterEnabled,
}) => {
  // Live Token calculations for System Prompt
  const systemPromptTokens = useMemo(() => {
    return estimateTokens(systemPrompt);
  }, [systemPrompt]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-tight">
                ตั้งค่าโมเดล AI (Model Settings)
              </h3>
              <p className="text-[11px] text-slate-500">
                {activeModelName || 'Chrome Built-in AI (GPU)'} • ปรับแต่งพารามิเตอร์ของโมเดล
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="ปิด"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* System Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                System Prompt (บทบาทของ AI)
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                ~{systemPromptTokens} Tokens
              </span>
            </div>
            <textarea
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="เช่น: คุณคือผู้ช่วย AI ที่ชาญฉลาดและเป็นมิตร ให้ตอบคำถามอย่างถูกต้อง สุภาพ และกระชับ..."
              className="w-full min-h-40 rounded-xl border border-slate-200 p-3.5 text-sm leading-relaxed focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-100 transition resize-y text-slate-700"
            />
            <p className="text-[11px] text-slate-400">
              กำหนดบทบาท คำสั่งเฉพาะ และลักษณะการตอบของ AI (สามารถลากมุมขวาล่างเพื่อขยายขนาดช่องกรอกเพิ่มเติมได้)
            </p>
          </div>

          {/* Temperature Stepped Slider */}
          <SteppedRangeSlider
            label="Temperature (ความคิดสร้างสรรค์)"
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={1}
            step={0.1}
            ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
            dots={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
            formatTick={(val) => val.toFixed(1)}
            badgeValue={temperature.toFixed(1)}
            minLabel="0.0 (แม่นยำ/แน่นอน)"
            maxLabel="1.0 (สร้างสรรค์/หลากหลาย)"
            description="กำหนดระดับความหลากหลายของการตอบ ยิ่งค่าต่ำคำตอบจะยิ่งตรงไปตรงมาและคงเส้นคงวา"
          />

          {/* Top-K Stepped Slider */}
          <SteppedRangeSlider
            label="Top-K (การคัดเลือกคำที่เป็นไปได้)"
            value={topK}
            onChange={setTopK}
            min={1}
            max={50}
            step={1}
            ticks={[1, 10, 20, 30, 40, 50]}
            dots={[1, 10, 20, 30, 40, 50]}
            formatTick={(val) => val.toString()}
            badgeValue={topK}
            minLabel="1 (คำตอบที่น่าจะเป็นไปได้มากที่สุด)"
            maxLabel="50 (พิจารณาคำศัพท์หลากหลาย)"
            description="จำกัดจำนวนคำที่เป็นไปได้ที่โมเดลจะพิจารณา (สำหรับ Chrome 154+ แนะนำค่า Top-K: 1 และ Temperature: 0 เพื่อรองรับระบบ MTP)"
          />

          {/* Profanity & Safety Filter Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs sm:text-sm">
                  <span>ตัวกรองและตรวจจับคำหยาบคาย (Profanity Filter)</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    แนะนำ
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  ตรวจจับคำหยาบ ถ้อยคำรุนแรง และปฏิเสธการประมวลผลอย่างสุภาพตามนโยบายความปลอดภัย AI (Pillar 2)
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
              <input
                type="checkbox"
                checked={isProfanityFilterEnabled}
                onChange={(e) => setIsProfanityFilterEnabled?.(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Built-in AI Guide Box */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <HelpCircle className="h-4 w-4 text-emerald-600" />
              <span>วิธีเปิดใช้งาน Chrome Built-in AI (Prompt API)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-500 pl-1 leading-relaxed">
              <li>ใช้ <strong>Google Chrome</strong> (เวอร์ชัน 138 ขึ้นไป หรือ Chrome Canary/Dev)</li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#prompt-api</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#prompt-api-multimodal-input</code> → เลือก <strong>Enabled</strong> (สำหรับส่งรูปภาพ)</li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#optimization-guide-debug-logs</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://flags/#enable-experimental-web-platform-features</code> → เลือก <strong>Enabled</strong></li>
              <li>ไปที่ <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px]">chrome://components</code> → กด <strong>Check for update</strong> ที่ Optimization Guide On Device Model</li>
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
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-emerald-700 transition"
          >
            บันทึกและเริ่มเซสชันใหม่
          </button>
        </div>
      </div>
    </div>
  );
};
