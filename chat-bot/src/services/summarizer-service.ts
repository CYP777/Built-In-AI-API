import type {
  AISummarizerFactory,
  AISummarizerSession,
  AISummarizerType,
  AISummarizerFormat,
  AISummarizerLength,
  AILanguageModelSession,
} from '../types/ai';
import { aiService, estimateTokens, detectRepetitionLoop } from './ai-service';

export type SummarizerStatus = 'available' | 'downloading' | 'fallback-prompt' | 'mock';
export type EngineUsedType = 'native' | 'prompt-api' | 'mock';

export interface SummarizerState {
  status: SummarizerStatus;
  statusMessage: string;
  isNative: boolean;
}

export interface SummarizeOptions {
  type?: AISummarizerType;
  format?: AISummarizerFormat;
  length?: AISummarizerLength;
  sharedContext?: string;
  signal?: AbortSignal;
  onChunk?: (accumulatedText: string) => void;
}

export interface CompressionResult {
  compressedSummary: string;
  newSystemPrompt: string;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  percentageSaved: number;
}

interface ParsedDialog {
  userQuestions: string[];
  aiResponses: string[];
  mainTopic: string;
}

function parseTranscript(text: string): ParsedDialog {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const userQuestions: string[] = [];
  const aiResponses: string[] = [];

  let currentSpeaker: 'user' | 'ai' | null = null;
  let currentBuffer: string[] = [];

  const flush = () => {
    if (currentBuffer.length > 0) {
      const content = currentBuffer.join(' ').trim();
      if (currentSpeaker === 'user') userQuestions.push(content);
      else if (currentSpeaker === 'ai') aiResponses.push(content);
      currentBuffer = [];
    }
  };

  for (const line of lines) {
    if (/^(ผู้ใช้งาน|User|Human)\s*[:：]/i.test(line)) {
      flush();
      currentSpeaker = 'user';
      currentBuffer.push(line.replace(/^(ผู้ใช้งาน|User|Human)\s*[:：]\s*/i, ''));
    } else if (/^(AI|AI ผู้ช่วย|Assistant)\s*[:：]/i.test(line)) {
      flush();
      currentSpeaker = 'ai';
      currentBuffer.push(line.replace(/^(AI|AI ผู้ช่วย|Assistant)\s*[:：]\s*/i, ''));
    } else {
      currentBuffer.push(line);
    }
  }
  flush();

  if (userQuestions.length === 0 && lines.length > 0) {
    userQuestions.push(lines[0]);
    if (lines.length > 1) {
      aiResponses.push(lines.slice(1).join(' '));
    }
  }

  const rawFirstQ = userQuestions[0] || 'การสนทนาทั่วไป';
  const mainTopic = rawFirstQ.length > 70 ? rawFirstQ.substring(0, 67) + '...' : rawFirstQ;

  return { userQuestions, aiResponses, mainTopic };
}

class SummarizerService {
  private factory: AISummarizerFactory | null = null;
  private lastEngineUsed: EngineUsedType = 'mock';

  public getLastEngineUsed(): EngineUsedType {
    return this.lastEngineUsed;
  }

  public getFactory(): AISummarizerFactory | null {
    if (typeof window === 'undefined') return null;

    if (window.ai?.summarizer) {
      return window.ai.summarizer;
    }

    if (typeof ai !== 'undefined' && ai?.summarizer) {
      return ai.summarizer;
    }

    if (typeof window.Summarizer !== 'undefined') {
      return window.Summarizer;
    }

    if (typeof Summarizer !== 'undefined') {
      return Summarizer;
    }

    return null;
  }

