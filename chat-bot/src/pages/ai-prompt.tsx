import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Square, Sparkles, Lightbulb, Code2, Globe, FileText, Info, Gauge, ArrowDown, Image as ImageIcon, X, Mic, MicOff, AlertTriangle, Layers, Plus, ShieldAlert, Music, Radio } from 'lucide-react';
import { ChatMessage, type Message } from '../components/ChatMessage';
import type { ImageAttachment, AudioAttachment } from '../types/ai';
import { ChatHeader } from '../components/ChatHeader';
import { ChatHistorySidebar } from '../components/ChatHistorySidebar';
import { SettingsModal } from '../components/SettingsModal';
import { PolicyModal } from '../components/PolicyModal';
import { SummaryModal } from '../components/SummaryModal';
import { aiService, estimateTokens, type AIServiceState } from '../services/ai-service';
import { summarizerService } from '../services/summarizer-service';
import { speechService } from '../services/speech-service';
import { chatHistoryService } from '../services/chat-history-service';
import type { ChatSession } from '../types/chat-history';
import {
  detectProfanity,
  getProfanitySafetyMessage,
  isProfanityFilterEnabled,
  setProfanityFilterEnabled,
} from '../utils/profanity-filter';

const QUICK_PROMPTS = [
  {
    icon: Lightbulb,
    title: 'อธิบายแนวคิด AI',
    prompt: 'Built-in AI (Prompt API) บน Chrome คืออะไร และมีข้อดีอย่างไรเมื่อเทียบกับ Cloud AI?',
  },
  {
    icon: Code2,
    title: 'ตัวอย่างโค้ด React',
    prompt: 'ช่วยเขียน Custom Hook ใน React สำหรับตรวจจับสถานะ Online/Offline พร้อมตัวอย่างการใช้งาน',
  },
  {
    icon: FileText,
    title: 'ร่างอีเมลภาษาทางการ',
    prompt: 'ช่วยเขียนอีเมลขอลางานเพื่อไปทำธุระส่วนตัว 1 วัน แบบสุภาพและเป็นมืออาชีพ',
  },
  {
    icon: Globe,
    title: 'แปลภาษาและปรับสำนวน',
    prompt: 'ช่วยแปลประโยคนี้เป็นภาษาอังกฤษแบบ Business Casual: "เราจะเริ่มพัฒนาฟีเจอร์นี้ในสัปดาห์หน้าตามแผนงาน"',
  },
];

const POLICY_MARKER = '[ข้อกำหนดนโยบายความถูกต้องและจริยธรรม]';
const POLICY_CLAUSE =
  '\n\n[ข้อกำหนดนโยบายความถูกต้องและจริยธรรม]: ต้องตอบโดยยึดหลักข้อเท็จจริงและความเป็นกลาง ตรวจสอบความถูกต้องอย่างรอบคอบ ปฏิเสธข้อมูลที่ผิดกฎหมายหรือสร้างความเกลียดชัง และไม่แต่งเติมข้อมูลเท็จอย่างเด็ดขาด';
const getDefaultBasePrompt = (modelName?: string): string => {
  const name = modelName || 'Chrome Built-in AI';
  return `คุณคือผู้ช่วย AI อัจฉริยะที่ประมวลผลด้วยโมเดล ${name} บนเครื่องของผู้ใช้ (On-Device) อย่างปลอดภัยและเป็นส่วนตัว ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร`;
};
const POLICY_ACCEPTED_KEY = 'ai_safety_policy_accepted';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9);
}

