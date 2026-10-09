import type {
  AILanguageModelFactory,
  AILanguageModelSession,
  AILanguageModelCreateOptions,
} from '../types/ai';

export type AIStatus = 'checking' | 'available' | 'downloading' | 'unavailable' | 'mock';
export type OnDeviceModelType = 'gemini-nano' | 'gemma';

export interface AIServiceState {
  status: AIStatus;
  statusMessage: string;
  isMock: boolean;
  modelType?: OnDeviceModelType;
  modelName?: string;
  hasGpu?: boolean;
}

class AIService {
  private session: AILanguageModelSession | null = null;
  private factory: AILanguageModelFactory | null = null;
  private currentSystemPrompt: string = 'คุณคือผู้ช่วย AI อัจฉริยะที่ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร';

  public detectModelType(): {
    modelType: OnDeviceModelType;
    modelName: string;
    hasGpu: boolean;
    maxTokens: number;
  } {
    const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const maxTokens = this.session?.maxTokens ?? 4096;

    // 1. Inspect explicit session / capabilities metadata if exposed by browser
    const sessionAny = this.session as unknown as Record<string, unknown> | null;
    const raw = String(sessionAny?.model || sessionAny?.modelName || '').toLowerCase();
    if (raw.includes('gemma')) {
      return {
        modelType: 'gemma',
        modelName: hasGpu ? 'Gemma 4 (GPU)' : 'Gemma 4',
        hasGpu,
        maxTokens,
      };
    }
    if (raw.includes('nano') || raw.includes('gemini')) {
      return {
        modelType: 'gemini-nano',
        modelName: hasGpu ? 'Gemini Nano (GPU)' : 'Gemini Nano',
        hasGpu,
        maxTokens,
      };
    }

    // 2. Check context window:
    // Gemini Nano on Chrome is strictly 4,096 tokens, while Gemma on-device has 8,192+
    if (maxTokens > 4096) {
      return {
        modelType: 'gemma',
        modelName: hasGpu ? 'Gemma 4 (GPU)' : 'Gemma 4',
        hasGpu,
        maxTokens,
      };
    }

    // Default to Gemini Nano (4,096 tokens standard in Chrome Canary/Dev)
    return {
      modelType: 'gemini-nano',
      modelName: hasGpu ? 'Gemini Nano (GPU)' : 'Gemini Nano',
      hasGpu,
      maxTokens,
    };
  }

  public getFactory(): AILanguageModelFactory | null {
    if (typeof window === 'undefined') return null;

    if (window.ai?.languageModel) {
      return window.ai.languageModel;
    }

    if (typeof ai !== 'undefined' && ai?.languageModel) {
      return ai.languageModel;
    }

    if (typeof window.LanguageModel !== 'undefined') {
      return window.LanguageModel;
    }

    if (typeof LanguageModel !== 'undefined') {
      return LanguageModel;
    }

    return null;
  }

  public async checkAvailability(): Promise<AIServiceState> {
    const detected = this.detectModelType();
    try {
      this.factory = this.getFactory();

      if (!this.factory) {
        return {
          status: 'unavailable',
          statusMessage: 'ไม่พบ Chrome Built-in AI ในเบราว์เซอร์นี้ (สามารถใช้โหมดจำลองได้)',
          isMock: true,
          ...detected,
        };
      }

      if (typeof this.factory.capabilities === 'function') {
        const capabilities = await this.factory.capabilities();
        if (capabilities.available === 'readily') {
          return {
            status: 'available',
            statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
            isMock: false,
            ...detected,
          };
        } else if (capabilities.available === 'after-download') {
          return {
            status: 'downloading',
            statusMessage: `กำลังดาวน์โหลดโมเดล ${detected.modelName} บนอุปกรณ์...`,
            isMock: false,
            ...detected,
          };
        }
      }

      if (typeof this.factory.availability === 'function') {
        let avail: string;
        try {
          avail = await this.factory.availability({ samplingMode: 'most-predictable' });
        } catch {
          try {
            avail = await this.factory.availability();
          } catch {
            avail = 'unavailable';
          }
        }

        if (avail === 'readily' || avail === 'available') {
          return {
            status: 'available',
            statusMessage: `Chrome ${detected.modelName} พร้อมใช้งานบนอุปกรณ์ของคุณ`,
            isMock: false,
            ...detected,
          };
        } else if (avail === 'after-download' || avail === 'downloading' || avail === 'downloadable') {
          return {
            status: 'downloading',
            statusMessage: `กำลังดาวน์โหลดโมเดล ${detected.modelName} บนอุปกรณ์...`,
            isMock: false,
            ...detected,
          };
        }
      }

      // If create is available directly
      return {
        status: 'available',
        statusMessage: `Chrome Prompt API (${detected.modelName}) พร้อมทำงาน`,
        isMock: false,
        ...detected,
      };
    } catch (err) {
      console.warn('AI availability check error:', err);
      return {
        status: 'unavailable',
        statusMessage: 'ไม่สามารถเชื่อมต่อโมเดล Built-in AI ได้ (จะเปิดโหมดจำลองเพื่อทดสอบ)',
        isMock: true,
        ...detected,
      };
    }
  }

  public hasActiveSession(): boolean {
    return this.session !== null;
  }