  public async checkAvailability(): Promise<SummarizerState> {
    try {
      this.factory = this.getFactory();

      if (this.factory) {
        if (typeof this.factory.capabilities === 'function') {
          const capabilities = await this.factory.capabilities();
          if (capabilities.available === 'readily') {
            return {
              status: 'available',
              statusMessage: 'Chrome Summarizer API พร้อมใช้งาน (On-Device Model)',
              isNative: true,
            };
          } else if (capabilities.available === 'after-download') {
            return {
              status: 'downloading',
              statusMessage: 'กำลังดาวน์โหลดโมเดล Summarizer บนอุปกรณ์...',
              isNative: true,
            };
          }
        }

        if (typeof this.factory.availability === 'function') {
          const avail = await this.factory.availability();
          if (avail === 'readily' || avail === 'available') {
            return {
              status: 'available',
              statusMessage: 'Chrome Summarizer API พร้อมใช้งาน (On-Device Model)',
              isNative: true,
            };
          } else if (avail === 'after-download' || avail === 'downloading' || avail === 'downloadable') {
            return {
              status: 'downloading',
              statusMessage: 'กำลังดาวน์โหลดโมเดล Summarizer บนอุปกรณ์...',
              isNative: true,
            };
          }
        }

        return {
          status: 'available',
          statusMessage: 'Chrome Summarizer API พร้อมทำงาน',
          isNative: true,
        };
      }

      // Check if Prompt API is available as fallback
      const promptFactory = aiService.getFactory();
      if (promptFactory) {
        return {
          status: 'fallback-prompt',
          statusMessage: 'ใช้โมเดล Prompt API ในเครื่องสำหรับการสรุปความและบีบอัด',
          isNative: false,
        };
      }

      return {
        status: 'mock',
        statusMessage: 'โหมดจำลองการสรุปความ (Mock Mode)',
        isNative: false,
      };
    } catch (err) {
      console.warn('Summarizer availability check error:', err);
      return {
        status: 'mock',
        statusMessage: 'โหมดจำลองการสรุปความ (Mock Mode)',
        isNative: false,
      };
    }
  }

  public async summarize(
    text: string,
    options?: SummarizeOptions
  ): Promise<string> {
    if (!text || !text.trim()) {
      return '';
    }

    const type = options?.type ?? 'key-points';
    const format = options?.format ?? 'markdown';
    const length = options?.length ?? 'medium';
    const sharedContext = options?.sharedContext ?? 'นี่คือการสรุปเนื้อหาบทสนทนาหรือข้อความ';

    const hasThai = /[\u0E00-\u0E7F]/.test(text);
    this.factory = this.getFactory();

    // 1. If text is non-Thai and Native Chrome Summarizer API is present, try it
    // Note: Chrome Native Summarizer officially only supports English, Japanese, Spanish, German, French.
    if (!hasThai && this.factory) {
      try {
        const nativeResult = await this.runNativeSummarize(text, {
          type,
          format,
          length,
          sharedContext,
          signal: options?.signal,
          onChunk: options?.onChunk,
        });

        if (nativeResult && nativeResult.trim().length >= 10) {
          this.lastEngineUsed = 'native';
          return nativeResult.trim();
        }
        console.warn('Native Summarizer returned empty or insufficient text, falling back to Prompt API...');
      } catch (nativeErr) {
        console.warn('Native Summarizer API failed, falling back to Prompt API:', nativeErr);
      }
    }

    // 2. Prompt API on-device fallback / primary for Thai text
    const promptSummary = await this.runPromptModelSummarize(text, {
      type,
      format,
      length,
      sharedContext,
      signal: options?.signal,
      onChunk: options?.onChunk,
    });

    if (promptSummary && promptSummary.trim().length > 0) {
      this.lastEngineUsed = 'prompt-api';
      return promptSummary.trim();
    }

    // 3. Dynamic Mock Fallback (if on-device models are unavailable or returned empty)
    this.lastEngineUsed = 'mock';
    return await this.mockSummarize(text, options);
  }

