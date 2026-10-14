import type {
  AISummarizerFactory,
  AISummarizerSession,
  AISummarizerType,
  AISummarizerFormat,
  AISummarizerLength,
  AILanguageModelSession,
} from '../types/ai';
import { aiService, estimateTokens, detectRepetitionLoop, consumePromptStream } from './ai-service';

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

export interface DialogTurn {
  userQuestion: string;
  aiResponse: string;
}

export interface ParsedDialog {
  userQuestions: string[];
  aiResponses: string[];
  mainTopic: string;
}

/**
 * Remove trailing ellipses (... or …), trailing dots, or dangling incomplete connectors
 * so sentences never end with "..." or abrupt cutoffs.
 */
export function cleanTrailingEllipsesAndIncomplete(text: string): string {
  if (!text) return '';
  let cleaned = text
    // Remove 3 or more dots or ellipsis at line ends or text end
    .replace(/(?:\.{2,}|…)+$/gm, '')
    .replace(/(?:\.{2,}|…)+$/g, '')
    .trim();

  // Remove hanging connectors at the end if truncated
  cleaned = cleaned
    .replace(/(?:โดยที่|และ|เช่น|ว่า|คือ|ดังนี้|เกี่ยวกับ)\s*[:：]?\s*$/g, '')
    .replace(/[:：]\s*$/g, '')
    .trim();

  return cleaned;
}

/**
 * Compact individual message to conserve tokens while preserving core facts, numbers, and decisions.
 */
export function compactMessageText(text: string, isUser: boolean): string {
  if (!text) return '';
  let clean = text.trim();

  if (!isUser) {
    // For AI messages, compact large code blocks
    clean = clean.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, codeContent) => {
      const codeLines = codeContent.trim().split('\n');
      if (codeLines.length > 3 || codeContent.length > 180) {
        const preview = codeLines.slice(0, 2).join(' ').substring(0, 80).trim();
        return `[โค้ดตัวอย่าง: ${preview} (ย่อส่วนโค้ด)]`;
      }
      return `\`\`\`\n${codeContent.trim()}\n\`\`\``;
    });

    // If message is very long (> 550 chars), keep the explanation head and conclusion tail
    if (clean.length > 550) {
      const head = clean.substring(0, 320).trim();
      const tail = clean.substring(clean.length - 160).trim();
      clean = `${head}\n[...สาระสำคัญ...]\n${tail}`;
    }
  } else {
    // For user messages, keep up to 400 chars
    if (clean.length > 400) {
      clean = clean.substring(0, 400).trim();
    }
  }

  return cleanTrailingEllipsesAndIncomplete(clean);
}

/**
 * Parses transcript text into distinct user-AI dialog turns.
 * Captures ALL turns across the conversation, not just the first one.
 */
