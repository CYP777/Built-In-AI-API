import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  Sparkles,
} from 'lucide-react';

export interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  onAppendToPrompt?: (shouldAppend: boolean) => void;
  isAppended?: boolean;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  onAppendToPrompt,
  isAppended = true,
}) => {
  const [agreed, setAgreed] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleToggleAppend = (checked: boolean) => {
    if (onAppendToPrompt) {
      onAppendToPrompt(checked);
    }
  };

  const handleConfirm = () => {
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-xl max-h-[90vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-tight">
                ข้อตกลงและนโยบายความปลอดภัย AI
              </h3>
              <p className="text-[11px] text-slate-500">
                มาตรฐานความปลอดภัยและคุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white">
          {/* Welcome Info Box */}
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 text-xs text-slate-700">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-1">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>ยินดีต้อนรับสู่ระบบแชทบอท On-Device AI</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              ระบบนี้ประมวลผลด้วยโมเดล On-Device บนอุปกรณ์ของคุณโดยตรง เพื่อความถูกต้องและปลอดภัยสูงสุด
              โปรดศึกษานโยบายความปลอดภัยและข้อกำหนดหลัก 4 ประการด้านล่างก่อนเริ่มต้นการสนทนา
            </p>
          </div>

          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Pillar 1 */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs">
                  1
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    นโยบายความถูกต้องและต้านข้อมูลเท็จ (Truth & Anti-Hallucination)
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    ปัญญาประดิษฐ์ต้องตอบข้อซักถามบนพื้นฐานข้อเท็จจริง หลีกเลี่ยงการกุเรื่องหรือชี้นำผิด ๆ
                    หากไม่มีข้อมูลที่แน่นอน จะแจ้งความไม่แน่นอนอย่างตรงไปตรงมาเพื่อสกัดกั้นข้อมูลเท็จ
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs">
                  2
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    นโยบายความปลอดภัยและเนื้อหาต้องห้าม (Safety & Prohibited Content)
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    ปฏิเสธการสร้างหรือเผยแพร่เนื้อหาที่ผิดกฎหมาย การพนัน สื่อลามกอนาจาร การสนับสนุนความรุนแรง
                    การคุกคาม หมิ่นประมาท คำพูดสร้างความเกลียดชัง (Hate Speech) หรือการละเมิดสิทธิมนุษยชน
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs">
                  3
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    นโยบายคุ้มครองข้อมูลส่วนบุคคล On-Device (PDPA Compliance)
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    บทสนทนาและคำถามทั้งหมดประมวลผลบนชิปภายในเครื่องของคุณ (Local Execution) 100%
                    <strong> ไม่มีการส่งข้อมูลประวัติออกสู่อินเทอร์เน็ตหรือจัดเก็บบนเซิร์ฟเวอร์ภายนอก</strong> สอดคล้องตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
                  </p>
                </div>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-300 transition">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs">
                  4
                </div>
                <div>
                  <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                    ความเป็นกลางและความรับผิดชอบ (Neutrality & Transparency)
                  </h5>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    วางตัวเป็นกลางในประเด็นทางสังคม และเปิดเผยอย่างโปร่งใสว่าเป็นผลลัพธ์จากเทคโนโลยี AI
                    ขอให้ผู้ใช้งานใช้วิจารณญาณในการนำข้อมูลไปอ้างอิง
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Checkboxes Area */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2 text-xs text-slate-700">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
              />
              <span className="font-medium text-slate-800">
                ข้าพเจ้าได้อ่านและเข้าใจข้อกำหนดนโยบายความปลอดภัยและจริยธรรม AI ฉบับนี้แล้ว
              </span>
            </label>

            {onAppendToPrompt && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none text-slate-600">
                <input
                  type="checkbox"
                  checked={isAppended}
                  onChange={(e) => handleToggleAppend(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                />
                <span className={isAppended ? 'font-medium text-slate-800' : 'text-slate-500'}>
                  ผนวกข้อกำหนดนโยบายนี้เข้าสู่ System Prompt ของ AI โดยอัตโนมัติ
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">
              ประมวลผลบนเครื่อง 100%
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60 transition"
            >
              ปิด
            </button>
            <button
              type="button"
              disabled={!agreed}
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Check className="h-4 w-4" />
              <span>ยอมรับนโยบาย</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
