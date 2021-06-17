import { fileSave } from "browser-fs-access";
import {
  copyBlobToClipboardAsPng,
  copyTextToSystemClipboard,
} from "../clipboard";
import { DEFAULT_EXPORT_PADDING } from "../constants";
import { NonDeletedExcalidrawElement } from "../element/types";
import { t } from "../i18n";
import { exportToCanvas, exportToSvg } from "../scene/export";
import { ExportType } from "../scene/types";
import { AppState } from "../types";
import { canvasToBlob } from "./blob";
import { serializeAsJSON } from "./json";

export { loadFromBlob } from "./blob";
export { loadFromJSON, saveAsJSON } from "./json";

export const exportCanvas = (
  type: Omit<ExportType, "backend">,
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  {
    exportBackground,
    exportPadding = DEFAULT_EXPORT_PADDING,
    viewBackgroundColor,
    name,
  }: {
    exportBackground: boolean;
    exportPadding?: number;
    viewBackgroundColor: string;
    name: string;
  },
) => {
  if (elements.length === 0) {
    return Promise.reject(new Error(t("alerts.cannotExportEmptyCanvas")));
  }

  if (type === "svg" || type === "clipboard-svg") {
    return (async function () {
      const tempSvg = exportToSvg(elements, {
        exportBackground,
        exportWithDarkMode: appState.exportWithDarkMode,
        viewBackgroundColor,
        exportPadding,
        exportScale: appState.exportScale,
        metadata:
          appState.exportEmbedScene && type === "svg"
            ? await (
                await import(/* webpackChunkName: "image" */ "./image")
              ).encodeSvgMetadata({
                text: serializeAsJSON(elements, appState),
              })
            : undefined,
      });
      if (type === "svg") {
        await fileSave(
          new Blob([tempSvg.outerHTML], { type: "image/svg+xml" }),
          {
            fileName: `${name}.svg`,
            extensions: [".svg"],
          },
        );
      } else if (type === "clipboard-svg") {
        copyTextToSystemClipboard(tempSvg.outerHTML);
      }
    })();
  }

  const tempCanvas = exportToCanvas(elements, appState, {
    exportBackground,
    viewBackgroundColor,
    exportPadding,
  });

  if (type === "png") {
    return (async function () {
      let blob = await canvasToBlob(tempCanvas);
      const fileName = `${name}.png`;
      if (appState.exportEmbedScene) {
        blob = await (
          await import(/* webpackChunkName: "image" */ "./image")
        ).encodePngMetadata({
          blob,
          metadata: serializeAsJSON(elements, appState),
        });
      }

      await fileSave(blob, {
        fileName,
        extensions: [".png"],
      });
    })();
  } else if (type === "clipboard") {
    const isDarwin = /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);

    if (isDarwin) {
      return navigator.clipboard.write([
        new window.ClipboardItem({
          "image/png": new Promise((resolve, reject) => {
            canvasToBlob(tempCanvas)
              .then((blob) => {
                resolve(blob);
              })
              .catch((error) => {
                reject(error);
              });
          }),
        }),
      ]);
    }

    return (async function () {
      const blob = await canvasToBlob(tempCanvas);
      try {
        copyBlobToClipboardAsPng(blob);
      } catch (error) {
        if (error.name === "CANVAS_POSSIBLY_TOO_BIG") {
          throw error;
        }
        throw new Error(t("alerts.couldNotCopyToClipboard"));
      }
    })();
  }

  return Promise.reject(new Error(`Unhandled export type: ${type}`));
};
