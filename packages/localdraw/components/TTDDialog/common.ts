import { DEFAULT_EXPORT_PADDING, EDITOR_LS_KEYS } from "@localdraw/common";

import type {
  NonDeletedExcalidrawElement,
  Theme,
} from "@localdraw/element/types";

import { EditorLocalStorage } from "../../data/EditorLocalStorage";
import {
  convertToExcalidrawElements,
  exportToCanvas,
  THEME,
} from "../../index";

import type { MermaidToExcalidrawLibProps } from "./types";

import type { AppClassProperties, BinaryFiles } from "../../types";

const replaceMermaidIconsWithLibraryItems = async (
  elements: readonly NonDeletedExcalidrawElement[],
  app: AppClassProperties,
): Promise<readonly NonDeletedExcalidrawElement[]> => {
  const libraryItems = await app.library.getLatestLibrary();
  if (!libraryItems.length) {
    return elements;
  }

  const elementsToRemove = new Set<string>();
  const elementsToAdd: NonDeletedExcalidrawElement[] = [];

  for (const el of elements) {
    if (el.type === "text" && el.text.includes("[[icon:")) {
      const match = el.text.match(/\[\[icon:([^\]]+)\]\]/);
      if (match) {
        const rawSearchTerm = match[1].toLowerCase().trim();
        // Remove common prefixes like 'aws-' and strip non-alphanumeric chars for loose matching
        const cleanSearchTerm = rawSearchTerm
          .replace(/^aws-/, "")
          .replace(/[^a-z0-9]/g, "");

        // Find a matching library item.
        // We clean the item name similarly to ensure "Secrets Manager" matches "secretsmanager"
        const libItem = libraryItems.find((item) => {
          if (!item.name) {
            return false;
          }
          const cleanName = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          return (
            cleanName === cleanSearchTerm || cleanName.includes(cleanSearchTerm)
          );
        });

        // mermaid-to-excalidraw doesn't use containerId.
        // We find the enclosing shape by checking bounding boxes.
        const textCenterX = el.x + el.width / 2;
        const textCenterY = el.y + el.height / 2;

        // eslint-disable-next-line no-console -- debug container lookup
        console.log(
          "Looking for container for:",
          match[0],
          "at",
          textCenterX,
          textCenterY,
        );

        const container = el.containerId
          ? elements.find((e) => e.id === el.containerId)
          : elements.find((e) => {
              if (
                !(
                  e.type === "rectangle" ||
                  e.type === "diamond" ||
                  e.type === "ellipse"
                )
              ) {
                return false;
              }

              // Excalidraw mermaid rects might be slightly smaller or text slightly larger than bounding box sometimes?
              // Or there could be padding. Let's do a loose intersection check.
              const isInside =
                textCenterX >= e.x &&
                textCenterX <= e.x + e.width &&
                textCenterY >= e.y &&
                textCenterY <= e.y + e.height;

              if (isInside) {
                // eslint-disable-next-line no-console -- debug container lookup
                console.log(
                  "Found container:",
                  e.id,
                  "type:",
                  e.type,
                  "bounds:",
                  e.x,
                  e.y,
                  e.width,
                  e.height,
                );
              }
              return isInside;
            });

        if (!container) {
          // eslint-disable-next-line no-console -- debug container lookup
          console.log(
            "Failed to find container! All elements:",
            elements.map((e) => ({
              id: e.id,
              type: e.type,
              x: e.x,
              y: e.y,
              w: e.width,
              h: e.height,
            })),
          );
        }

        if (libItem && container) {
          // Mark the original Mermaid shape and text for removal
          elementsToRemove.add(container.id);
          elementsToRemove.add(el.id);

          // Compute library item bounding box
          const libElements = libItem.elements;
          if (libElements.length) {
            const minX = Math.min(...libElements.map((e) => e.x));
            const minY = Math.min(...libElements.map((e) => e.y));
            const maxX = Math.max(...libElements.map((e) => e.x + e.width));
            const maxY = Math.max(...libElements.map((e) => e.y + e.height));

            const libWidth = maxX - minX;
            const libHeight = maxY - minY;
            const libCenterX = minX + libWidth / 2;
            const libCenterY = minY + libHeight / 2;

            // Compute container center
            const containerCenterX = container.x + container.width / 2;
            const containerCenterY = container.y + container.height / 2;

            // Offset to match container center
            const offsetX = containerCenterX - libCenterX;
            const offsetY = containerCenterY - libCenterY;

            // Clone and shift library elements
            const clonedLibElements = libElements.map((le) => ({
              ...le,
              // basic reassignment, real code would regenerate IDs and binding
              id: `${le.id}-${Math.random().toString(36).slice(2, 6)}`,
              x: le.x + offsetX,
              y: le.y + offsetY,
              groupIds: [], // Detach from internal library groups to avoid conflicts
            })) as NonDeletedExcalidrawElement[];

            elementsToAdd.push(...clonedLibElements);

            // Note: In a robust implementation, incoming arrows bound to `container.id`
            // should be rebound to one of the new library elements.
            // For now, Mermaid arrows are just lines, so removing the container might just
            // leave the lines pointing at the new shapes.
          }
        } else {
          // If no library item found (or no container), clone and clean the text
          const cleanText = el.text.replace(/\[\[icon:[^\]]+\]\]/gi, "").trim();
          elementsToRemove.add(el.id);
          elementsToAdd.push({
            ...el,
            text: cleanText,
            originalText: cleanText,
          } as any);
        }
      }
    }
  }

  if (elementsToRemove.size === 0) {
    return elements;
  }

  return [
    ...elements.filter((e) => !elementsToRemove.has(e.id)),
    ...elementsToAdd,
  ];
};

