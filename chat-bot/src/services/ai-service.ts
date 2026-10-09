import type {
  AILanguageModelFactory,
  AILanguageModelSession,
  AILanguageModelCreateOptions,
  AIMultimodalPart,
  AIPromptInput,
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
  isMultimodal?: boolean;
}

class AIService {
  private session: AILanguageModelSession | null = null;
  private factory: AILanguageModelFactory | null = null;
  private currentSystemPrompt: string = 'คุณคือผู้ช่วย AI อัจฉริยะที่ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร';
  private isMultimodalSupported: boolean | null = null;

  public async checkMultimodalSupport(): Promise<boolean> {
    if (this.isMultimodalSupported !== null) {
      return this.isMultimodalSupported;
    }

    this.factory = this.getFactory();
    if (!this.factory) {
      this.isMultimodalSupported = false;
      return false;
    }

    try {
      if (typeof this.factory.availability === 'function') {
        const avail = await this.factory.availability({
          expectedInputs: [{ type: 'text' }, { type: 'image' }],
        });
        this.isMultimodalSupported = avail === 'readily' || avail === 'available';
        return this.isMultimodalSupported;
      }
    } catch {
      // ignore
    }

    this.isMultimodalSupported = false;
    return false;
  }

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

    const winAny = window as unknown as Record<string, unknown>;
    if (winAny.ai && typeof winAny.ai === 'object') {
      const aiObj = winAny.ai as Record<string, unknown>;
      if (aiObj.languageModel) return aiObj.languageModel as AILanguageModelFactory;
      if (aiObj.assistant) return aiObj.assistant as AILanguageModelFactory;
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
        } else if (avail === 'no' || avail === 'unavailable') {
          return {
            status: 'unavailable',
            statusMessage: 'โมเดล On-Device ยังไม่พร้อมทำงานบนเบราว์เซอร์นี้ (Not Supported)',
            isMock: true,
            ...detected,
          };
        }
      }

      return {
        status: 'unavailable',
        statusMessage: 'ไม่สามารถเชื่อมต่อโมเดล Built-in AI ได้ในขณะนี้',
        isMock: true,
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

        // Try 1: with user options (temperature & topK) if provided
        if (!sessionCreated && (options?.temperature !== undefined || options?.topK !== undefined)) {
          try {
            this.session = await this.factory.create({
              systemPrompt: this.currentSystemPrompt,
              temperature: options?.temperature,
              topK: options?.topK,
            });
            sessionCreated = true;
          } catch (eUser) {
            console.warn('User params session create fallback:', eUser);
          }
        }

        // Try 2: with samplingMode: 'most-predictable' (Chrome 154+ MTP compatible)
        if (!sessionCreated) {
          try {
            this.session = await this.factory.create({
              systemPrompt: this.currentSystemPrompt,
              samplingMode: 'most-predictable',
            });
            sessionCreated = true;
            console.log('AI session created successfully via samplingMode');
          } catch (e1) {
            console.warn('Try 2 (samplingMode) failed:', e1);
          }
        }

        // Try 3: with topK: 1 (MTP compatible)
        if (!sessionCreated) {
          try {
            this.session = await this.factory.create({
              systemPrompt: this.currentSystemPrompt,
              topK: 1,
            });
            sessionCreated = true;
            console.log('AI session created successfully via topK: 1');
          } catch (e2) {
            console.warn('Try 3 (topK: 1) failed:', e2);
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

  public async createIsolatedSession(
    options?: AILanguageModelCreateOptions
  ): Promise<AILanguageModelSession | null> {
    const factory = this.getFactory();
    if (!factory) return null;

    try {
      if (options?.temperature !== undefined || options?.topK !== undefined || options?.systemPrompt) {
        try {
          return await factory.create(options);
        } catch (e1) {
          console.warn('createIsolatedSession with options failed:', e1);
        }
      }

      try {
        return await factory.create({
          systemPrompt: options?.systemPrompt,
          samplingMode: 'most-predictable',
        });
      } catch (e2) {
        console.warn('createIsolatedSession with samplingMode failed:', e2);
      }

      try {
        return await factory.create({
          systemPrompt: options?.systemPrompt,
          topK: 1,
        });
      } catch (e3) {
        console.warn('createIsolatedSession with topK: 1 failed:', e3);
      }

      return await factory.create();
    } catch (e) {
      console.warn('createIsolatedSession failed:', e);
      return null;
    }
  }

  public async promptStream(
    userMessage: string,
    onChunk: (chunkText: string) => void,
    signal?: AbortSignal,
    imageFile?: File | Blob | null
  ): Promise<string> {
    this.factory = this.getFactory();

    // If real Built-in AI is available
    if (this.factory) {
      if (!this.session) {
        await this.initSession();
      }

      // If an image is attached, create/use multimodal session
      let sessionToUse = this.session;
      let isolatedMultimodalSession: AILanguageModelSession | null = null;

      if (imageFile) {
        try {
          isolatedMultimodalSession = await this.factory.create({
            systemPrompt: this.currentSystemPrompt,
            expectedInputs: [{ type: 'text' }, { type: 'image' }],
          });
          sessionToUse = isolatedMultimodalSession;
        } catch (e) {
          console.warn('Dedicated multimodal session creation fallback:', e);
        }
      }

      if (sessionToUse) {
        try {
          let promptPayload: AIPromptInput = userMessage;

          if (imageFile) {
            promptPayload = [
              {
                role: 'user',
                content: [
                  { type: 'text', value: userMessage || 'โปรดวิเคราะห์และอธิบายรูปภาพนี้อย่างละเอียด' },
                  { type: 'image', value: imageFile },
                ],
              },
            ];
          }

          if (typeof sessionToUse.promptStreaming === 'function') {
            try {
              let stream: ReadableStream<string>;
              try {
                stream = sessionToUse.promptStreaming(promptPayload, { signal });
              } catch (payloadErr) {
                if (imageFile) {
                  const flatParts: Array<AIMultimodalPart> = [
                    { type: 'text', value: userMessage || 'โปรดวิเคราะห์และอธิบายรูปภาพนี้อย่างละเอียด' },
                    { type: 'image', value: imageFile },
                  ];
                  stream = sessionToUse.promptStreaming(flatParts, { signal });
                } else {
                  throw payloadErr;
                }
              }

              let accumulated = '';
              for await (const chunk of stream as unknown as AsyncIterable<string>) {
                if (signal?.aborted) break;

                // Handle both cumulative stream (Chrome Built-in AI default) and delta stream
                if (typeof chunk === 'string') {
                  if (chunk.startsWith(accumulated)) {
                    accumulated = chunk; // Cumulative chunk
                  } else {
                    accumulated += chunk; // Delta chunk
                  }
                }

                // Detect and cut off repetition loop immediately (ดักลูปตัวอักษรซ้ำ เช่น งงงงงงง)
                const loopCheck = detectRepetitionLoop(accumulated);
                if (loopCheck.hasLoop) {
                  accumulated = loopCheck.cleanedText;
                  onChunk(accumulated);
                  break; // Cut off the stream immediately!
                }

                onChunk(accumulated);
              }
              return accumulated;
            } catch (streamErr) {
              if (signal?.aborted) throw streamErr;
              const msg = String((streamErr as Error)?.message || '').toLowerCase();
              const name = String((streamErr as Error)?.name || '');
              if (
                name === 'QuotaExceededError' ||
                name === 'InvalidStateError' ||
                msg.includes('token') ||
                msg.includes('quota') ||
                msg.includes('limit') ||
                msg.includes('exhaust') ||
                msg.includes('context')
              ) {
                throw streamErr;
              }

              console.warn('promptStreaming error, falling back to prompt():', streamErr);
              let rawAnswer: string;
              try {
                rawAnswer = await sessionToUse.prompt(promptPayload, { signal });
              } catch {
                if (imageFile) {
                  const flatParts: Array<AIMultimodalPart> = [
                    { type: 'text', value: userMessage || 'โปรดวิเคราะห์และอธิบายรูปภาพนี้อย่างละเอียด' },
                    { type: 'image', value: imageFile },
                  ];
                  rawAnswer = await sessionToUse.prompt(flatParts, { signal });
                } else {
                  throw streamErr;
                }
              }

              const loopCheck = detectRepetitionLoop(rawAnswer);
              const answer = loopCheck.hasLoop ? loopCheck.cleanedText : rawAnswer;
              onChunk(answer);
              return answer;
            }
          } else {
            let rawAnswer: string;
            try {
              rawAnswer = await sessionToUse.prompt(promptPayload, { signal });
            } catch {
              if (imageFile) {
                const flatParts: Array<AIMultimodalPart> = [
                  { type: 'text', value: userMessage || 'โปรดวิเคราะห์และอธิบายรูปภาพนี้อย่างละเอียด' },
                  { type: 'image', value: imageFile },
                ];
                rawAnswer = await sessionToUse.prompt(flatParts, { signal });
              } else {
                throw new Error('Prompt failed');
              }
            }
            const loopCheck = detectRepetitionLoop(rawAnswer);
            const answer = loopCheck.hasLoop ? loopCheck.cleanedText : rawAnswer;
            onChunk(answer);
            return answer;
          }
        } catch (err: unknown) {
          if (signal?.aborted) throw err;
          const msg = String((err as Error)?.message || '').toLowerCase();
          const name = String((err as Error)?.name || '');
          if (
            name === 'QuotaExceededError' ||
            name === 'InvalidStateError' ||
            msg.includes('token') ||
            msg.includes('quota') ||
            msg.includes('limit') ||
            msg.includes('exhaust') ||
            msg.includes('context')
          ) {
            throw err;
          }

          if (imageFile) {
            console.warn('Multimodal vision prompt error:', err);
            const errorMsg =
              '⚠️ โมเดล Built-in AI บนเบราว์เซอร์นี้ยังไม่สามารถประมวลผลรูปภาพได้ในขณะนี้\n\n' +
              'กรุณาตรวจสอบการตั้งค่าใน Chrome ดังนี้:\n' +
              '1. เปิด `chrome://flags/#prompt-api-multimodal-input` (หรือ `#prompt-api-for-gemini-nano-multimodal-input`) → เลือก **Enabled**\n' +
              '2. เปิด `chrome://flags/#prompt-api` → เลือก **Enabled**\n' +
              '3. เปิด `chrome://components` → กด **Check for update** ที่ Optimization Guide On Device Models\n' +
              '4. ปิดแล้วเปิด Chrome ใหม่เพื่อโหลดโมเดล Vision เข้าสู่ระบบครับ';
            onChunk(errorMsg);
            return errorMsg;
          }

          console.warn('Prompt error, attempting recreation...', err);
          await this.initSession();
          if (this.session) {
            const rawAnswer = await this.session.prompt(userMessage, { signal });
            const loopCheck = detectRepetitionLoop(rawAnswer);
            const answer = loopCheck.hasLoop ? loopCheck.cleanedText : rawAnswer;
            onChunk(answer);
            return answer;
          }
          throw err;
        } finally {
          if (isolatedMultimodalSession) {
            try {
              isolatedMultimodalSession.destroy();
            } catch {
              // ignore
            }
          }
        }
      }
    }

    // Mock response fallback for development / browsers without flag enabled
    return await this.mockStreamResponse(userMessage, onChunk, signal, imageFile);
  }

  private async mockStreamResponse(
    userMessage: string,
    onChunk: (accumulated: string) => void,
    signal?: AbortSignal,
    imageFile?: File | Blob | null
  ): Promise<string> {
    const hasCompressedContext = this.currentSystemPrompt.includes('[บริบทประวัติเดิมที่ถูกบีบอัด]:');

    let reply: string;
    if (imageFile) {
      const fileName = imageFile instanceof File ? imageFile.name : 'image.png';
      const fileSizeKb = (imageFile.size / 1024).toFixed(1);
      const fileType = imageFile.type || 'image/png';
      reply =
        `⚠️ **ไม่สามารถประมวลผลรูปภาพด้วยโมเดล On-Device ได้ในขณะนี้**\n\n` +
        `- **ไฟล์ที่แนบมา**: \`${fileName}\` (${fileSizeKb} KB, \`${fileType}\`)\n` +
        `- **สาเหตุ**: เซสชันของโมเดล AI บน Chrome ในเครื่องยังไม่พร้อมทำงานจริง\n\n` +
        `กรุณาตรวจสอบว่าสถานะ Built-in AI ที่แถบด้านบนขึ้นเป็นสีเขียว "Chrome Gemini Nano พร้อมใช้งาน" เพื่อให้โมเดล AI ในเครื่องเป็นผู้มองเห็นและวิเคราะห์รูปภาพจริงครับ`;
    } else if (hasCompressedContext) {
      reply = `เข้าใจแล้วครับ! ผมจำบริบทเดิมจากการสนทนาก่อนหน้าที่ถูกบีบอัดไว้ได้เรียบร้อยแล้ว\n\nสำหรับข้อความล่าสุด: "${userMessage}"\nผมพร้อมตอบคำถามและสนทนาต่ออย่างต่อเนื่องครับ! 😊`;
    } else {
      const lower = userMessage.toLowerCase();
      if (
        lower.includes('custom hook') ||
        lower.includes('hook') ||
        lower.includes('online/offline') ||
        lower.includes('online')
      ) {
        reply =
          `นี่คือตัวอย่างการสร้าง Custom Hook ใน React สำหรับตรวจจับสถานะ Online/Offline (\`useOnlineStatus\`) พร้อมคำอธิบายและตัวอย่างการนำไปใช้งานครับ:\n\n` +
          `### 1. โค้ด Custom Hook (\`useOnlineStatus.ts\`)\n\n` +
          `\`\`\`tsx\n` +
          `import { useState, useEffect } from 'react';\n\n` +
          `/**\n` +
          ` * Custom Hook สำหรับตรวจจับสถานะการเชื่อมต่อเครือข่ายของผู้ใช้\n` +
          ` * @returns boolean - true หากออนไลน์, false หากออฟไลน์\n` +
          ` */\n` +
          `export function useOnlineStatus(): boolean {\n` +
          `  const [isOnline, setIsOnline] = useState<boolean>(() => {\n` +
          `    return typeof navigator !== 'undefined' ? navigator.onLine : true;\n` +
          `  });\n\n` +
          `  useEffect(() => {\n` +
          `    const handleOnline = () => setIsOnline(true);\n` +
          `    const handleOffline = () => setIsOnline(false);\n\n` +
          `    window.addEventListener('online', handleOnline);\n` +
          `    window.addEventListener('offline', handleOffline);\n\n` +
          `    return () => {\n` +
          `      window.removeEventListener('online', handleOnline);\n` +
          `      window.removeEventListener('offline', handleOffline);\n` +
          `    };\n` +
          `  }, []);\n\n` +
          `  return isOnline;\n` +
          `}\n` +
          `\`\`\`\n\n` +
          `### 2. ตัวอย่างการนำไปใช้งานใน Component\n\n` +
          `\`\`\`tsx\n` +
          `import React from 'react';\n` +
          `import { useOnlineStatus } from './useOnlineStatus';\n\n` +
          `export const NetworkBadge: React.FC = () => {\n` +
          `  const isOnline = useOnlineStatus();\n\n` +
          `  return (\n` +
          `    <div className={\`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold \${\n` +
          `      isOnline\n` +
          `        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'\n` +
          `        : 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'\n` +
          `    }\`}>\n` +
          `      <span className={\`h-2 w-2 rounded-full \${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}\`} />\n` +
          `      <span>{isOnline ? 'เชื่อมต่อออนไลน์ปกติ' : 'ขาดการเชื่อมต่อ (ออฟไลน์)'}</span>\n` +
          `    </div>\n` +
          `  );\n` +
          `};\n` +
          `\`\`\`\n\n` +
          `---\n` +
          `> 💡 *หมายเหตุ (โหมดจำลอง Mock Mode): ขณะนี้เบราว์เซอร์ทำงานในโหมดจำลอง หากเปิดใช้งาน Chrome Prompt API บนเครื่อง ระบบจะประมวลผลผ่านโมเดล Gemini Nano บนเครื่องจริงครับ*`;
      } else if (
        lower.includes('built-in ai') ||
        lower.includes('prompt api') ||
        lower.includes('cloud ai')
      ) {
        reply =
          `### 🌐 Chrome Built-in AI (Prompt API) คืออะไร?\n\n` +
          `**Chrome Built-in AI** คือความสามารถใหม่ของ Google Chrome ที่ผนวกรวมโมเดล AI (เช่น **Gemini Nano**) เข้ามาไว้ในตัวเบราว์เซอร์ ทำให้นักพัฒนาสามารถเรียกใช้งานผ่าน JavaScript API ได้โดยตรงโดยไม่ต้องติดตั้งไลบรารีขนาดใหญ่หรือส่งข้อมูลขึ้น Cloud Server\n\n` +
          `### 📊 เปรียบเทียบ Built-in AI vs Cloud AI\n\n` +
          `| คุณสมบัติ | Built-in AI (On-Device) | Cloud AI (เช่น OpenAI, Gemini API) |\n` +
          `| :--- | :--- | :--- |\n` +
          `| **ความเป็นส่วนตัว (Privacy)** | 🔒 ข้อมูลประมวลผลในเครื่อง 100% ไม่ส่งออกนอกเครื่อง | 🌐 ต้องส่งข้อมูลผ่านเน็ตขึ้นเซิร์ฟเวอร์ภายนอก |\n` +
          `| **ความเร็วและความหน่วง (Latency)** | ⚡ ไม่มีค่า Network Overhead (Zero Network Latency) | ⏳ ขึ้นอยู่กับความเร็วอินเทอร์เน็ตและคิวเซิร์ฟเวอร์ |\n` +
          `| **การทำงานออฟไลน์ (Offline)** | 📶 ทำงานได้ 100% แม้ไม่มีการเชื่อมต่ออินเทอร์เน็ต | ❌ ไม่สามารถใช้งานได้หากเน็ตหลุด |\n` +
          `| **ค่าใช้จ่าย (Cost)** | 🆓 ฟรี ไม่มีค่า Token Billing | 💰 คิดค่าบริการตามจำนวน Token ที่ประมวลผล |\n\n` +
          `---\n` +
          `> 💡 *หมายเหตุ (โหมดจำลอง Mock Mode)*`;
      } else if (lower.includes('อีเมล') || lower.includes('ลางาน')) {
        reply =
          `นี่คือตัวอย่างร่างอีเมลขอลางานเพื่อทำธุระส่วนตัวแบบสุภาพและเป็นมืออาชีพครับ:\n\n` +
          `**หัวข้ออีเมล:** [ขอลางานเพื่อทำธุระส่วนตัว] - [ชื่อ-นามสกุลของคุณ] ([ตำแหน่ง])\n\n` +
          `เรียน [ชื่อหัวหน้างาน / ผู้จัดการ],\n\n` +
          `กระผมนาย/ดิฉัน [ชื่อ-นามสกุล] ตำแหน่ง [ระบุตำแหน่ง] มีความประสงค์จะขอลางานเพื่อไปทำธุระส่วนตัวเป็นเวลา 1 วัน ในวันที่ [ระบุวันที่]\n\n` +
          `ทั้งนี้ กระผม/ดิฉัน ได้จัดเตรียมและส่งมอบงานที่จำเป็นให้แก่ [ชื่อผู้รับผิดชอบงานแทน] เรียบร้อยแล้ว และจะกลับมาปฏิบัติงานตามปกติในวันที่ [ระบุวันรุ่งขึ้น] หากมีเรื่องเร่งด่วนสามารถติดต่อกระผม/ดิฉันได้ทางโทรศัพท์ [ระบุเบอร์โทร]\n\n` +
          `จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ\n\n` +
          `ขอแสดงความนับถือ,\n` +
          `[ชื่อ-นามสกุลของคุณ]\n` +
          `[เบอร์โทรติดต่อ]`;
      } else if (
        lower.includes('แปล') ||
        lower.includes('business casual') ||
        lower.includes('ภาษาอังกฤษ')
      ) {
        reply =
          `นี่คือคำแปลภาษาอังกฤษในระดับ **Business Casual** ที่เป็นธรรมชาติและเป็นมืออาชีพครับ:\n\n` +
          `> **"We're set to kick off this feature next week according to plan."**\n\n` +
          `**ตัวเลือกสำนวนอื่นๆ:**\n` +
          `- *ทางการปานกลาง:* "We will begin developing this feature next week as planned."\n` +
          `- *กระชับและทันสมัย:* "We're on track to start work on this feature next week."`;
      } else {
        const mockReplies = [
          `ได้รับข้อความ: "${userMessage}" เรียบร้อยแล้วครับ\n\n` +
            `> ⚠️ **ระบบกำลังทำงานในโหมดจำลอง (Mock Mode)**\n` +
            `> เนื่องจากเบราว์เซอร์ปัจจุบันยังไม่ได้เปิดใช้งาน Chrome Prompt API (Gemini Nano)\n\n` +
            `**หากต้องการใช้งานโมเดล AI จริงในเครื่อง กรุณาเปิดใช้งาน Flags ดังนี้:**\n` +
            `1. เปิด \`chrome://flags/#prompt-api-for-gemini-nano\` → เลือก **Enabled**\n` +
            `2. เปิด \`chrome://flags/#optimization-guide-on-device-model\` → เลือก **Enabled BypassPerfRequirement**\n` +
            `3. ไปที่ \`chrome://components\` → ตรวจสอบการดาวน์โหลดที่ **Optimization Guide On Device Models**\n` +
            `4. ปิดแล้วเปิด Chrome ใหม่อีกครั้งครับ!`,
          `สำหรับคำถาม: "${userMessage}"\n\n` +
            `ขณะนี้ระบบแชทบอททำงานใน **โหมดจำลอง (Mock Demo)** UI และฟังก์ชันทุกส่วน (Markdown, Code Block, Streaming, Image Upload) พร้อมทำงานอย่างสมบูรณ์แล้วครับ!`,
        ];
        reply = mockReplies[Math.floor(Math.random() * mockReplies.length)];
      }
    }

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
    let tokensSoFar = 0;

    if (this.session && typeof this.session.tokensSoFar === 'number') {
      tokensSoFar = this.session.tokensSoFar;
    } else if (accumulatedChars !== undefined && accumulatedChars > 0) {
      tokensSoFar = Math.ceil(accumulatedChars / 3.0);
    }

    const tokensLeft =
      this.session && typeof this.session.tokensLeft === 'number'
        ? this.session.tokensLeft
        : Math.max(0, maxTokens - tokensSoFar);
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

export function detectRepetitionLoop(text: string): { hasLoop: boolean; cleanedText: string } {
  if (!text || text.length < 16) {
    return { hasLoop: false, cleanedText: text };
  }

  // 1. Single letter or digit repeating 8 or more times (e.g. "งงงงงงงง", "aaaaaaa", "00000000")
  // Excludes markdown dividers like "--------", "========", "********"
  const charLoopRegex = /([\p{L}\p{N}])\1{7,}/u;
  const charMatch = charLoopRegex.exec(text);
  if (charMatch && charMatch.index !== undefined) {
    const cutIndex = charMatch.index + 2;
    const cleaned = text.substring(0, cutIndex);
    return { hasLoop: true, cleanedText: cleaned };
  }

  // 2. Real word/phrase of 4-30 chars repeating 4 or more times consecutively
  // Exclude whitespace/punctuation-only repeats
  const phraseLoopRegex = /([^\s\p{P}]{4,30}?)\1{3,}/u;
  const phraseMatch = phraseLoopRegex.exec(text);
  if (phraseMatch && phraseMatch.index !== undefined) {
    const phrase = phraseMatch[1];
    const cutIndex = phraseMatch.index + phrase.length;
    const cleaned = text.substring(0, cutIndex);
    return { hasLoop: true, cleanedText: cleaned };
  }

  return { hasLoop: false, cleanedText: text };
}

export const aiService = new AIService();
