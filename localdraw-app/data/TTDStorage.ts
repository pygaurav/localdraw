import { createStore, get, set } from "idb-keyval";

import type {
  SavedChats,
  TTDPersistenceAdapter,
} from "@excalidraw/excalidraw/components/TTDDialog/types";

import { DISK_STORAGE_SERVER_URL, STORAGE_KEYS } from "../app_constants";

// ---------------------------------------------------------------------------
// Disk adapter — per-tab AI chat history stored on the Express backend
// ---------------------------------------------------------------------------

const BASE = DISK_STORAGE_SERVER_URL;

/**
 * Disk-backed persistence adapter for TTD chat storage.
 * Each tab gets its own chat history file on the server.
 * Create a new instance per active tab; the instance is stable for the
 * lifetime of that tab (use useMemo in React).
 */
export class DiskTTDAdapter implements TTDPersistenceAdapter {
  constructor(private readonly tabId: string) {}

  async loadChats(): Promise<SavedChats> {
    try {
      const res = await fetch(`${BASE}/api/chats/${this.tabId}`);
      if (!res.ok) {
        return [];
      }
      return (await res.json()) as SavedChats;
    } catch {
      return [];
    }
  }

  async saveChats(chats: SavedChats): Promise<void> {
    try {
      await fetch(`${BASE}/api/chats/${this.tabId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chats),
      });
    } catch (err) {
      console.warn("[DiskTTDAdapter] Failed to save chats:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB adapter — kept for reference / fallback
// ---------------------------------------------------------------------------

/**
 * IndexedDB adapter for TTD chat storage.
 * Implements TTDPersistenceAdapter interface.
 */
export class TTDIndexedDBAdapter {
  /** IndexedDB database name */
  private static idb_name = STORAGE_KEYS.IDB_TTD_CHATS;
  /** Store key for chat data */
  private static key = "ttdChats";

  private static store = createStore(
    `${TTDIndexedDBAdapter.idb_name}-db`,
    `${TTDIndexedDBAdapter.idb_name}-store`,
  );

  /**
   * Load saved chats from IndexedDB.
   * @returns Promise resolving to saved chats array (empty if none found)
   */
  static async loadChats(): Promise<SavedChats> {
    try {
      const data = await get<SavedChats>(
        TTDIndexedDBAdapter.key,
        TTDIndexedDBAdapter.store,
      );
      return data || [];
    } catch (error) {
      console.warn("Failed to load TTD chats from IndexedDB:", error);
      return [];
    }
  }

  /**
   * Save chats to IndexedDB.
   * @param chats - The chats array to persist
   */
  static async saveChats(chats: SavedChats): Promise<void> {
    try {
      await set(TTDIndexedDBAdapter.key, chats, TTDIndexedDBAdapter.store);
    } catch (error) {
      console.warn("Failed to save TTD chats to IndexedDB:", error);
      throw error;
    }
  }
}
