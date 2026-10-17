import React, { useState } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  Cpu,
  Zap,
  ShieldAlert,
  Copy,
  Check,
  Ban,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Monitor,
  Wrench,
} from 'lucide-react';
import type { DeviceInfo } from '../utils/device-detection';

interface UnsupportedDeviceScreenProps {
  deviceInfo: DeviceInfo;
  onBypassDev?: () => void;
}

export const UnsupportedDeviceScreen: React.FC<UnsupportedDeviceScreenProps> = ({
  deviceInfo,
  onBypassDev,
}) => {
  const [copied, setCopied] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isAppleMobile = deviceInfo.isIpadOrIphone;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-rose-600/10 blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-emerald-600/10 blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-xl mx-auto flex flex-col gap-5 z-10">
        {/* Top Header Card */}
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/90 backdrop-blur-md p-6 sm:p-7 shadow-2xl shadow-rose-950/40 text-center">
          {/* Top Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold mb-4 tracking-tight">
            <Ban className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>อุปกรณ์นี้ไม่รองรับการใช้งาน (Access Restricted)</span>
          </div>

          {/* Warning Icon Graphic */}
          <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-rose-500/20 to-slate-800 border border-rose-500/30 shadow-inner">
            {deviceInfo.isIpad ? (
              <Tablet className="h-10 w-10 text-rose-400 animate-pulse" />
            ) : deviceInfo.isIphone ? (
              <Smartphone className="h-10 w-10 text-rose-400 animate-pulse" />
            ) : (
              <ShieldAlert className="h-10 w-10 text-rose-400 animate-pulse" />
            )}
            <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-md">
              <Ban className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            {isAppleMobile
              ? `ไม่รองรับการใช้งานบน ${deviceInfo.detectedName}`
              : 'รองรับเฉพาะคอมพิวเตอร์ Notebook / Laptop เท่านั้น'}
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
            ระบบแชทบอทนี้ประมวลผลด้วยโมเดล <strong className="text-emerald-400">Chrome Built-in AI</strong> บนชิปประมวลผล (CPU / GPU) ภายในคอมพิวเตอร์โดยตรงผ่าน Chrome Prompt API จึง<strong>ไม่สามารถใช้งานบน iPad, iPhone หรืออุปกรณ์พกพาได้</strong>
          </p>
        </div>

        {/* Comparison Cards: Allowed vs Blocked */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Allowed Devices */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <Laptop className="h-4 w-4" />
              </div>
              <span>อุปกรณ์ที่รองรับ (Allowed)</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>คอมพิวเตอร์ Notebook / Laptop</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>เครื่องคอมพิวเตอร์ Desktop (PC / Mac)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>มีชิปประมวลผล <strong>CPU / GPU</strong> ในเครื่อง</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>รัน Google Chrome (เวอร์ชัน 128+)</span>
              </li>
            </ul>
          </div>

          {/* Blocked Devices */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400">
                <Ban className="h-4 w-4" />
              </div>
              <span>อุปกรณ์ที่ถูกระงับ (Restricted)</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <Ban className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span><strong>iPad ทุกรุ่น</strong> (iPadOS)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Ban className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span><strong>iPhone ทุกรุ่น</strong> (iOS)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>แท็บเล็ตและสมาร์ทโฟนพกพาทุกชนิด</span>
              </li>
              <li className="flex items-start gap-1.5 text-slate-400 italic">
                <span>(เบราว์เซอร์ iOS ไม่มี Chrome Prompt API)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Instructions & Next Steps */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Monitor className="h-4 w-4 text-emerald-400" />
            <span>วิธีเปิดใช้งานบนคอมพิวเตอร์ของคุณ:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-300">
            <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
              <div className="font-bold text-emerald-400 mb-1">1. สลับไปใช้ Laptop</div>
              <p className="text-slate-400">เปิดเครื่อง Notebook หรือ Laptop ของคุณ</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
              <div className="font-bold text-emerald-400 mb-1">2. เปิด Google Chrome</div>
              <p className="text-slate-400">เข้าเบราว์เซอร์ Chrome บนเครื่องคอมพิวเตอร์</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
              <div className="font-bold text-emerald-400 mb-1">3. วางลิงก์นี้</div>
              <p className="text-slate-400">คัดลอก URL ด้านล่างไปเปิดใช้งานได้ทันที</p>
            </div>
          </div>

          {/* Copy Link Button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-medium text-xs sm:text-sm shadow-md transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-white" />
                <span>คัดลอกลิงก์สำเร็จแล้ว! นำไปเปิดบน Laptop ได้เลย</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-white" />
                <span>คัดลอกลิงก์เว็บไซต์นี้ (Copy Link to Laptop)</span>
              </>
            )}
          </button>
        </div>

        {/* Collapsible Device Diagnostics */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className="w-full flex items-center justify-between p-3.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <span>ข้อมูลการตรวจจับอุปกรณ์ (Device Diagnostics)</span>
            {showDiagnostics ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showDiagnostics && (
            <div className="border-t border-slate-800 p-4 bg-slate-950/60 text-[11px] text-slate-400 flex flex-col gap-2 font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">อุปกรณ์ที่ตรวจพบ:</span>
                <span className="text-rose-400 font-semibold">{deviceInfo.detectedName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">ระบบปฏิบัติการ:</span>
                <span className="text-slate-200">{deviceInfo.osName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">เบราว์เซอร์:</span>
                <span className="text-slate-200">{deviceInfo.browserName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">จุดสัมผัสหน้าจอ (Touch Points):</span>
                <span className="text-slate-200">{deviceInfo.maxTouchPoints}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">รองรับ WebGPU บนเบราว์เซอร์:</span>
                <span className={deviceInfo.hasGpu ? 'text-emerald-400' : 'text-amber-400'}>
                  {deviceInfo.hasGpu ? 'ตรวจพบ GPU API' : 'ไม่พบ WebGPU'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">สถานะการอนุญาต:</span>
                <span className="text-rose-400 font-bold flex items-center gap-1">
                  <Ban className="h-3.5 w-3.5 text-rose-400" />
                  <span>ระงับการเข้าถึง (Blocked)</span>
                </span>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 block mb-1">User Agent:</span>
                <p className="text-[10px] text-slate-400 break-all bg-slate-900 p-2 rounded border border-slate-800">
                  {deviceInfo.userAgent || '(ไม่มี User Agent)'}
                </p>
              </div>

              {/* Developer mode override button for testing */}
              {onBypassDev && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={onBypassDev}
                    className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-emerald-400 underline transition cursor-pointer"
                  >
                    <Wrench className="h-3 w-3 text-slate-500" />
                    <span>[โหมดทดสอบสำหรับนักพัฒนา] ข้ามการตรวจจับชั่วคราว (Dev Bypass)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
