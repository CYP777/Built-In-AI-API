import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Sliders,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  Database,
  FileText,
  Info,
} from 'lucide-react';
import { estimateTokens } from '../services/ai-service';
import { chatHistoryService } from '../services/chat-history-service';
import type { StorageEstimateInfo } from '../services/db-service';
import { SteppedRangeSlider } from './SteppedRangeSlider';

export type SettingsTabId = 'parameters' | 'safety' | 'guide';

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
  onOpenPolicy,
  activeModelName,
  isProfanityFilterEnabled = true,
  setIsProfanityFilterEnabled,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('parameters');
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);

  // Live Token calculations for System Prompt
  const systemPromptTokens = useMemo(() => {
    return estimateTokens(systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    if (isOpen) {
      chatHistoryService.getStorageUsage().then((info) => {
        if (info) setStorageInfo(info);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const tabs: { id: SettingsTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'parameters', label: 'พารามิเตอร์โมเดล', icon: Sliders },
    { id: 'safety', label: 'ความปลอดภัยและข้อมูล', icon: ShieldCheck },
    { id: 'guide', label: 'คู่มือการเปิดใช้งาน', icon: HelpCircle },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-2xl max-h-[88vh] rounded-3xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                ตั้งค่าโมเดล AI (Model Settings)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activeModelName || 'Chrome Built-in AI (GPU)'} • กำหนดพารามิเตอร์และระบบความปลอดภัย
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer active:scale-95"
            title="ปิด"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Sub-category Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-2.5 shrink-0">
          <div
            role="tablist"
            aria-label="หมวดหมู่การตั้งค่าโมเดล"
            className="flex items-center gap-1.5 rounded-xl bg-slate-200/60 p-1"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isSelected}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 px-3 text-xs font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected
                      ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-emerald-600' : 'text-slate-500'}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Panels */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {/* Tab 1: Parameters */}
          {activeTab === 'parameters' && (
            <div
              role="tabpanel"
              id="panel-parameters"
              aria-labelledby="tab-parameters"
              className="space-y-5 animate-in fade-in duration-150"
            >
              {/* System Prompt */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    System Prompt (บทบาทและคำสั่งหลัก)
                  </label>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    ~{systemPromptTokens} Tokens
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="เช่น: คุณคือผู้ช่วย AI ที่ชาญฉลาดและเป็นมิตร ให้ตอบคำถามอย่างถูกต้อง สุภาพ และกระชับ..."
                  className="w-full min-h-36 rounded-xl border border-slate-200 p-3.5 text-sm leading-relaxed focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-100 transition resize-y text-slate-700"
                />
                <p className="text-[11px] text-slate-400">
                  กำหนดบทบาท คำสั่งเฉพาะ และขอบเขตการตอบของ AI (สามารถลากมุมขวาล่างเพื่อขยายช่องกรอกได้)
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
            </div>
          )}

          {/* Tab 2: Safety & Data */}
          {activeTab === 'safety' && (
            <div
              role="tabpanel"
              id="panel-safety"
              aria-labelledby="tab-safety"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Profanity & Safety Filter Toggle Card */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs hover:border-emerald-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    <ShieldAlert className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                      <span>ตัวกรองและตรวจจับคำหยาบคาย (Profanity Filter)</span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        แนะนำ
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      ตรวจจับคำหยาบ ถ้อยคำรุนแรง และปฏิเสธการประมวลผลอย่างสุภาพตามนโยบายความปลอดภัย AI (เสาหลักที่ 2)
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                  <input
                    type="checkbox"
                    checked={isProfanityFilterEnabled}
                    onChange={(e) => setIsProfanityFilterEnabled?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Local Database Card */}
              <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60">
                      <Database className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">ฐานข้อมูลในเครื่อง (Local Storage)</h4>
                      <p className="text-[11px] text-slate-500">IndexedDB • จัดเก็บบนเบราว์เซอร์ 100%</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                    ส่วนตัว & ปลอดภัย
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  บันทึกข้อความ รูปภาพ และไฟล์เสียงทั้งหมดลงบนอุปกรณ์ของคุณโดยตรง ไม่ส่งข้อมูลออกสู่คลาวด์ สอดคล้องตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
                </p>
                {storageInfo && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                      <span>พื้นที่ที่ใช้งาน: <strong>{storageInfo.usageFormatted}</strong></span>
                      <span className="text-slate-400">จากโควตาทั้งหมด {storageInfo.quotaFormatted}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                      <div
                        className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(storageInfo.percentage, 0.5)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* AI Safety Policy Access Card */}
              {onOpenPolicy && (
                <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">ข้อตกลงและนโยบายความปลอดภัย AI</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        อ่านข้อกำหนด 4 เสาหลักด้านความถูกต้อง ปลอดภัย ข้อมูลส่วนบุคคล และความโปร่งใส
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPolicy();
                    }}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
                  >
                    ดูนโยบาย
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Guide */}
          {activeTab === 'guide' && (
            <div
              role="tabpanel"
              id="panel-guide"
              aria-labelledby="tab-guide"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Built-in AI Guide Box */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 space-y-3.5 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <HelpCircle className="h-4.5 w-4.5 text-emerald-600" />
                  <span>วิธีเปิดใช้งาน Chrome Built-in AI (Prompt API)</span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-slate-600 pl-1 leading-relaxed">
                  <li>
                    ใช้ <strong>Google Chrome</strong> (เวอร์ชัน 138 ขึ้นไป หรือ Chrome Canary/Dev)
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://chrome-urls/</code> → เลือก <strong>Enable internals debugging pages</strong>
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://flags/#prompt-api</code> → เลือก <strong>Enabled</strong>
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://flags/#prompt-api-multimodal-input</code> → เลือก <strong>Enabled</strong> (สำหรับส่งรูปภาพ)
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://flags/#optimization-guide-debug-logs</code> → เลือก <strong>Enabled</strong>
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://flags/#enable-experimental-web-platform-features</code> → เลือก <strong>Enabled</strong>
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://components</code> → กด <strong>Check for update</strong> ที่ <em>Optimization Guide On Device Model</em>
                  </li>
                  <li>
                    ไปที่ <code className="bg-slate-200/90 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono">chrome://on-device-internals/</code> → เลือกแท็บ <strong>Broker State</strong>
                  </li>
                  <li>
                    เลื่อนไปที่ <strong>Use Cases</strong> → กดเลือกงานที่ต้องการใช้งาน → เลื่อนไปที่ <strong>Assets</strong> จะเห็นว่ารายชื่อโมเดลนั้น ๆ กำลังดาวน์โหลดเก็บไว้
                  </li>
                </ol>
              </div>

              {/* Requirement Hint Note */}
              <div className="flex items-start gap-3 p-4 text-xs text-emerald-900 leading-relaxed">
                <Info className="h-4.5 w-4.5 text-emerald-700 shrink-0 mt-0.5" />
                <p>
                  <strong>คำแนะนำเพิ่มเติม:</strong> หากตั้งค่า Flags ครบถ้วนแล้วแต่โมเดลยังไม่เริ่มต้น ให้ตรวจสอบว่าอุปกรณ์มีพื้นที่ว่างในดิสก์อย่างน้อย 2-4 GB สำหรับดาวน์โหลด Gemini Nano ลงสู่เครื่อง
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => {
              onSaveAndReset();
              onClose();
            }}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            บันทึกการตั้งค่าและเริ่มแชทใหม่
          </button>
        </div>
      </div>
    </div>
  );
};
