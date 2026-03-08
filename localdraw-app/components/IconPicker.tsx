import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { atom, useAtom } from "../app-jotai";
import { ALL_ICONS, buildIconSVG, searchIcons } from "../data/iconData";

import "./IconPicker.scss";

import type { IconCategory, IconEntry } from "../data/iconData";

// ─── Atoms ────────────────────────────────────────────────────────────────────

export const iconPickerOpenAtom = atom(false);

/** Stores the toolbar button's bounding rect so the panel can anchor below it */
export const iconPickerAnchorAtom = atom<{
  bottom: number;
  centerX: number;
} | null>(null);

// ─── Props ────────────────────────────────────────────────────────────────────

interface IconPickerProps {
  onInsert: (entry: IconEntry) => void;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: {
  id: IconCategory;
  label: string;
  description: string;
  previewSvg: string;
}[] = [
  {
    id: "general",
    label: "General Icon",
    description: "Common UI & design icons",
    previewSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  },
  {
    id: "tech",
    label: "Tech Logo",
    description: "Popular tools and libraries",
    previewSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  },
  {
    id: "cloud",
    label: "Cloud Provider Icon",
    description: "AWS, Azure, and Google Cloud",
    previewSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
  },
];

// ─── Icon card ────────────────────────────────────────────────────────────────

const IconCard = React.memo(
  ({
    icon,
    isSelected,
    onClick,
  }: {
    icon: IconEntry;
    isSelected: boolean;
    onClick: (icon: IconEntry) => void;
  }) => {
    const previewColor =
      icon.renderType === "fill"
        ? icon.brandColor ?? "currentColor"
        : "currentColor";

    const svg = useMemo(
      () => buildIconSVG(icon, previewColor, 1.75),
      [icon, previewColor],
    );

    return (
      <button
        className={`ip-icon-card${isSelected ? " ip-icon-card--selected" : ""}`}
        onClick={() => onClick(icon)}
        title={icon.name}
        type="button"
        data-icon-id={icon.id}
      >
        <span
          className="ip-icon-card__svg"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <span className="ip-icon-card__name">{icon.name}</span>
      </button>
    );
  },
);

IconCard.displayName = "IconCard";

// ─── Chevrons ─────────────────────────────────────────────────────────────────

const ChevronRight = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronLeft = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────

const PANEL_WIDTH = 400;
const PANEL_GAP = 6; // gap between button bottom and panel top
const VIEWPORT_MARGIN = 12;

export const IconPicker: React.FC<IconPickerProps> = ({ onInsert }) => {
  const [isOpen, setIsOpen] = useAtom(iconPickerOpenAtom);
  const [anchor] = useAtom(iconPickerAnchorAtom);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [activeCategory, setActiveCategory] = useState<IconCategory | "all">(
    "all",
  );
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Dynamic panel position anchored to toolbar button ─────────────────────

  const panelStyle = useMemo((): React.CSSProperties => {
    const top = anchor ? anchor.bottom + PANEL_GAP : 96;
    let left = anchor
      ? anchor.centerX - PANEL_WIDTH / 2
      : window.innerWidth / 2 - PANEL_WIDTH / 2;
    // clamp so panel never clips viewport edges
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
    );
    return { top, left };
  }, [anchor]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setActiveCategory("all");
    setFocusedIdx(-1);
  }, [setIsOpen]);

  // ── Click-outside to close (non-modal behaviour) ───────────────────────────

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onDocumentClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [isOpen, close]);

  // ── Auto-focus search on open ──────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // ── Filtered icons ─────────────────────────────────────────────────────────

  const filteredIcons = useMemo(() => {
    const cat =
      activeCategory === "all" ? undefined : (activeCategory as IconCategory);
    return searchIcons(deferredQuery, cat);
  }, [deferredQuery, activeCategory]);

  // ── Category counts ────────────────────────────────────────────────────────

  const categoryCounts = useMemo(() => {
    const counts: Record<IconCategory, number> = {
      general: 0,
      tech: 0,
      cloud: 0,
    };
    ALL_ICONS.forEach((i) => counts[i.category]++);
    return counts;
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const COLS = 5;

  const handlePickerKey = useCallback(
    (key: string, preventDefault: () => void, stopPropagation: () => void) => {
      stopPropagation();

      if (key === "Escape") {
        preventDefault();
        close();
        return;
      }

      if (filteredIcons.length === 0) {
        return;
      }

      if (key === "ArrowRight") {
        preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, filteredIcons.length - 1));
      } else if (key === "ArrowLeft") {
        preventDefault();
        setFocusedIdx((i) => (i <= 0 ? 0 : i - 1));
      } else if (key === "ArrowDown") {
        preventDefault();
        setFocusedIdx((i) => Math.min(i + COLS, filteredIcons.length - 1));
      } else if (key === "ArrowUp") {
        preventDefault();
        setFocusedIdx((i) => Math.max(i - COLS, 0));
      } else if (key === "Enter" && focusedIdx >= 0) {
        preventDefault();
        const icon = filteredIcons[focusedIdx];
        if (icon) {
          onInsert(icon);
          close();
        }
      }
    },
    [close, filteredIcons, focusedIdx, onInsert],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handlePickerKey(
        e.key,
        () => e.preventDefault(),
        () => e.stopPropagation(),
      );
    },
    [handlePickerKey],
  );

  // Excalidraw installs global keyboard handlers, so capture on window
  // while the picker is open to guarantee arrow/enter navigation.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onWindowKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const target = e.target as Node | null;
      if (target && !panel.contains(target)) {
        return;
      }

      handlePickerKey(
        e.key,
        () => e.preventDefault(),
        () => {
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        },
      );
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [isOpen, handlePickerKey]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIdx < 0 || !gridRef.current) {
      return;
    }
    const card = gridRef.current.querySelector<HTMLElement>(
      `[data-icon-id="${filteredIcons[focusedIdx]?.id}"]`,
    );
    card?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx, filteredIcons]);

  // Reset focus when the list changes
  useEffect(() => {
    setFocusedIdx(-1);
  }, [deferredQuery, activeCategory]);

  // ── Breadcrumb helpers ─────────────────────────────────────────────────────

  const activeMeta =
    activeCategory !== "all"
      ? CATEGORY_META.find((m) => m.id === activeCategory)
      : null;

  const breadcrumbCurrent = deferredQuery
    ? "Search results"
    : activeMeta
    ? activeMeta.label
    : "Icon";

  const showCategoryCards = !deferredQuery && activeCategory === "all";

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCategoryClick = useCallback((cat: IconCategory) => {
    setActiveCategory(cat);
    setQuery("");
    setFocusedIdx(-1);
  }, []);

  const handleBack = useCallback(() => {
    setActiveCategory("all");
    setQuery("");
    setFocusedIdx(-1);
  }, []);

  const handleInsert = useCallback(
    (icon: IconEntry) => {
      onInsert(icon);
      close();
    },
    [onInsert, close],
  );

  if (!isOpen) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={panelRef}
      className="ip-panel"
      style={panelStyle}
      onKeyDown={handleKeyDown}
    >
      {/* ── Top row: search ─────────────────────────────────────────────── */}
      <div className="ip-top-row">
        <div className="ip-search">
          <svg
            className="ip-search__icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            className="ip-search__input"
            type="text"
            placeholder="Insert item"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value) {
                setActiveCategory("all");
              }
            }}
          />
          {query && (
            <button
              className="ip-search__clear"
              onClick={() => setQuery("")}
              type="button"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div className="ip-breadcrumb">
        {activeCategory !== "all" || deferredQuery ? (
          <button
            className="ip-breadcrumb__back"
            onClick={handleBack}
            type="button"
          >
            <ChevronLeft />
            <span>All Categories</span>
          </button>
        ) : (
          <span className="ip-breadcrumb__segment">All Categories</span>
        )}
        <span className="ip-breadcrumb__sep">/</span>
        <span className="ip-breadcrumb__current">{breadcrumbCurrent}</span>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="ip-body">
        {/* Category cards — all-icons view only */}
        {showCategoryCards && (
          <div className="ip-category-cards">
            {CATEGORY_META.map((meta) => (
              <button
                key={meta.id}
                className="ip-cat-card"
                onClick={() => handleCategoryClick(meta.id)}
                type="button"
              >
                <span
                  className="ip-cat-card__icon"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: meta.previewSvg }}
                />
                <span className="ip-cat-card__text">
                  <span className="ip-cat-card__label">{meta.label}</span>
                  <span className="ip-cat-card__desc">
                    {categoryCounts[meta.id]}+ icons available
                  </span>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        )}

        {/* Icon grid */}
        {filteredIcons.length === 0 ? (
          <div className="ip-empty">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p>No icons match &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="ip-grid" ref={gridRef}>
            {filteredIcons.map((icon, idx) => (
              <IconCard
                key={icon.id}
                icon={icon}
                isSelected={idx === focusedIdx}
                onClick={handleInsert}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="ip-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <kbd>←</kbd>
          <kbd>→</kbd> to navigate&nbsp;&nbsp;
          <kbd>Enter</kbd> to insert
        </span>
        <span>{filteredIcons.length} icons</span>
      </div>
    </div>
  );
};
