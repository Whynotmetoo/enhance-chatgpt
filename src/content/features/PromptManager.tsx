import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  BookmarkIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

const promptTriggerHostAttribute = "data-ecg-prompt-trigger-host";
const promptPanelHostAttribute = "data-ecg-prompt-panel-host";
const promptComposerLayerClass = "ecg-prompt-composer-layer";

type PromptComposerAnchors = {
  panelHost: HTMLElement;
  triggerHost: HTMLElement;
};

type PromptEditorMode = { kind: "create" } | { kind: "edit"; promptId: string };

type PromptDraft = {
  body: string;
  submitted: boolean;
  title: string;
};

type PromptEditorProps = {
  bodyError: string | null;
  draft: PromptDraft;
  mode: PromptEditorMode;
  onCancel: () => void;
  onChange: (draft: PromptDraft) => void;
  onSave: () => void;
  titleError: string | null;
  titleInputRef: RefObject<HTMLInputElement | null>;
};

function createPromptId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function emptyDraft(): PromptDraft {
  return { body: "", submitted: false, title: "" };
}

function draftHasContent(draft: PromptDraft): boolean {
  return draft.title.trim().length > 0 || draft.body.trim().length > 0;
}

function IconButton({
  children,
  label,
  onClick
}: {
  children: ReactElement;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={label}
          className="ecg-prompt-icon-button"
          type="button"
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="ecg-prompt-tooltip" side="top" sideOffset={7}>
          {label}
          <Tooltip.Arrow className="ecg-prompt-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function PromptEditor({
  bodyError,
  draft,
  mode,
  onCancel,
  onChange,
  onSave,
  titleError,
  titleInputRef
}: PromptEditorProps): ReactElement {
  const titleId = `ecg-prompt-${mode.kind}-title`;
  const bodyId = `ecg-prompt-${mode.kind}-body`;

  return (
    <div className="ecg-prompt-editor">
      <div className="ecg-prompt-field">
        <label htmlFor={titleId}>Title</label>
        <input
          aria-invalid={Boolean(titleError)}
          className="ecg-prompt-input"
          id={titleId}
          maxLength={120}
          placeholder="Name this prompt"
          ref={titleInputRef}
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
        {titleError ? <span className="ecg-prompt-error">{titleError}</span> : null}
      </div>
      <div className="ecg-prompt-field">
        <label htmlFor={bodyId}>Prompt</label>
        <textarea
          aria-invalid={Boolean(bodyError)}
          className="ecg-prompt-textarea"
          id={bodyId}
          placeholder="Write the reusable prompt..."
          rows={6}
          value={draft.body}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
        />
        {bodyError ? <span className="ecg-prompt-error">{bodyError}</span> : null}
      </div>
      <div className="ecg-prompt-editor-actions">
        <button className="ecg-prompt-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="ecg-prompt-primary" type="button" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

function usePromptComposerAnchors(): PromptComposerAnchors | null {
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
      composerLayers.forEach((layer) => layer.classList.remove(promptComposerLayerClass));
    };
  }, []);

  return anchors;
}