  private async runNativeSummarize(
    text: string,
    options: SummarizeOptions
  ): Promise<string> {
    if (!this.factory) return '';
    let session: AISummarizerSession | null = null;

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      timeoutController.abort('runNativeSummarize timeout');
    }, 6000);

    const onExternalAbort = () => timeoutController.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutTimer);
        return '';
      }
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const sessionPromise = this.factory.create({
        type: options.type,
        format: options.format,
        length: options.length,
        sharedContext: options.sharedContext,
        signal: timeoutController.signal,
      });

      session = await Promise.race([
        sessionPromise,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('native summarizer create timeout')), 3500)
        ),
      ]);

      if (!session || timeoutController.signal.aborted) return '';

      if (options.onChunk && typeof session.summarizeStreaming === 'function') {
        try {
          const stream = session.summarizeStreaming(text, {
            context: options.sharedContext,
            signal: timeoutController.signal,
          });
          let accumulated = '';
          for await (const chunk of stream as unknown as AsyncIterable<string>) {
            if (timeoutController.signal.aborted) break;
            if (typeof chunk === 'string') {
              if (chunk.startsWith(accumulated)) {
                accumulated = chunk; // Cumulative chunk
              } else {
                accumulated += chunk; // Delta chunk
              }
            }
            options.onChunk(accumulated);
          }
          if (accumulated.trim().length > 0) {
            return accumulated;
          }
        } catch (streamErr) {
          console.warn('summarizeStreaming error, falling back to summarize():', streamErr);
        }
      }

      const summarizePromise = session.summarize(text, {
        context: options.sharedContext,
        signal: timeoutController.signal,
      });

      const result = await Promise.race([
        summarizePromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('native summarize timeout')), 4500)
        ),
      ]);

      if (options.onChunk) {
        options.onChunk(result);
      }
      return result;
    } catch (nativeErr) {
      console.warn('runNativeSummarize failed or timed out:', nativeErr);
      return '';
    } finally {
      clearTimeout(timeoutTimer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
      if (session) {
        try {
          session.destroy();
        } catch {
          // ignore
        }
      }
    }
  }

  private async runPromptModelSummarize(
    text: string,
    options: SummarizeOptions
  ): Promise<string> {
    const typeThaiDesc =
      options.type === 'tl;dr'
        ? 'สรุปใจความสำคัญสั้นๆ (TL;DR) 1-2 ย่อหน้า'
        : options.type === 'headline'
        ? 'พาดหัวสรุปสั้นกระชับ 1 บรรทัด (Headline)'
        : 'สรุปประเด็นสำคัญเป็นข้อๆ (Key Points) พร้อมระบุสาระสำคัญของคำถามและคำตอบ';

    const lengthThaiDesc =
      options.length === 'short'
        ? 'สั้นกระชับ 2-3 บรรทัด'
        : options.length === 'long'
        ? 'ละเอียด ครอบคลุมทุกประเด็นและข้อสรุป'
        : 'ปานกลาง กระชับตรงประเด็น';

    const summarizerSystemPrompt = `คุณคือระบบ AI ผู้เชี่ยวชาญด้านการสรุปเนื้อหาและบทสนทนา (Conversation Summarizer) บนอุปกรณ์
หน้าที่ของคุณ:
1. สรุปเนื้อหาบทสนทนาอย่างกระชับ ชัดเจน และตรงประเด็น
2. หากเป็นการสนทนาสั้นๆ (เช่น 1-2 ข้อความ) ให้สรุปว่าผู้ใช้สอบถามเรื่องอะไร และ AI ได้ตอบหรือให้ข้อเสนอแนะอะไรไว้อย่างชัดเจน
3. จัดรูปแบบด้วย Markdown (เช่น หัวข้อ, bullet points, ตัวหนา) ให้อ่านง่าย
4. ตอบเป็นภาษาไทยที่สุภาพ เป็นธรรมชาติ ห้ามตอบเป็นข้อความว่าง`;

    const summarizerUserPrompt = `โปรดสรุปเนื้อหาบทสนทนาต่อไปนี้:
- รูปแบบที่ต้องการ: ${typeThaiDesc}
- ความยาว: ${lengthThaiDesc}
${options.sharedContext ? `- บริบทเพิ่มเติม: ${options.sharedContext}` : ''}

บทสนทนา:
"""
${text}
"""

สรุปเนื้อหา:`;

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      timeoutController.abort('runPromptModelSummarize timeout');
    }, 7500);

    const onExternalAbort = () => timeoutController.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutTimer);
        return '';
      }
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    let session: AILanguageModelSession | null = null;
    try {
      const sessionPromise = aiService.createIsolatedSession({
        systemPrompt: summarizerSystemPrompt,
        temperature: 0.3,
        topK: 3,
      });

      session = await Promise.race([
        sessionPromise,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('createIsolatedSession timeout')), 3500)
        ),
      ]);

      if (!session || timeoutController.signal.aborted) return '';

      let accumulated = '';
      if (options.onChunk && typeof session.promptStreaming === 'function') {
        try {
          const stream = session.promptStreaming(summarizerUserPrompt, {
            signal: timeoutController.signal,
          });
          for await (const chunk of stream as unknown as AsyncIterable<string>) {
            if (timeoutController.signal.aborted) break;
            if (typeof chunk === 'string') {
              if (chunk.startsWith(accumulated)) {
                accumulated = chunk; // Cumulative chunk
              } else {
                accumulated += chunk; // Delta chunk
              }
            }

            const loopCheck = detectRepetitionLoop(accumulated);
            if (loopCheck.hasLoop) {
              accumulated = loopCheck.cleanedText;
              options.onChunk(accumulated);
              break;
            }

            options.onChunk(accumulated);
          }
          if (accumulated.trim().length > 0) {
            return accumulated;
          }
        } catch (streamErr) {
          console.warn('promptStreaming in summarizer error, trying prompt():', streamErr);
        }
      }

      if (timeoutController.signal.aborted) return '';

      const promptPromise = session.prompt(summarizerUserPrompt, {
        signal: timeoutController.signal,
      });

      const rawAnswer = await Promise.race([
        promptPromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('session.prompt timeout')), 5000)
        ),
      ]);

      const loopCheck = detectRepetitionLoop(rawAnswer);
      accumulated = loopCheck.hasLoop ? loopCheck.cleanedText : rawAnswer;
      if (options.onChunk) {
        options.onChunk(accumulated);
      }
      return accumulated;
    } catch (err) {
      console.warn('runPromptModelSummarize failed or timed out:', err);
      return '';
    } finally {
      clearTimeout(timeoutTimer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
      if (session) {
        try {
          session.destroy();
        } catch {
          // ignore
        }
      }
    }
  }

  public async summarizeChat(
    messages: Array<{ sender: string; text: string }>,
    options?: SummarizeOptions
  ): Promise<string> {
    if (!messages || messages.length === 0) {
      return 'ไม่มีประวัติการสนทนาให้สรุป';
    }

    const chatTranscript = messages
      .map((m) => `${m.sender === 'user' ? 'ผู้ใช้งาน' : 'AI ผู้ช่วย'}: ${m.text}`)
      .join('\n\n');

    return await this.summarize(chatTranscript, {
      ...options,
      sharedContext: options?.sharedContext || 'บทสนทนาระหว่างผู้ใช้งานกับ AI ผู้ช่วย',
    });
  }

  public async compressChatContext(
    messages: Array<{ sender: string; text: string }>,
    currentSystemPrompt: string,
    options?: { signal?: AbortSignal }
  ): Promise<CompressionResult> {
    const rawTranscript = messages
      .map((m) => `${m.sender === 'user' ? 'ผู้ใช้งาน' : 'AI'}: ${m.text}`)
      .join('\n\n');

    const originalTokens = estimateTokens(rawTranscript + currentSystemPrompt);

    const compressionInstruction = `คุณคือระบบสรุปสาระสำคัญของบทสนทนา (Conversation Summarizer)
โปรดสรุปเนื้อหาสำคัญของการสนทนานี้ให้เป็นภาษาไทยที่กระชับ ตรงประเด็น และอ่านง่าย (ความยาวประมาณ 2-4 บรรทัด):
- สรุปว่าผู้ใช้สอบถามหรือพูดคุยเรื่องอะไร และได้คำตอบหรือข้อสรุปสำคัญอะไร
- ห้ามสร้างตาราง (ห้ามใช้เครื่องหมาย | หรือ Markdown Table) โดยเด็ดขาด
- ห้ามใส่หัวข้อทางเทคนิคภาษาอังกฤษ เช่น "Context Compression Engine", "Main Topic", "Key Takeaways"
- เขียนเป็นความเรียงหรือสรุปเป็นข้อๆ อย่างเป็นธรรมชาติ`;

    let rawSummary: string;
    const safeController = new AbortController();
    const safeTimer = setTimeout(() => {
      safeController.abort();
    }, 9000);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => safeController.abort(), { once: true });
    }

    try {
      rawSummary = await this.summarize(rawTranscript, {
        type: 'tl;dr',
        format: 'plain-text',
        length: 'medium',
        sharedContext: compressionInstruction,
        signal: safeController.signal,
      });
    } catch (summarizeErr) {
      console.warn('summarize in compressChatContext timed out or errored:', summarizeErr);
      rawSummary = await this.mockSummarize(rawTranscript, { type: 'tl;dr' });
    } finally {
      clearTimeout(safeTimer);
    }

    const cleaned = cleanCompressedSummary(rawSummary);
    const newSummaryPortion =
      cleaned ||
      'สรุปประวัติเดิม: มีการสนทนาก่อนหน้าระหว่างผู้ใช้กับ AI เกี่ยวกับหัวข้อที่ได้กล่าวถึงข้างต้น';

    // Check for previous compressed context in systemPrompt and preserve it
    const marker = '\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:\n';
    let existingCompressed = '';
    if (currentSystemPrompt.includes(marker)) {
      const parts = currentSystemPrompt.split(marker);
      if (parts[1]) {
        const memoryOnly = parts[1].split('\n\n[คำสั่งสำคัญสำหรับ AI]:')[0];
        existingCompressed = memoryOnly.split('\n---')[0].trim();
      }
    }

    const compressedSummary = existingCompressed
      ? `${existingCompressed}\n\n[สรุปส่วนเพิ่มเติม]:\n${newSummaryPortion}`
      : newSummaryPortion;

    const contextHeader =
      '\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:\n' +
      compressedSummary +
      '\n\n[คำสั่งสำคัญสำหรับ AI]:\n' +
      '1. นี่คือประวัติการสนทนาก่อนหน้านี้ที่คุณและผู้ใช้ได้พูดคุยกันไว้ คุณต้องจดจำหัวข้อและสาระสำคัญทั้งหมดในส่วนนี้เสมอ\n' +
      '2. หากผู้ใช้ถามว่า "จำได้ไหม", "เมื่อกี้คุยอะไรกัน", หรือถามถึงเรื่องเดิม ให้ตอบจากข้อมูลในส่วนนี้อย่างเป็นธรรมชาติและถูกต้อง\n' +
      '3. ห้ามตอบว่า "จำไม่ได้" หรือ "ไม่มีประวัติการสนทนา" โดยเด็ดขาด เพราะคุณมีบันทึกความจำอยู่ข้างต้นนี้แล้ว\n---';
    const cleanBasePrompt = currentSystemPrompt.split('\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:')[0].trim();
    const newSystemPrompt = cleanBasePrompt + contextHeader;

    const compressedTokens = estimateTokens(newSystemPrompt);
    const savedTokens = Math.max(0, originalTokens - compressedTokens);
    const percentageSaved =
      originalTokens > 0 ? Math.min(95, Math.max(10, Math.round((savedTokens / originalTokens) * 100))) : 0;

    return {
      compressedSummary,
      newSystemPrompt,
      originalTokens,
      compressedTokens,
      savedTokens,
      percentageSaved,
    };
  }

  private async mockSummarize(
    text: string,
    options?: SummarizeOptions
  ): Promise<string> {
    const type = options?.type ?? 'key-points';
    const { userQuestions, aiResponses, mainTopic } = parseTranscript(text);

    const userSummary = userQuestions[0]
      ? userQuestions[0].substring(0, 120) + (userQuestions[0].length > 120 ? '...' : '')
      : 'สอบถามข้อมูลทั่วไป';

    const aiSummary = aiResponses[0]
      ? aiResponses[0].substring(0, 160) + (aiResponses[0].length > 160 ? '...' : '')
      : 'AI ได้ให้คำตอบและคำอธิบายอย่างครบถ้วน';

    const turnCount = userQuestions.length + aiResponses.length;

    let mockText: string;
    if (type === 'tl;dr') {
      mockText = `### 📌 สรุปใจความสำคัญ (TL;DR)\nการสนทนานี้เน้นหัวข้อ **${mainTopic}** โดยผู้ใช้ได้สอบถามหรือเปิดประเด็นว่า: "${userSummary}" และ AI ได้ให้คำตอบสรุปว่า: "${aiSummary}"`;
    } else if (type === 'headline') {
      mockText = `### 📰 หัวข้อหลัก\n**สรุปการพูดคุยเกี่ยวกับ: "${mainTopic}"**`;
    } else {
      mockText = `### 📋 สรุปประเด็นสำคัญ (Key Points)\n- **หัวข้อการสนทนา**: ${mainTopic}\n- **ประเด็นคำถามของผู้ใช้**: ${userSummary}\n- **คำตอบและคำอธิบายจาก AI**: ${aiSummary}\n- **สถานะการพูดคุย**: ครอบคลุมสาระสำคัญของบทสนทนา ${turnCount > 0 ? `${turnCount} ข้อความ` : ''} เรียบร้อยแล้ว`;
    }

    if (options?.onChunk) {
      let current = '';
      for (let i = 0; i < mockText.length; i++) {
        if (options.signal?.aborted) break;
        current += mockText[i];
        options.onChunk(current);
        await new Promise((r) => setTimeout(r, 10));
      }
      return current;
    }

    return mockText;
  }
}

