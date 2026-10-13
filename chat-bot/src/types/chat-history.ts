import type { Message } from '../components/ChatMessage';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  createdAt: number;
  updatedAt: number;
}
