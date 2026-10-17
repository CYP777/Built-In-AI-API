import type { ChatSession, CachedSessionSummary } from '../types/chat-history';
import type { Message } from '../components/ChatMessage';
import { generateId } from '../utils/id';
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

// Module-level in-memory state
let sessionsCache: ChatSession[] = [];
let isInitialized = false;
let initPromise: Promise<ChatSession[]> | null = null;
const listeners = new Set<(sessions: ChatSession[]) => void>();

// Synchronous initial bootstrap from localStorage to prevent empty flicker on first paint
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        sessionsCache = parsed;
      }
    }
  } catch {
    // ignore initial cache read error
  }

  // Automatically trigger async initialization with IndexedDB
  initChatHistory().catch((err) => {
    console.warn('Initial IndexedDB initialization error:', err);
  });
}

function notifyListeners(): void {
  const copy = [...sessionsCache];
  listeners.forEach((listener) => {
    try {
      listener(copy);
    } catch (err) {
      console.error('Error in session update listener:', err);
    }
  });
}

/**
 * Initializes IndexedDB, performs migration from legacy localStorage if necessary,
 * and populates the in-memory cache.
 */
export async function initChatHistory(): Promise<ChatSession[]> {
  if (isInitialized) return sessionsCache;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Run migration from localStorage if needed, or read from IndexedDB
      const sessions = await migrateFromLocalStorage();
      sessionsCache = sessions;
      isInitialized = true;
      notifyListeners();
      return sessions;
    } catch (err) {
      console.warn('Failed to initialize IndexedDB sessions, falling back to cache:', err);
      isInitialized = true;
      return sessionsCache;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Subscribes a listener callback to session updates.
 * Returns an unsubscribe function.
 */
export function subscribeChatHistory(listener: (sessions: ChatSession[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns all chat sessions synchronously from in-memory cache,
 * sorted by updatedAt descending.
 */
export function getAllSessions(): ChatSession[] {
  return [...sessionsCache];
}

/**
 * Ensures IndexedDB is fully initialized before returning sessions.
 */
export async function getAllSessionsAsync(): Promise<ChatSession[]> {
  if (!isInitialized) {
    return initChatHistory();
  }
  return [...sessionsCache];
}

/**
 * Retrieves a specific session by its ID.
 */
export function getSession(id: string): ChatSession | null {
  return sessionsCache.find((s) => s.id === id) || null;
}

/**
 * Creates a new chat session, prepends it to memory cache,
 * and asynchronously persists it to IndexedDB.
 */
export function createSession(
  title = 'บทสนทนาใหม่',
  initialMessages: Message[] = [],
  options?: { systemPrompt?: string; temperature?: number; topK?: number }
): ChatSession {
  const id = generateId('session');
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
  sessionsCache = [newSession, ...sessionsCache.filter((s) => s.id !== id)];
  setActiveSessionId(id);
  notifyListeners();

  // Persist to IndexedDB
  saveSessionToDB(newSession).catch((err) => {
    console.error('Failed to persist new session to IndexedDB:', err);
  });

  return newSession;
}

/**
 * Saves or updates a session in cache and persists to IndexedDB.
 */
export function saveSession(session: ChatSession): void {
  const sanitizedMessages = session.messages.map(sanitizeMessageForIndexedDB);
  const updatedSession: ChatSession = {
    ...session,
    messages: sanitizedMessages,
    updatedAt: Date.now(),
  };

  const remaining = sessionsCache.filter((s) => s.id !== session.id);
  sessionsCache = [updatedSession, ...remaining];
  notifyListeners();

  saveSessionToDB(updatedSession).catch((err) => {
    console.error('Failed to save session to IndexedDB:', err);
  });
}

/**
 * Updates only messages and optionally system prompt for an existing session.
 */
export function updateSessionMessages(
  id: string,
  messages: Message[],
  systemPrompt?: string
): void {
  const target = sessionsCache.find((s) => s.id === id);
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
  const remaining = sessionsCache.filter((s) => s.id !== id);
  sessionsCache = [target, ...remaining];
  notifyListeners();

  saveSessionToDB(target).catch((err) => {
    console.error('Failed to update session messages in IndexedDB:', err);
  });
}

/**
 * Updates and locks the generated summary for a chat session.
 */
export function updateSessionSummary(
  id: string,
  summary: CachedSessionSummary
): void {
  const target = sessionsCache.find((s) => s.id === id);
  if (!target) return;

  target.savedSummary = summary;
  target.updatedAt = Date.now();
  notifyListeners();

  saveSessionToDB(target).catch((err) => {
    console.error('Failed to update session summary in IndexedDB:', err);
  });
}

/**
 * Renames a chat session.
 */
export function renameSession(id: string, newTitle: string): void {
  const target = sessionsCache.find((s) => s.id === id);
  if (!target) return;

  target.title = newTitle.trim() || 'บทสนทนาไม่มีชื่อ';
  target.updatedAt = Date.now();
  notifyListeners();

  saveSessionToDB(target).catch((err) => {
    console.error('Failed to rename session in IndexedDB:', err);
  });
}

/**
 * Deletes a specific chat session from cache and IndexedDB.
 */
export function deleteSession(id: string): void {
  sessionsCache = sessionsCache.filter((s) => s.id !== id);

  if (getActiveSessionId() === id) {
    const nextActive = sessionsCache.length > 0 ? sessionsCache[0].id : null;
    setActiveSessionId(nextActive);
  }

  notifyListeners();

  deleteSessionFromDB(id).catch((err) => {
    console.error('Failed to delete session from IndexedDB:', err);
  });
}

/**
 * Clears all chat history from cache and IndexedDB.
 */
export function clearAllSessions(): void {
  sessionsCache = [];
  setActiveSessionId(null);
  notifyListeners();

  clearAllSessionsFromDB().catch((err) => {
    console.error('Failed to clear sessions from IndexedDB:', err);
  });
}

/**
 * Gets currently active session ID from localStorage.
 */
export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
}

/**
 * Sets currently active session ID in localStorage.
 */
export function setActiveSessionId(id: string | null): void {
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
export async function getStorageUsage(): Promise<StorageEstimateInfo | null> {
  return getStorageEstimate();
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

// Grouped object export for compatibility with existing imports
export const chatHistoryService = {
  init: initChatHistory,
  subscribe: subscribeChatHistory,
  getAllSessions,
  getAllSessionsAsync,
  getSession,
  createSession,
  saveSession,
  updateSessionMessages,
  updateSessionSummary,
  renameSession,
  deleteSession,
  clearAllSessions,
  getActiveSessionId,
  setActiveSessionId,
  getStorageUsage,
};
