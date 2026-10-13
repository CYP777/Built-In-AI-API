import type { ChatSession } from '../types/chat-history';
import type { Message } from '../components/ChatMessage';

const STORAGE_KEY = 'chrome_ai_chat_sessions_v1';
const ACTIVE_SESSION_ID_KEY = 'chrome_ai_active_session_id';

/**
 * Sanitizes messages for localStorage storage.
 * Strips non-serializable File objects from imageAttachment to avoid JSON errors and reduce storage size.
 */
function sanitizeMessageForStorage(message: Message): Message {
  if (!message.imageAttachment) return message;
  const safeAttachment = { ...message.imageAttachment };
  delete safeAttachment.file;
  return {
    ...message,
    imageAttachment: safeAttachment,
  };
}

class ChatHistoryService {
  /**
   * Loads all chat sessions from localStorage, sorted by updatedAt descending.
   */
  public getAllSessions(): ChatSession[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: ChatSession[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Deduplicate by ID and accidental near-simultaneous duplicate creations
      const seenIds = new Set<string>();
      const uniqueSessions: ChatSession[] = [];
      let hadDuplicates = false;

      // Sort by createdAt ascending first to identify consecutive identical duplicates
      const sorted = [...parsed].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (!s || !s.id || seenIds.has(s.id)) {
          hadDuplicates = true;
          continue;
        }

        // Check if previous session is an accidental duplicate (same title, created within 5s)
        const prev = uniqueSessions[uniqueSessions.length - 1];
        if (
          prev &&
          prev.title === s.title &&
          Math.abs((prev.createdAt || 0) - (s.createdAt || 0)) < 5000 &&
          prev.messages?.length === s.messages?.length
        ) {
          hadDuplicates = true;
          continue;
        }

        seenIds.add(s.id);
        uniqueSessions.push(s);
      }

      // If accidental duplicates were found, re-save the cleaned array
      if (hadDuplicates) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueSessions));
        } catch {
          // ignore
        }
      }

      return uniqueSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (err) {
      console.warn('Failed to read chat history from localStorage:', err);
      return [];
    }
  }

  /**
   * Retrieves a specific session by its ID.
   */
  public getSession(id: string): ChatSession | null {
    const sessions = this.getAllSessions();
    return sessions.find((s) => s.id === id) || null;
  }

  /**
   * Persists the sessions array to localStorage safely.
   * If storage quota is exceeded, attempts to evict the oldest sessions.
   */
  public saveAllSessions(sessions: ChatSession[]): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      return true;
    } catch (err: unknown) {
      console.warn('LocalStorage save error, attempting quota recovery:', err);
      // If quota exceeded, trim older sessions one by one
      if (sessions.length > 3) {
        const trimmed = sessions.slice(0, Math.floor(sessions.length * 0.75));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
          return true;
        } catch {
          // If still failing, keep only latest 2
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 2)));
            return true;
          } catch {
            return false;
          }
        }
      }
      return false;
    }
  }

  /**
   * Creates a new chat session and saves it to history.
   */
  public createSession(
    title = 'บทสนทนาใหม่',
    initialMessages: Message[] = [],
    options?: { systemPrompt?: string; temperature?: number; topK?: number }
  ): ChatSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const sanitizedMessages = initialMessages.map(sanitizeMessageForStorage);

    const newSession: ChatSession = {
      id,
      title: title.trim() || 'บทสนทนาใหม่',
      messages: sanitizedMessages,
      systemPrompt: options?.systemPrompt,
      temperature: options?.temperature,
      topK: options?.topK,
      createdAt: now,
      updatedAt: now,
    };

    const existing = this.getAllSessions();
    const updated = [newSession, ...existing];
    this.saveAllSessions(updated);
    this.setActiveSessionId(id);

    return newSession;
  }

  /**
   * Saves or updates a session.
   */
  public saveSession(session: ChatSession): void {
    const existing = this.getAllSessions();
    const sanitizedMessages = session.messages.map(sanitizeMessageForStorage);
    const updatedSession: ChatSession = {
      ...session,
      messages: sanitizedMessages,
      updatedAt: Date.now(),
    };

    const index = existing.findIndex((s) => s.id === session.id);
    let updatedList: ChatSession[];

    if (index >= 0) {
      updatedList = [
        updatedSession,
        ...existing.filter((s) => s.id !== session.id),
      ];
    } else {
      updatedList = [updatedSession, ...existing];
    }

    this.saveAllSessions(updatedList);
  }

  /**
   * Updates only messages and optionally system prompt for an existing session.
   */
  public updateSessionMessages(
    id: string,
    messages: Message[],
    systemPrompt?: string
  ): void {
    const existing = this.getAllSessions();
    const target = existing.find((s) => s.id === id);
    if (!target) return;

    const sanitizedMessages = messages.map(sanitizeMessageForStorage);
    target.messages = sanitizedMessages;
    target.updatedAt = Date.now();
    if (systemPrompt !== undefined) {
      target.systemPrompt = systemPrompt;
    }

    // Auto-update title if it's still default or empty and we have a user prompt
    if (
      (!target.title || target.title === 'บทสนทนาใหม่') &&
      sanitizedMessages.length > 0
    ) {
      const firstUserMsg = sanitizedMessages.find((m) => m.sender === 'user');
      if (firstUserMsg && firstUserMsg.text.trim()) {
        const text = firstUserMsg.text.trim();
        target.title = text.length > 36 ? text.substring(0, 36) + '...' : text;
      }
    }

    // Move updated session to top
    const remaining = existing.filter((s) => s.id !== id);
    this.saveAllSessions([target, ...remaining]);
  }

  /**
   * Renames a chat session.
   */
  public renameSession(id: string, newTitle: string): void {
    const existing = this.getAllSessions();
    const target = existing.find((s) => s.id === id);
    if (!target) return;

    target.title = newTitle.trim() || 'บทสนทนาไม่มีชื่อ';
    target.updatedAt = Date.now();
    this.saveAllSessions(existing);
  }

  /**
   * Deletes a specific chat session.
   */
  public deleteSession(id: string): void {
    const existing = this.getAllSessions();
    const filtered = existing.filter((s) => s.id !== id);
    this.saveAllSessions(filtered);

    if (this.getActiveSessionId() === id) {
      const nextActive = filtered.length > 0 ? filtered[0].id : null;
      this.setActiveSessionId(nextActive);
    }
  }

  /**
   * Clears all chat history.
   */
  public clearAllSessions(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    } catch (err) {
      console.warn('Failed to clear sessions:', err);
    }
  }

  /**
   * Gets currently active session ID.
   */
  public getActiveSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
  }

  /**
   * Sets currently active session ID.
   */
  public setActiveSessionId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (id) {
      localStorage.setItem(ACTIVE_SESSION_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    }
  }
}

/**
 * Categorizes timestamp into human-readable relative groups (e.g. 'วันนี้', 'เมื่อวาน', '7 วันที่ผ่านมา')
 */
export function getRelativeDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays <= 7) return '7 วันที่ผ่านมา';
  if (diffDays <= 30) return '30 วันที่ผ่านมา';
  return 'ก่อนหน้านี้';
}

/**
 * Formats timestamp for card display
 */
export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return `${date.getDate()} ${date.toLocaleDateString('th-TH', { month: 'short' })}`;
  }

  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export const chatHistoryService = new ChatHistoryService();
