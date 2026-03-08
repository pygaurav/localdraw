import { Stats } from "@excalidraw/excalidraw";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import {
  DEFAULT_VERSION,
  debounce,
  getVersion,
  nFormatter,
} from "@localdraw/common";
import { t } from "@excalidraw/excalidraw/i18n";
import { useEffect, useState } from "react";

import type { NonDeletedExcalidrawElement } from "@localdraw/element/types";
import type { UIAppState } from "@excalidraw/excalidraw/types";

import { DISK_STORAGE_SERVER_URL } from "./app_constants";

type StorageSizes = { scene: number; total: number };

const STORAGE_SIZE_TIMEOUT = 500;

/**
 * Compute scene size from the active scene on the disk-storage server.
 * Falls back to 0 if the server is unreachable.
 */
const fetchStorageSizes = async (
  elements: readonly NonDeletedExcalidrawElement[],
): Promise<StorageSizes> => {
  try {
    const tabsRes = await fetch(`${DISK_STORAGE_SERVER_URL}/api/tabs`);
    if (!tabsRes.ok) {
      return { scene: 0, total: 0 };
    }
    const { activeTabId } = await tabsRes.json();
    if (!activeTabId) {
      return { scene: 0, total: 0 };
    }
    const sceneRes = await fetch(
      `${DISK_STORAGE_SERVER_URL}/api/scenes/${activeTabId}`,
    );
    if (!sceneRes.ok) {
      return { scene: 0, total: 0 };
    }
    const text = await sceneRes.text();
    const sceneBytes = new TextEncoder().encode(text).byteLength;
    return { scene: sceneBytes, total: sceneBytes };
  } catch {
    // Server not reachable – show size based on in-memory element count (rough estimate)
    const rough = JSON.stringify(elements).length;
    return { scene: rough, total: rough };
  }
};

const getStorageSizes = debounce(
  (
    elements: readonly NonDeletedExcalidrawElement[],
    cb: (sizes: StorageSizes) => void,
  ) => {
    fetchStorageSizes(elements).then(cb);
  },
  STORAGE_SIZE_TIMEOUT,
);

type Props = {
  setToast: (message: string) => void;
  elements: readonly NonDeletedExcalidrawElement[];
  appState: UIAppState;
};
const CustomStats = (props: Props) => {
  const [storageSizes, setStorageSizes] = useState<StorageSizes>({
    scene: 0,
    total: 0,
  });

  useEffect(() => {
    getStorageSizes(props.elements, (sizes) => {
      setStorageSizes(sizes);
    });
  }, [props.elements, props.appState]);
  useEffect(() => () => getStorageSizes.cancel(), []);

  const version = getVersion();
  let hash;
  let timestamp;

  if (version !== DEFAULT_VERSION) {
    timestamp = version.slice(0, 16).replace("T", " ");
    hash = version.slice(21);
  } else {
    timestamp = t("stats.versionNotAvailable");
  }

  return (
    <Stats.StatsRows order={-1}>
      <Stats.StatsRow heading>{t("stats.version")}</Stats.StatsRow>
      <Stats.StatsRow
        style={{ textAlign: "center", cursor: "pointer" }}
        onClick={async () => {
          try {
            await copyTextToSystemClipboard(getVersion());
            props.setToast(t("toast.copyToClipboard"));
          } catch {}
        }}
        title={t("stats.versionCopy")}
      >
        {timestamp}
        <br />
        {hash}
      </Stats.StatsRow>

      <Stats.StatsRow heading>{t("stats.storage")}</Stats.StatsRow>
      <Stats.StatsRow columns={2}>
        <div>{t("stats.scene")}</div>
        <div>{nFormatter(storageSizes.scene, 1)}</div>
      </Stats.StatsRow>
      <Stats.StatsRow columns={2}>
        <div>{t("stats.total")}</div>
        <div>{nFormatter(storageSizes.total, 1)}</div>
      </Stats.StatsRow>
    </Stats.StatsRows>
  );
};

export default CustomStats;
