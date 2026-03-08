import { useCallback, useRef, useState } from "react";

import "./TabBar.scss";

import type { TabMeta } from "../data/diskStorage";

interface TabBarProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  onTabSwitch: (tabId: string) => void;
  onTabAdd: () => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string, name: string) => void;
}

const PlusIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 11 11"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M5.5 1v9M1 5.5h9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const TabBar = ({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabAdd,
  onTabClose,
  onTabRename,
}: TabBarProps) => {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback((tab: TabMeta, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingTabId) {
      return;
    }
    const trimmed = editingName.trim().slice(0, 50);
    if (!trimmed) {
      setEditingTabId(null);
      return;
    }

    const isDuplicate = tabs.some(
      (t) =>
        t.id !== editingTabId && t.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (isDuplicate) {
      // Shake the input then revert to the original name
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setEditingTabId(null);
      }, 380);
      return;
    }

    onTabRename(editingTabId, trimmed);
    setEditingTabId(null);
  }, [editingTabId, editingName, onTabRename, tabs]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setEditingTabId(null);
      }
    },
    [commitEdit],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onTabClose(tabId);
    },
    [onTabClose],
  );

  const handleLabelClick = useCallback(
    (e: React.MouseEvent, tab: TabMeta, isActive: boolean) => {
      if (isActive) {
        startEditing(tab, e);
      }
    },
    [startEditing],
  );

  return (
    <div className="excalidraw-tab-bar">
      <div className="excalidraw-tab-bar__tabs" ref={tabsScrollRef}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingTabId;

          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              data-color-idx={String(index % 8)}
              className={`excalidraw-tab-bar__tab${
                isActive ? " excalidraw-tab-bar__tab--active" : ""
              }`}
              onClick={() => !isEditing && onTabSwitch(tab.id)}
              onKeyDown={(e) => {
                if (!isEditing && (e.key === "Enter" || e.key === " ")) {
                  onTabSwitch(tab.id);
                }
              }}
              onDoubleClick={(e) => startEditing(tab, e)}
              title={isEditing ? undefined : `${tab.name} — click to rename`}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className={`excalidraw-tab-bar__tab-input${
                    shaking ? " excalidraw-tab-bar__tab-input--shake" : ""
                  }`}
                  value={editingName}
                  maxLength={50}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleInputKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className={`excalidraw-tab-bar__tab-label${
                    isActive ? " excalidraw-tab-bar__tab-label--editable" : ""
                  }`}
                  onClick={(e) => handleLabelClick(e, tab, isActive)}
                  title={isActive ? "Click to rename" : tab.name}
                >
                  {tab.name}
                </span>
              )}

              {tabs.length > 1 && (
                <button
                  className="excalidraw-tab-bar__tab-close"
                  onClick={(e) => handleTabClose(e, tab.id)}
                  title="Close tab"
                  aria-label={`Close ${tab.name}`}
                  tabIndex={-1}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 1l6 6M7 1L1 7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* ─ New-tab button lives inline, right after the last tab ─ */}
        <button
          className="excalidraw-tab-bar__add-btn"
          onClick={onTabAdd}
          title="New drawing"
          aria-label="New drawing"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
};
