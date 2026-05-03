import { useEffect, useState } from "react";
import { findPromptComposerForm, findPromptInput } from "../../lib/dom";
import type { PromptComposerAnchors } from "./types";

const promptTriggerHostAttribute = "data-ecg-prompt-trigger-host";
const promptPanelHostAttribute = "data-ecg-prompt-panel-host";
const promptPanelSideAttribute = "data-ecg-prompt-panel-side";
const promptComposerLayerClass = "ecg-prompt-composer-layer";

function sameAnchors(current: PromptComposerAnchors | null, next: PromptComposerAnchors | null): boolean {
  return current?.triggerHost === next?.triggerHost && current?.panelHost === next?.panelHost;
}

function syncPanelSide(form: HTMLElement, panelHost: HTMLElement): void {
  const rect = form.getBoundingClientRect();
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  panelHost.setAttribute(promptPanelSideAttribute, spaceBelow > spaceAbove ? "bottom" : "top");
}

export function usePromptComposerAnchors(): PromptComposerAnchors | null {
  const [anchors, setAnchors] = useState<PromptComposerAnchors | null>(null);

  useEffect(() => {
    const createdHosts = new Set<HTMLElement>();
    const composerLayers = new Set<HTMLElement>();
    let frame = 0;

    const syncAnchors = () => {
      const input = findPromptInput();
      const form = findPromptComposerForm(input);

      if (!form) {
        setAnchors((current) => (current === null ? current : null));
        return;
      }

      form.classList.add("ecg-prompt-composer-anchor");
      if (form.parentElement) {
        form.parentElement.classList.add(promptComposerLayerClass);
        composerLayers.add(form.parentElement);
      }

      let triggerHost = form.querySelector<HTMLElement>(`[${promptTriggerHostAttribute}]`);
      if (!triggerHost) {
        triggerHost = document.createElement("div");
        triggerHost.setAttribute(promptTriggerHostAttribute, "true");
        form.append(triggerHost);
        createdHosts.add(triggerHost);
      }

      let panelHost = form.querySelector<HTMLElement>(`[${promptPanelHostAttribute}]`);
      if (!panelHost) {
        panelHost = document.createElement("div");
        panelHost.setAttribute(promptPanelHostAttribute, "true");
        form.append(panelHost);
        createdHosts.add(panelHost);
      }
      syncPanelSide(form, panelHost);

      const nextAnchors = { panelHost, triggerHost };
      setAnchors((current) => (sameAnchors(current, nextAnchors) ? current : nextAnchors));
    };

    const scheduleSyncAnchors = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncAnchors);
    };

    syncAnchors();

    const observer = new MutationObserver(scheduleSyncAnchors);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleSyncAnchors);
    window.addEventListener("scroll", scheduleSyncAnchors, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleSyncAnchors);
      window.removeEventListener("scroll", scheduleSyncAnchors, true);
      createdHosts.forEach((host) => {
        if (host.childElementCount === 0) {
          host.remove();
        }
      });
      composerLayers.forEach((layer) => layer.classList.remove(promptComposerLayerClass));
    };
  }, []);

  return anchors;
}
