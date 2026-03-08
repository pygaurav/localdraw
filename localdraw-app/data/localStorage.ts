/**
 * Helpers for collab-only data (username).
 *
 * Username is stored in the prefs cache (disk-backed). No localStorage is
 * used anywhere in this file.
 *
 * Scene elements and appState are persisted by the disk-storage server
 * (see diskStorage.ts). Binary files (images) remain in IndexedDB (LocalData).
 */

import { getPrefsCache, updatePrefs } from "./prefsCache";

export const saveUsernameToLocalStorage = (username: string) => {
  updatePrefs({ collabUsername: username });
};

export const importUsernameFromLocalStorage = (): string | null => {
  const username = getPrefsCache().collabUsername;
  return username || null;
};
