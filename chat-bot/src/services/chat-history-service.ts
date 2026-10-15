import type { ChatSession } from '../types/chat-history';
import type { Message } from '../components/ChatMessage';
import {
  saveSessionToDB,
  deleteSessionFromDB,
  clearAllSessionsFromDB,
  migrateFromLocalStorage,
  getStorageEstimate,
  sanitizeMessageForIndexedDB,
  type StorageEstimateInfo,
} from './db-service';

const ACTIVE_SESSION_ID_KEY = 'chrome_ai_active_session_id';
const LEGACY_STORAGE_KEY = 'chrome_ai_chat_sessions_v1';

class ChatHistoryService {
  private sessionsCache: ChatSession[] = [];
  private isInitialized = false;
  private initPromise: Promise<ChatSession[]> | null = null;
  private listeners = new Set<(sessions: ChatSession[]) => void>();

  constructor() {
    // Initial sync bootstrap from localStorage to prevent empty flicker on first paint
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.sessionsCache = parsed;
          }
        }
      } catch {
        // ignore initial cache read error
      }

      // Automatically trigger async initialization with IndexedDB
      this.init().catch((err) => {
        console.warn('Initial IndexedDB initialization error:', err);
      });
    }
  }

  /**
   * Initializes IndexedDB, performs migration from legacy localStorage if necessary,
   * and populates the in-memory cache.
   */
  public async init(): Promise<ChatSession[]> {
    if (this.isInitialized) return this.sessionsCache;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Run migration from localStorage if needed, or read from IndexedDB
        const sessions = await migrateFromLocalStorage();
        this.sessionsCache = sessions;
        this.isInitialized = true;
        this.notifyListeners();
        return sessions;
      } catch (err) {
        console.warn('Failed to initialize IndexedDB sessions, falling back to cache:', err);
        this.isInitialized = true;
        return this.sessionsCache;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Subscribes a listener callback to session updates.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: (sessions: ChatSession[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const copy = [...this.sessionsCache];
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error('Error in session update listener:', err);
      }
    });
  }

  /**
   * Returns all chat sessions synchronously from in-memory cache,
   * sorted by updatedAt descending.
   */
  public getAllSessions(): ChatSession[] {
    return [...this.sessionsCache];
  }

  /**
   * Ensures IndexedDB is fully initialized before returning sessions.
   */
  public async getAllSessionsAsync(): Promise<ChatSession[]> {
    if (!this.isInitialized) {
      return this.init();
    }
    return [...this.sessionsCache];
  }

  /**
   * Retrieves a specific session by its ID.
   */
  public getSession(id: string): ChatSession | null {
    return this.sessionsCache.find((s) => s.id === id) || null;
  }

  /**
   * Creates a new chat session, prepends it to memory cache,
   * and asynchronously persists it to IndexedDB.
   */
  public createSession(
    title = 'บทสนทนาใหม่',
    initialMessages: Message[] = [],
    options?: { systemPrompt?: string; temperature?: number; topK?: number }
  ): ChatSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const sanitizedMessages = initialMessages.map(sanitizeMessageForIndexedDB);

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

    // Prepend to cache
    this.sessionsCache = [newSession, ...this.sessionsCache.filter((s) => s.id !== id)];
    this.setActiveSessionId(id);
    this.notifyListeners();

    // Persist to IndexedDB
    saveSessionToDB(newSession).catch((err) => {
      console.error('Failed to persist new session to IndexedDB:', err);
    });

    return newSession;
  }

  /**
   * Saves or updates a session in cache and persists to IndexedDB.
   */
  public saveSession(session: ChatSession): void {
    const sanitizedMessages = session.messages.map(sanitizeMessageForIndexedDB);
    const updatedSession: ChatSession = {
      ...session,
      messages: sanitizedMessages,
      updatedAt: Date.now(),
    };

    const remaining = this.sessionsCache.filter((s) => s.id !== session.id);
    this.sessionsCache = [updatedSession, ...remaining];
    this.notifyListeners();

    saveSessionToDB(updatedSession).catch((err) => {
      console.error('Failed to save session to IndexedDB:', err);
    });
  }

  /**
   * Updates only messages and optionally system prompt for an existing session.
   */
  public updateSessionMessages(
    id: string,
    messages: Message[],
    systemPrompt?: string
  ): void {
    const target = this.sessionsCache.find((s) => s.id === id);
    if (!target) return;

    const sanitizedMessages = messages.map(sanitizeMessageForIndexedDB);
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
    const remaining = this.sessionsCache.filter((s) => s.id !== id);
    this.sessionsCache = [target, ...remaining];
    this.notifyListeners();

    saveSessionToDB(target).catch((err) => {
      console.error('Failed to update session messages in IndexedDB:', err);
    });
  }

  /**
   * Renames a chat session.
   */
  public renameSession(id: string, newTitle: string): void {
    const target = this.sessionsCache.find((s) => s.id === id);
    if (!target) return;

    target.title = newTitle.trim() || 'บทสนทนาไม่มีชื่อ';
    target.updatedAt = Date.now();
    this.notifyListeners();

    saveSessionToDB(target).catch((err) => {
      console.error('Failed to rename session in IndexedDB:', err);
    });
  }

  /**
   * Deletes a specific chat session from cache and IndexedDB.
   */
  public deleteSession(id: string): void {
    this.sessionsCache = this.sessionsCache.filter((s) => s.id !== id);

    if (this.getActiveSessionId() === id) {
      const nextActive = this.sessionsCache.length > 0 ? this.sessionsCache[0].id : null;
      this.setActiveSessionId(nextActive);
    }

    this.notifyListeners();

    deleteSessionFromDB(id).catch((err) => {
      console.error('Failed to delete session from IndexedDB:', err);
    });
  }

  /**
   * Clears all chat history from cache and IndexedDB.
   */
  public clearAllSessions(): void {
    this.sessionsCache = [];
    this.setActiveSessionId(null);
    this.notifyListeners();

    clearAllSessionsFromDB().catch((err) => {
      console.error('Failed to clear sessions from IndexedDB:', err);
    });
  }

  /**
   * Gets currently active session ID from localStorage.
   */
  public getActiveSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
  }

  /**
   * Sets currently active session ID in localStorage.
   */
  public setActiveSessionId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (id) {
      localStorage.setItem(ACTIVE_SESSION_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    }
  }

  /**
   * Retrieves browser storage usage and quota information for IndexedDB.
   */
  public async getStorageUsage(): Promise<StorageEstimateInfo | null> {
    return getStorageEstimate();
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