export const resetPreview = ({
  canvasRef,
  setError,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  setError: (error: Error | null) => void;
}) => {
  const canvasNode = canvasRef.current;

  if (!canvasNode) {
    return;
  }
  const parent = canvasNode.parentElement;
  if (!parent) {
    return;
  }
  parent.style.background = "";
  setError(null);
  canvasNode.replaceChildren();
};

export const convertMermaidToExcalidraw = async ({
  canvasRef,
  mermaidToExcalidrawLib,
  mermaidDefinition,
  setError,
  data,
  theme,
  app,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  mermaidDefinition: string;
  setError: (error: Error | null) => void;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;
  theme: Theme;
  app?: AppClassProperties;
}): Promise<{ success: true } | { success: false; error?: Error }> => {
  const canvasNode = canvasRef.current;
  const parent = canvasNode?.parentElement;

  if (!canvasNode || !parent) {
    return { success: false };
  }

  if (!mermaidDefinition) {
    resetPreview({ canvasRef, setError });
    return { success: false };
  }

  let ret;
  try {
    const api = await mermaidToExcalidrawLib.api;

    try {
      try {
        ret = await api.parseMermaidToExcalidraw(mermaidDefinition);
      } catch (err: unknown) {
        ret = await api.parseMermaidToExcalidraw(
          mermaidDefinition.replace(/"/g, "'"),
        );
      }
    } catch (err: unknown) {
      return { success: false, error: err as Error };
    }

    const { elements, files } = ret;
    setError(null);

    let processedElements = convertToExcalidrawElements(elements, {
      regenerateIds: true,
    });

    if (app) {
      processedElements = (await replaceMermaidIconsWithLibraryItems(
        processedElements,
        app,
      )) as any;
    }

    data.current = {
      elements: processedElements as any,
      files,
    };

    const canvas = await exportToCanvas({
      elements: data.current.elements,
      files: data.current.files,
      exportPadding: DEFAULT_EXPORT_PADDING,
      maxWidthOrHeight:
        Math.max(parent.offsetWidth, parent.offsetHeight) *
        window.devicePixelRatio,
      appState: {
        exportWithDarkMode: theme === THEME.DARK,
      },
    });

    parent.style.background = "var(--default-bg-color)";
    canvasNode.replaceChildren(canvas);
    return { success: true };
  } catch (err: any) {
    parent.style.background = "var(--default-bg-color)";
    if (mermaidDefinition) {
      setError(err);
    }

    // Return error so caller can display meaningful error message
    return { success: false, error: err };
  }
};
export const saveMermaidDataToStorage = (mermaidDefinition: string) => {
  EditorLocalStorage.set(
    EDITOR_LS_KEYS.MERMAID_TO_EXCALIDRAW,
    mermaidDefinition,
  );
};

export const insertToEditor = ({
  app,
  data,
  text,
  shouldSaveMermaidDataToStorage,
}: {
  app: AppClassProperties;
  data: React.MutableRefObject<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>;
  text?: string;
  shouldSaveMermaidDataToStorage?: boolean;
}) => {
  const { elements: newElements, files } = data.current;

  if (!newElements.length) {
    return;
  }

  app.addElementsFromPasteOrLibrary({
    elements: newElements,
    files,
    position: "center",
    fitToContent: true,
  });
  app.setOpenDialog(null);

  if (shouldSaveMermaidDataToStorage && text) {
    saveMermaidDataToStorage(text);
  }
};
