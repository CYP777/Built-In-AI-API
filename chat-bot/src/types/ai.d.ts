export interface AILanguageModelCapabilities {
  available: 'readily' | 'after-download' | 'no';
  defaultTemperature?: number;
  maxTemperature?: number;
  defaultTopK?: number;
  maxTopK?: number;
}

export interface AILanguageModelCreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  samplingMode?: 'most-predictable' | 'predictable' | 'balanced' | 'creative' | 'most-creative';
  expectedInputs?: Array<{ type: string; languages?: string[] }>;
  signal?: AbortSignal;
}

export type AIMultimodalPart =
  | { type: 'text'; value: string }
  | { type: 'image'; value: Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement };

export interface AIMultimodalMessage {
  role?: 'user' | 'assistant' | 'system';
  content: Array<AIMultimodalPart>;
}

export type AIPromptInput = string | Array<AIMultimodalPart> | Array<AIMultimodalMessage>;

export interface ImageAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
  file?: File;
}

export interface AILanguageModelSession {
  prompt(input: AIPromptInput, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(
    input: AIPromptInput,
    options?: { signal?: AbortSignal }
  ): ReadableStream<string>;
  countPromptTokens?(input: string): Promise<number>;
  maxTokens?: number;
  tokensSoFar?: number;
  tokensLeft?: number;
  contextWindow?: number;
  contextUsage?: number;
  inputQuota?: number;
  inputUsage?: number;
  destroy(): void;
  clone(): Promise<AILanguageModelSession>;
}

export interface AILanguageModelFactory {
  capabilities(): Promise<AILanguageModelCapabilities>;
  availability?(options?: AILanguageModelCreateOptions): Promise<string>;
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModelSession>;
}

// Chrome Built-in AI Summarizer API Types
export type AISummarizerType = 'key-points' | 'tl;dr' | 'teaser' | 'headline';
export type AISummarizerFormat = 'markdown' | 'plain-text';
export type AISummarizerLength = 'short' | 'medium' | 'long';

export interface AISummarizerCapabilities {
  available: 'readily' | 'after-download' | 'no';
}

export interface AISummarizerCreateOptions {
  type?: AISummarizerType;
  format?: AISummarizerFormat;
  length?: AISummarizerLength;
  sharedContext?: string;
  signal?: AbortSignal;
  monitor?: (m: EventTarget) => void;
}

export interface AISummarizerSession {
  summarize(input: string, options?: { context?: string; signal?: AbortSignal }): Promise<string>;
  summarizeStreaming?(
    input: string,
    options?: { context?: string; signal?: AbortSignal }
  ): ReadableStream<string>;
  ready?: Promise<void>;
  destroy(): void;
}

export interface AISummarizerFactory {
  capabilities(): Promise<AISummarizerCapabilities>;
  availability?(options?: AISummarizerCreateOptions): Promise<string>;
  create(options?: AISummarizerCreateOptions): Promise<AISummarizerSession>;
}

declare global {
  interface Window {
    ai?: {
      languageModel?: AILanguageModelFactory;
      summarizer?: AISummarizerFactory;
    };
    LanguageModel?: AILanguageModelFactory;
    Summarizer?: AISummarizerFactory;
  }

  const LanguageModel: AILanguageModelFactory | undefined;
  const Summarizer: AISummarizerFactory | undefined;
  const ai: {
    languageModel?: AILanguageModelFactory;
    summarizer?: AISummarizerFactory;
  } | undefined;
}

