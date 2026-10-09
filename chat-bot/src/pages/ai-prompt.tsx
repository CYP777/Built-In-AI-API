import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Square, Sparkles, Lightbulb, Code2, Globe, FileText, Info, Gauge, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { ChatMessage, type Message } from '../components/ChatMessage';
import { ChatHeader } from '../components/ChatHeader';
import { SettingsModal } from '../components/SettingsModal';
import { PolicyModal } from '../components/PolicyModal';
import { aiService, type AIServiceState } from '../services/ai-service';

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
const DEFAULT_BASE_PROMPT = 'คุณคือผู้ช่วย AI อัจฉริยะที่ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Policy Modal State (เปิดแจ้งเตือนอัตโนมัติเฉพาะเมื่อยังไม่เคยกดยอมรับนโยบาย)
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(POLICY_ACCEPTED_KEY) !== 'true';
    }
    return false;
  });

  // Prompt History state สำหรับปุ่มลูกศรขึ้น/ลง (Arrow Up / Down)
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const draftInputRef = useRef<string>('');

  // Context Limit Alert Modal state
  const [showContextLimitModal, setShowContextLimitModal] = useState<boolean>(false);

  const [statusState, setStatusState] = useState<AIServiceState>({
    status: 'checking',
    statusMessage: 'กำลังตรวจสอบสถานะโมเดล...',
    isMock: false,
  });

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    DEFAULT_BASE_PROMPT + POLICY_CLAUSE
  );
  const [temperature, setTemperature] = useState<number>(0);
  const [topK, setTopK] = useState<number>(1);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  // Auto-detected Model Information
  const activeModelInfo = useMemo(() => {
    // Re-evaluate when statusState updates (e.g. session initialized)
    void statusState.status;
    return aiService.detectModelType();
  }, [statusState.status]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Restore focus to textarea when generation finishes
  useEffect(() => {
    if (!isGenerating) {
      textareaRef.current?.focus();
    }
  }, [isGenerating]);

  // Check Built-in AI on load
  const verifyAI = useCallback(async () => {
    setStatusState((prev) => ({
      ...prev,
      status: 'checking',
      statusMessage: 'กำลังตรวจสอบสถานะโมเดล...',
    }));
    const state = await aiService.checkAvailability();
    await aiService.initSession({
      systemPrompt,
      temperature,
      topK,
    });
    if (aiService.hasActiveSession()) {
      const detected = aiService.detectModelType();
      setStatusState({
        status: 'available',
        statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
        isMock: false,
        ...detected,
      });
    } else {
      setStatusState(state);
    }
  }, [systemPrompt, temperature, topK]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const state = await aiService.checkAvailability();
      await aiService.initSession({
        systemPrompt,
        temperature,
        topK,
      });
      if (!ignore) {
        if (aiService.hasActiveSession()) {
          const detected = aiService.detectModelType();
          setStatusState({
            status: 'available',
            statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
            isMock: false,
            ...detected,
          });
        } else {
          setStatusState(state);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [systemPrompt, temperature, topK]);

  // Context Window Token Metrics
  const conversationChars = useMemo(() => {
    return messages.reduce((acc, m) => acc + m.text.length, 0);
  }, [messages]);

  const tokenUsage = useMemo(() => {
    return aiService.getContextTokenUsage(conversationChars + systemPrompt.length);
  }, [conversationChars, systemPrompt]);

  const maxTokens = tokenUsage.maxTokens || 4096;
  const tokensSoFar = Math.min(tokenUsage.tokensSoFar, maxTokens);
  const tokensLeft = Math.max(0, maxTokens - tokensSoFar);
  const contextPercentage = Math.min(100, Math.round((tokensSoFar / maxTokens) * 1000) / 10);

  const isContextNearLimit = contextPercentage >= 80;
  const isContextExceeded = contextPercentage >= 95;

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
      if (shouldAppend) {
        if (prev.includes(POLICY_MARKER)) return prev;
        return prev.trim() + POLICY_CLAUSE;
      } else {
        if (!prev.includes(POLICY_MARKER)) return prev;
        const markerIndex = prev.indexOf(POLICY_MARKER);
        return prev.substring(0, markerIndex).trim();
      }
    });
  }, [setSystemPrompt]);

  // Reset Session
  const handleResetSession = async () => {
    handleStop();
    setMessages([]);
    aiService.resetSession();
    await aiService.initSession({
      systemPrompt,
      temperature,
      topK,
    });
    setShowContextLimitModal(false);
  };

  // Handle Send
  const handleSend = async (textToSend?: string) => {
    const promptText = (textToSend || inputMessage).trim();
    if (!promptText || isGenerating) return;

    // หากบริบทเกินเกณฑ์สูงสุด แจ้งเตือนให้เปิดเซสชันใหม่
    if (tokensSoFar >= maxTokens * 0.98) {
      setShowContextLimitModal(true);
      return;
    }

    // บันทึกลงใน promptHistory สำหรับการกดลูกศรขึ้น/ลง
    setPromptHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === promptText) {
        return prev;
      }
      return [...prev, promptText];
    });
    setHistoryIndex(-1);
    draftInputRef.current = '';

    setInputMessage('');
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
      text: promptText,
      timestamp: timeString,
    };

    const aiMessageItem: Message = {
      id: actualAiId,
      sender: 'ai',
      text: '',
      timestamp: timeString,
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessageItem, aiMessageItem]);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await aiService.promptStream(
        promptText,
        (currentText) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === actualAiId
                ? { ...msg, text: currentText, isStreaming: true }
                : msg
            )
          );
        },
        controller.signal
      );
    } catch (err: unknown) {
      console.error('Prompting failed:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === actualAiId
            ? {
                ...msg,
                text:
                  msg.text ||
                  'ขออภัย เกิดข้อผิดพลาดในการประมวลผลคำตอบ กรุณาลองใหม่อีกครั้ง',
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === actualAiId ? { ...msg, isStreaming: false } : msg
        )
      );
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Stop generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  };

  // New chat (Reset session)
  const handleClearChat = () => {
    if (messages.length === 0) return;
    if (confirm('ต้องการเริ่มต้นบทสนทนาใหม่ใช่หรือไม่? (ระบบจะเริ่มเซสชันและล้างบริบทเดิม)')) {
      handleStop();
      setMessages([]);
      aiService.resetSession();
    }
  };

  // Reset Session on settings save
  const handleSaveAndResetSession = async () => {
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
      e.preventDefault();
      handleSend();
      return;
    }

    // กดลูกศรขึ้น (ArrowUp) เพื่อดู prompt ก่อนหน้า
    if (e.key === 'ArrowUp') {
      const isAtStart = textareaRef.current
        ? textareaRef.current.selectionStart === 0 && textareaRef.current.selectionEnd === 0
        : true;
      if (promptHistory.length > 0 && (isAtStart || inputMessage === '')) {
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

  return (
    <div className="flex h-screen w-full flex-col bg-gradient-to-b from-slate-50 via-white/50 to-slate-50/80 font-sans text-slate-800 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Header */}
      <ChatHeader
        status={statusState.status}
        statusMessage={statusState.statusMessage}
        isMock={statusState.isMock}
        modelName={activeModelInfo.modelName}
        modelType={activeModelInfo.modelType}
        onClearChat={handleClearChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStatus={verifyAI}
        onOpenPolicy={() => setIsPolicyModalOpen(true)}
      />

      {/* Optional Notice banner when mock mode is active */}
      {statusState.isMock && !bannerDismissed && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/90 px-4 py-2 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              ขณะนี้ระบบทำงานใน<strong>โหมดจำลอง (Mock Mode)</strong> เนื่องจาก Chrome Built-in AI ยังไม่ได้เปิดใช้งานในเบราว์เซอร์นี้
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
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {messages.length === 0 ? (
            /* Welcome / Empty State */
            <div className="flex min-h-[58vh] flex-col items-center justify-center text-center px-4">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/20">
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
      </main>

      {/* Input Form Footer */}
      <footer className="border-t border-slate-200/80 bg-white p-3 sm:p-4">
        <div className="mx-auto max-w-4xl space-y-2">
          {/* Urgent Warning if context window is near limit or exceeded */}
          {isContextNearLimit && (
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl p-3 text-xs shadow-xs animate-in fade-in border-2 ${
                isContextExceeded
                  ? 'border-red-500 bg-red-50 text-red-900'
                  : 'border-amber-400 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    isContextExceeded ? 'text-red-600 animate-bounce' : 'text-amber-600'
                  }`}
                />
                <div>
                  <span
                    className={`font-black text-white px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                      isContextExceeded ? 'bg-red-600' : 'bg-amber-600'
                    }`}
                  >
                    {isContextExceeded ? 'วิกฤตบริบท' : 'เตือนภัยบริบท'}
                  </span>
                  <span className="font-bold">
                    Context Window {isContextExceeded ? 'เต็ม/เกินกำหนดแล้ว' : 'ใกล้เต็มแล้ว'} (
                    {tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} Tokens, {contextPercentage}%)!
                  </span>
                  <span className="block sm:inline sm:ml-1 text-[11px] opacity-90">
                    ข้อความใหม่อาจทำให้โมเดลตัดประวัติเก่าทิ้ง แนะนำให้เปิดเซสชันใหม่
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetSession}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition shrink-0 shadow-xs ${
                  isContextExceeded
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>เปิดเซสชันใหม่ทันที</span>
              </button>
            </div>
          )}

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
                  contextPercentage >= 85
                    ? 'bg-red-100 text-red-700'
                    : contextPercentage >= 60
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {contextPercentage}%
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">
                คงเหลือ: <strong>{tokensLeft.toLocaleString()} Tokens</strong>
              </span>
              {/* Mini progress bar */}
              <div className="h-1.5 w-16 sm:w-24 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    contextPercentage >= 85
                      ? 'bg-red-600'
                      : contextPercentage >= 60
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(3, contextPercentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Textarea Input Container */}
          <div className="relative rounded-2xl border border-slate-300/80 bg-white p-2 sm:p-2.5 shadow-sm shadow-slate-200/50 focus-within:border-emerald-500 focus-within:ring-3 focus-within:ring-emerald-500/15 focus-within:shadow-md transition-all duration-200">
            <div className="flex items-end gap-2">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                autoFocus
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์ข้อความของคุณที่นี่... (Enter เพื่อส่ง, กด ↑ / ↓ เพื่อเลือกประวัติคำสั่ง)"
                className="max-h-40 min-h-10 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden leading-relaxed"
              />

              {/* Action Buttons */}
              <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="หยุดการสร้างข้อความ"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500 text-white shadow-xs hover:bg-rose-600 active:scale-95 transition"
                  >
                    <Square className="h-4 w-4 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputMessage.trim()}
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
            <span>Powered by Chrome Built-in AI / Prompt API</span>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-slate-400">
                (กด ↑ / ↓ เพื่อเลือกประวัติคำสั่ง)
              </span>
              <span>{inputMessage.length > 0 ? `${inputMessage.length} ตัวอักษร` : ''}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Context Exceeded Limit Modal */}
      {showContextLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base leading-tight">
                    เตือนภัย: Context Window เต็มพิกัด
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    บริบทการสนทนาเกินขีดจำกัดความจุของ {activeModelInfo.modelName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowContextLimitModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                title="ปิด"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3.5 text-xs sm:text-sm">
              <p className="text-slate-700 leading-relaxed">
                ขณะนี้บริบทการสนทนาใช้ไปแล้ว <strong>{tokensSoFar.toLocaleString()} / {maxTokens.toLocaleString()} Tokens ({contextPercentage}%)</strong>
                {' '}ซึ่งเต็มความจุของโมเดลแล้ว หากสนทนาต่อ โมเดลจะตัดประวัติการสนทนาแรกเริ่มออก
              </p>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                💡 <strong>คำแนะนำของระบบ:</strong> ควรเปิดเซสชันใหม่เพื่อคงความรวดเร็วและป้องกันข้อมูลคลาดเคลื่อน
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setShowContextLimitModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60 transition"
              >
                ส่งต่อ (ยอมรับการตัดบริบท)
              </button>
              <button
                type="button"
                onClick={handleResetSession}
                className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-rose-700 transition"
              >
                เปิดเซสชันใหม่ทันที
              </button>
            </div>
          </div>
        </div>
      )}

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
      />
    </div>
  );
};

export default AIPromptPage;