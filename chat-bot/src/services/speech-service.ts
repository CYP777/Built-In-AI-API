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

class SpeechService {
  private recognition: ISpeechRecognition | null = null;
  private listening: boolean = false;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as Record<string, unknown>;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  private getRecognitionConstructor(): (new () => ISpeechRecognition) | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as Record<string, new () => ISpeechRecognition>;
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }

  public isProcessLocallySupported(): boolean {
    const Ctor = this.getRecognitionConstructor();
    if (!Ctor) return false;
    try {
      const instance = new Ctor();
      return 'processLocally' in instance;
    } catch {
      return false;
    }
  }

  public isListening(): boolean {
    return this.listening;
  }

  public startListening(
    callbacks: SpeechListenerCallbacks,
    options?: SpeechRecognitionOptions
  ): boolean {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.recognition = null;
      this.listening = false;
    }

    const Ctor = this.getRecognitionConstructor();
    if (!Ctor) {
      callbacks.onError?.('เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition (Web Speech API)');
      return false;
    }

    try {
      this.recognition = new Ctor();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      const targetLang = options?.lang || 'th-TH';
      this.recognition.lang = targetLang;

      // Chrome's on-device small expert model currently supports English ('en-US') on desktop.
      // Other languages (like th-TH) will throw 'language-not-supported' if processLocally is forced.
      // Therefore, attempt processLocally only for English or when explicitly specified.
      const shouldAttemptLocal = options?.preferLocal && targetLang.toLowerCase().startsWith('en');
      if (shouldAttemptLocal) {
        try {
          if ('processLocally' in this.recognition) {
            this.recognition.processLocally = true;
            console.log('SpeechRecognition: Enabled on-device local processing (processLocally = true)');
          }
        } catch (e) {
          console.warn('Could not set processLocally on SpeechRecognition:', e);
        }
      }

      this.recognition.onstart = () => {
        this.listening = true;
        callbacks.onStart?.();
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
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

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('SpeechRecognition error:', event.error);

        // If on-device language pack is missing, automatically fall back to standard Web Speech recognition
        if (event.error === 'language-not-supported') {
          console.log('Language not supported on-device, falling back to standard recognition...');
          this.stopListening();
          setTimeout(() => {
            this.startListening(callbacks, { ...options, preferLocal: false });
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

      this.recognition.onend = () => {
        this.listening = false;
        callbacks.onEnd?.();
      };

      this.recognition.start();
      return true;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      this.listening = false;
      callbacks.onError?.('ไม่สามารถเริ่มต้นระบบรับเสียงได้ กรุณาลองใหม่อีกครั้ง');
      return false;
    }
  }

  public stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.listening = false;
    }
  }

  public abortListening(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.listening = false;
    }
  }
}

export const speechService = new SpeechService();