  public async initSession(options?: AILanguageModelCreateOptions): Promise<void> {
    this.factory = this.getFactory();

    if (options?.systemPrompt) {
      this.currentSystemPrompt = options.systemPrompt;
    }

    if (this.factory) {
      try {
        if (this.session) {
          try {
            this.session.destroy();
          } catch {
            // ignore
          }
          this.session = null;
        }

        let sessionCreated = false;

        // Try 1: with samplingMode: 'most-predictable' (Chrome 154+ MTP compatible)
        try {
          this.session = await this.factory.create({
            systemPrompt: this.currentSystemPrompt,
            samplingMode: 'most-predictable',
          });
          sessionCreated = true;
          console.log('AI session created successfully via samplingMode');
        } catch (e1) {
          console.warn('Try 1 (samplingMode) failed:', e1);
        }

        // Try 2: with topK: 1 (MTP compatible)
        if (!sessionCreated) {
          try {
            this.session = await this.factory.create({
              systemPrompt: this.currentSystemPrompt,
              topK: 1,
            });
            sessionCreated = true;
            console.log('AI session created successfully via topK: 1');
          } catch (e2) {
            console.warn('Try 2 (topK: 1) failed:', e2);
          }
        }

        // Try 3: with user options / fallback
        if (!sessionCreated) {
          try {
            this.session = await this.factory.create({
              systemPrompt: this.currentSystemPrompt,
              temperature: options?.temperature,
              topK: options?.topK,
            });
            sessionCreated = true;
          } catch (e3) {
            console.warn('Try 3 (user options) failed:', e3);
          }
        }

        // Try 4: bare minimum
        if (!sessionCreated) {
          this.session = await this.factory.create();
        }
      } catch (e) {
        console.warn('Could not initialize Built-in AI session:', e);
        this.session = null;
      }
    }
  }

  public async promptStream(
    userMessage: string,
    onChunk: (chunkText: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    this.factory = this.getFactory();

    // If real Built-in AI is available
    if (this.factory) {
      if (!this.session) {
        await this.initSession();
      }

      if (this.session) {
        try {
          if (typeof this.session.promptStreaming === 'function') {
            try {
              const stream = this.session.promptStreaming(userMessage, { signal });
              let accumulated = '';
              for await (const chunk of stream as unknown as AsyncIterable<string>) {
                accumulated += chunk;
                onChunk(accumulated);
              }
              return accumulated;
            } catch (streamErr) {
              console.warn('promptStreaming error, falling back to prompt():', streamErr);
              const answer = await this.session.prompt(userMessage, { signal });
              onChunk(answer);
              return answer;
            }
          } else {
            const answer = await this.session.prompt(userMessage, { signal });
            onChunk(answer);
            return answer;
          }
        } catch (err: unknown) {
          console.warn('Prompt error, attempting recreation...', err);
          await this.initSession();
          if (this.session) {
            const answer = await this.session.prompt(userMessage, { signal });
            onChunk(answer);
            return answer;
          }
          throw err;
        }
      }
    }

    // Mock response fallback for development / browsers without flag enabled
    return await this.mockStreamResponse(userMessage, onChunk, signal);
  }

  private async mockStreamResponse(
    userMessage: string,
    onChunk: (accumulated: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const mockReplies = [
      `สวัสดีครับ! ได้รับข้อความ "${userMessage}" เรียบร้อยแล้วครับ ขอบคุณที่ทดสอบใช้งาน UI แชทบอทนี้! 😊`,
      `นี่คือผลลัพธ์จำลองสำหรับการทดสอบหน้าเว็บ (Mock Mode) ของ Built-in AI Prompt API ครับ\n\nเมื่อเปิดใช้งานผ่าน Chrome ที่รองรับ ระบบจะประมวลผลผ่านโมเดล On-Device บนเครื่องของคุณโดยตรงอย่างรวดเร็วและปลอดภัย!`,
      `ข้อความของคุณคือ: "${userMessage}"\n\nระบบแชทบอทนี้พร้อมใช้งานทั้ง:\n1. การตอบแบบ Real-time Streaming\n2. การปรับแต่ง System Prompt\n3. การจัดรูปแบบ **Markdown** อย่างสวยงาม\n4. รองรับทั้ง Desktop และ Mobile`,
    ];
    const reply = mockReplies[Math.floor(Math.random() * mockReplies.length)];

    let current = '';

    for (let i = 0; i < reply.length; i++) {
      if (signal?.aborted) {
        break;
      }
      current += reply[i];
      onChunk(current);
      await new Promise((r) => setTimeout(r, 15));
    }

    return current;
  }

  public resetSession(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch {
        // ignore
      }
      this.session = null;
    }
  }

  public getSession(): AILanguageModelSession | null {
    return this.session;
  }

  public estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  public async countPromptTokens(text: string): Promise<number> {
    if (!text || !text.trim()) return 0;
    if (this.session && typeof this.session.countPromptTokens === 'function') {
      try {
        return await this.session.countPromptTokens(text);
      } catch (err) {
        console.warn('countPromptTokens fallback to estimation:', err);
      }
    }
    return this.estimateTokens(text);
  }

  public getContextTokenUsage(accumulatedChars?: number): {
    maxTokens: number;
    tokensSoFar: number;
    tokensLeft: number;
  } {
    const maxTokens = this.session?.maxTokens ?? 4096;
    let tokensSoFar = this.session?.tokensSoFar ?? 0;

    if (tokensSoFar === 0 && accumulatedChars) {
      tokensSoFar = Math.ceil(accumulatedChars / 3.2);
    }

    const tokensLeft = this.session?.tokensLeft ?? Math.max(0, maxTokens - tokensSoFar);
    return {
      maxTokens,
      tokensSoFar,
      tokensLeft,
    };
  }
}

export function estimateTokens(text: string): number {
  if (!text || !text.trim()) return 0;
  const thaiMatch = text.match(/[\u0E00-\u0E7F]/g);
  const thaiCount = thaiMatch ? thaiMatch.length : 0;
  const nonThaiCount = text.length - thaiCount;
  const estimated = Math.ceil(thaiCount / 2.8 + nonThaiCount / 4);
  return Math.max(1, estimated);
}

export const aiService = new AIService();
