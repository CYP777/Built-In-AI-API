import React, { useState, useEffect } from 'react';
import { detectDevice, type DeviceInfo } from '../utils/device-detection';
import { UnsupportedDeviceScreen } from './UnsupportedDeviceScreen';

interface DeviceGuardProps {
  children: React.ReactNode;
}

const DEV_BYPASS_KEY = 'dev_bypass_device_guard';

export const DeviceGuard: React.FC<DeviceGuardProps> = ({ children }) => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => detectDevice());
  const [isBypassed, setIsBypassed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(DEV_BYPASS_KEY) === 'true';
    }
    return false;
  });

  // ตรวจจับอุปกรณ์ซ้ำเมื่อโหลดและเมื่อมีการเปลี่ยนขนาดหน้าจอ
  useEffect(() => {
    const check = () => {
      setDeviceInfo(detectDevice());
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  const handleBypass = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DEV_BYPASS_KEY, 'true');
    }
    setIsBypassed(true);
  };

  // หากเป็นอุปกรณ์ที่ไม่รองรับ (เช่น iPad, iPhone, หรืออุปกรณ์พกพา) และไม่ได้เปิดโหมด Bypass
  // ให้แสดงหน้าต่างดักออกและระงับการเข้าใช้งานทันที
  if (!deviceInfo.isSupported && !isBypassed) {
    return (
      <UnsupportedDeviceScreen
        deviceInfo={deviceInfo}
        onBypassDev={import.meta.env.DEV ? handleBypass : undefined}
      />
    );
  }

  return <>{children}</>;
};
