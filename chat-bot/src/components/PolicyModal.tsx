import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  AlertTriangle,
} from 'lucide-react';

export interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  onRevoke?: () => void;
  isAlreadyAccepted?: boolean;
  onAppendToPrompt?: (shouldAppend: boolean) => void;
  isAppended?: boolean;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  onRevoke,
  isAlreadyAccepted = false,
  onAppendToPrompt,
  isAppended = true,
}) => {
  const [agreed, setAgreed] = useState<boolean>(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when modal opens
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  // Close on Escape when policy is already accepted
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAlreadyAccepted) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAlreadyAccepted, onClose]);

  if (!isOpen) return null;

  const handleToggleAppend = (checked: boolean) => {
    if (onAppendToPrompt) {
      onAppendToPrompt(checked);
    }
  };

  const handleConfirm = () => {
    if (isAlreadyAccepted && !agreed) {
      onRevoke?.();
    } else {
      onAccept();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && isAlreadyAccepted) {
          onClose();
        }
      }}
    >
      <div className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-3xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden text-slate-800 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="policy-modal-title" className="font-bold text-slate-900 text-base leading-tight">
                  ข้อตกลงและนโยบายความปลอดภัย AI
                </h3>
                {isAlreadyAccepted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                    <Check className="h-3 w-3" />
                    ยอมรับแล้ว
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600">
                มาตรฐานความปลอดภัยและคุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="ปิดหน้าต่างข้อตกลงและนโยบายความปลอดภัย AI"
            title="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white">
          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Pillar 1 */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs">
                  1
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    ความถูกต้องและป้องกันข้อมูลเท็จ
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    ตอบคำถามบนพื้นฐานข้อเท็จจริง หลีกเลี่ยงการสร้างข้อมูลเท็จ (Hallucination) หากข้อมูลไม่ชัดเจน จะแจ้งตามตรงเพื่อความถูกต้องสูงสุด
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs">
                  2
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    ความปลอดภัยและเนื้อหาต้องห้าม
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    ไม่สร้างและไม่สนับสนุนเนื้อหาผิดกฎหมาย ความรุนแรง การคุกคาม การพนัน สื่อลามกอนาจาร หรือคำพูดสร้างความเกลียดชัง (Hate Speech)
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs">
                  3
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    คุ้มครองข้อมูลส่วนบุคคล (PDPA)
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    บทสนทนาทั้งหมดประมวลผลภายในเครื่องของคุณ 100% <strong>ไม่มีการส่งข้อมูลออกสู่อินเทอร์เน็ตหรือจัดเก็บบนเซิร์ฟเวอร์ภายนอก</strong> สอดคล้องตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs">
                  4
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    ความเป็นกลางและความโปร่งใส
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    วางตัวเป็นกลางและเปิดเผยอย่างโปร่งใสว่าเป็นผลลัพธ์จาก AI โปรดใช้วิจารณญาณในการนำข้อมูลไปอ้างอิง
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Checkboxes Area */}
          <div className="space-y-2.5 text-xs text-slate-700 px-1 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
              />
              <span className="font-medium text-slate-800">
                ฉันได้อ่านและยอมรับข้อกำหนดความปลอดภัย AI ฉบับนี้
              </span>
            </label>

            {isAlreadyAccepted && !agreed && (
              <p className="text-[11.5px] text-rose-600 font-medium pl-6.5 flex items-center gap-1.5 animate-in fade-in duration-150">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>หากเพิกถอนการยอมรับ คุณจะไม่สามารถส่งข้อความถึง AI ได้จนกว่าจะยอมรับอีกครั้ง</span>
              </p>
            )}

            {onAppendToPrompt && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none text-slate-600">
                <input
                  type="checkbox"
                  checked={isAppended}
                  onChange={(e) => handleToggleAppend(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                />
                <span className={isAppended ? 'font-medium text-slate-800' : 'text-slate-600'}>
                  ใช้นโยบายนี้กำกับคำตอบของ AI เสมอ (System Prompt)
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {isAlreadyAccepted ? 'ปิด' : 'ไม่ยอมรับ'}
          </button>

          {isAlreadyAccepted && !agreed ? (
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 active:scale-95 transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              <span>เพิกถอนการยอมรับ</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!agreed}
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isAlreadyAccepted ? 'เรียบร้อย' : 'ยอมรับข้อตกลง'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
