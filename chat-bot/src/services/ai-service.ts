import type {
  AILanguageModelFactory,
  AILanguageModelSession,
  AILanguageModelCreateOptions,
  AIMultimodalPart,
  AIPromptInput,
  AIVisualInput,
  AIAudioInput,
  AudioAttachment,
  AILanguageModelExpectedInput,
} from '../types/ai';

export type AIStatus = 'checking' | 'available' | 'downloading' | 'unavailable' | 'mock';
export type OnDeviceModelType = 'built-in' | 'mock';

export interface AIServiceState {
  status: AIStatus;
  statusMessage: string;
  isMock: boolean;
  modelType?: OnDeviceModelType;
  modelName?: string;
  hasGpu?: boolean;
  isMultimodal?: boolean;
  isAudioMultimodal?: boolean;
}

let session: AILanguageModelSession | null = null;
let factory: AILanguageModelFactory | null = null;
let currentSystemPrompt: string = '';
let isMultimodalSupported: boolean | null = null;
let isAudioSupported: boolean | null = null;

export function getDefaultSystemPrompt(modelName?: string): string {
  const name = modelName || detectModelType().modelName;
  return `คุณคือผู้ช่วย AI อัจฉริยะที่ประมวลผลด้วยโมเดล ${name} บนเครื่องของผู้ใช้ (On-Device) อย่างปลอดภัยและเป็นส่วนตัว ตอบคำถามอย่างสุภาพ ถูกต้อง ชัดเจน และเป็นมิตร`;
}

export async function checkMultimodalSupport(): Promise<{ image: boolean; audio: boolean }> {
  if (isMultimodalSupported !== null && isAudioSupported !== null) {
    return { image: isMultimodalSupported, audio: isAudioSupported };
  }

  factory = getFactory();
  if (!factory) {
    isMultimodalSupported = false;
    isAudioSupported = false;
    return { image: false, audio: false };
  }

  let imageOk = false;
  let audioOk = false;

  try {
    if (typeof factory.availability === 'function') {
      try {
        const availImg = await factory.availability({
          expectedInputs: [{ type: 'text' }, { type: 'image' }],
        });
        imageOk = availImg === 'readily' || availImg === 'available';
      } catch {
        imageOk = false;
      }

      try {
        const availAudio = await factory.availability({
          expectedInputs: [{ type: 'text' }, { type: 'audio' }],
        });
        audioOk = availAudio === 'readily' || availAudio === 'available';
      } catch {
        audioOk = false;
      }
    }
  } catch {
    // ignore
  }

  isMultimodalSupported = imageOk;
  isAudioSupported = audioOk;
  return { image: imageOk, audio: audioOk };
}

export function detectModelType(): {
  modelType: OnDeviceModelType;
  modelName: string;
  hasGpu: boolean;
  maxTokens: number;
} {
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const sessionAny = session as unknown as Record<string, unknown> | null;
  const maxTokens =
    (sessionAny?.contextWindow as number) ??
    (sessionAny?.inputQuota as number) ??
    (session?.maxTokens as number) ??
    9216;

  const modelName = hasGpu ? 'Chrome Built-in AI (GPU)' : 'Chrome Built-in AI';

  return {
    modelType: 'built-in',
    modelName,
    hasGpu,
    maxTokens,
  };
}