export const summarizerService = new SummarizerService();

export function cleanCompressedSummary(text: string): string {
  if (!text || !text.trim()) return '';

  return text
    // Remove robotic headers like "🧠 Context Compression Engine Summary"
    .replace(/^#*\s*🧠?\s*Context Compression Engine Summary\s*:?/gim, '')
    // Remove redundant technical labels in brackets
    .replace(/\(Main Topic\):?/gi, ':')
    .replace(/\(Key Takeaways\):?/gi, ':')
    .replace(/\(Outstanding Context\/Next Step\):?/gi, ':')
    // Remove markdown table header separator rows like | :--- | :--- |
    .replace(/\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|/g, '')
    // Convert table row lines | Col1 | Col2 | into clean bullet points
    .replace(/\|\s*([^|\n\r]+?)\s*\|\s*([^|\n\r]+?)\s*\|\s*/g, (_, col1, col2) => {
      const c1 = String(col1).trim();
      const c2 = String(col2).trim();
      if (!c1 && !c2) return '';
      if (c1.includes('Built-in') && c2.includes('Cloud')) {
        return `\n- เปรียบเทียบ: ${c1} vs ${c2}\n`;
      }
      return `\n- ${c1}: ${c2}`;
    })
    // Remove any remaining stray pipes
    .replace(/\|/g, ' ')
    // Normalize excessive multiple spaces
    .replace(/[ \t]{2,}/g, ' ')
    // Normalize excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
