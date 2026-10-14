export interface DeviceInfo {
  isSupported: boolean;
  isIpadOrIphone: boolean;
  isIpad: boolean;
  isIphone: boolean;
  isMobileOrTablet: boolean;
  deviceType: 'notebook-laptop' | 'desktop' | 'ipad' | 'iphone' | 'android' | 'other-mobile';
  detectedName: string;
  osName: string;
  browserName: string;
  hasGpu: boolean;
  cpuCores: number;
  maxTouchPoints: number;
  userAgent: string;
  platform: string;
  reason?: string;
}

/**
 * ตรวจสอบความเข้ากันได้ของอุปกรณ์:
 * - รองรับเฉพาะคอมพิวเตอร์ Notebook / Laptop / Desktop ที่มี CPU/GPU และรันบนระบบปฏิบัติการ Desktop
 * - ดักและบล็อกการใช้งานจาก iPad, iPhone (iOS/iPadOS) และอุปกรณ์มือถือ/แท็บเล็ต 100%
 */
export function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSupported: true,
      isIpadOrIphone: false,
      isIpad: false,
      isIphone: false,
      isMobileOrTablet: false,
      deviceType: 'notebook-laptop',
      detectedName: 'คอมพิวเตอร์ Notebook / Laptop',
      osName: 'Desktop OS',
      browserName: 'Google Chrome',
      hasGpu: true,
      cpuCores: 8,
      maxTouchPoints: 0,
      userAgent: '',
      platform: '',
    };
  }

  const ua = navigator.userAgent || '';
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const cpuCores = navigator.hardwareConcurrency || 4;

  // 1. ตรวจสอบ iPhone หรือ iPod Touch
  const isIphone = /iPhone|iPod/i.test(ua) || /iPhone|iPod/i.test(platform);

  // 2. ตรวจสอบ iPad:
  // - iPad Classic: userAgent มีคำว่า "iPad" หรือ platform เป็น "iPad"
  // - iPadOS 13+ (Modern iPad): ปลอมตัวเป็น Mac Desktop (Macintosh / MacIntel) แต่มีจอสัมผัส (maxTouchPoints > 1) ในขณะที่เครื่อง Mac จริงไม่มีจอสัมผัส (maxTouchPoints = 0)
  const isIpadClassic = /iPad/i.test(ua) || /iPad/i.test(platform);
  const isMacPlatform =
    (/MacIntel|Macintosh|MacPPC|Mac68K/i.test(platform) || ua.includes('Macintosh')) && !isIphone;
  const isIpadModern = isMacPlatform && maxTouchPoints > 1;
  const isIpad = !isIphone && (isIpadClassic || isIpadModern);

  const isIpadOrIphone = isIphone || isIpad;

  // 3. ตรวจสอบอุปกรณ์ Android (มือถือ/แท็บเล็ต)
  const isAndroid = /Android/i.test(ua) || /Android/i.test(platform);

  // 4. ตรวจสอบอุปกรณ์พกพาอื่นๆ
  const isOtherMobile =
    /webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    Boolean((navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);

  // สรุปรวมอุปกรณ์พกพา / แท็บเล็ตทั้งหมด
  const isMobileOrTablet = isIpadOrIphone || isAndroid || isOtherMobile;

  // ระบบปฏิบัติการ
  let osName = 'Desktop OS';
  if (isIphone) {
    osName = 'iOS (iPhone)';
  } else if (isIpad) {
    osName = 'iPadOS (iPad)';
  } else if (isAndroid) {
    osName = 'Android OS';
  } else if (/Win32|Win64|Windows/i.test(platform) || ua.includes('Windows')) {
    osName = 'Windows';
  } else if (isMacPlatform) {
    osName = 'macOS';
  } else if (/Linux/i.test(platform) || ua.includes('Linux')) {
    osName = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    osName = 'ChromeOS';
  }

  // เบราว์เซอร์
  let browserName = 'Web Browser';
  if (/Edg/i.test(ua)) {
    browserName = 'Microsoft Edge';
  } else if (/Chrome|CriOS/i.test(ua)) {
    browserName = 'Google Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browserName = 'Apple Safari';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browserName = 'Mozilla Firefox';
  }

  // จำแนกประเภทอุปกรณ์และผลการรองรับ
  let deviceType: DeviceInfo['deviceType'];
  let detectedName: string;
  let isSupported: boolean;
  let reason: string | undefined;

  if (isIphone) {
    deviceType = 'iphone';
    detectedName = 'iPhone (iOS)';
    isSupported = false;
    reason = 'ระบบ Built-in AI ไม่รองรับบน iPhone (iOS) เนื่องจากเบราว์เซอร์บน iOS ไม่มี Chrome Prompt API บนเครื่อง';
  } else if (isIpad) {
    deviceType = 'ipad';
    detectedName = 'iPad (iPadOS)';
    isSupported = false;
    reason = 'ระบบ Built-in AI ไม่รองรับบน iPad (iPadOS) เนื่องจากเบราว์เซอร์บน iPadOS ไม่มี Chrome Prompt API บนเครื่อง';
  } else if (isAndroid) {
    deviceType = 'android';
    detectedName = 'อุปกรณ์ Android (มือถือ/แท็บเล็ต)';
    isSupported = false;
    reason = 'ระบบ Built-in AI รองรับเฉพาะ Google Chrome บนคอมพิวเตอร์ Notebook / Laptop / Desktop เท่านั้น';
  } else if (isOtherMobile) {
    deviceType = 'other-mobile';
    detectedName = 'อุปกรณ์พกพา (Mobile Device)';
    isSupported = false;
    reason = 'ระบบรองรับเฉพาะคอมพิวเตอร์ Notebook หรือ Laptop ที่มี CPU/GPU เท่านั้น';
  } else {
    deviceType = 'notebook-laptop';
    detectedName = `คอมพิวเตอร์ Notebook / Laptop (${osName})`;
    isSupported = true;
  }

  return {
    isSupported,
    isIpadOrIphone,
    isIpad,
    isIphone,
    isMobileOrTablet,
    deviceType,
    detectedName,
    osName,
    browserName,
    hasGpu,
    cpuCores,
    maxTouchPoints,
    userAgent: ua,
    platform: String(platform),
    reason,
  };
}