export function PromptManager(): ReactElement | null {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editorMode, setEditorMode] = useState<PromptEditorMode | null>(null);
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const anchors = usePromptComposerAnchors();

  const hasPrompts = prompts.length > 0;
  const activePrompt = useMemo(
    () => prompts[Math.min(activeIndex, Math.max(prompts.length - 1, 0))],
    [activeIndex, prompts]
  );
  const editedPrompt = useMemo(
    () =>
      editorMode?.kind === "edit"
        ? prompts.find((prompt) => prompt.id === editorMode.promptId) ?? null
        : null,
    [editorMode, prompts]
  );
  const hasBlockingEditor = editorMode !== null;
  const hasUnsavedDraft = useMemo(() => {
    if (!editorMode) {
      return false;
    }

    if (editorMode.kind === "create") {
      return draftHasContent(draft);
    }

    return Boolean(
      editedPrompt &&
        (draft.title !== editedPrompt.title || draft.body !== editedPrompt.body)
    );
  }, [draft, editedPrompt, editorMode]);
  const titleError = draft.submitted && draft.title.trim() === "" ? "Title is required" : null;
  const bodyError = draft.submitted && draft.body.trim() === "" ? "Prompt is required" : null;

  useEffect(() => {
    void loadPrompts().then(setPrompts);
  }, []);

  useEffect(() => {
    if (!editorMode) {
      return;
    }

    window.requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [editorMode]);

  useEffect(() => {
    if (!isOpen || !anchors) {
      return;
    }

    const containsPromptManager = (target: EventTarget | null): boolean => {
      const input = findPromptInput();

      return Boolean(
        target instanceof Node &&
          (anchors.panelHost.contains(target) ||
            anchors.triggerHost.contains(target) ||
            (input && input.contains(target)))
      );
    };

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!hasBlockingEditor && deletePromptId === null && !containsPromptManager(event.target)) {
        setIsOpen(false);
      }
    };

    const closeOnOutsideFocus = (event: FocusEvent) => {
      if (!hasBlockingEditor && deletePromptId === null && !containsPromptManager(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("focusin", closeOnOutsideFocus, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("focusin", closeOnOutsideFocus, true);
    };
  }, [anchors, deletePromptId, hasBlockingEditor, isOpen]);

  useEffect(() => {
    if (!hasUnsavedDraft) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const confirmNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchors?.panelHost.contains(anchor) || anchors?.triggerHost.contains(anchor)) {
        return;
      }

      if (!window.confirm("Discard unsaved prompt changes?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [anchors, hasUnsavedDraft]);

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

      if (hasBlockingEditor) {
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
  }, [activePrompt, hasBlockingEditor, isOpen, prompts.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [isOpen]);

  async function persist(nextPrompts: SavedPrompt[]): Promise<void> {
    setPrompts(nextPrompts);
    await savePrompts(nextPrompts);
  }

  function insertPrompt(prompt: SavedPrompt): void {
    if (hasBlockingEditor) {
      return;
    }

    const input = findPromptInput();
    if (!input) {
      return;
    }

    const current = readPromptInput(input);
    writePromptInput(input, composeInsertedText(current, prompt.body));
    setIsOpen(false);
  }

  async function deletePrompt(promptId: string): Promise<void> {
    if (hasBlockingEditor) {
      return;
    }

    await persist(prompts.filter((prompt) => prompt.id !== promptId));
    setDeletePromptId(null);
  }

  function openCreateEditor(): void {
    if (hasBlockingEditor) {
      titleInputRef.current?.focus();
      return;
    }

    const input = findPromptInput();
    const body = input ? readPromptInput(input).replace(/\/\s*$/, "").trim() : "";
    setDraft({ body, submitted: false, title: "" });
    setEditorMode({ kind: "create" });
    setIsOpen(true);
  }

  function openEditEditor(prompt: SavedPrompt): void {
    if (hasBlockingEditor) {
      titleInputRef.current?.focus();
      return;
    }

    setDraft({ body: prompt.body, submitted: false, title: prompt.title });
    setEditorMode({ kind: "edit", promptId: prompt.id });
    setIsOpen(true);
  }

  function cancelEditor(): void {
    setDraft(emptyDraft());
    setEditorMode(null);
    setIsOpen(true);
  }

  async function saveEditor(): Promise<void> {
    const trimmedTitle = draft.title.trim();
    const trimmedBody = draft.body.trim();

    if (!trimmedTitle || !trimmedBody) {
      setDraft((current) => ({ ...current, submitted: true }));
      return;
    }

    const now = new Date().toISOString();

    if (editorMode?.kind === "create") {
      await persist([
        {
          id: createPromptId(),
          title: trimmedTitle,
          body: trimmedBody,
          createdAt: now
        },
        ...prompts
      ]);
    }

    if (editorMode?.kind === "edit") {
      await persist(
        prompts.map((prompt) =>
          prompt.id === editorMode.promptId
            ? { ...prompt, title: trimmedTitle, body: trimmedBody, updatedAt: now }
            : prompt
        )
      );
    }

    setDraft(emptyDraft());
    setEditorMode(null);
    setIsOpen(true);
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (hasBlockingEditor) {
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
  }

  function togglePanel(): void {
    if (!isOpen) {
      setIsOpen(true);
      return;
    }

    if (hasBlockingEditor) {
      titleInputRef.current?.focus();
      return;
    }

    setIsOpen(false);
  }

  if (!anchors) {
    return null;
  }

  const trigger = createPortal(
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            aria-expanded={isOpen}
            aria-label="Open prompt manager"
            className="ecg-prompt-trigger"
            type="button"
            onClick={togglePanel}
          >
            <BookmarkIcon />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="ecg-prompt-tooltip" side="top" sideOffset={7}>
            Prompt manager
            <Tooltip.Arrow className="ecg-prompt-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>,
    anchors.triggerHost
  );

  const promptToDelete = prompts.find((prompt) => prompt.id === deletePromptId) ?? null;
  const panel = isOpen
    ? createPortal(
        <Tooltip.Provider delayDuration={350}>
          <div
            aria-label="Prompt manager"
            className="ecg-prompt-panel"
            role="dialog"
            onKeyDown={handlePanelKeyDown}
          >
            <div className="ecg-prompt-list" role="list">
              {hasPrompts ? (
                prompts.map((prompt, index) => (
                  <div className="ecg-prompt-list-entry" key={prompt.id}>
                    {editorMode?.kind === "edit" && editorMode.promptId === prompt.id ? (
                      <PromptEditor
                        bodyError={bodyError}
                        draft={draft}
                        mode={editorMode}
                        titleError={titleError}
                        titleInputRef={titleInputRef}
                        onCancel={cancelEditor}
                        onChange={setDraft}
                        onSave={() => void saveEditor()}
                      />
                    ) : null}
                    <div
                      className="ecg-prompt-item"
                      data-active={activeIndex === index}
                      role="listitem"
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <button
                        className="ecg-prompt-select"
                        type="button"
                        onClick={() => insertPrompt(prompt)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            insertPrompt(prompt);
                          }
                        }}
                      >
                        <span className="ecg-prompt-copy">
                          <span className="ecg-prompt-title">{prompt.title}</span>
                          <span className="ecg-prompt-preview">{preview(prompt.body)}</span>
                        </span>
                      </button>
                      <span className="ecg-prompt-actions">
                        <IconButton label={`Edit prompt: ${prompt.title}`} onClick={() => openEditEditor(prompt)}>
                          <Pencil1Icon />
                        </IconButton>
                        <IconButton label={`Delete prompt: ${prompt.title}`} onClick={() => setDeletePromptId(prompt.id)}>
                          <TrashIcon />
                        </IconButton>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="ecg-prompt-empty">No saved prompts</div>
              )}
            </div>
            {editorMode?.kind === "create" ? (
              <PromptEditor
                bodyError={bodyError}
                draft={draft}
                mode={editorMode}
                titleError={titleError}
                titleInputRef={titleInputRef}
                onCancel={cancelEditor}
                onChange={setDraft}
                onSave={() => void saveEditor()}
              />
            ) : null}
            {!editorMode ? (
              <div className="ecg-prompt-footer">
                <IconButton label="Create prompt" onClick={openCreateEditor}>
                  <PlusIcon />
                </IconButton>
              </div>
            ) : null}
            <AlertDialog.Root
              open={Boolean(promptToDelete)}
              onOpenChange={(open) => {
                if (!open) {
                  setDeletePromptId(null);
                }
              }}
            >
              <AlertDialog.Portal>
                <AlertDialog.Overlay className="ecg-prompt-alert-overlay" />
                <AlertDialog.Content className="ecg-prompt-alert">
                  <AlertDialog.Title className="ecg-prompt-alert-title">
                    Delete prompt?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="ecg-prompt-alert-description">
                    This removes {promptToDelete?.title ? `"${promptToDelete.title}"` : "this prompt"} from your saved prompts.
                  </AlertDialog.Description>
                  <div className="ecg-prompt-alert-actions">
                    <AlertDialog.Cancel asChild>
                      <button className="ecg-prompt-secondary" type="button">
                        Cancel
                      </button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button
                        className="ecg-prompt-danger"
                        type="button"
                        onClick={() => {
                          if (promptToDelete) {
                            void deletePrompt(promptToDelete.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        </Tooltip.Provider>,
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
