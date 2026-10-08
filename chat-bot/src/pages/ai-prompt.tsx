import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Sparkles, Lightbulb, Code2, Globe, FileText, Info } from 'lucide-react';
import { ChatMessage, type Message } from '../components/ChatMessage';
import { ChatHeader } from '../components/ChatHeader';
import { SettingsModal } from '../components/SettingsModal';
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

  const [statusState, setStatusState] = useState<AIServiceState>({
    status: 'checking',
    statusMessage: 'กำลังตรวจสอบสถานะโมเดล...',
    isMock: false,
  });

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    'คุณคือผู้ช่วย AI อัจฉริยะที่ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร'
  );
  const [temperature, setTemperature] = useState<number>(0);
  const [topK, setTopK] = useState<number>(1);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

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
    const state = await aiService.checkAvailability();
    await aiService.initSession({
      systemPrompt,
      temperature,
      topK,
    });
    if (aiService.hasActiveSession()) {
      setStatusState({
        status: 'available',
        statusMessage: 'Chrome Gemini Nano พร้อมใช้งานบนอุปกรณ์ของคุณ',
        isMock: false,
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
          setStatusState({
            status: 'available',
            statusMessage: 'Chrome Gemini Nano พร้อมใช้งานบนอุปกรณ์ของคุณ',
            isMock: false,
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

  // Handle Send
  const handleSend = async (textToSend?: string) => {
    const promptText = (textToSend || inputMessage).trim();
    if (!promptText || isGenerating) return;

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

  // Clear chat
  const handleClearChat = () => {
    if (messages.length === 0) return;
    if (confirm('คุณต้องการล้างประวัติการสนทนานี้ทั้งหมดใช่หรือไม่?')) {
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

  // Textarea input auto-resize and keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 font-sans text-slate-800">
      {/* Header */}
      <ChatHeader
        status={statusState.status}
        statusMessage={statusState.statusMessage}
        isMock={statusState.isMock}
        onClearChat={handleClearChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshStatus={verifyAI}
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
            <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xl shadow-emerald-100">
                <Sparkles className="h-8 w-8" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500"></span>
                </span>
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
                เริ่มต้นสนทนากับ AI
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-500 leading-relaxed">
                ระบบแชทบอทอัจฉริยะที่ใช้เทคโนโลยี Chrome Prompt API สามารถถามคำถาม ขอคำแนะนำ หรือให้ช่วยร่างข้อความได้ทันที
              </p>

              {/* Prompt Starter Pills */}
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 text-left">
                {QUICK_PROMPTS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSend(item.prompt)}
                      className="group flex flex-col rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2 font-medium text-slate-600 text-sm group-hover:text-emerald-600">
                        <Icon className="h-4 w-4 text-emerald-500" />
                        <span>{item.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 group-hover:text-slate-600">
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
        <div className="mx-auto max-w-4xl">
          <div className="relative rounded-2xl border border-slate-300 bg-white p-2 shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition">
            <div className="flex items-center">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputMessage}
                autoFocus
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์ข้อความของคุณที่นี่... (กด Enter เพื่อส่ง, Shift + Enter เพื่อขึ้นบรรทัดใหม่)"
                className="max-h-40 min-h-9.5 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden"
              />

              {/* Action Buttons */}
              <div className="flex shrink-0 items-center gap-1.5 pr-1">
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    title="หยุดการสร้างข้อความ"
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition"
                  >
                    <Square className="h-4 w-4 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputMessage.trim()}
                    title="ส่งข้อความ"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-emerald-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-gray-50 transition"
                  >
                    <Send className="h-5 w-5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span>Powered by Chrome Built-in AI / Prompt API</span>
            <span>{inputMessage.length > 0 ? `${inputMessage.length} ตัวอักษร` : ''}</span>
          </div>
        </div>
      </footer>

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
      />
    </div>
  );
};

export default AIPromptPage;