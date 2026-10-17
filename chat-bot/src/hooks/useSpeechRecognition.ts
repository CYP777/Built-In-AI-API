import { useState, useRef, useCallback, useEffect } from 'react';
import { speechService } from '../services/speech-service';

export interface UseSpeechRecognitionOptions {
  onFinalTranscript?: (text: string) => void;
  onError?: (errorMessage: string) => void;
  initialLang?: 'th-TH' | 'en-US';
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  speechLang: 'th-TH' | 'en-US';
  setSpeechLang: (lang: 'th-TH' | 'en-US') => void;
  interimTranscript: string;
  isSpeechSupported: boolean;
  isLocalSpeechSupported: boolean;
  toggleListening: (currentBaseText?: string) => void;
  stopListening: () => void;
}

export function useSpeechRecognition({
  onFinalTranscript,
  onError,
  initialLang = 'th-TH',
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechLang, setSpeechLang] = useState<'th-TH' | 'en-US'>(initialLang);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isSpeechSupported] = useState<boolean>(() => speechService.isSupported());
  const [isLocalSpeechSupported] = useState<boolean>(() => speechService.isProcessLocallySupported());

  const speechBaseTextRef = useRef<string>('');

  const stopListening = useCallback(() => {
    speechService.stopListening();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const toggleListening = useCallback(
    (currentBaseText = '') => {
      if (isListening) {
        stopListening();
        return;
      }

      speechBaseTextRef.current = currentBaseText.trim();

      const started = speechService.startListening(
        {
          onStart: () => {
            setIsListening(true);
          },
          onInterim: (text) => {
            setInterimTranscript(text);
          },
          onFinal: (text) => {
            const base = speechBaseTextRef.current;
            const fullText = base ? `${base} ${text}` : text;
            onFinalTranscript?.(fullText);
            setInterimTranscript('');
          },
          onError: (err) => {
            const errMsg = typeof err === 'string' ? err : 'เกิดข้อผิดพลาดในการรับเสียงจากไมโครโฟน';
            onError?.(errMsg);
            setIsListening(false);
            setInterimTranscript('');
          },
          onEnd: () => {
            setIsListening(false);
            setInterimTranscript('');
          },
        },
        { lang: speechLang, preferLocal: true }
      );

      if (!started) {
        setIsListening(false);
      }
    },
    [isListening, speechLang, stopListening, onFinalTranscript, onError]
  );

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      speechService.stopListening();
    };
  }, []);

  return {
    isListening,
    speechLang,
    setSpeechLang,
    interimTranscript,
    isSpeechSupported,
    isLocalSpeechSupported,
    toggleListening,
    stopListening,
  };
}
