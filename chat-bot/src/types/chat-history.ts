import type { Message } from '../components/ChatMessage';
import type { AISummarizerType, AISummarizerLength } from './ai';
import type { EngineUsedType } from '../services/summarizer-service';

export interface CachedSessionSummary {
  content: string;
  type: AISummarizerType;
  length: AISummarizerLength;
  engine: EngineUsedType | null;
  messageCount: number;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  savedSummary?: CachedSessionSummary;
  createdAt: number;
  updatedAt: number;
}