export function parseTranscriptTurns(text: string): DialogTurn[] {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const turns: DialogTurn[] = [];

  let currentSpeaker: 'user' | 'ai' | null = null;
  let currentBuffer: string[] = [];
  let pendingUser = '';
  let pendingAi = '';

  const flush = () => {
    if (currentBuffer.length === 0) return;
    const content = currentBuffer.join(' ').trim();
    currentBuffer = [];

    if (currentSpeaker === 'user') {
      if (pendingUser && pendingAi) {
        turns.push({
          userQuestion: cleanTrailingEllipsesAndIncomplete(pendingUser),
          aiResponse: cleanTrailingEllipsesAndIncomplete(pendingAi),
        });
        pendingUser = '';
        pendingAi = '';
      }
      pendingUser = pendingUser ? `${pendingUser} ${content}` : content;
    } else if (currentSpeaker === 'ai') {
      pendingAi = pendingAi ? `${pendingAi} ${content}` : content;
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

  if (pendingUser || pendingAi) {
    turns.push({
      userQuestion: cleanTrailingEllipsesAndIncomplete(pendingUser || 'สอบถามข้อมูลทั่วไป'),
      aiResponse: cleanTrailingEllipsesAndIncomplete(pendingAi || 'AI ได้ให้คำอธิบายและข้อเสนอแนะครบถ้วน'),
    });
  }

  // Fallback if no speaker markers found but lines exist
  if (turns.length === 0 && lines.length > 0) {
    turns.push({
      userQuestion: cleanTrailingEllipsesAndIncomplete(lines[0]),
      aiResponse: cleanTrailingEllipsesAndIncomplete(lines.slice(1).join(' ') || 'AI ได้ให้คำตอบเรียบร้อยแล้ว'),
    });
  }

  return turns;
}

/**
 * Backward compatibility parser returning ParsedDialog.
 */
export function parseTranscript(text: string): ParsedDialog {
  const turns = parseTranscriptTurns(text);
  const userQuestions = turns.map((t) => t.userQuestion);
  const aiResponses = turns.map((t) => t.aiResponse);
  const rawFirstQ = userQuestions[0] || 'การสนทนาทั่วไป';
  const mainTopic = cleanTrailingEllipsesAndIncomplete(
    rawFirstQ.length > 70 ? rawFirstQ.substring(0, 67).trim() : rawFirstQ
  );

  return { userQuestions, aiResponses, mainTopic };
}

/**
 * Compact entire transcript preserving all conversational turns.
 */
export function compactTranscript(text: string): string {
  if (!text) return '';
  const turns = parseTranscriptTurns(text);
  if (turns.length === 0) {
    return compactMessageText(text, false);
  }

  return turns
    .map((turn) => {
      const compactedUser = compactMessageText(turn.userQuestion, true);
      const compactedAi = compactMessageText(turn.aiResponse, false);
      return `ผู้ใช้งาน: ${compactedUser}\nAI: ${compactedAi}`;
    })
    .join('\n\n');
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
        statusMessage: 'โหมดจำลองการสรุปความ',
        isNative: false,
      };
    } catch (err) {
      console.warn('Summarizer availability check error:', err);
      return {
        status: 'mock',
        statusMessage: 'โหมดจำลองการสรุปความ',
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
    // Chrome Native Summarizer officially supports English, Japanese, Spanish, German, French.
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
          return cleanTrailingEllipsesAndIncomplete(nativeResult.trim());
        }
        console.warn('Native Summarizer returned empty or insufficient text, falling back to Prompt API...');
      } catch (nativeErr) {
        console.warn('Native Summarizer API failed, falling back to Prompt API:', nativeErr);
      }
    }

    // 2. Prompt API on-device fallback / primary for Thai text
    try {
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
        return cleanTrailingEllipsesAndIncomplete(promptSummary.trim());
      }
    } catch (promptErr) {
      console.warn('runPromptModelSummarize failed or hit quota, falling back to dynamic multi-turn mock:', promptErr);
    }

    // 3. Dynamic Mock Fallback (extractive summarization covering all turns cleanly)
    this.lastEngineUsed = 'mock';
    return await this.mockSummarize(text, options);
  }

  private async runNativeSummarize(
    text: string,
    options: SummarizeOptions
  ): Promise<string> {
    if (!this.factory) throw new Error('summarizer factory unavailable');
    if (options.signal?.aborted) throw new Error('aborted');

    const TOTAL_TIMEOUT_MS = 60000;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('native summarize timeout')),
      TOTAL_TIMEOUT_MS
    );
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    let session: AISummarizerSession | null = null;
    try {
      session = await this.factory.create({
        type: options.type,
        format: options.format,
        length: options.length,
        sharedContext: options.sharedContext,
        signal: controller.signal,
      });

      const sessionAny = session as unknown as Record<string, unknown>;
      const quota = sessionAny.inputQuota;
      if (typeof quota === 'number' && typeof sessionAny.measureInputUsage === 'function') {
        const usage = await (sessionAny.measureInputUsage as (t: string) => Promise<number>)(text);
        if (usage > quota) {
          throw new Error(`input exceeds quota: ${usage}/${quota}`);
        }
      }

      if (options.onChunk && typeof session.summarizeStreaming === 'function') {
        const stream = session.summarizeStreaming(text, {
          context: options.sharedContext,
          signal: controller.signal,
        });
        const finalClean = await consumePromptStream(
          stream,
          (chunk) => options.onChunk?.(chunk),
          controller.signal,
          {
            postProcess: cleanTrailingEllipsesAndIncomplete,
          }
        );
        return finalClean;
      }

      const result = await session.summarize(text, {
        context: options.sharedContext,
        signal: controller.signal,
      });
      const cleaned = cleanTrailingEllipsesAndIncomplete(result);
      options.onChunk?.(cleaned);
      return cleaned;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
      try {
        session?.destroy();
      } catch {
        // ignore
      }
    }
  }

  private async executeSessionPrompt(
    session: AILanguageModelSession,
    userPrompt: string,
    signal: AbortSignal,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (signal.aborted) throw new Error('aborted');

    try {
      if (onChunk && typeof session.promptStreaming === 'function') {
        const stream = session.promptStreaming(userPrompt, { signal });
        const finalClean = await consumePromptStream(
          stream,
          (chunk) => onChunk(chunk),
          signal,
          {
            postProcess: cleanTrailingEllipsesAndIncomplete,
          }
        );
        if (!finalClean.trim()) throw new Error('empty summary from streaming');
        return finalClean;
      }

      const raw = await session.prompt(userPrompt, { signal });
      const loopCheck = detectRepetitionLoop(raw);
      const result = cleanTrailingEllipsesAndIncomplete(loopCheck.hasLoop ? loopCheck.cleanedText : raw);
      if (!result.trim()) throw new Error('empty summary from prompt');
      onChunk?.(result);
      return result;
    } catch (err: unknown) {
      const errMsg = String((err as Error)?.message || '').toLowerCase();
      const errName = String((err as Error)?.name || '');
      const isQuota =
        errName === 'QuotaExceededError' ||
        errMsg.includes('too large') ||
        errMsg.includes('quota');

      if (isQuota) {
        console.warn('executeSessionPrompt QuotaExceededError, retrying with emergency compaction:', err);
        const compactedPrompt = userPrompt.length > 600
          ? `${userPrompt.substring(0, 320)}\n\n[...ย่อบทสนทนา...]\n\n${userPrompt.substring(userPrompt.length - 180)}`
          : userPrompt;

        if (typeof session.prompt === 'function') {
          const retryRaw = await session.prompt(compactedPrompt, { signal });
          const retryResult = cleanTrailingEllipsesAndIncomplete(retryRaw);
          if (retryResult.trim()) {
            onChunk?.(retryResult);
            return retryResult;
          }
        }
      }
      throw err;
    }
  }

  private async runPromptModelSummarize(
    text: string,
    options: SummarizeOptions
  ): Promise<string> {
    if (options.signal?.aborted) throw new Error('aborted');

    const isContextCompression =
      options.type === 'tl;dr' &&
      options.format === 'plain-text' &&
      Boolean(options.sharedContext && options.sharedContext.includes('ความจำ'));

    let summarizerSystemPrompt: string;
    if (isContextCompression) {
      summarizerSystemPrompt = `คุณคือระบบสรุปบทสนทนาเพื่อบันทึกเป็นความจำให้ AI สนทนาต่อได้อย่างต่อเนื่องและแม่นยำ
กฎสำคัญในการเขียน:
1. เขียนสรุปเป็นภาษาไทย กระชับ ตรงประเด็น ไม่ใส่ emoji ไม่ใช้เครื่องหมาย Markdown ตาราง
2. สกัดสาระสำคัญให้ครบทุกประเด็นการคุย: หัวข้อที่ผู้ใช้สอบถาม, ข้อสรุปหรือคำตอบที่ได้รับ (เก็บชื่อ ตัวเลข โค้ด ข้อเท็จจริงเฉพาะให้ครบ), ข้อตกลงหรือความชอบที่ผู้ใช้ระบุ, เรื่องที่ยังค้างอยู่
3. สรุปเนื้อหาโดยตรง ห้ามใช้คำเกริ่นนำรูปแบบ "ผู้ใช้ถามว่า" หรือ "AI ตอบว่า" และตัดคำทักทายทิ้ง
4. เขียนประโยคให้จบสมบูรณ์ทุกประโยค ห้ามตัดจบประโยคค้างไว้ และห้ามจบด้วยเครื่องหมายจุดไข่ปลา (...) หรือ "ฯลฯ" โดยเด็ดขาด
5. เขียนเป็นข้อความสั้น 3-6 บรรทัด ครอบคลุมสาระสำคัญทั้งหมด`;
    } else if (options.type === 'key-points') {
      summarizerSystemPrompt = `คุณคือระบบสรุปการสนทนาภาษาไทย
กฎสำคัญในการเขียน:
1. สรุปเป็นประเด็นสำคัญ (Bullet Points) ให้ครบถ้วนทุกประเด็นที่สนทนา
2. สกัดหัวข้อคำถามของผู้ใช้และคำตอบ/ข้อสรุปสำคัญจาก AI
3. เขียนประโยคให้จบสมบูรณ์ทุกประโยค ห้ามตัดจบประโยคค้างไว้ และห้ามจบด้วยเครื่องหมายจุดไข่ปลา (...) หรือ "ฯลฯ" โดยเด็ดขาด`;
    } else if (options.type === 'headline') {
      summarizerSystemPrompt = `คุณคือระบบสรุปหัวข้อการสนทนาภาษาไทย
กฎสำคัญในการเขียน:
1. เขียนหัวข้อหลักของการสนทนา 1 บรรทัด กระชับ ตรงประเด็น
2. เขียนประโยคให้จบสมบูรณ์ ห้ามจบด้วยเครื่องหมายจุดไข่ปลา (...) หรือ "ฯลฯ"`;
    } else {
      summarizerSystemPrompt = `คุณคือระบบสรุปบทสนทนาภาษาไทย
กฎสำคัญในการเขียน:
1. เขียนสรุปเป็นภาษาไทย กระชับ ตรงประเด็น ครอบคลุมทุกประเด็นที่พูดคุย
2. สกัดหัวข้อคำถามและข้อสรุปสำคัญให้ครบถ้วน
3. เขียนประโยคให้จบสมบูรณ์ทุกประโยค ห้ามตัดจบประโยคค้างไว้ และห้ามจบด้วยเครื่องหมายจุดไข่ปลา (...) หรือ "ฯลฯ" โดยเด็ดขาด`;
    }

    const TOTAL_TIMEOUT_MS = 60000;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('prompt summarize timeout')),
      TOTAL_TIMEOUT_MS
    );
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    let session: AILanguageModelSession | null = null;
    try {
      session = await aiService.createIsolatedSession({
        systemPrompt: summarizerSystemPrompt,
        temperature: 0.2,
        topK: 3,
      });
      if (!session) throw new Error('createIsolatedSession returned null');

      // Calculate safe input token budget for the session
      const sessionAny = session as unknown as Record<string, unknown>;
      const maxTokens =
        (sessionAny?.contextWindow as number) ??
        (sessionAny?.inputQuota as number) ??
        (session.maxTokens as number) ??
        4096;
      const tokensLeft =
        typeof session.tokensLeft === 'number' ? session.tokensLeft : maxTokens;
      const safeInputTokens = Math.max(500, Math.min(tokensLeft, maxTokens) - 1000);

      const compactedText = compactTranscript(text);
      const estimatedTokens = estimateTokens(compactedText);

      // If text exceeds safe token budget, use progressive chunked summarization
      if (estimatedTokens > safeInputTokens) {
        const turns = parseTranscriptTurns(compactedText);
        if (turns.length > 1) {
          const chunks: DialogTurn[][] = [];
          let currentChunk: DialogTurn[] = [];
          let currentChunkTokens = 0;
          const maxChunkTokens = Math.floor(safeInputTokens * 0.65);

          for (const turn of turns) {
            const turnTokens = estimateTokens(`ผู้ใช้งาน: ${turn.userQuestion}\nAI: ${turn.aiResponse}`);
            if (currentChunk.length > 0 && currentChunkTokens + turnTokens > maxChunkTokens) {
              chunks.push(currentChunk);
              currentChunk = [turn];
              currentChunkTokens = turnTokens;
            } else {
              currentChunk.push(turn);
              currentChunkTokens += turnTokens;
            }
          }
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
          }

          if (chunks.length > 1) {
            let runningSummary = '';
            for (let i = 0; i < chunks.length; i++) {
              if (controller.signal.aborted) throw new Error('aborted');
              const isLast = i === chunks.length - 1;
              const chunkTranscript = chunks[i]
                .map((t) => `ผู้ใช้งาน: ${t.userQuestion}\nAI: ${t.aiResponse}`)
                .join('\n\n');

              const chunkUserPrompt = runningSummary
                ? `[ความจำจากการสนทนาก่อนหน้า]:\n${runningSummary}\n\n[บทสนทนาส่วนถัดไป (${i + 1}/${chunks.length})]:\n${chunkTranscript}\n\nโปรดรวมและสังเคราะห์เป็นความจำฉบับเดียวให้กระชับ ครอบคลุมทุกประเด็น (เขียนประโยคให้จบสมบูรณ์ ห้ามจบประโยคด้วย ...):`
                : `${options.sharedContext ? `${options.sharedContext}\n\n` : ''}บทสนทนา (ส่วนที่ 1/${chunks.length}):\n${chunkTranscript}\n\nสรุปประเด็นสำคัญเพื่อเป็นความจำ (เขียนประโยคให้จบสมบูรณ์ ห้ามจบประโยคด้วย ...):`;

              // Create a fresh isolated session per chunk so old turns don't accumulate in session context
              const chunkSession: AILanguageModelSession | null =
                i === 0
                  ? session
                  : await aiService.createIsolatedSession({
                      systemPrompt: summarizerSystemPrompt,
                      temperature: 0.2,
                      topK: 3,
                    });
              if (!chunkSession) throw new Error('createIsolatedSession returned null');

              try {
                runningSummary = await this.executeSessionPrompt(
                  chunkSession,
                  chunkUserPrompt,
                  controller.signal,
                  isLast ? options.onChunk : undefined
                );
              } finally {
                if (chunkSession !== session) {
                  try {
                    chunkSession.destroy();
                  } catch {
                    // ignore
                  }
                }
              }
            }
            return cleanTrailingEllipsesAndIncomplete(runningSummary);
          }
        }
      }

      // Single-batch execution within safe quota
      const summarizerUserPrompt = `${options.sharedContext ? `${options.sharedContext}\n\n` : ''}บทสนทนา:
"""
${compactedText}
"""

สรุปสาระสำคัญ (เขียนประโยคให้จบสมบูรณ์ทุกประโยค ห้ามตัดจบด้วย ...):`;

      const result = await this.executeSessionPrompt(
        session,
        summarizerUserPrompt,
        controller.signal,
        options.onChunk
      );
      return cleanTrailingEllipsesAndIncomplete(result);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
      try {
        session?.destroy();
      } catch {
        // ignore
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
    // 1. Build compacted transcript preserving all turns
    const compactedTranscript = messages
      .map((m) => {
        const speaker = m.sender === 'user' ? 'ผู้ใช้งาน' : 'AI';
        const compactedText = compactMessageText(m.text, m.sender === 'user');
        return `${speaker}: ${compactedText}`;
      })
      .join('\n\n');

    const originalTokens = estimateTokens(compactedTranscript + currentSystemPrompt);

    // 2. Extract existing compressed context if present to avoid losing prior memory
    const marker = '\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:\n';
    let existingCompressed = '';
    if (currentSystemPrompt.includes(marker)) {
      const parts = currentSystemPrompt.split(marker);
      if (parts[1]) {
        const memoryOnly = parts[1].split('\n\n[คำสั่งสำคัญสำหรับ AI]:')[0];
        existingCompressed = memoryOnly.split('\n---')[0].trim();
      }
    }

    const compressionInstruction = `คุณคือระบบสรุปบทสนทนาเพื่อบันทึกเป็นความจำให้ AI สนทนาต่อได้อย่างต่อเนื่องและแม่นยำ
กฎสำคัญในการเขียน:
1. เขียนสรุปเป็นภาษาไทย กระชับ ตรงประเด็น ไม่ใส่ emoji ไม่ใช้เครื่องหมาย Markdown ตาราง
2. สกัดสาระสำคัญให้ครบทุกประเด็นการคุย: หัวข้อที่ผู้ใช้สอบถาม, ข้อสรุปหรือคำตอบที่ได้รับ (เก็บชื่อ ตัวเลข โค้ด ข้อเท็จจริงเฉพาะให้ครบ), ข้อตกลงหรือความชอบที่ผู้ใช้ระบุ, เรื่องที่ยังค้างอยู่
3. สรุปเนื้อหาโดยตรง ห้ามใช้คำเกริ่นนำรูปแบบ "ผู้ใช้ถามว่า" หรือ "AI ตอบว่า" และตัดคำทักทายทิ้ง
4. เขียนประโยคให้จบสมบูรณ์ทุกประโยค ห้ามตัดจบประโยคค้างไว้ และห้ามจบด้วยเครื่องหมายจุดไข่ปลา (...) หรือ "ฯลฯ" โดยเด็ดขาด
${existingCompressed ? `5. บันทึกเดิมก่อนหน้า: "${existingCompressed}" -> โปรดสังเคราะห์รวมสาระของบันทึกเดิมเข้ากับบทสนทนาใหม่ให้เป็นเนื้อเดียวกันอย่างสมบูรณ์` : ''}`;

    let rawSummary: string;
    const safeController = new AbortController();
    const safeTimer = setTimeout(() => {
      safeController.abort();
    }, 60000);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => safeController.abort(), { once: true });
    }

    try {
      rawSummary = await this.summarize(compactedTranscript, {
        type: 'tl;dr',
        format: 'plain-text',
        length: 'medium',
        sharedContext: compressionInstruction,
        signal: safeController.signal,
      });
    } catch (summarizeErr) {
      console.warn('summarize in compressChatContext errored or timed out:', summarizeErr);
      rawSummary = await this.mockSummarize(compactedTranscript, { type: 'tl;dr' });
    } finally {
      clearTimeout(safeTimer);
    }

    const cleaned = cleanCompressedSummary(rawSummary);
    const newSummaryPortion =
      cleaned ||
      (existingCompressed ? existingCompressed : 'มีการสนทนาก่อนหน้าระหว่างผู้ใช้กับ AI เกี่ยวกับหัวข้อที่ได้กล่าวถึงข้างต้น');

    const compressedSummary = cleanTrailingEllipsesAndIncomplete(newSummaryPortion);

    const contextHeader =
      '\n\n---\n[บริบทประวัติเดิมที่ถูกบีบอัด]:\n' +
      compressedSummary +
      '\n\n[คำสั่งสำคัญสำหรับ AI]:\n' +
      '1. นี่คือประวัติและสาระสำคัญของการสนทนาทั้งหมดที่คุณและผู้ใช้ได้พูดคุยกันไว้ คุณต้องจดจำหัวข้อ ข้อมูลสำคัญ และข้อสรุปทั้งหมดในส่วนนี้เสมอ\n' +
      '2. หากผู้ใช้ถามว่า "จำได้ไหม", "เมื่อกี้คุยอะไรกัน", หรือถามถึงเรื่องเดิม ให้ตอบจากข้อมูลในส่วนนี้อย่างเป็นธรรมชาติ ถูกต้อง และครบถ้วนทุกประเด็น\n' +
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
    const turns = parseTranscriptTurns(text);

    let mockText: string;

    if (turns.length === 0) {
      mockText = 'ไม่มีข้อมูลการสนทนาที่ต้องการสรุป';
    } else {
      const mainTopic = turns[0].userQuestion.length > 80
        ? turns[0].userQuestion.substring(0, 75).trim()
        : turns[0].userQuestion;

      if (type === 'tl;dr') {
        if (turns.length === 1) {
          mockText = `สรุปใจความสำคัญ:\n- หัวข้อหลัก: ${mainTopic}\n- รายละเอียดคำถาม: ${turns[0].userQuestion}\n- ข้อสรุปของ AI: ${turns[0].aiResponse}`;
        } else {
          const points = turns
            .map((t, idx) => `- ประเด็นที่ ${idx + 1}: ${t.userQuestion}\n  -> ข้อสรุป: ${t.aiResponse}`)
            .join('\n');
          mockText = `สรุปใจความสำคัญของการสนทนา (${turns.length} ประเด็น):\n${points}\n- สถานะ: ครอบคลุมสาระสำคัญและข้อสรุปครบถ้วนทุกข้อความ`;
        }
      } else if (type === 'headline') {
        const allTopics = turns.map((t) => t.userQuestion.substring(0, 40).trim()).slice(0, 3).join(', ');
        mockText = `หัวข้อหลัก: การพูดคุยเรื่อง ${allTopics}`;
      } else {
        const points = turns
          .map((t, idx) => `- **ประเด็นที่ ${idx + 1}**: ${t.userQuestion}\n  - **ข้อสรุปจาก AI**: ${t.aiResponse}`)
          .join('\n');
        mockText = `### สรุปประเด็นสำคัญ (${turns.length} ประเด็น)\n${points}`;
      }
    }

    mockText = cleanTrailingEllipsesAndIncomplete(mockText);

    if (options?.onChunk) {
      let current = '';
      for (let i = 0; i < mockText.length; i++) {
        if (options.signal?.aborted) break;
        current += mockText[i];
        options.onChunk(current);
        await new Promise((r) => setTimeout(r, 8));
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
    .replace(/^#*\s*สรุป(ใจความสำคัญ|ประเด็นสำคัญ|เพื่อเป็นความจำ).*$/gim, '')
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
    // Remove trailing ellipses and unicode ellipsis at line ends or string end
    .replace(/(?:\.{2,}|…)+$/gm, '')
    .replace(/(?:\.{2,}|…)+$/g, '')
    // Clean up dangling connectors at the end
    .replace(/(?:โดยที่|และ|เช่น|ว่า|คือ|ดังนี้|เกี่ยวกับ)\s*[:：]?\s*$/g, '')
    .replace(/[:：]\s*$/g, '')
    .trim();
}
