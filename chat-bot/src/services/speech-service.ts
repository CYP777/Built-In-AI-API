/**
 * Speech Service - Chrome Web Speech API with On-Device Small Expert Model support
 * Supports 'processLocally = true' for Chrome's on-device speech recognition model.
 * Automatically falls back to standard recognition if on-device language packs are unavailable.
 */

export interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResultItem[];
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
    isFinal: boolean;
    length: number;
  };
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

export interface SpeechListenerCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (errorMessage: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface SpeechRecognitionOptions {
  lang?: string;
  preferLocal?: boolean;
}

// Module-level state
let activeRecognition: ISpeechRecognition | null = null;
let isCurrentlyListening = false;

function getRecognitionConstructor(): (new () => ISpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as Record<string, new () => ISpeechRecognition>;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

/**
 * Checks if Web Speech API is supported in the current browser.
 */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as Record<string, unknown>;
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Checks if on-device local speech processing (processLocally) is supported.
 */
export function isProcessLocallySupported(): boolean {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) return false;
  try {
    const instance = new Ctor();
    return 'processLocally' in instance;
  } catch {
    return false;
  }
}

/**
 * Checks if the speech recognition is currently active.
 */
export function isListening(): boolean {
  return isCurrentlyListening;
}

/**
 * Starts speech recognition with real-time interim and final transcripts.
 */
export function startListening(
  callbacks: SpeechListenerCallbacks,
  options?: SpeechRecognitionOptions
): boolean {
  if (activeRecognition) {
    try {
      activeRecognition.abort();
    } catch {
      // ignore
    }
    activeRecognition = null;
    isCurrentlyListening = false;
  }

  const Ctor = getRecognitionConstructor();
  if (!Ctor) {
    callbacks.onError?.('เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition (Web Speech API)');
    return false;
  }

  try {
    activeRecognition = new Ctor();
    activeRecognition.continuous = true;
    activeRecognition.interimResults = true;
    const targetLang = options?.lang || 'th-TH';
    activeRecognition.lang = targetLang;

    // Chrome's on-device small expert model currently supports English ('en-US') on desktop.
    // Other languages (like th-TH) will throw 'language-not-supported' if processLocally is forced.
    // Therefore, attempt processLocally only for English or when explicitly specified.
    const shouldAttemptLocal = options?.preferLocal && targetLang.toLowerCase().startsWith('en');
    if (shouldAttemptLocal) {
      try {
        if ('processLocally' in activeRecognition) {
          activeRecognition.processLocally = true;
          console.log('SpeechRecognition: Enabled on-device local processing (processLocally = true)');
        }
      } catch (e) {
        console.warn('Could not set processLocally on SpeechRecognition:', e);
      }
    }

    activeRecognition.onstart = () => {
      isCurrentlyListening = true;
      callbacks.onStart?.();
    };

    activeRecognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + transcript.trim();
        } else {
          interimTranscript += (interimTranscript ? ' ' : '') + transcript.trim();
        }
      }

      if (finalTranscript) {
        callbacks.onFinal?.(finalTranscript);
      }

      if (interimTranscript) {
        const combined = finalTranscript
          ? `${finalTranscript} ${interimTranscript.trim()}`
          : interimTranscript.trim();
        callbacks.onInterim?.(combined);
      }
    };

    activeRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('SpeechRecognition error:', event.error);

      // If on-device language pack is missing, automatically fall back to standard Web Speech recognition
      if (event.error === 'language-not-supported') {
        console.log('Language not supported on-device, falling back to standard recognition...');
        stopListening();
        setTimeout(() => {
          startListening(callbacks, { ...options, preferLocal: false });
        }, 100);
        return;
      }

      if (event.error === 'not-allowed') {
        callbacks.onError?.('กรุณาอนุญาตการเข้าถึงไมโครโฟนในเบราว์เซอร์เพื่อใช้งานระบบเสียง');
      } else if (event.error === 'no-speech') {
        // No speech detected is normal silence, do not alert aggressively
      } else if (event.error === 'audio-capture') {
        callbacks.onError?.('ไม่พบอุปกรณ์ไมโครโฟน หรือไมโครโฟนถูกใช้งานโดยโปรแกรมอื่น');
      } else if (event.error === 'aborted') {
        // User stopped manually
      } else {
        callbacks.onError?.(`เกิดข้อผิดพลาดในการรับเสียง: ${event.error}`);
      }
    };

    activeRecognition.onend = () => {
      isCurrentlyListening = false;
      callbacks.onEnd?.();
    };

    activeRecognition.start();
    return true;
  } catch (err) {
    console.error('Failed to start speech recognition:', err);
    isCurrentlyListening = false;
    callbacks.onError?.('ไม่สามารถเริ่มต้นระบบรับเสียงได้ กรุณาลองใหม่อีกครั้ง');
    return false;
  }
}

/**
 * Stops active speech recognition gracefully.
 */
export function stopListening(): void {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch {
      // ignore
    }
    isCurrentlyListening = false;
  }
}

/**
 * Aborts speech recognition immediately without waiting for final transcript.
 */
export function abortListening(): void {
  if (activeRecognition) {
    try {
      activeRecognition.abort();
    } catch {
      // ignore
    }
    isCurrentlyListening = false;
  }
}

// Grouped object export for compatibility with existing imports
export const speechService = {
  isSupported: isSpeechSupported,
  isProcessLocallySupported,
  isListening,
  startListening,
  stopListening,
  abortListening,
};
