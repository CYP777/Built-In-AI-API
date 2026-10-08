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

export interface AILanguageModelSession {
  prompt(input: string | unknown, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(
    input: string | unknown,
    options?: { signal?: AbortSignal }
  ): ReadableStream<string>;
  countPromptTokens?(input: string): Promise<number>;
  maxTokens?: number;
  tokensSoFar?: number;
  tokensLeft?: number;
  destroy(): void;
  clone(): Promise<AILanguageModelSession>;
}

export interface AILanguageModelFactory {
  capabilities(): Promise<AILanguageModelCapabilities>;
  availability?(options?: AILanguageModelCreateOptions): Promise<string>;
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModelSession>;
}

declare global {
  interface Window {
    ai?: {
      languageModel?: AILanguageModelFactory;
    };
    LanguageModel?: AILanguageModelFactory;
  }

  const LanguageModel: AILanguageModelFactory | undefined;
  const ai: {
    languageModel?: AILanguageModelFactory;
  } | undefined;
}
