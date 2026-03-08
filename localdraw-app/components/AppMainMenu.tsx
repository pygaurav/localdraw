import { eyeIcon, brainIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@localdraw/common";

import type { Theme } from "@localdraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import { useSetAtom } from "../app-jotai";

import { saveDebugState } from "./DebugCanvas";
import { aiPreferencesDialogOpenAtom } from "./AIPreferencesDialog";
import { aiSettingsDialogOpenAtom } from "./AISettingsDialog";

export const AppMainMenu: React.FC<{
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
}> = React.memo((props) => {
  const openAiSettings = useSetAtom(aiSettingsDialogOpenAtom);
  const openAiPreferences = useSetAtom(aiPreferencesDialogOpenAtom);

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.Item icon={brainIcon} onSelect={() => openAiSettings(true)}>
        AI Settings
      </MainMenu.Item>
      <MainMenu.DefaultItems.Preferences
        additionalItems={
          <>
            <MainMenu.Separator />
            <MainMenu.Item
              icon={brainIcon}
              onSelect={() => openAiPreferences(true)}
            >
              AI Provider Preferences
            </MainMenu.Item>
          </>
        }
      />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
