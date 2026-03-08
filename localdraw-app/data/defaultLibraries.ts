/**
 * Default icon libraries that are seeded into the user's library on first run.
 *
 * Files are served statically from /icons/ (public/icons/ in the vite project).
 */

import { loadLibraryFromBlob } from "@excalidraw/excalidraw/data/blob";

import type { LibraryItem, LibraryItems } from "@excalidraw/excalidraw/types";

/** LocalStorage key used to prevent re-seeding on every page load. */
export const DEFAULT_LIBS_SEEDED_KEY = "excalidraw_default_libs_seeded_v1";

/**
 * Human-readable names for the bundled libraries.
 * Keep in sync with DEFAULT_LIBRARY_FILES below.
 */
export const DEFAULT_LIBRARY_NAMES = [
  "UML & ER Diagrams",
  "Architecture Diagram Components",
  "AWS Architecture Icons",
  "Forms & UI Elements",
  "General Icons",
  "Software Architecture",
  "System Design",
] as const;

/** Static paths to the bundled .excalidrawlib files (relative to app root). */
const DEFAULT_LIBRARY_FILES = [
  "/icons/UML-ER-library.excalidrawlib",
  "/icons/architecture-diagram-components.excalidrawlib",
  "/icons/aws-architecture-icons.excalidrawlib",
  "/icons/forms.excalidrawlib",
  "/icons/icons.excalidrawlib",
  "/icons/software-architecture.excalidrawlib",
  "/icons/system-design.excalidrawlib",
] as const;

/**
 * Fetch and parse all default library files.
 * Failures of individual files are swallowed and logged so a bad file
 * doesn't prevent the rest from loading.
 */
export async function loadDefaultLibraries(): Promise<LibraryItems> {
  const results = await Promise.allSettled(
    DEFAULT_LIBRARY_FILES.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch default library ${path}: ${response.status}`,
        );
      }
      const blob = await response.blob();
      return loadLibraryFromBlob(blob, "published");
    }),
  );

  // LibraryItems is `readonly LibraryItem[]`, so collect into a mutable array
  const allItems: LibraryItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    } else {
      console.warn(
        "[defaultLibraries] Could not load a default library:",
        result.reason,
      );
    }
  }
  return allItems;
}
