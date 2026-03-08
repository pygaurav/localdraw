import { THEME } from "@excalidraw/excalidraw";
import { EVENT, CODES, KEYS } from "@localdraw/common";
import { useEffect, useLayoutEffect, useState } from "react";

import type { Theme } from "@localdraw/element/types";

import { getPrefs, savePrefs } from "./data/diskStorage";

const getDarkThemeMediaQuery = (): MediaQueryList | undefined =>
  window.matchMedia?.("(prefers-color-scheme: dark)");

const resolveTheme = (appTheme: Theme | "system"): Theme => {
  if (appTheme === "system") {
    return getDarkThemeMediaQuery()?.matches ? THEME.DARK : THEME.LIGHT;
  }
  return appTheme;
};

export const useHandleAppTheme = () => {
  // Default to dark until we hear back from the server
  const [appTheme, setAppThemeState] = useState<Theme | "system">(THEME.DARK);
  const [editorTheme, setEditorTheme] = useState<Theme>(THEME.DARK);

  // Load persisted theme from disk on mount
  useEffect(() => {
    getPrefs()
      .then(({ theme }) => {
        const loaded = (theme as Theme | "system") || THEME.DARK;
        setAppThemeState(loaded);
        setEditorTheme(resolveTheme(loaded));
      })
      .catch(() => {
        // Server unreachable – stay with dark default
      });
  }, []);

  // Sync editorTheme whenever appTheme changes (also handles "system")
  useLayoutEffect(() => {
    setEditorTheme(resolveTheme(appTheme));
  }, [appTheme]);

  // Follow OS preference when set to "system"
  useEffect(() => {
    if (appTheme !== "system") {
      return;
    }
    const mediaQuery = getDarkThemeMediaQuery();
    const handleChange = (e: MediaQueryListEvent) => {
      setEditorTheme(e.matches ? THEME.DARK : THEME.LIGHT);
    };
    mediaQuery?.addEventListener("change", handleChange);
    return () => mediaQuery?.removeEventListener("change", handleChange);
  }, [appTheme]);

  // Alt+Shift+D keyboard shortcut to toggle theme
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        !event[KEYS.CTRL_OR_CMD] &&
        event.altKey &&
        event.shiftKey &&
        event.code === CODES.D
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setAppTheme(editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK);
      }
    };
    document.addEventListener(EVENT.KEYDOWN, handleKeydown, { capture: true });
    return () =>
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown, {
        capture: true,
      });
  }, [editorTheme]);

  // Persist to disk whenever the theme choice changes
  const setAppTheme = (theme: Theme | "system") => {
    setAppThemeState(theme);
    savePrefs({ theme }).catch(console.error);
  };

  return { editorTheme, appTheme, setAppTheme };
};
