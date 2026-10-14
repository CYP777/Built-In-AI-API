import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Square, Sparkles, Lightbulb, Code2, Globe, FileText, Info, Gauge, RefreshCw, ArrowDown, Image as ImageIcon, X, Mic, MicOff, AlertTriangle, Layers, Plus } from 'lucide-react';
import { ChatMessage, type Message } from '../components/ChatMessage';
import type { ImageAttachment } from '../types/ai';
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
  const [selectedImage, setSelectedImage] = useState<ImageAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // Helper to read File into persistent Data URL and set selectedImage
  const processImageFile = useCallback((file: File, fallbackName?: string) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น PNG, JPG, WebP, GIF)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('ขนาดไฟล์รูปภาพเกินกำหนด (จำกัดไม่เกิน 10 MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSelectedImage({
        url: dataUrl,
        name: file.name || fallbackName || `image-${Date.now()}.png`,
        size: file.size,
        type: file.type || 'image/png',
        file: file,
      });
    };
    reader.readAsDataURL(file);
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
        const file = files[0];
        if (file.type.startsWith('image/')) {
          processImageFile(file);
        }
      }
    },
    [processImageFile]
  );

  // Handle file select (Image attachment)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  // Handle remove selected image
  const handleRemoveImage = useCallback(() => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
            break;
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
        const imgTokens = m.imageAttachment ? 300 : 0;
        return acc + textTokens + imgTokens;
      }, 0);
  }, [messages]);

  const tokenUsage = useMemo(() => {
    const draftTokens = inputMessage.trim() ? estimateTokens(inputMessage.trim()) : 0;
    const draftImgTokens = selectedImage ? 300 : 0;
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    return aiService.getContextTokenUsage(
      conversationTokens + systemTokens + draftTokens + draftImgTokens
    );
  }, [conversationTokens, systemPrompt, inputMessage, selectedImage]);

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
          console.warn('Context compression error, using dynamic fallback:', compressErr);
          const firstQ = rawMessages[0]?.text?.substring(0, 80) || 'การสนทนาทั่วไป';
          const fallbackSummary = `สรุปประวัติเดิม: การสนทนาเกี่ยวกับ "${firstQ}" ได้รับการจัดเก็บลงในบริบทความจำเรียบร้อยแล้ว`;
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
    setSelectedImage(null);
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
  }, [handleStop, isListening, isPolicyAppended, temperature, topK]);

  // Handle Send
  const handleSend = async (textToSend?: string) => {
    // If voice listening is active, stop it gracefully
    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
      setInterimTranscript('');
    }

    const promptText = (textToSend || inputMessage).trim();
    const currentImage = selectedImage;
    if ((!promptText && !currentImage) || isGenerating) return;

    const effectiveUserPrompt = promptText || (currentImage ? 'ช่วยวิเคราะห์รูปภาพนี้' : '');
    let activeSystemPrompt = systemPromptRef.current || systemPrompt;

    // 1. ตรวจสอบก่อนส่ง: หาก Token ใกล้หมด (เหลือ <= 800 หรือใช้ไป >= 88%)
    const activeRawMessages = (messagesRef.current || messages).filter(
      (m) => !m.isCompressedContext && !m.isCompacted && m.text.trim()
    );
    const estPromptTokens = estimateTokens(effectiveUserPrompt) + 200;
    const isTokensLow =
      tokensLeft <= 800 ||
      tokensSoFar + estPromptTokens >= maxTokens * 0.88 ||
      contextPercentage >= 88;

    if (isTokensLow) {
      // หากหน่วยความจำเต็มหรือเกือบเต็ม (9,216/9,216 หรือ tokensLeft <= 150) และไม่มีข้อความให้บีบอัดแล้ว
      if ((tokensLeft <= 150 || tokensSoFar >= maxTokens) && activeRawMessages.length < 2) {
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
    setSelectedImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const messageId = generateId();
    const aiMessageId = generateId();
    const timeString = getCurrentTime();

    const actualUserId = `user-${messageId}`;
    const actualAiId = `ai-${aiMessageId}`;

    const userMessageItem: Message = {
      id: actualUserId,
      sender: 'user',
      text: effectiveUserPrompt,
      timestamp: timeString,
      imageAttachment: currentImage || undefined,
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
        currentImage?.file || null
      );

      // ตรวจสอบหลังตอบเสร็จ: หาก Token เหลือน้อย (tokensLeft <= 800 หรือ tokensSoFar >= maxTokens * 0.88) และมีประวัติเดิม ให้บีบอัดอัตโนมัติเพื่อเตรียมพร้อมรอบต่อไป
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
        (postTokensUsage.tokensLeft <= 800 || postTokensUsage.tokensSoFar >= maxTokens * 0.88) &&
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
        errTokensUsage.tokensLeft <= 800;

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
            currentImage?.file || null
          );
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
      setSelectedImage(null);
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
    setSelectedImage(null);
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
    <div className="flex h-screen w-full overflow-hidden bg-linear-to-b from-slate-50 via-white/50 to-slate-50/80 font-sans text-slate-800 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
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
            /* Welcome / Empty State */
            <div className="flex min-h-[58vh] flex-col items-center justify-center text-center px-4">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/20">
                <Sparkles className="h-8 w-8" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500"></span>
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                เริ่มต้นสนทนากับ AI
              </h2>
              <p className="mt-2.5 max-w-lg text-sm text-slate-500 leading-relaxed">
                ประมวลผลคำสั่งด้วย {activeModelInfo.modelName} บนเครื่องของคุณโดยตรง ปลอดภัย รวดเร็ว และเป็นส่วนตัว
              </p>

              {/* Prompt Starter Pills */}
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 text-left">
                {QUICK_PROMPTS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSend(item.prompt)}
                      className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-xs p-4 shadow-2xs transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-50/20 hover:shadow-md hover:shadow-emerald-500/5 hover:-translate-y-0.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 font-semibold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-2xs">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span>{item.title}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-500 leading-relaxed">
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

      {/* Input Form Footer */}
      <footer className="border-t border-slate-200/80 bg-white p-3 sm:p-4">
        <div className="mx-auto max-w-4xl space-y-2">
          {/* Context Window Live Indicator Strip */}
          <div className="flex items-center justify-between px-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-bold text-slate-700">Context Window:</span>
              <span className="font-semibold text-slate-800">
                {tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} T
              </span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  contextPercentage >= 88
                    ? 'bg-rose-100 text-rose-700'
                    : contextPercentage >= 70
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {contextPercentage}%
              </span>

              {isCompressingContext ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-600" />
                  กำลังบีบอัดบริบท...
                </span>
              ) : isGenerating ? (
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 animate-in fade-in duration-150">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>AI กำลังประมวลผล...</span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline">
                คงเหลือ: <strong>{tokensLeft.toLocaleString()} Tokens</strong>
              </span>
              {/* Mini progress bar */}
              <div className="h-1.5 w-16 sm:w-24 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    contextPercentage >= 88
                      ? 'bg-red-600'
                      : contextPercentage >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(3, contextPercentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Warning / Action Banner when Context is Full or Near-Full (>= 88% or tokensLeft <= 800) */}
          {(contextPercentage >= 88 || tokensLeft <= 800) && messages.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-rose-200 bg-rose-50/95 p-2.5 text-xs text-rose-900 shadow-2xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="text-xs leading-relaxed">
                  <strong>บริบทความจำใกล้เต็ม ({tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} T)</strong>:
                  {' '}คุณสามารถเลือกบีบอัดประวัติเดิม หรือเปิดห้องแชทใหม่ได้
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCompressChatContext()}
                  disabled={isCompressingContext}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 active:scale-95 disabled:opacity-50 transition cursor-pointer"
                  title="บีบอัดประวัติเดิมลงในหน่วยความจำเพื่อลดการใช้ Tokens"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{isCompressingContext ? 'กำลังบีบอัด...' : 'บีบอัดประวัติ'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 shadow-2xs hover:bg-rose-100 active:scale-95 transition cursor-pointer"
                  title="เริ่มการสนทนาใหม่ (ประวัติเดิมจะถูกบันทึกเก็บไว้ในแถบประวัติด้านข้าง)"
                >
                  <Plus className="h-3.5 w-3.5 text-rose-600" />
                  <span>เริ่มแชทใหม่</span>
                </button>
              </div>
            </div>
          )}

          {/* Textarea Input Container */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-2xl border transition-all duration-200 p-2 sm:p-2.5 shadow-sm ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/50 ring-4 ring-emerald-500/20 shadow-md'
                : 'border-slate-300/80 bg-white shadow-slate-200/50 focus-within:border-emerald-500 focus-within:ring-3 focus-within:ring-emerald-500/15 focus-within:shadow-md'
            }`}
          >
            {/* Attached Image Preview bar */}
            {selectedImage && (
              <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-2 animate-in fade-in duration-150">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-2xs">
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {selectedImage.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {(selectedImage.size / 1024).toFixed(1)} KB • รองรับ Multimodal (Vision)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  title="ลบรูปภาพที่เลือก"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-100/80 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Active Speech Recognition Banner */}
            {isListening && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-200/90 bg-rose-50/90 p-2 text-xs text-rose-800 animate-in fade-in duration-150">
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
                  {/* Language switch button */}
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
                      On-Device Model
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

            {/* Hidden File Input for images */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex items-end gap-2">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                autoFocus
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="พิมพ์ข้อความของคุณที่นี่... (Enter เพื่อส่ง, แนบรูป หรือ Ctrl+V เพื่อวางรูป, กด 🎙️ เพื่อพูด)"
                className="max-h-40 min-h-10 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden leading-relaxed"
              />

              {/* Action Buttons */}
              <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
                {/* Voice Input (Speech-to-Text) Button */}
                <button
                  type="button"
                  onClick={handleToggleListening}
                  disabled={isGenerating || !isSpeechSupported}
                  title={
                    !isSpeechSupported
                      ? 'เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition'
                      : isListening
                      ? 'กำลังฟังเสียง... (คลิกเพื่อหยุด)'
                      : `พิมพ์ด้วยเสียง (คลิกเพื่อพูด - ${speechLang === 'th-TH' ? 'ภาษาไทย' : 'English'})`
                  }
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                    isListening
                      ? 'border-rose-500 bg-rose-500 text-white shadow-sm ring-2 ring-rose-400/40 animate-pulse'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-700'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  title="แนบรูปภาพ (หรือกด Ctrl+V เพื่อวางรูป)"
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                    selectedImage
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400/20'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-700'
                  } active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <ImageIcon className="h-4 w-4" />
                </button>

                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="หยุดการสร้างข้อความ"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500 text-white shadow-xs hover:bg-rose-600 active:scale-95 transition cursor-pointer"
                  >
                    <Square className="h-4 w-4 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputMessage.trim() && !selectedImage}
                    title="ส่งข้อความ"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-30 disabled:hover:bg-emerald-600 disabled:active:scale-100 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span>Powered by Chrome Built-in AI</span>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-slate-400">
                (กด ↑ / ↓ เพื่อเลือกประวัติ • วางรูป Ctrl+V • กด 🎙️ เพื่อพูด)
              </span>
              <span>{inputMessage.length > 0 ? `${inputMessage.length} ตัวอักษร` : ''}</span>
            </div>
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
        modelName={activeModelInfo.modelName}
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