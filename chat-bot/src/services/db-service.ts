import type { ChatSession } from '../types/chat-history';
import type { Message } from '../components/ChatMessage';

const DB_NAME = 'chrome_ai_database';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_METADATA = 'metadata';

const LEGACY_STORAGE_KEY = 'chrome_ai_chat_sessions_v1';
const LEGACY_MIGRATED_KEY = 'chrome_ai_chat_sessions_v1_migrated';

export interface StorageEstimateInfo {
  usage: number; // in bytes
  quota: number; // in bytes
  usageFormatted: string;
  quotaFormatted: string;
  percentage: number;
}

/**
 * Format bytes to human readable string (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens or retrieves the singleton IndexedDB database connection.
 */
export function getDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // 1. Sessions store with indexes
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        sessionStore.createIndex('by_createdAt', 'createdAt', { unique: false });
      }

      // 2. Metadata store for settings and flags
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Strips non-serializable objects (like AudioBuffer) that cannot be cloned by IndexedDB.
 * Retains Blob and File objects directly.
 */
export function sanitizeMessageForIndexedDB(message: Message): Message {
  const result: Message = { ...message };

  if (result.imageAttachment) {
    result.imageAttachment = { ...result.imageAttachment };
  }

  if (result.imageAttachments && Array.isArray(result.imageAttachments)) {
    result.imageAttachments = result.imageAttachments.map((img) => ({ ...img }));
  }

  if (result.audioAttachment) {
    const safeAudio = { ...result.audioAttachment };
    // AudioBuffer cannot be structured-cloned by IndexedDB
    delete safeAudio.audioBuffer;
    result.audioAttachment = safeAudio;
  }

  // Clear transient streaming flag
  if (result.isStreaming) {
    result.isStreaming = false;
  }

  return result;
}

/**
 * Restores usable object URLs if an attachment stored a Blob/File but its URL expired or is empty.
 */
export function restoreMessageMediaUrls(message: Message): Message {
  const result: Message = { ...message };

  if (result.imageAttachment?.file instanceof Blob) {
    if (!result.imageAttachment.url || result.imageAttachment.url.startsWith('blob:')) {
      try {
        result.imageAttachment = {
          ...result.imageAttachment,
          url: URL.createObjectURL(result.imageAttachment.file),
        };
      } catch {
        // keep existing url
      }
    }
  }

  if (result.imageAttachments && Array.isArray(result.imageAttachments)) {
    result.imageAttachments = result.imageAttachments.map((img) => {
      if (img.file instanceof Blob && (!img.url || img.url.startsWith('blob:'))) {
        try {
          return {
            ...img,
            url: URL.createObjectURL(img.file),
          };
        } catch {
          return img;
        }
      }
      return img;
    });
  }

  if (result.audioAttachment?.blob instanceof Blob) {
    if (!result.audioAttachment.url || result.audioAttachment.url.startsWith('blob:')) {
      try {
        result.audioAttachment = {
          ...result.audioAttachment,
          url: URL.createObjectURL(result.audioAttachment.blob),
        };
      } catch {
        // keep existing url
      }
    }
  }

  return result;
}

/**
 * Retrieves all chat sessions from IndexedDB, sorted by updatedAt descending.
 */
export async function getAllSessionsFromDB(): Promise<ChatSession[]> {
  const db = await getDatabase();

  return new Promise<ChatSession[]>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('by_updatedAt');
    const request = index.openCursor(null, 'prev'); // descending order

    const sessions: ChatSession[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const rawSession = cursor.value as ChatSession;
        // Restore media URLs for each message
        const restoredMessages = (rawSession.messages || []).map(restoreMessageMediaUrls);
        sessions.push({
          ...rawSession,
          messages: restoredMessages,
        });
        cursor.continue();
      } else {
        resolve(sessions);
      }
    };

    request.onerror = () => {
      console.error('Failed to get sessions from IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Retrieves a single session by ID from IndexedDB.
 */
export async function getSessionFromDB(id: string): Promise<ChatSession | null> {
  const db = await getDatabase();

  return new Promise<ChatSession | null>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.get(id);

    request.onsuccess = () => {
      const rawSession = request.result as ChatSession | undefined;
      if (!rawSession) {
        resolve(null);
        return;
      }
      const restoredMessages = (rawSession.messages || []).map(restoreMessageMediaUrls);
      resolve({
        ...rawSession,
        messages: restoredMessages,
      });
    };

    request.onerror = () => {
      console.error(`Failed to get session ${id} from IndexedDB:`, request.error);
      reject(request.error);
    };
  });
}

/**
 * Saves or updates a session in IndexedDB.
 */
export async function saveSessionToDB(session: ChatSession): Promise<void> {
  const db = await getDatabase();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);

    const sanitizedMessages = (session.messages || []).map(sanitizeMessageForIndexedDB);
    const payload: ChatSession = {
      ...session,
      messages: sanitizedMessages,
      updatedAt: session.updatedAt || Date.now(),
    };

    const request = store.put(payload);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Failed to save session to IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Saves multiple sessions in a single batch transaction.
 */
export async function saveSessionsBatchToDB(sessions: ChatSession[]): Promise<void> {
  if (sessions.length === 0) return;
  const db = await getDatabase();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);

    for (const session of sessions) {
      const sanitizedMessages = (session.messages || []).map(sanitizeMessageForIndexedDB);
      const payload: ChatSession = {
        ...session,
        messages: sanitizedMessages,
        updatedAt: session.updatedAt || Date.now(),
      };
      store.put(payload);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error('Batch save failed in IndexedDB:', tx.error);
      reject(tx.error);
    };
  });
}

/**
 * Deletes a session by ID from IndexedDB.
 */
export async function deleteSessionFromDB(id: string): Promise<void> {
  const db = await getDatabase();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error(`Failed to delete session ${id} from IndexedDB:`, request.error);
      reject(request.error);
    };
  });
}

/**
 * Clears all sessions from IndexedDB.
 */
export async function clearAllSessionsFromDB(): Promise<void> {
  const db = await getDatabase();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Failed to clear sessions from IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Automatic migration from localStorage to IndexedDB.
 * Migrates existing sessions safely and frees up localStorage quota.
 */
export async function migrateFromLocalStorage(): Promise<ChatSession[]> {
  if (typeof window === 'undefined') return [];

  try {
    const isAlreadyMigrated = localStorage.getItem(LEGACY_MIGRATED_KEY) === 'true';
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);

    if (legacyRaw && !isAlreadyMigrated) {
      const legacySessions: ChatSession[] = JSON.parse(legacyRaw);
      if (Array.isArray(legacySessions) && legacySessions.length > 0) {
        console.info(`[IndexedDB Migration] Migrating ${legacySessions.length} sessions from localStorage to IndexedDB...`);
        await saveSessionsBatchToDB(legacySessions);

        // Mark migrated and free localStorage quota
        localStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        console.info('[IndexedDB Migration] Migration completed successfully.');
      }
    }
  } catch (err) {
    console.warn('[IndexedDB Migration] Migration error (non-fatal):', err);
  }

  return getAllSessionsFromDB();
}

/**
 * Queries current browser storage estimate for IndexedDB/cache.
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo | null> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      return {
        usage,
        quota,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota),
        percentage: Math.min(100, Math.round(percentage * 10) / 10),
      };
    } catch (err) {
      console.warn('Failed to estimate storage:', err);
    }
  }
  return null;
}