function getCurrentTime(): string {
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

const AIPromptPage: React.FC = () => {
  // Chat History & Session State
  const [sessions, setSessions] = useState<ChatSession[]>(() => chatHistoryService.getAllSessions());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    if (savedActiveId && all.some((s) => s.id === savedActiveId)) {
      return savedActiveId;
    }
    return all.length > 0 ? all[0].id : null;
  });
  const currentSessionIdRef = useRef<string | null>(currentSessionId);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const [messages, setMessages] = useState<Message[]>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    const target = (savedActiveId && all.find((s) => s.id === savedActiveId)) || (all.length > 0 ? all[0] : null);
    return target ? target.messages : [];
  });
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<AudioAttachment | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef<boolean>(false);
  const draftInputRef = useRef<string>('');
  const speechBaseTextRef = useRef<string>('');
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Subscribe to ChatHistoryService (IndexedDB initialization and real-time sync)
  useEffect(() => {
    const unsubscribe = chatHistoryService.subscribe((updatedSessions) => {
      setSessions(updatedSessions);
    });

    chatHistoryService.init().then((loadedSessions) => {
      setSessions(loadedSessions);
      const savedActiveId = chatHistoryService.getActiveSessionId();
      if (!currentSessionIdRef.current && savedActiveId && loadedSessions.some((s) => s.id === savedActiveId)) {
        setCurrentSessionId(savedActiveId);
        const active = loadedSessions.find((s) => s.id === savedActiveId);
        if (active) {
          setMessages(active.messages);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Helper to read File into persistent Data URL and add to selectedImages
  const processImageFile = useCallback((file: File, fallbackName?: string) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น PNG, JPG, WebP, GIF)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('ขนาดไฟล์รูปภาพเกินกำหนด (จำกัดไม่เกิน 10 MB ต่อภาพ)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSelectedImages((prev) => {
        if (prev.length >= 8) {
          alert('จำกัดการแนบรูปภาพไม่เกิน 8 รูปต่อครั้ง');
          return prev;
        }
        return [
          ...prev,
          {
            url: dataUrl,
            name: file.name || fallbackName || `image-${Date.now()}.png`,
            size: file.size,
            type: file.type || 'image/png',
            file: file,
          },
        ];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  // Helper to process audio file into AudioAttachment
  const processAudioFile = useCallback((file: File) => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|webm|aac|flac)$/i.test(file.name)) {
      alert('กรุณาเลือกไฟล์เสียง (เช่น MP3, WAV, OGG, M4A, WebM)');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert('ขนาดไฟล์เสียงเกินกำหนด (จำกัดไม่เกิน 25 MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      let audioBuffer: AudioBuffer | undefined;
      let duration: number | undefined;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const ab = await file.arrayBuffer();
          audioBuffer = await ctx.decodeAudioData(ab.slice(0));
          duration = audioBuffer.duration;
          ctx.close();
        }
      } catch (err) {
        console.warn('Audio decode error:', err);
      }

      setSelectedAudio({
        url: dataUrl,
        name: file.name,
        size: file.size,
        type: file.type || 'audio/webm',
        duration,
        blob: file,
        audioBuffer,
      });
    };
    reader.readAsDataURL(file);
  }, []);

  // Direct Audio Recording for Multimodal Prompt API
  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target?.result as string;
          let audioBuffer: AudioBuffer | undefined;
          let duration: number | undefined;
          try {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const ab = await audioBlob.arrayBuffer();
              audioBuffer = await ctx.decodeAudioData(ab.slice(0));
              duration = audioBuffer.duration;
              ctx.close();
            }
          } catch (err) {
            console.warn('decodeAudioData on recording fallback:', err);
          }

          setSelectedAudio({
            url: dataUrl,
            name: `voice-recording-${Date.now()}.webm`,
            size: audioBlob.size,
            type: mimeType,
            duration,
            blob: audioBlob,
            audioBuffer,
          });
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecordingAudio(true);
      setRecordingDuration(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed:', err);
      alert('ไม่สามารถเข้าถึงไมโครโฟนสำหรับการบันทึกเสียงได้ (กรุณาอนุญาตการเข้าถึงไมโครโฟน)');
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAudio(false);
  }, []);

  const cancelAudioRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingDuration(0);
  }, []);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            processImageFile(file);
          } else if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm|aac|flac)$/i.test(file.name)) {
            processAudioFile(file);
          }
        }
      }
    },
    [processImageFile, processAudioFile]
  );

  // Handle file select (Image attachment)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        processImageFile(files[i]);
      }
    }
    e.target.value = '';
  };

  // Handle audio file select
  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAudioFile(file);
    }
    e.target.value = '';
  };

  // Handle remove specific selected image
  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle remove selected audio
  const handleRemoveAudio = useCallback(() => {
    setSelectedAudio(null);
    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = '';
    }
  }, []);

  // Handle clipboard image paste (Ctrl + V)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file, `clipboard-image-${Date.now()}.png`);
          }
        }
      }
    },
    [processImageFile]
  );

  // Speech Recognition (Voice Input) State with On-Device Small Expert Model support
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechLang, setSpeechLang] = useState<'th-TH' | 'en-US'>('th-TH');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isSpeechSupported] = useState<boolean>(() => speechService.isSupported());
  const [isLocalSpeechSupported] = useState<boolean>(() => speechService.isProcessLocallySupported());

  // Toggle voice listening
  const handleToggleListening = () => {
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      setInterimTranscript('');
      return;
    }

    speechBaseTextRef.current = inputMessage.trim();

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
          setInputMessage(base ? `${base} ${text}` : text);
          setInterimTranscript('');
          if (textareaRef.current) {
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
                textareaRef.current.focus();
              }
            }, 50);
          }
        },
        onError: (err) => {
          alert(err);
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
  };

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      speechService.stopListening();
    };
  }, []);

  // Policy Modal State (เปิดแจ้งเตือนอัตโนมัติเฉพาะเมื่อยังไม่เคยกดยอมรับนโยบาย)
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(POLICY_ACCEPTED_KEY) !== 'true';
    }
    return false;
  });

  // Prompt History state สำหรับปุ่มลูกศรขึ้น/ลง (Arrow Up / Down)
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    const target = (savedActiveId && all.find((s) => s.id === savedActiveId)) || (all.length > 0 ? all[0] : null);
    if (!target) return [];
    return target.messages
      .filter((m) => m.sender === 'user' && m.text.trim())
      .map((m) => m.text.trim())
      .filter((text, idx, arr) => idx === 0 || text !== arr[idx - 1]);
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Profanity Filter State (ตรวจจับและกรองคำหยาบคายตามนโยบายความปลอดภัย)
  const [isProfanityFilterActive, setIsProfanityFilterActive] = useState<boolean>(() => isProfanityFilterEnabled());
  const currentInputProfanity = useMemo(() => {
    if (!isProfanityFilterActive || !inputMessage.trim()) return null;
    const res = detectProfanity(inputMessage);
    return res.hasProfanity ? res : null;
  }, [inputMessage, isProfanityFilterActive]);

  // Summarizer & Context Compression state
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [isCompressingContext, setIsCompressingContext] = useState<boolean>(false);

  const [statusState, setStatusState] = useState<AIServiceState>(() => {
    const detected = aiService.detectModelType();
    return {
      status: 'checking',
      statusMessage: `กำลังตรวจสอบ Chrome ${detected.modelName}...`,
      isMock: false,
      ...detected,
    };
  });

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    const target = (savedActiveId && all.find((s) => s.id === savedActiveId)) || (all.length > 0 ? all[0] : null);
    if (target?.systemPrompt) return target.systemPrompt;
    const detected = aiService.detectModelType();
    return getDefaultBasePrompt(detected.modelName) + POLICY_CLAUSE;
  });
  const systemPromptRef = useRef<string>(systemPrompt);
  useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);
  const [temperature, setTemperature] = useState<number>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    const target = (savedActiveId && all.find((s) => s.id === savedActiveId)) || (all.length > 0 ? all[0] : null);
    return target?.temperature ?? 0.4;
  });
  const [topK, setTopK] = useState<number>(() => {
    const savedActiveId = chatHistoryService.getActiveSessionId();
    const all = chatHistoryService.getAllSessions();
    const target = (savedActiveId && all.find((s) => s.id === savedActiveId)) || (all.length > 0 ? all[0] : null);
    return target?.topK ?? 3;
  });
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  // Auto-detected Model Information
  const activeModelInfo = useMemo(() => {
    // Re-evaluate when statusState updates (e.g. session initialized)
    void statusState.status;
    return aiService.detectModelType();
  }, [statusState.status]);

  const [showScrollBottomButton, setShowScrollBottomButton] = useState<boolean>(false);

  // Handle scroll position detection: allow user to scroll up freely without being forced down
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    if (messages.length === 0) {
      userScrolledUpRef.current = false;
      setShowScrollBottomButton(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (scrollHeight > clientHeight && distanceFromBottom > 100) {
      userScrolledUpRef.current = true;
      setShowScrollBottomButton(true);
    } else {
      userScrolledUpRef.current = false;
      setShowScrollBottomButton(false);
    }
  }, [messages.length]);

  // Scroll to bottom helper (instant during streaming, smooth on user request)
  const scrollToBottom = useCallback((smooth = false) => {
    userScrolledUpRef.current = false;
    setShowScrollBottomButton(false);
    if (scrollContainerRef.current) {
      if (smooth) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, []);

  // Auto-scroll to bottom of messages only when user hasn't scrolled up
  useEffect(() => {
    if (messages.length === 0) {
      userScrolledUpRef.current = false;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      return;
    }
    if (userScrolledUpRef.current) return;
    if (scrollContainerRef.current) {
      // Direct scrollTop assignment does NOT block or fight the mouse wheel
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Restore focus to textarea when generation finishes
  useEffect(() => {
    if (!isGenerating) {
      textareaRef.current?.focus();
    }
  }, [isGenerating]);

  // Check Built-in AI on load / refresh
  const verifyAI = useCallback(async () => {
    const state = await aiService.checkAvailability();
    const detected = aiService.detectModelType();
    const isDefaultBase = systemPrompt.includes('คุณคือผู้ช่วย AI อัจฉริยะ');
    const dynamicPrompt = isDefaultBase
      ? getDefaultBasePrompt(detected.modelName) + (systemPrompt.includes(POLICY_MARKER) ? POLICY_CLAUSE : '')
      : systemPrompt;

    await aiService.initSession({
      systemPrompt: dynamicPrompt,
      temperature,
      topK,
    });
    if (aiService.hasActiveSession()) {
      setStatusState({
        status: 'available',
        statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
        isMock: false,
        ...detected,
      });
    } else {
      setStatusState({
        ...state,
        status: 'unavailable',
        isMock: true,
        statusMessage: 'ไม่สามารถสร้างเซสชัน AI บนอุปกรณ์ได้ (เบราว์เซอร์อยู่ในโหมดจำลอง)',
      });
    }
  }, [systemPrompt, temperature, topK]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const state = await aiService.checkAvailability();
      const detected = aiService.detectModelType();
      const dynamicPrompt = getDefaultBasePrompt(detected.modelName) + POLICY_CLAUSE;

      if (!ignore) {
        setSystemPrompt(dynamicPrompt);
        await aiService.initSession({
          systemPrompt: dynamicPrompt,
          temperature,
          topK,
        });

        if (aiService.hasActiveSession()) {
          setStatusState({
            status: 'available',
            statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
            isMock: false,
            ...detected,
          });
        } else {
          setStatusState({
            ...state,
            status: 'unavailable',
            isMock: true,
            statusMessage: 'ไม่สามารถสร้างเซสชัน AI บนอุปกรณ์ได้ (เบราว์เซอร์อยู่ในโหมดจำลอง)',
          });
        }
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Context Window Token Metrics
  const conversationChars = useMemo(() => {
    return messages
      .filter((m) => !m.isCompacted && !m.isCompressedContext)
      .reduce((acc, m) => {
        const textLen = m.text ? m.text.length : 0;
        const imgEquivalentChars = m.imageAttachment ? 1200 : 0; // ~300 tokens per image
        return acc + textLen + imgEquivalentChars;
      }, 0);
  }, [messages]);

  const conversationTokens = useMemo(() => {
    return messages
      .filter((m) => !m.isCompacted && !m.isCompressedContext)
      .reduce((acc, m) => {
        const textTokens = m.text ? estimateTokens(m.text) : 0;
        const imgTokens = (m.imageAttachments?.length || (m.imageAttachment ? 1 : 0)) * 300;
        const audioTokens = m.audioAttachment ? 300 : 0;
        return acc + textTokens + imgTokens + audioTokens;
      }, 0);
  }, [messages]);

  const tokenUsage = useMemo(() => {
    const draftTokens = inputMessage.trim() ? estimateTokens(inputMessage.trim()) : 0;
    const draftImgTokens = selectedImages.length * 300;
    const draftAudioTokens = selectedAudio ? 300 : 0;
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    return aiService.getContextTokenUsage(
      conversationTokens + systemTokens + draftTokens + draftImgTokens + draftAudioTokens
    );
  }, [conversationTokens, systemPrompt, inputMessage, selectedImages, selectedAudio]);

  const maxTokens = tokenUsage.maxTokens || 9216;
  const tokensSoFar = Math.min(tokenUsage.tokensSoFar, maxTokens);
  const tokensLeft = Math.max(0, maxTokens - tokensSoFar);
  const contextPercentage = Math.min(100, Math.round((tokensSoFar / maxTokens) * 1000) / 10);

  // Check whether policy is currently appended in systemPrompt
  const isPolicyAppended = useMemo(() => {
    return systemPrompt.includes(POLICY_MARKER);
  }, [systemPrompt]);

  // Policy Handlers
  const handleAcceptPolicy = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(POLICY_ACCEPTED_KEY, 'true');
    }
    setIsPolicyModalOpen(false);
  };

  const handleTogglePolicyInPrompt = useCallback((shouldAppend: boolean) => {
    setSystemPrompt((prev) => {
      let next = prev;
      if (shouldAppend) {
        if (!prev.includes(POLICY_MARKER)) {
          next = prev.trim() + POLICY_CLAUSE;
        }
      } else {
        if (prev.includes(POLICY_MARKER)) {
          const markerIndex = prev.indexOf(POLICY_MARKER);
          next = prev.substring(0, markerIndex).trim();
        }
      }
      systemPromptRef.current = next;
      return next;
    });
  }, []);

  // Context Compression using Summarizer API
  const handleCompressChatContext = useCallback(
    async (targetMessages?: Message[], customSystemPrompt?: string) => {
      const currentPrompt = customSystemPrompt || systemPromptRef.current || systemPrompt;
      const allActive = (messagesRef.current || messages).filter(
        (m) => !m.isCompressedContext && m.text.trim()
      );
      const uncompacted = allActive.filter((m) => !m.isCompacted);

      // If triggered manually by user without specific target messages
      if (!targetMessages) {
        if (allActive.length === 0) {
          alert('ยังไม่มีประวัติการสนทนาในห้องนี้สำหรับการบีบอัด');
          return null;
        }
        if (uncompacted.length === 0) {
          alert('ประวัติการสนทนาทั้งหมดในห้องนี้ได้รับการบีบอัดลงในบริบทเรียบร้อยแล้ว');
          setIsSummaryModalOpen(false);
          return null;
        }
        if (uncompacted.length < 2) {
          alert('จำเป็นต้องมีบทสนทนาอย่างน้อย 2 ข้อความ (คำถามและคำตอบ) ขึ้นไปเพื่อทำการบีบอัดบริบท');
          return null;
        }
      }

      const rawMessages = targetMessages ?? uncompacted;
      if (rawMessages.length === 0 || isCompressingContext) return null;

      setIsCompressingContext(true);
      try {
        let result;
        try {
          result = await summarizerService.compressChatContext(
            rawMessages.map((m) => ({ sender: m.sender, text: m.text })),
            currentPrompt
          );
        } catch (compressErr) {
          console.warn('Context compression error, using dynamic multi-turn fallback:', compressErr);
          const userTopics = rawMessages
            .filter((m) => m.sender === 'user' && m.text.trim())
            .map((m) => m.text.trim().replace(/\n+/g, ' '));
          const topicSummary =
            userTopics.length > 0
              ? userTopics
                  .map((q, idx) => `- ประเด็นที่ ${idx + 1}: ${q.length > 90 ? q.substring(0, 85).trim() : q}`)
                  .join('\n')
              : '- สอบถามข้อมูลและสนทนาทั่วไป';
          const fallbackSummary = `สรุปประวัติเดิม (${userTopics.length} ประเด็น):\n${topicSummary}\n- ข้อสรุป: AI ได้ให้คำตอบและคำแนะนำเรียบร้อยแล้ว`;
          const contextHeader = '\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:\n' + fallbackSummary + '\n---';
          const cleanBase = currentPrompt.split('\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:')[0].trim();
          result = {
            compressedSummary: fallbackSummary,
            newSystemPrompt: cleanBase + contextHeader,
            originalTokens: 800,
            compressedTokens: 150,
            savedTokens: 650,
            percentageSaved: 81,
          };
        }

        const compressionNotice: Message = {
          id: `compress-${generateId()}`,
          sender: 'system',
          text: result.compressedSummary,
          timestamp: getCurrentTime(),
          isCompressedContext: true,
          compressionStats: {
            originalTokens: result.originalTokens,
            compressedTokens: result.compressedTokens,
            savedTokens: result.savedTokens,
            percentageSaved: result.percentageSaved,
          },
        };

        // Reset prompt session with the new compressed context injected into system prompt
        systemPromptRef.current = result.newSystemPrompt;
        setSystemPrompt(result.newSystemPrompt);
        aiService.resetSession();
        await aiService.initSession({
          systemPrompt: result.newSystemPrompt,
          temperature,
          topK,
        });

        // Mark target messages as compacted and insert the "Conversation compacted" divider
        const targetIds = new Set(rawMessages.map((m) => m.id));
        const currentList = messagesRef.current;
        let lastTargetIndex = -1;
        for (let i = 0; i < currentList.length; i++) {
          if (targetIds.has(currentList[i].id)) {
            lastTargetIndex = i;
          }
        }

        const resultList: Message[] = [];
        for (let i = 0; i < currentList.length; i++) {
          const msg = currentList[i];
          if (targetIds.has(msg.id)) {
            resultList.push({ ...msg, isCompacted: true });
          } else {
            resultList.push(msg);
          }
          if (i === lastTargetIndex) {
            resultList.push(compressionNotice);
          }
        }

        if (lastTargetIndex === -1) {
          resultList.push(compressionNotice);
        }

        // Synchronously update messagesRef.current so subsequent code uses compacted messages
        messagesRef.current = resultList;
        setMessages(resultList);

        const activeId = currentSessionIdRef.current;
        if (activeId) {
          chatHistoryService.updateSessionMessages(activeId, resultList, result.newSystemPrompt);
          setSessions(chatHistoryService.getAllSessions());
        }

        setIsSummaryModalOpen(false);
        return { resultList, newSystemPrompt: result.newSystemPrompt };
      } catch (err) {
        console.error('Context compression failed:', err);
        return null;
      } finally {
        setIsCompressingContext(false);
      }
    },
    [messages, systemPrompt, temperature, topK, isCompressingContext, setSystemPrompt, setIsSummaryModalOpen]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  }, []);

  // Start New Chat (Clear current session without losing saved history)
  const handleNewChat = useCallback(async () => {
    handleStop();
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      setInterimTranscript('');
    }
    userScrolledUpRef.current = false;
    setShowScrollBottomButton(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setSelectedImages([]);
    setSelectedAudio(null);
    if (isRecordingAudio) {
      cancelAudioRecording();
    }
    messagesRef.current = [];
    setMessages([]);
    setCurrentSessionId(null);
    chatHistoryService.setActiveSessionId(null);
    setPromptHistory([]);
    setHistoryIndex(-1);
    draftInputRef.current = '';

    const detected = aiService.detectModelType();
    const defaultPrompt =
      getDefaultBasePrompt(detected.modelName) + (isPolicyAppended ? POLICY_CLAUSE : '');
    systemPromptRef.current = defaultPrompt;
    setSystemPrompt(defaultPrompt);
    aiService.resetSession();
    await aiService.initSession({
      systemPrompt: defaultPrompt,
      temperature,
      topK,
    });
  }, [handleStop, isListening, isRecordingAudio, cancelAudioRecording, isPolicyAppended, temperature, topK]);

  // Handle Send
  const handleSend = async (textToSend?: string) => {
    // If voice listening is active, stop it gracefully
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      setInterimTranscript('');
    }
    if (isRecordingAudio) {
      stopAudioRecording();
    }

    const promptText = (textToSend || inputMessage).trim();
    const currentImages = [...selectedImages];
    const currentAudio = selectedAudio;
    if ((!promptText && currentImages.length === 0 && !currentAudio) || isGenerating) return;

    const defaultPromptDesc =
      currentImages.length > 1
        ? 'โปรดวิเคราะห์และเปรียบเทียบรูปภาพเหล่านี้'
        : currentImages.length === 1
        ? 'ช่วยวิเคราะห์รูปภาพนี้'
        : currentAudio
        ? 'โปรดฟังและตอบสนองต่อเสียงนี้'
        : '';

    const effectiveUserPrompt = promptText || defaultPromptDesc;
    let activeSystemPrompt = systemPromptRef.current || systemPrompt;

    // 1. ตรวจสอบก่อนส่ง: บีบอัดอัตโนมัติเฉพาะเมื่อ Token วิกฤตจริงๆ (เหลือ <= 350 หรือใช้ไป >= 96%) เพื่อให้ใช้งานได้คุ้มค่าที่สุด
    const activeRawMessages = (messagesRef.current || messages).filter(
      (m) => !m.isCompressedContext && !m.isCompacted && m.text.trim()
    );
    const estPromptTokens = estimateTokens(effectiveUserPrompt) + 200;
    const isTokensCritical =
      tokensLeft <= 350 ||
      (tokensLeft - estPromptTokens < 250) ||
      tokensSoFar + estPromptTokens >= maxTokens * 0.96 ||
      contextPercentage >= 96;

    if (isTokensCritical) {
      // หากหน่วยความจำเต็มหรือเกือบเต็ม (9,216/9,216 หรือ tokensLeft <= 100) และไม่มีข้อความให้บีบอัดแล้ว
      if ((tokensLeft <= 100 || tokensSoFar >= maxTokens) && activeRawMessages.length < 2) {
        const confirmNewChat = window.confirm(
          `บริบทการสนทนาเต็มแล้ว (${tokensSoFar.toLocaleString()} / ${maxTokens.toLocaleString()} Tokens)\n\nระบบไม่สามารถรับคำสั่งเพิ่มเติมในห้องแชทเดิมได้เนื่องจากเต็มโควตา On-Device Model\n\nต้องการเริ่มห้องแชทใหม่และส่งข้อความนี้เลยหรือไม่? (ประวัติการสนทนาเดิมจะถูกบันทึกเก็บไว้ให้อัตโนมัติ)`
        );
        if (confirmNewChat) {
          await handleNewChat();
          setTimeout(() => {
            handleSend(effectiveUserPrompt);
          }, 80);
          return;
        } else {
          return;
        }
      }

      if (activeRawMessages.length >= 2) {
        const compResult = await handleCompressChatContext(activeRawMessages, activeSystemPrompt);
        if (compResult) {
          activeSystemPrompt = compResult.newSystemPrompt;
        }
      }
    }

    // บันทึกลงใน promptHistory สำหรับการกดลูกศรขึ้น/ลง
    if (promptText) {
      setPromptHistory((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === promptText) {
          return prev;
        }
        return [...prev, promptText];
      });
      setHistoryIndex(-1);
      draftInputRef.current = '';
    }

    setInputMessage('');
    setSelectedImages([]);
    setSelectedAudio(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const messageId = generateId();
    const aiMessageId = generateId();
    const timeString = getCurrentTime();

    const actualUserId = `user-${messageId}`;
    const actualAiId = `ai-${aiMessageId}`;

    // ตรวจสอบคำหยาบคาย (Profanity & Safety Check Trigger)
    const profanityResult = isProfanityFilterActive
      ? detectProfanity(effectiveUserPrompt)
      : { hasProfanity: false, matches: [], matchedWords: [], severity: 'none' as const };

    if (profanityResult.hasProfanity) {
      const userProfaneItem: Message = {
        id: actualUserId,
        sender: 'user',
        text: effectiveUserPrompt,
        timestamp: timeString,
        hasProfanity: true,
        imageAttachment: currentImages[0] || undefined,
        imageAttachments: currentImages.length > 0 ? currentImages : undefined,
        audioAttachment: currentAudio || undefined,
      };

      const aiSafetyItem: Message = {
        id: actualAiId,
        sender: 'ai',
        text: getProfanitySafetyMessage(profanityResult.matches),
        timestamp: timeString,
        isStreaming: false,
        isSafetyAdvisory: true,
      };

      const currentMessages = messagesRef.current;
      const nextMessages = [...currentMessages, userProfaneItem, aiSafetyItem];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);

      const currentActiveId = currentSessionIdRef.current;
      if (!currentActiveId) {
        const sessionTitle =
          effectiveUserPrompt.length > 36
            ? effectiveUserPrompt.substring(0, 36) + '...'
            : effectiveUserPrompt;
        const newSession = chatHistoryService.createSession(
          sessionTitle,
          nextMessages,
          { systemPrompt: activeSystemPrompt, temperature, topK }
        );
        currentSessionIdRef.current = newSession.id;
        setCurrentSessionId(newSession.id);
      } else {
        chatHistoryService.updateSessionMessages(currentActiveId, nextMessages, activeSystemPrompt);
      }
      setSessions(chatHistoryService.getAllSessions());
      scrollToBottom(false);
      return;
    }

    const userMessageItem: Message = {
      id: actualUserId,
      sender: 'user',
      text: effectiveUserPrompt,
      timestamp: timeString,
      imageAttachment: currentImages[0] || undefined,
      imageAttachments: currentImages.length > 0 ? currentImages : undefined,
      audioAttachment: currentAudio || undefined,
    };

    const aiMessageItem: Message = {
      id: actualAiId,
      sender: 'ai',
      text: '',
      timestamp: timeString,
      isStreaming: true,
    };

    const currentMessages = messagesRef.current;
    const nextMessages = [...currentMessages, userMessageItem, aiMessageItem];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    const currentActiveId = currentSessionIdRef.current;
    if (!currentActiveId) {
      const sessionTitle =
        effectiveUserPrompt.length > 36
          ? effectiveUserPrompt.substring(0, 36) + '...'
          : effectiveUserPrompt;
      const newSession = chatHistoryService.createSession(
        sessionTitle,
        nextMessages,
        { systemPrompt: activeSystemPrompt, temperature, topK }
      );
      currentSessionIdRef.current = newSession.id;
      setCurrentSessionId(newSession.id);
    } else {
      chatHistoryService.updateSessionMessages(currentActiveId, nextMessages, activeSystemPrompt);
    }
    setSessions(chatHistoryService.getAllSessions());
    setIsGenerating(true);
    scrollToBottom(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await aiService.promptStream(
        effectiveUserPrompt,
        (currentText) => {
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === actualAiId
                ? { ...msg, text: currentText, isStreaming: true }
                : msg
            );
            messagesRef.current = updated;
            return updated;
          });
        },
        controller.signal,
        currentImages.map((img) => img.file!).filter(Boolean),
        currentAudio
      );

      // 1. ปลดสถานะ Streaming ออกจากข้อความ AI ทันที (หยุดเคอร์เซอร์กะพริบ)
      setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === actualAiId
            ? { ...msg, isStreaming: false }
            : msg
        );
        messagesRef.current = updated;
        return updated;
      });

      // 2. ปลดสถานะ isGenerating เป็น false ทันที เพื่อไม่ให้ปุ่มหรือแถบสถานะด้านล่างค้าง "AI กำลังประมวลผล..."
      setIsGenerating(false);

      // ตรวจสอบหลังตอบเสร็จ: บีบอัดอัตโนมัติเฉพาะเมื่อ Token วิกฤตจริงๆ (tokensLeft <= 350 หรือ tokensSoFar >= maxTokens * 0.96)
      const latestMessages = messagesRef.current;
      const postTotalTokens =
        latestMessages
          .filter((m) => !m.isCompacted && !m.isCompressedContext)
          .reduce((acc, m) => acc + (m.text ? estimateTokens(m.text) : 0), 0) +
        (activeSystemPrompt ? estimateTokens(activeSystemPrompt) : 0);

      const postTokensUsage = aiService.getContextTokenUsage(postTotalTokens);
      const priorToCompact = latestMessages.filter(
        (m) =>
          !m.isCompressedContext &&
          !m.isCompacted &&
          m.text.trim()
      );

      if (
        (postTokensUsage.tokensLeft <= 350 || postTokensUsage.tokensSoFar >= maxTokens * 0.96) &&
        priorToCompact.length >= 2 &&
        !controller.signal.aborted
      ) {
        const postCompResult = await handleCompressChatContext(priorToCompact, activeSystemPrompt);
        if (postCompResult) {
          activeSystemPrompt = postCompResult.newSystemPrompt;
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;

      const latestMessages = messagesRef.current;
      const errTotalTokens =
        latestMessages
          .filter((m) => !m.isCompacted && !m.isCompressedContext)
          .reduce((acc, m) => acc + (m.text ? estimateTokens(m.text) : 0), 0) +
        (activeSystemPrompt ? estimateTokens(activeSystemPrompt) : 0);

      const errTokensUsage = aiService.getContextTokenUsage(errTotalTokens);

      const errMessage = String((err as Error)?.message || '').toLowerCase();
      const errName = String((err as Error)?.name || '');
      const isTokenExhausted =
        errName === 'QuotaExceededError' ||
        errName === 'InvalidStateError' ||
        errMessage.includes('token') ||
        errMessage.includes('quota') ||
        errMessage.includes('context') ||
        errMessage.includes('limit') ||
        errMessage.includes('exhaust') ||
        errMessage.includes('max') ||
        errTokensUsage.tokensLeft <= 400;

      const priorToCompact = latestMessages.filter(
        (m) =>
          !m.isCompressedContext &&
          !m.isCompacted &&
          m.text.trim()
      );

      // หากหยุดเพราะ Token เต็ม: บีบอัดประวัติเดิม และตอบให้ใหม่ทันที!
      if (isTokenExhausted && priorToCompact.length >= 2) {
        try {
          // 1. บีบอัดประวัติเดิม และแทรกเส้นแบ่ง ──────────────── Conversation compacted ────────────────
          const errCompResult = await handleCompressChatContext(priorToCompact, activeSystemPrompt);
          if (errCompResult) {
            activeSystemPrompt = errCompResult.newSystemPrompt;
          }

          // 2. เคลียร์ข้อความ AI ที่ค้าง เพื่อตอบใหม่ให้สมบูรณ์
          setMessages((prev) => {
            const cleared = prev.map((msg) =>
              msg.id === actualAiId ? { ...msg, text: '', isStreaming: true } : msg
            );
            messagesRef.current = cleared;
            return cleared;
          });
          setIsGenerating(true);

          // 3. ตอบคำถามใหม่ด้วยบริบทความจำที่ถูกบีบอัดแล้ว
          await aiService.promptStream(
            effectiveUserPrompt,
            (retryText) => {
              setMessages((prev) => {
                const retried = prev.map((msg) =>
                  msg.id === actualAiId
                    ? { ...msg, text: retryText, isStreaming: true }
                    : msg
                );
                messagesRef.current = retried;
                return retried;
              });
            },
            controller.signal,
            currentImages.map((img) => img.file!).filter(Boolean),
            currentAudio
          );

          setMessages((prev) => {
            const finished = prev.map((msg) =>
              msg.id === actualAiId ? { ...msg, isStreaming: false } : msg
            );
            messagesRef.current = finished;
            return finished;
          });
          setIsGenerating(false);
          return;
        } catch (retryErr) {
          console.error('Retry after token compression failed:', retryErr);
        }
      }

      if (isTokenExhausted) {
        console.warn('Prompting stopped due to token limit exhaustion');
        setMessages((prev) => {
          const updated = prev.map((msg) =>
            msg.id === actualAiId
              ? {
                  ...msg,
                  text:
                    '⚠️ **หน่วยความจำบริบทเต็มแล้ว (9,216 / 9,216 Tokens)**\n\n' +
                    'โมเดล On-Device ไม่สามารถประมวลผลคำตอบเพิ่มเติมในห้องแชทเดิมได้เนื่องจากเต็มโควตา แนะนำให้คลิก **"ขึ้นแชทใหม่"** ที่แถบด้านล่าง เพื่อเริ่มต้นการสนทนาใหม่ได้อย่างราบรื่น (ประวัติแชทนี้จะถูกบันทึกเก็บไว้ในแถบประวัติด้านข้าง)',
                  isStreaming: false,
                }
              : msg
          );
          messagesRef.current = updated;
          return updated;
        });
        return;
      }

      console.error('Prompting failed:', err);
      setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === actualAiId
            ? {
                ...msg,
                text:
                  msg.text ||
                  'ขออภัย เกิดข้อผิดพลาดในการประมวลผลคำตอบ กรุณาลองใหม่อีกครั้ง',
                isStreaming: false,
              }
            : msg
        );
        messagesRef.current = updated;
        return updated;
      });
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;

      const finalMessages = messagesRef.current.map((msg) =>
        msg.id === actualAiId
          ? {
              ...msg,
              text: msg.text || (controller.signal.aborted ? '⏹️ หยุดการสร้างข้อความแล้ว' : msg.text),
              isStreaming: false,
            }
          : msg
      );
      messagesRef.current = finalMessages;
      setMessages(finalMessages);

      const activeId = currentSessionIdRef.current;
      if (activeId) {
        chatHistoryService.updateSessionMessages(activeId, finalMessages, activeSystemPrompt);
        setSessions(chatHistoryService.getAllSessions());
      }
    }
  };

  // Select an existing session from history
  const handleSelectSession = useCallback(
    async (session: ChatSession) => {
      if (session.id === currentSessionIdRef.current) return;
      handleStop();
      if (isListening) {
        speechService.stopListening();
        setIsListening(false);
        setInterimTranscript('');
      }
      setSelectedImages([]);
      setSelectedAudio(null);
      setCurrentSessionId(session.id);
      chatHistoryService.setActiveSessionId(session.id);
      messagesRef.current = session.messages;
      setMessages(session.messages);
      const sessionUserPrompts = session.messages
        .filter((m) => m.sender === 'user' && m.text.trim())
        .map((m) => m.text.trim())
        .filter((text, idx, arr) => idx === 0 || text !== arr[idx - 1]);
      setPromptHistory(sessionUserPrompts);
      setHistoryIndex(-1);
      draftInputRef.current = '';
      userScrolledUpRef.current = false;
      setShowScrollBottomButton(false);
      setTimeout(() => {
        scrollToBottom(false);
      }, 30);

      const detected = aiService.detectModelType();
      const targetPrompt =
        session.systemPrompt ||
        getDefaultBasePrompt(detected.modelName) + (isPolicyAppended ? POLICY_CLAUSE : '');
      systemPromptRef.current = targetPrompt;
      setSystemPrompt(targetPrompt);
      if (session.temperature !== undefined) setTemperature(session.temperature);
      if (session.topK !== undefined) setTopK(session.topK);

      aiService.resetSession();
      await aiService.initSession({
        systemPrompt: targetPrompt,
        temperature: session.temperature ?? temperature,
        topK: session.topK ?? topK,
      });
    },
    [handleStop, isListening, isPolicyAppended, scrollToBottom, temperature, topK]
  );

  // Delete a session from history
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      chatHistoryService.deleteSession(sessionId);
      setSessions(chatHistoryService.getAllSessions());
      if (sessionId === currentSessionIdRef.current) {
        handleNewChat();
      }
    },
    [handleNewChat]
  );

  // Rename a session
  const handleRenameSession = useCallback((sessionId: string, newTitle: string) => {
    chatHistoryService.renameSession(sessionId, newTitle);
    setSessions(chatHistoryService.getAllSessions());
  }, []);

  // Clear all sessions
  const handleClearAllSessions = useCallback(() => {
    chatHistoryService.clearAllSessions();
    setSessions([]);
    handleNewChat();
  }, [handleNewChat]);

  // Reset Session on settings save
  const handleSaveAndResetSession = async () => {
    handleStop();
    userScrolledUpRef.current = false;
    setShowScrollBottomButton(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    messagesRef.current = [];
    setMessages([]);
    setSelectedImages([]);
    setSelectedAudio(null);
    setCurrentSessionId(null);
    chatHistoryService.setActiveSessionId(null);
    setPromptHistory([]);
    setHistoryIndex(-1);
    draftInputRef.current = '';
    systemPromptRef.current = systemPrompt;
    aiService.resetSession();
    await aiService.initSession({
      systemPrompt,
      temperature,
      topK,
    });
  };

  // Textarea input auto-resize and keyboard shortcuts (Enter to send, ArrowUp/ArrowDown for history)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSend();
      return;
    }

    // กดลูกศรขึ้น (ArrowUp) เพื่อดู prompt ก่อนหน้า
    if (e.key === 'ArrowUp') {
      const isAtStart = textareaRef.current
        ? textareaRef.current.selectionStart === 0 && textareaRef.current.selectionEnd === 0
        : true;
      if (promptHistory.length > 0 && (isAtStart || inputMessage === '' || historyIndex !== -1)) {
        e.preventDefault();
        if (historyIndex === -1) {
          draftInputRef.current = inputMessage;
        }
        const nextIndex =
          historyIndex === -1
            ? promptHistory.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        const text = promptHistory[nextIndex] || '';
        setInputMessage(text);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
            textareaRef.current.setSelectionRange(text.length, text.length);
          }
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      // กดลูกศรลง (ArrowDown) เพื่อกลับมา prompt ถัดไปหรือ draft
      if (historyIndex !== -1) {
        e.preventDefault();
        const nextIndex = historyIndex + 1;
        if (nextIndex >= promptHistory.length) {
          setHistoryIndex(-1);
          const draft = draftInputRef.current;
          setInputMessage(draft);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
              textareaRef.current.setSelectionRange(draft.length, draft.length);
            }
          }, 0);
        } else {
          setHistoryIndex(nextIndex);
          const text = promptHistory[nextIndex] || '';
          setInputMessage(text);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
              textareaRef.current.setSelectionRange(text.length, text.length);
            }
          }, 0);
        }
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    setHistoryIndex(-1);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  // Memoize summary messages so SummaryModal does not get a new array reference on unrelated renders
  const summaryModalMessages = useMemo(
    () =>
      messages
        .filter((m) => !m.isCompressedContext && m.text.trim())
        .map((m) => ({ sender: m.sender as 'user' | 'ai', text: m.text })),
    [messages]
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Ambient background depth orbs */}
      <div className="pointer-events-none absolute -top-40 right-10 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-32 h-96 w-96 rounded-full bg-teal-500/5 blur-3xl" />

      {/* Chat History Sidebar */}
      <ChatHistorySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onClearAllSessions={handleClearAllSessions}
        onTogglePin={() => setIsSidebarOpen((prev) => !prev)}
      />

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
        {/* Header */}
        <ChatHeader
          status={statusState.status}
          statusMessage={statusState.statusMessage}
          isMock={statusState.isMock}
          modelName={activeModelInfo.modelName}
          modelType={activeModelInfo.modelType}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRefreshStatus={verifyAI}
          onOpenPolicy={() => setIsPolicyModalOpen(true)}
          onOpenSummary={() => setIsSummaryModalOpen(true)}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isSidebarOpen={isSidebarOpen}
          messagesCount={messages.length}
        />

      {/* Optional Notice banner when mock mode is active */}
      {statusState.isMock && !bannerDismissed && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/90 px-4 py-2 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              ขณะนี้ระบบทำงานใน<strong>โหมดจำลอง</strong> เนื่องจาก Chrome Built-in AI ยังไม่ได้เปิดใช้งานในเบราว์เซอร์นี้
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="font-medium underline hover:text-amber-950"
            >
              ดูวิธีเปิดใช้งาน
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="ml-2 font-bold text-amber-600 hover:text-amber-900"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Scroll Container */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 relative"
      >
        <div className="mx-auto max-w-4xl">
          {messages.length === 0 ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center text-center px-4">
              <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
                <Sparkles className="h-7 w-7" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                เริ่มต้นสนทนากับ AI
              </h2>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-slate-500 leading-relaxed">
                โมเดล On-Device ประมวลผลบนเครื่องของคุณโดยตรง (Prompt API) ปลอดภัย รวดเร็ว และเป็นส่วนตัว 100%
              </p>

              {/* Prompt Starter Cards */}
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
                {QUICK_PROMPTS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSend(item.prompt)}
                      className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-xs p-3.5 shadow-2xs transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-md hover:shadow-emerald-500/5 hover:-translate-y-0.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-800 text-xs sm:text-sm group-hover:text-emerald-700 transition-colors">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-2xs shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="truncate">{item.title}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 leading-relaxed group-hover:text-slate-600">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Messages List */
            <div className="space-y-1 w-full min-w-0">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Scroll-to-Bottom button when user scrolled up in an active chat */}
        {showScrollBottomButton && messages.length > 0 && (
          <div className="sticky bottom-3 flex justify-end max-w-4xl mx-auto pointer-events-none px-2">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md border border-slate-200/90 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition active:scale-95 cursor-pointer animate-in fade-in duration-150 z-20"
              title="เลื่อนลงล่างสุด"
            >
              <ArrowDown className="h-3.5 w-3.5 text-emerald-600" />
              <span>เลื่อนลงล่างสุด</span>
            </button>
          </div>
        )}
      </main>

      {/* Floating Bottom Input Area */}
      <footer className="relative bg-linear-to-t from-slate-50 via-slate-50/95 to-transparent pt-2 pb-3.5 px-3 sm:px-6 shrink-0">
        <div className="mx-auto max-w-3xl sm:max-w-4xl space-y-2">
          {/* Context Notice / Warning: แจ้งเตือนเมื่อแตะ >= 85% หรือเหลือ <= 1200T ให้ผู้ใช้ทราบและเลือกบีบอัดเองได้ตามต้องการ */}
          {(contextPercentage >= 85 || tokensLeft <= 1200) && messages.length > 0 && (
            <div
              className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-2 text-xs shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                contextPercentage >= 95
                  ? 'bg-rose-50/95 border-rose-200/90 text-rose-900 shadow-rose-500/5'
                  : 'bg-amber-50/95 border-amber-200/90 text-amber-900 shadow-amber-500/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    contextPercentage >= 95 ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <span className="font-semibold">
                  {contextPercentage >= 95 ? 'บริบทความจำใกล้เต็มขั้นวิกฤต:' : 'บริบทความจำเริ่มสูง:'}
                </span>
                <span className="font-medium opacity-90">
                  {tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} T ({contextPercentage}%) • เหลือ {tokensLeft.toLocaleString()} Tokens
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => handleCompressChatContext()}
                  disabled={isCompressingContext}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2.5 py-1 text-[11px] font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
                  title="บีบอัดประวัติเดิมลงในหน่วยความจำเพื่อลดการใช้ Tokens"
                >
                  <Layers className="h-3 w-3" />
                  <span>{isCompressingContext ? 'กำลังบีบอัด...' : 'บีบอัดประวัติ'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 hover:bg-slate-100 active:scale-95 text-slate-700 bg-white px-2.5 py-1 text-[11px] font-medium shadow-2xs transition cursor-pointer"
                  title="เริ่มการสนทนาใหม่"
                >
                  <Plus className="h-3 w-3 text-slate-500" />
                  <span>เริ่มแชทใหม่</span>
                </button>
              </div>
            </div>
          )}

          {/* Real-time Profanity Detection Warning */}
          {currentInputProfanity && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50/95 px-3.5 py-2 text-xs text-amber-900 shadow-2xs animate-in fade-in duration-150">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold">ตรวจพบคำไม่สุภาพ:</span>
                {' '}มีถ้อยคำที่ไม่เหมาะสม (<code>{currentInputProfanity.matches.slice(0, 3).join(', ')}</code>) ระบบจะปฏิเสธการประมวลผลหากกดส่ง
              </div>
            </div>
          )}

          {/* Floating Glass Input Island */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-3xl border bg-white/95 backdrop-blur-xl transition-all duration-200 p-2.5 sm:p-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/60 ring-4 ring-emerald-500/20 shadow-lg'
                : 'border-slate-200/90 hover:border-slate-300 focus-within:border-emerald-500/70 focus-within:shadow-[0_8px_30px_rgba(16,185,129,0.12)] focus-within:ring-4 focus-within:ring-emerald-500/10'
            }`}
          >
            {/* Attached Images Preview Shelf */}
            {selectedImages.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2 animate-in fade-in duration-150">
                {selectedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="group/thumb relative flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 p-1.5 pr-2.5 shadow-2xs max-w-50"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-emerald-200 bg-white">
                      <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-800" title={img.name}>
                        {img.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {(img.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      title="ลบรูปภาพนี้"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-200/60 hover:text-slate-700 transition cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Attached Audio Preview Card */}
            {selectedAudio && (
              <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-teal-200/90 bg-teal-50/80 p-2 animate-in fade-in duration-150">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-2xs">
                  <Music className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs font-semibold text-slate-800" title={selectedAudio.name}>
                      {selectedAudio.name}
                    </p>
                    <span className="shrink-0 text-[10px] text-teal-700 font-mono font-medium">
                      {(selectedAudio.size / 1024).toFixed(1)} KB
                      {selectedAudio.duration ? ` • ~${Math.round(selectedAudio.duration)}s` : ''}
                    </span>
                  </div>
                  <audio controls src={selectedAudio.url} className="mt-1 h-7 w-full accent-teal-600" />
                </div>
                <button
                  type="button"
                  onClick={handleRemoveAudio}
                  title="ลบไฟล์เสียงนี้"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-teal-100 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Direct Audio Recording Live Banner */}
            {isRecordingAudio && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-rose-300 bg-rose-50/95 p-2 text-xs text-rose-900 animate-in fade-in duration-150 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-3 w-3 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
                  </span>
                  <span className="font-semibold shrink-0 text-rose-700">กำลังอัดเสียงสด (Prompt API Audio):</span>
                  <span className="font-mono font-bold text-rose-900">
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={stopAudioRecording}
                    className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold shadow-2xs transition cursor-pointer"
                    title="เสร็จสิ้นการบันทึกเสียง"
                  >
                    เสร็จสิ้น
                  </button>
                  <button
                    type="button"
                    onClick={cancelAudioRecording}
                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 transition cursor-pointer"
                    title="ยกเลิกการบันทึกเสียง"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Active Speech Recognition Banner */}
            {isListening && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-rose-200/90 bg-rose-50/90 p-2 text-xs text-rose-800 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-3 w-3 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <span className="font-semibold shrink-0 text-rose-700">กำลังฟังเสียง:</span>
                  <span className="truncate text-rose-900 font-medium italic">
                    {interimTranscript || 'เริ่มพูดข้อความของคุณได้เลย...'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSpeechLang((prev) => (prev === 'th-TH' ? 'en-US' : 'th-TH'));
                      speechService.stopListening();
                      setIsListening(false);
                      setInterimTranscript('');
                    }}
                    className="rounded-lg bg-white border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                    title="สลับภาษาพูดระหว่าง ภาษาไทย และ English"
                  >
                    {speechLang === 'th-TH' ? '🇹🇭 ไทย' : '🇺🇸 EN'}
                  </button>

                  {speechLang.startsWith('en') && isLocalSpeechSupported && (
                    <span
                      className="hidden sm:inline-block rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300/80 px-1.5 py-0.5 text-[10px] font-medium"
                      title="ประมวลผลเสียงภาษาอังกฤษบนเครื่อง On-Device ด้วย Small Expert Model"
                    >
                      On-Device
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleListening}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-200/60 transition cursor-pointer"
                    title="หยุดบันทึกเสียง"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Hidden File Input for images (Multi-image support) */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Hidden File Input for audio */}
            <input
              ref={audioFileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.aac"
              className="hidden"
              onChange={handleAudioFileSelect}
            />

            {/* Textarea Input */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputMessage}
              autoFocus
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="พิมพ์ข้อความของคุณที่นี่... (รองรับการส่งภาพหลายรูปและเสียง หรือกด Shift+Enter ขึ้นบรรทัดใหม่)"
              className="max-h-40 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-1.5 text-sm sm:text-[14.5px] text-slate-800 placeholder-slate-400 focus:outline-hidden leading-relaxed"
            />

            {/* Bottom Inner Toolbar */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100/80 mt-1 px-1">
              {/* Left Action Buttons & Subtle Token Indicator */}
              <div className="flex items-center gap-1.5">
                {/* Voice Typing Button (Speech-to-Text) */}
                <button
                  type="button"
                  onClick={handleToggleListening}
                  disabled={isGenerating || !isSpeechSupported || isRecordingAudio}
                  title={
                    !isSpeechSupported
                      ? 'เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition'
                      : isListening
                      ? 'กำลังฟังเสียง... (คลิกเพื่อหยุด)'
                      : `พิมพ์ด้วยเสียง STT (คลิกเพื่อพูด - ${speechLang === 'th-TH' ? 'ภาษาไทย' : 'English'})`
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    isListening
                      ? 'border border-rose-500 bg-rose-500 text-white shadow-xs ring-2 ring-rose-400/40 animate-pulse'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                {/* Direct Audio Recording Button (Prompt API Multimodal Audio) */}
                <button
                  type="button"
                  onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                  disabled={isGenerating || isListening}
                  title={
                    isRecordingAudio
                      ? 'กำลังบันทึกเสียงสด... (คลิกเพื่อเสร็จสิ้น)'
                      : 'บันทึกเสียงสดส่งตรงให้ AI (Prompt API Multimodal Audio)'
                  }
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    isRecordingAudio
                      ? 'border border-rose-600 bg-rose-600 text-white shadow-xs ring-2 ring-rose-400/40 animate-pulse'
                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Radio className="h-4 w-4" />
                </button>

                {/* Audio File Attach Button */}
                <button
                  type="button"
                  onClick={() => audioFileInputRef.current?.click()}
                  disabled={isGenerating}
                  title="แนบไฟล์เสียง (MP3, WAV, WebM ฯลฯ สำหรับ Audio Multimodal)"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    selectedAudio
                      ? 'border border-teal-500 bg-teal-50 text-teal-700 ring-2 ring-teal-400/20'
                      : 'text-slate-400 hover:text-teal-700 hover:bg-teal-50'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Music className="h-4 w-4" />
                </button>

                {/* Image Attach Button (Multiple) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  title="แนบรูปภาพ (รองรับหลายรูปพร้อมกัน หรือกด Ctrl+V เพื่อวางรูป)"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    selectedImages.length > 0
                      ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/20'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="relative">
                    <ImageIcon className="h-4 w-4" />
                    {selectedImages.length > 1 && (
                      <span className="absolute -top-1.5 -right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                        {selectedImages.length}
                      </span>
                    )}
                  </div>
                </button>

                <div className="h-3.5 w-px bg-slate-200/80 mx-0.5 hidden sm:block" />

                {/* Subtle Token Usage Badge */}
                <div
                  className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-full hover:bg-slate-100/70 transition cursor-default select-none"
                  title={`การใช้หน่วยความจำบริบท: ${tokensSoFar.toLocaleString()} / ${maxTokens.toLocaleString()} Tokens (${contextPercentage}%) • คงเหลือ ${tokensLeft.toLocaleString()} Tokens`}
                >
                  <Gauge className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">{tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} T</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      contextPercentage >= 95
                        ? 'bg-rose-100 text-rose-700'
                        : contextPercentage >= 80
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {contextPercentage}%
                  </span>
                </div>
              </div>

              {/* Right: Character count + Send/Stop Button */}
              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="หยุดการสร้างข้อความ"
                    className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-rose-500 text-white shadow-xs hover:bg-rose-600 active:scale-95 transition cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputMessage.trim() && selectedImages.length === 0 && !selectedAudio}
                    title="ส่งข้อความ"
                    className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-25 disabled:hover:bg-emerald-600 disabled:active:scale-100 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Micro Footer Caption */}
          <div className="text-center text-[11px] text-slate-400/80 px-2 select-none">
            Google Chrome Built-in AI • ประมวลผลบนเครื่อง (On-Device) ปลอดภัยและเป็นส่วนตัว 100%
          </div>
        </div>
      </footer>
    </div>

      {/* Policy Modal (เปิดแจ้งเตือนอัตโนมัติก่อนเริ่มแชทตอนโหลดหน้าครั้งแรก) */}
      <PolicyModal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        onAccept={handleAcceptPolicy}
        onAppendToPrompt={handleTogglePolicyInPrompt}
        isAppended={isPolicyAppended}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        temperature={temperature}
        setTemperature={setTemperature}
        topK={topK}
        setTopK={setTopK}
        onSaveAndReset={handleSaveAndResetSession}
        messagesCount={messages.length}
        conversationChars={conversationChars}
        onOpenPolicy={() => setIsPolicyModalOpen(true)}
        activeModelName={activeModelInfo.modelName}
        isProfanityFilterEnabled={isProfanityFilterActive}
        setIsProfanityFilterEnabled={(enabled) => {
          setIsProfanityFilterActive(enabled);
          setProfanityFilterEnabled(enabled);
        }}
      />

      {/* Summary Modal */}
      <SummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        messages={summaryModalMessages}
        uncompactedCount={messages.filter((m) => !m.isCompressedContext && !m.isCompacted && m.text.trim()).length}
        onCompressAndContinue={async () => {
          await handleCompressChatContext();
        }}
        onNewChat={handleNewChat}
        isCompressing={isCompressingContext}
        modelName={activeModelInfo.modelName}
      />
    </div>
  );
};

export default AIPromptPage;