export function getFactory(): AILanguageModelFactory | null {
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

export async function checkAvailability(): Promise<AIServiceState> {
  const detected = detectModelType();
  try {
    factory = getFactory();

    if (!factory) {
      return {
        status: 'unavailable',
        statusMessage: 'ไม่พบ Chrome Built-in AI ในเบราว์เซอร์นี้ (สามารถใช้โหมดจำลองได้)',
        isMock: true,
        ...detected,
      };
    }

    if (typeof factory.capabilities === 'function') {
      const capabilities = await factory.capabilities();
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

    if (typeof factory.availability === 'function') {
      let avail: string;
      try {
        avail = await factory.availability({ samplingMode: 'most-predictable' });
      } catch {
        try {
          avail = await factory.availability();
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

export function hasActiveSession(): boolean {
  return session !== null;
}

export async function initSession(options?: AILanguageModelCreateOptions): Promise<void> {
  factory = getFactory();

  if (options?.systemPrompt) {
    currentSystemPrompt = options.systemPrompt;
  } else if (!currentSystemPrompt) {
    currentSystemPrompt = getDefaultSystemPrompt();
  }

  if (factory) {
    try {
      if (session) {
        try {
          session.destroy();
        } catch {
          // ignore
        }
        session = null;
      }

      let sessionCreated = false;

      // Try 1: with user options (temperature & topK) if provided
      if (!sessionCreated && (options?.temperature !== undefined || options?.topK !== undefined)) {
        try {
          session = await factory.create({
            systemPrompt: currentSystemPrompt,
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
          session = await factory.create({
            systemPrompt: currentSystemPrompt,
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
          session = await factory.create({
            systemPrompt: currentSystemPrompt,
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
        session = await factory.create();
        if (session) {
          sessionCreated = true;
        }
      }

      if (session) {
        const sessionAny = session as unknown as Record<string, unknown>;
        const maxTokens =
          (sessionAny.contextWindow as number) ??
          (sessionAny.inputQuota as number) ??
          session.maxTokens ??
          9216;
        const tokensSoFar =
          (sessionAny.contextUsage as number) ??
          (sessionAny.inputUsage as number) ??
          session.tokensSoFar ??
          0;
        const tokensLeft =
          session.tokensLeft ??
          ((typeof maxTokens === 'number' && typeof tokensSoFar === 'number')
            ? Math.max(0, maxTokens - tokensSoFar)
            : undefined);

        console.log('[Chrome Built-in AI] Session initialized:', {
          isLiveSession: true,
          contextWindow: sessionAny.contextWindow,
          inputQuota: sessionAny.inputQuota,
          maxTokens: maxTokens,
          tokensSoFar: tokensSoFar,
          tokensLeft: tokensLeft,
          rawSession: session,
        });
      }
    } catch (e) {
      console.warn('Could not initialize Built-in AI session:', e);
      session = null;
    }
  }
}

export async function createIsolatedSession(
  options?: AILanguageModelCreateOptions
): Promise<AILanguageModelSession | null> {
  const f = getFactory();
  if (!f) return null;

  try {
    if (options?.temperature !== undefined || options?.topK !== undefined || options?.systemPrompt) {
      try {
        return await f.create(options);
      } catch (e1) {
        console.warn('createIsolatedSession with options failed:', e1);
      }
    }

    try {
      return await f.create({
        systemPrompt: options?.systemPrompt,
        samplingMode: 'most-predictable',
      });
    } catch (e2) {
      console.warn('createIsolatedSession with samplingMode failed:', e2);
    }

    try {
      return await f.create({
        systemPrompt: options?.systemPrompt,
        topK: 1,
      });
    } catch (e3) {
      console.warn('createIsolatedSession with topK: 1 failed:', e3);
    }

    return await f.create();
  } catch (e) {
    console.warn('createIsolatedSession failed:', e);
    return null;
  }
}

export async function promptStream(
  userMessage: string,
  onChunk: (chunkText: string) => void,
  signal?: AbortSignal,
  images?: Array<File | Blob | AIVisualInput> | File | Blob | null,
  audio?: AIAudioInput | AudioAttachment | null
): Promise<string> {
  factory = getFactory();

  // Normalize images into an array
  const imageList: Array<File | Blob | AIVisualInput> = [];
  if (images) {
    if (Array.isArray(images)) {
      imageList.push(...images);
    } else {
      imageList.push(images);
    }
  }

  // Normalize audio input
  let audioInput: AIAudioInput | null = null;
  let audioMeta: { name?: string; size?: number; type?: string; duration?: number } | null = null;
  if (audio) {
    if ('url' in audio && 'name' in audio) {
      const att = audio as AudioAttachment;
      audioInput = att.blob || att.audioBuffer || att.arrayBuffer || null;
      audioMeta = { name: att.name, size: att.size, type: att.type, duration: att.duration };
    } else if (audio instanceof Blob) {
      audioInput = audio;
      audioMeta = {
        name: audio instanceof File ? audio.name : 'audio-clip.webm',
        size: audio.size,
        type: audio.type || 'audio/webm',
      };
    } else if (typeof AudioBuffer !== 'undefined' && audio instanceof AudioBuffer) {
      audioInput = audio;
      audioMeta = {
        name: 'audio-buffer',
        duration: audio.duration,
        size: audio.length * audio.numberOfChannels * 4,
        type: 'audio/raw',
      };
    } else if (audio instanceof ArrayBuffer || ArrayBuffer.isView(audio)) {
      audioInput = audio as AIAudioInput;
      audioMeta = {
        name: 'audio-buffer-view',
        size: audio.byteLength,
        type: 'audio/raw',
      };
    }
  }

  const hasMultimodalInput = imageList.length > 0 || audioInput !== null;

  // If real Built-in AI is available
  if (factory) {
    if (!session) {
      await initSession();
    }

    // Extract compressed memory context from currentSystemPrompt if present
    let memorySnippet = '';
    const startMarker = '[บริบทประวัติเดิมที่ถูกบีบอัด]:';
    if (currentSystemPrompt.includes(startMarker)) {
      const parts = currentSystemPrompt.split(startMarker)[1];
      if (parts) {
        memorySnippet = parts
          .split('[คำสั่งสำคัญสำหรับ AI]')[0]
          .split('---')[0]
          .trim();
      }
    }

    const effectivePromptText =
      memorySnippet && !hasMultimodalInput
        ? `[บริบทความจำจากการสนทนาก่อนหน้านี้ที่คุณเพิ่งคุยกับผู้ใช้]:\n${memorySnippet}\n\n[ข้อความหรือคำถามล่าสุดจากผู้ใช้]:\n${userMessage}`
        : userMessage;

    let sessionToUse = session;
    let isolatedMultimodalSession: AILanguageModelSession | null = null;
    const openedBitmaps: ImageBitmap[] = [];

    if (hasMultimodalInput) {
      const expectedInputs: AILanguageModelExpectedInput[] = [{ type: 'text' }];
      if (imageList.length > 0) {
        expectedInputs.push({ type: 'image' });
      }
      if (audioInput) {
        expectedInputs.push({ type: 'audio' });
      }

      try {
        isolatedMultimodalSession = await factory.create({
          systemPrompt: currentSystemPrompt,
          expectedInputs,
        });
        sessionToUse = isolatedMultimodalSession;
      } catch {
        try {
          isolatedMultimodalSession = await factory.create({
            systemPrompt: currentSystemPrompt,
            expectedInputs: expectedInputs.map((e) => ({ type: e.type })),
          });
          sessionToUse = isolatedMultimodalSession;
        } catch (e) {
          console.warn('Dedicated multimodal session creation fallback:', e);
        }
      }
    }

    if (sessionToUse) {
      try {
        let promptPayload: AIPromptInput = effectivePromptText;

        if (hasMultimodalInput) {
          const textVal = memorySnippet
            ? `[บริบทความจำก่อนหน้า]:\n${memorySnippet}\n\n${userMessage || 'โปรดวิเคราะห์ข้อมูลภาพและเสียงนี้อย่างละเอียด'}`
            : userMessage || 'โปรดวิเคราะห์ข้อมูลภาพและเสียงนี้อย่างละเอียด';

          const parts: AIMultimodalPart[] = [];
          if (textVal) {
            parts.push({ type: 'text', value: textVal });
          }

          for (const img of imageList) {
            let visualValue: AIVisualInput = img as AIVisualInput;
            if (img instanceof Blob && typeof createImageBitmap === 'function') {
              try {
                const bmp = await createImageBitmap(img);
                openedBitmaps.push(bmp);
                visualValue = bmp;
              } catch {
                visualValue = img;
              }
            }
            parts.push({ type: 'image', value: visualValue });
          }

          if (audioInput) {
            parts.push({ type: 'audio', value: audioInput });
          }

          promptPayload = [
            {
              role: 'user',
              content: parts,
            },
          ];
        }

        const promptWithTimeout = async (payload: AIPromptInput, timeoutMs = 45000): Promise<string> => {
          let timerId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => reject(new Error('Prompt call timed out')), timeoutMs);
          });
          try {
            return await Promise.race([
              sessionToUse.prompt(payload, { signal }),
              timeoutPromise,
            ]);
          } finally {
            if (timerId) clearTimeout(timerId);
          }
        };

        if (typeof sessionToUse.promptStreaming === 'function') {
          try {
            let stream: ReadableStream<string>;
            try {
              stream = sessionToUse.promptStreaming(promptPayload, { signal });
            } catch (payloadErr) {
              if (Array.isArray(promptPayload) && promptPayload[0] && typeof promptPayload[0] === 'object' && 'content' in promptPayload[0]) {
                const rawParts = (promptPayload[0] as { content: AIMultimodalPart[] }).content;
                stream = sessionToUse.promptStreaming(rawParts, { signal });
              } else {
                throw payloadErr;
              }
            }

            return await consumePromptStream(stream, onChunk, signal);
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

            console.warn('promptStreaming error or timeout, falling back to prompt():', streamErr);
            let rawAnswer: string;
            try {
              rawAnswer = await promptWithTimeout(promptPayload);
            } catch {
              if (Array.isArray(promptPayload) && promptPayload[0] && typeof promptPayload[0] === 'object' && 'content' in promptPayload[0]) {
                const rawParts = (promptPayload[0] as { content: AIMultimodalPart[] }).content;
                rawAnswer = await promptWithTimeout(rawParts);
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
            rawAnswer = await promptWithTimeout(promptPayload);
          } catch {
            if (Array.isArray(promptPayload) && promptPayload[0] && typeof promptPayload[0] === 'object' && 'content' in promptPayload[0]) {
              const rawParts = (promptPayload[0] as { content: AIMultimodalPart[] }).content;
              rawAnswer = await promptWithTimeout(rawParts);
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

        if (hasMultimodalInput) {
          console.warn('Multimodal prompt error:', err);
          const inputDesc = [
            imageList.length > 0 ? `${imageList.length} รูปภาพ (Visual)` : '',
            audioInput ? 'ไฟล์/สัญญาณเสียง (Audio)' : '',
          ].filter(Boolean).join(' และ ');

          const errorMsg =
            `**[แจ้งเตือน] โมเดล Built-in AI บนเบราว์เซอร์นี้ยังไม่สามารถประมวลผล ${inputDesc} ได้ในขณะนี้**\n\n` +
            'กรุณาตรวจสอบการตั้งค่าใน Chrome ดังนี้:\n' +
            '1. เปิด `chrome://flags/#prompt-api-multimodal-input` (หรือ `#prompt-api-for-gemini-nano-multimodal-input`) → เลือก **Enabled**\n' +
            '2. เปิด `chrome://flags/#prompt-api` → เลือก **Enabled**\n' +
            '3. เปิด `chrome://flags/#optimization-guide-on-device-model` → เลือก **Enabled BypassPerfRequirement**\n' +
            '4. เปิด `chrome://components` → กด **Check for update** ที่ Optimization Guide On Device Models\n' +
            '5. ปิดแล้วเปิด Chrome ใหม่เพื่อโหลดโมเดล Multimodal (Vision & Audio) เข้าสู่ระบบครับ';
          onChunk(errorMsg);
          return errorMsg;
        }

        console.warn('Prompt error, attempting recreation...', err);
        await initSession();
        if (session) {
          let timerId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => reject(new Error('Prompt recreation call timed out')), 40000);
          });
          let rawAnswer: string;
          try {
            rawAnswer = await Promise.race([
              session.prompt(effectivePromptText, { signal }),
              timeoutPromise,
            ]);
          } finally {
            if (timerId) clearTimeout(timerId);
          }
          const loopCheck = detectRepetitionLoop(rawAnswer);
          const answer = loopCheck.hasLoop ? loopCheck.cleanedText : rawAnswer;
          onChunk(answer);
          return answer;
        }
        throw err;
      } finally {
        for (const bmp of openedBitmaps) {
          try {
            bmp.close();
          } catch {
            // ignore
          }
        }
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
  return await mockStreamResponse(userMessage, onChunk, signal, imageList, audioInput, audioMeta);
}

async function mockStreamResponse(
  userMessage: string,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
  images?: Array<File | Blob | AIVisualInput> | null,
  audio?: AIAudioInput | null,
  audioMeta?: { name?: string; size?: number; type?: string; duration?: number } | null
): Promise<string> {
  let memorySnippet = '';
  const startMarker = '[บริบทประวัติเดิมที่ถูกบีบอัด]:';
  if (currentSystemPrompt.includes(startMarker)) {
    const parts = currentSystemPrompt.split(startMarker)[1];
    if (parts) {
      memorySnippet = parts
        .split('[คำสั่งสำคัญสำหรับ AI]')[0]
        .split('---')[0]
        .trim();
    }
  }

  let reply: string;
  const hasImages = Boolean(images && images.length > 0);
  const hasAudio = Boolean(audio);

  if (hasImages || hasAudio) {
    const visualSummary = hasImages
      ? `- **Visual Inputs**: ตรวจพบ ${images!.length} ภาพ (${images!.map((img, i) => {
          const name = img instanceof File ? img.name : `Visual_${i + 1}`;
          const sizeKb = img instanceof Blob ? ` (${(img.size / 1024).toFixed(1)} KB)` : '';
          return `\`${name}\`${sizeKb}`;
        }).join(', ')})\n`
      : '';

    const audioSummary = hasAudio
      ? `- **Audio Input**: ตรวจพบสัญญาณเสียง (\`${audioMeta?.name || 'Audio Recording'}\`${
          audioMeta?.size ? `, ${(audioMeta.size / 1024).toFixed(1)} KB` : ''
        }${audioMeta?.duration ? `, ~${Math.round(audioMeta.duration)}s` : ''})\n`
      : '';

    reply =
      `**ได้รับข้อมูล Multimodal Input เรียบร้อยแล้ว (โหมดจำลอง Demo):**\n\n` +
      visualSummary +
      audioSummary +
      `\n**คำสั่งจากผู้ใช้:** "${userMessage || 'โปรดวิเคราะห์ข้อมูลภาพและเสียงนี้'}"\n\n` +
      `---\n\n` +
      `### การวิเคราะห์แบบ On-Device Multimodal:\n\n` +
      (hasImages && images!.length > 1
        ? `ระบบตรวจพบภาพทั้งหมด **${images!.length} ภาพ** สำหรับการเปรียบเทียบ (Visual Comparison):\n` +
          `1. **ภาพที่ 1**: แสดงองค์ประกอบหลักและรายละเอียดภาพแรก\n` +
          `2. **ภาพที่ 2**: แสดงองค์ประกอบเพิ่มเติมสำหรับการเปรียบเทียบ\n` +
          `*ข้อสรุปการเปรียบเทียบ*: ทั้งสองภาพมีความสอดคล้องกันตามเงื่อนไขที่กำหนด\n\n`
        : hasImages
        ? `ระบบได้รับข้อมูลภาพขนาดสมบูรณ์ พร้อมส่งเข้า Gemini Nano Vision Pipeline เพื่อดึงข้อมูลเชิงลึก\n\n`
        : '') +
      (hasAudio
        ? `ระบบได้รับข้อมูลเสียงสำหรับ Audio Processing เพื่อวิเคราะห์เสียงพูดหรือเสียงบันทึกโดยตรง\n\n`
        : '') +
      `> *หมายเหตุ (โหมดจำลอง Mock Mode)*: โค้ดฝั่ง Client-side ได้เตรียมโครงสร้างข้อมูล \`expectedInputs\` สำหรับ **Visual (${images?.length || 0})** และ **Audio (${hasAudio ? 1 : 0})** ตามมาตรฐาน WICG Prompt API เรียบร้อยแล้ว หากเปิด Flag \`#prompt-api-multimodal-input\` ใน Chrome Canary ระบบจะประมวลผลผ่านโมเดลจริงบนเครื่อง On-Device ทันทีครับ`;
  } else if (memorySnippet) {
    const isAskingMemory =
      userMessage.includes('จำได้') ||
      userMessage.includes('เมื่อกี้') ||
      userMessage.includes('คุยอะไร') ||
      userMessage.includes('ก่อนหน้านี้') ||
      userMessage.includes('เรื่องเดิม') ||
      userMessage.includes('ประวัติ');

    if (isAskingMemory) {
      reply = `จำได้แน่นอนครับ! จากประวัติการสนทนาก่อนหน้านี้ที่เราคุยกัน:\n\n${memorySnippet}\n\nคุณมีคำถามเพิ่มเติมเกี่ยวกับประเด็นนี้ หรือต้องการคุยต่อเรื่องไหน ยินดีเลยครับ!`;
    } else {
      reply = `เข้าใจแล้วครับ! (อ้างอิงจากบริบทประวัติเดิมที่คุยกัน: ${memorySnippet.substring(0, 80)}...)\n\nสำหรับข้อความล่าสุด: "${userMessage}"\nผมพร้อมตอบคำถามและสนทนาต่ออย่างต่อเนื่องครับ!`;
    }
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
        `> *หมายเหตุ (โหมดจำลอง Mock Mode): ขณะนี้เบราว์เซอร์ทำงานในโหมดจำลอง หากเปิดใช้งาน Chrome Prompt API บนเครื่อง ระบบจะประมวลผลผ่านโมเดล On-Device AI (${detectModelType().modelName}) บนเครื่องจริงครับ*`;
    } else if (
      lower.includes('built-in ai') ||
      lower.includes('prompt api') ||
      lower.includes('cloud ai')
    ) {
      reply =
        `### Chrome Built-in AI (Prompt API) คืออะไร?\n\n` +
        `**Chrome Built-in AI** คือความสามารถใหม่ของ Google Chrome ที่ผนวกรวมโมเดล AI (On-Device Model) เข้ามาไว้ในตัวเบราว์เซอร์ ทำให้นักพัฒนาสามารถเรียกใช้งานผ่าน JavaScript API ได้โดยตรงโดยไม่ต้องติดตั้งไลบรารีขนาดใหญ่หรือส่งข้อมูลขึ้น Cloud Server\n\n` +
        `### เปรียบเทียบ Built-in AI vs Cloud AI\n\n` +
        `| คุณสมบัติ | Built-in AI (On-Device) | Cloud AI (เช่น OpenAI, Gemini API) |\n` +
        `| :--- | :--- | :--- |\n` +
        `| **ความเป็นส่วนตัว (Privacy)** | ข้อมูลประมวลผลในเครื่อง 100% ไม่ส่งออกนอกเครื่อง | ต้องส่งข้อมูลผ่านเน็ตขึ้นเซิร์ฟเวอร์ภายนอก |\n` +
        `| **ความเร็วและการประมวลผล (Processing)** | ไม่ต้องส่งข้อมูลผ่านเน็ต (ความเร็วขึ้นอยู่กับชิป CPU/GPU ในเครื่อง) | ขึ้นอยู่กับความเร็วอินเทอร์เน็ตและคิวเซิร์ฟเวอร์ |\n` +
        `| **การทำงานออฟไลน์ (Offline)** | ทำงานได้ 100% แม้ไม่มีการเชื่อมต่ออินเทอร์เน็ต | ไม่สามารถใช้งานได้หากเน็ตหลุด |\n` +
        `| **ค่าใช้จ่าย (Cost)** | ฟรี ไม่มีค่า Token Billing | คิดค่าบริการตามจำนวน Token ที่ประมวลผล |\n\n` +
        `---\n` +
        `> *หมายเหตุ (โหมดจำลอง Mock Mode)*`;
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
          `> **[แจ้งเตือน] ระบบกำลังทำงานในโหมดจำลอง (Mock Mode)**\n` +
          `> เนื่องจากเบราว์เซอร์ปัจจุบันยังไม่ได้เปิดใช้งาน Chrome Prompt API\n\n` +
          `**หากต้องการใช้งานโมเดล AI จริงในเครื่อง กรุณาเปิดใช้งาน Flags ดังนี้:**\n` +
          `1. เปิด \`chrome://flags/#prompt-api\` → เลือก **Enabled**\n` +
          `2. เปิด \`chrome://flags/#optimization-guide-on-device-model\` → เลือก **Enabled BypassPerfRequirement**\n` +
          `3. ไปที่ \`chrome://components\` → ตรวจสอบการดาวน์โหลดที่ **Optimization Guide On Device Model**\n` +
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

export function resetSession(): void {
  if (session) {
    try {
      session.destroy();
    } catch {
      // ignore
    }
    session = null;
  }
}

export function getSession(): AILanguageModelSession | null {
  return session;
}

export async function countPromptTokens(text: string): Promise<number> {
  if (!text || !text.trim()) return 0;
  if (session && typeof session.countPromptTokens === 'function') {
    try {
      return await session.countPromptTokens(text);
    } catch (err) {
      console.warn('countPromptTokens fallback to estimation:', err);
    }
  }
  return estimateTokens(text);
}

export function getContextTokenUsage(liveTokens?: number): {
  maxTokens: number;
  tokensSoFar: number;
  tokensLeft: number;
} {
  const sessionAny = session as unknown as Record<string, unknown> | null;
  const maxTokens =
    (sessionAny?.contextWindow as number) ??
    (sessionAny?.inputQuota as number) ??
    (session?.maxTokens as number) ??
    9216;

  const chromeUsage =
    typeof sessionAny?.contextUsage === 'number' && sessionAny.contextUsage > 0
      ? (sessionAny.contextUsage as number)
      : typeof sessionAny?.inputUsage === 'number' && sessionAny.inputUsage > 0
      ? (sessionAny.inputUsage as number)
      : typeof session?.tokensSoFar === 'number' && session.tokensSoFar > 0
      ? session.tokensSoFar
      : 0;

  const liveEstimated =
    liveTokens !== undefined && liveTokens > 0
      ? Math.round(liveTokens)
      : 0;

  // Use live character estimation so tokens tick in real-time as text streams,
  // while never going below what Chrome officially reported.
  const tokensSoFar = Math.max(chromeUsage, liveEstimated);
  const tokensLeft = Math.max(0, maxTokens - tokensSoFar);

  return {
    maxTokens,
    tokensSoFar,
    tokensLeft,
  };
}

export function estimateTokens(text: string): number {
  if (!text || !text.trim()) return 0;
  const thaiMatch = text.match(/[\u0E00-\u0E7F]/g);
  const thaiCount = thaiMatch ? thaiMatch.length : 0;
  const nonThaiCount = text.length - thaiCount;
  // On-Device tokenizer estimate: Thai text ~2.8 chars/token, Non-Thai (English/code/symbols) ~4.2 chars/token
  const estimated = Math.ceil(thaiCount / 2.8 + nonThaiCount / 4.2);
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

export interface ConsumeStreamOptions {
  firstChunkTimeoutMs?: number;
  idleChunkTimeoutMs?: number;
  postProcess?: (text: string) => string;
}

/**
 * Safely read a ReadableStream<string> from Chrome's Prompt/Summarizer API with:
 * 1. Initial response timeout (Prefill timeout: default 35s)
 * 2. Inactivity watchdog (Idle stream timeout: default 2.5s once text has started streaming)
 * 3. Duplicate/empty chunk guard (detects stagnant stream without new text)
 * 4. Automatic reader cancellation and lock release on completion, loop, abort, or timeout
 */
export async function consumePromptStream(
  stream: ReadableStream<string>,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
  options?: ConsumeStreamOptions
): Promise<string> {
  const FIRST_CHUNK_TIMEOUT_MS = options?.firstChunkTimeoutMs ?? 35000;
  const IDLE_CHUNK_TIMEOUT_MS = options?.idleChunkTimeoutMs ?? 2500;
  const postProcess = options?.postProcess ?? ((t: string) => t);

  const reader = stream.getReader();
  let accumulated = '';
  let streamFinished = false;
  let lastGrowthTime = Date.now();

  let onAbort: (() => void) | null = null;
  const abortPromise = new Promise<{ isAborted: true }>((resolve) => {
    if (signal?.aborted) {
      resolve({ isAborted: true });
      return;
    }
    if (signal) {
      onAbort = () => resolve({ isAborted: true });
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    while (!streamFinished) {
      if (signal?.aborted) break;

      const hasStarted = accumulated.length > 0;
      let timeoutMs: number;
      if (!hasStarted) {
        timeoutMs = FIRST_CHUNK_TIMEOUT_MS;
      } else {
        const elapsedSinceGrowth = Date.now() - lastGrowthTime;
        timeoutMs = Math.max(200, IDLE_CHUNK_TIMEOUT_MS - elapsedSinceGrowth);
      }

      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ isTimeout: true }>((resolve) => {
        timerId = setTimeout(() => resolve({ isTimeout: true }), timeoutMs);
      });

      let readResult: { done?: boolean; value?: string; isTimeout?: boolean; isAborted?: boolean };
      try {
        readResult = await Promise.race([
          reader.read(),
          timeoutPromise,
          abortPromise,
        ]);
      } finally {
        if (timerId) clearTimeout(timerId);
      }

      if (readResult.isAborted) {
        break;
      }

      if (readResult.isTimeout) {
        if (accumulated.length > 0) {
          console.info('Prompt stream idle timeout reached after generation; concluding stream cleanly.');
          break;
        } else {
          throw new Error('Prompt stream timed out waiting for initial response');
        }
      }

      const { done, value } = readResult;
      if (done) {
        streamFinished = true;
        break;
      }

      const prevLen = accumulated.length;
      if (typeof value === 'string') {
        if (value.startsWith(accumulated)) {
          accumulated = value; // Cumulative chunk
        } else {
          accumulated += value; // Delta chunk
        }
      }

      if (accumulated.length > prevLen) {
        lastGrowthTime = Date.now();
      } else if (hasStarted && Date.now() - lastGrowthTime >= IDLE_CHUNK_TIMEOUT_MS) {
        console.info('Prompt stream stagnant without new text; concluding stream.');
        break;
      }

      // Detect and cut off repetition loop immediately (ดักลูปตัวอักษรซ้ำ เช่น งงงงงงง)
      const loopCheck = detectRepetitionLoop(accumulated);
      if (loopCheck.hasLoop) {
        accumulated = loopCheck.cleanedText;
        onChunk(postProcess(accumulated));
        break;
      }

      onChunk(postProcess(accumulated));
    }
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const finalResult = postProcess(accumulated);
  return finalResult;
}

export const aiService = {
  getDefaultSystemPrompt,
  checkMultimodalSupport,
  detectModelType,
  getFactory,
  checkAvailability,
  hasActiveSession,
  initSession,
  createIsolatedSession,
  promptStream,
  resetSession,
  getSession,
  estimateTokens,
  countPromptTokens,
  getContextTokenUsage,
};

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__aiService = aiService;
}
