import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedPrompt } from "../../shared/promptTypes";
import { loadPrompts, savePrompts } from "../lib/browserStorage";
import {
  findPromptComposerForm,
  findPromptInput,
  isPromptInputTarget,
  readPromptInput,
  writePromptInput
} from "../lib/dom";
import { CloseIcon, PlusIcon, PromptIcon } from "../lib/icons";

const maxTitleLength = 54;
const promptTriggerHostAttribute = "data-ecg-prompt-trigger-host";
const promptPanelHostAttribute = "data-ecg-prompt-panel-host";

type PromptComposerAnchors = {
  panelHost: HTMLElement;
  triggerHost: HTMLElement;
};

function createPromptId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFromBody(body: string): string {
  const firstLine = body.trim().split(/\n+/)[0] ?? "Saved prompt";
  return firstLine.length > maxTitleLength
    ? `${firstLine.slice(0, maxTitleLength - 1)}...`
    : firstLine;
}

function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

function composeInsertedText(current: string, promptBody: string): string {
  const withoutSlash = current.replace(/\/\s*$/, "").trimEnd();

  if (!withoutSlash) {
    return promptBody;
  }

  return `${withoutSlash}\n\n${promptBody}`;
}

function sameAnchors(current: PromptComposerAnchors | null, next: PromptComposerAnchors | null): boolean {
  return current?.triggerHost === next?.triggerHost && current?.panelHost === next?.panelHost;
}

function usePromptComposerAnchors(): PromptComposerAnchors | null {
  const [anchors, setAnchors] = useState<PromptComposerAnchors | null>(null);

  useEffect(() => {
    const createdHosts = new Set<HTMLElement>();
    let frame = 0;

    const syncAnchors = () => {
      const input = findPromptInput();
      const form = findPromptComposerForm(input);

      if (!form) {
        setAnchors((current) => (current === null ? current : null));
        return;
      }

      form.classList.add("ecg-prompt-composer-anchor");

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

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      createdHosts.forEach((host) => {
        if (host.childElementCount === 0) {
          host.remove();
        }
      });
    };
  }, []);

  return anchors;
}

export function PromptManager(): ReactElement | null {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const anchors = usePromptComposerAnchors();

  const hasPrompts = prompts.length > 0;
  const activePrompt = useMemo(
    () => prompts[Math.min(activeIndex, Math.max(prompts.length - 1, 0))],
    [activeIndex, prompts]
  );

  useEffect(() => {
    void loadPrompts().then(setPrompts);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPromptInputTarget(event.target)) {
        return;
      }

      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        readPromptInput(findPromptInput() ?? (event.target as HTMLElement)).trim() === ""
      ) {
        window.setTimeout(() => setIsOpen(true), 0);
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(prompts.length - 1, 0)));
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }

      if (event.key === "Enter" && activePrompt) {
        event.preventDefault();
        insertPrompt(activePrompt);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activePrompt, isOpen, prompts.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [isOpen]);

  async function persist(nextPrompts: SavedPrompt[]): Promise<void> {
    setPrompts(nextPrompts);
    await savePrompts(nextPrompts);
  }

  function insertPrompt(prompt: SavedPrompt): void {
    const input = findPromptInput();
    if (!input) {
      return;
    }

    const current = readPromptInput(input);
    writePromptInput(input, composeInsertedText(current, prompt.body));
    setIsOpen(false);
  }

  async function deletePrompt(promptId: string): Promise<void> {
    await persist(prompts.filter((prompt) => prompt.id !== promptId));
  }

  async function saveCurrentInput(): Promise<void> {
    const input = findPromptInput();
    if (!input) {
      return;
    }

    const body = readPromptInput(input).replace(/\/\s*$/, "").trim();
    if (!body) {
      return;
    }

    const now = new Date().toISOString();
    const prompt: SavedPrompt = {
      id: createPromptId(),
      title: titleFromBody(body),
      body,
      createdAt: now
    };

    await persist([prompt, ...prompts]);
    setIsOpen(true);
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(prompts.length - 1, 0)));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }

    if (event.key === "Enter" && activePrompt) {
      event.preventDefault();
      insertPrompt(activePrompt);
    }
  }

  if (!anchors) {
    return null;
  }

  const trigger = createPortal(
    <button
      aria-expanded={isOpen}
      aria-label="Open saved prompts"
      className="ecg-prompt-trigger"
      type="button"
      onClick={() => setIsOpen((value) => !value)}
    >
      <PromptIcon />
    </button>,
    anchors.triggerHost
  );

  const panel = isOpen
    ? createPortal(
        <div
          aria-label="Saved prompts"
          className="ecg-prompt-panel"
          role="listbox"
          onKeyDown={handlePanelKeyDown}
        >
          <div className="ecg-prompt-list">
            {hasPrompts ? (
              prompts.map((prompt, index) => (
                <div
                  aria-selected={activeIndex === index}
                  className="ecg-prompt-item"
                  key={prompt.id}
                  role="option"
                  tabIndex={0}
                  onClick={() => insertPrompt(prompt)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      insertPrompt(prompt);
                    }
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="ecg-prompt-copy">
                    <span className="ecg-prompt-title">{prompt.title}</span>
                    <span className="ecg-prompt-preview">{preview(prompt.body)}</span>
                  </span>
                  <button
                    aria-label={`Delete prompt: ${prompt.title}`}
                    className="ecg-prompt-delete"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void deletePrompt(prompt.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        void deletePrompt(prompt.id);
                      }
                    }}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))
            ) : (
              <div className="ecg-prompt-empty">No saved prompts</div>
            )}
          </div>
          <div className="ecg-prompt-footer">
            <button className="ecg-save-prompt" type="button" onClick={saveCurrentInput}>
              <PlusIcon />
              Save current input as prompt
            </button>
          </div>
        </div>,
        anchors.panelHost
      )
    : null;

  return (
    <>
      {trigger}
      {panel}
    </>
  );
}
