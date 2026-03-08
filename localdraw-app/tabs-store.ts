/**
 * Jotai atoms for the multi-tab state.
 * Kept in a separate file so App.tsx imports stay manageable.
 */

import { atom } from "./app-jotai";

import type { TabMeta } from "./data/diskStorage";

/** Ordered list of all open tabs */
export const tabsAtom = atom<TabMeta[]>([]);

/** ID of the currently visible tab */
export const activeTabIdAtom = atom<string | null>(null);
