import {
  BookmarkIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedPrompt } from "../../shared/promptTypes";
import { AlertModal } from "../components/AlertModal";
import { loadPrompts, savePrompts } from "../lib/browserStorage";
import {
  findPromptInput,
  isPromptInputTarget,
  readPromptInput,
  writePromptInput
} from "../lib/dom";
import { PromptEditor } from "./promptManager/PromptEditor";
import { PromptIconButton } from "./promptManager/PromptIconButton";
import type { PromptDraft, PromptEditorMode } from "./promptManager/types";
import { usePromptComposerAnchors } from "./promptManager/usePromptComposerAnchors";
import { composeInsertedText, createPromptId, draftHasContent, emptyDraft, preview } from "./promptManager/utils";

export function PromptManager(): ReactElement | null {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editorMode, setEditorMode] = useState<PromptEditorMode | null>(null);
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
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

  function closeDeletePromptDialog(): void {
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
  const deletePromptDescription = `This removes ${
    promptToDelete?.title ? `"${promptToDelete.title}"` : "this prompt"
  } from your saved prompts.`;
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
                        <PromptIconButton label={`Edit prompt: ${prompt.title}`} onClick={() => openEditEditor(prompt)}>
                          <Pencil1Icon />
                        </PromptIconButton>
                        <PromptIconButton label={`Delete prompt: ${prompt.title}`} onClick={() => setDeletePromptId(prompt.id)}>
                          <TrashIcon />
                        </PromptIconButton>
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
                <PromptIconButton label="Create prompt" onClick={openCreateEditor}>
                  <PlusIcon />
                </PromptIconButton>
              </div>
            ) : null}
            <AlertModal
              contentClassName="ecg-prompt-alert"
              description={deletePromptDescription}
              descriptionClassName="ecg-prompt-alert-description"
              initialFocusRef={deleteCancelRef}
              open={Boolean(promptToDelete)}
              overlayClassName="ecg-prompt-alert-overlay"
              title="Delete prompt?"
              titleClassName="ecg-prompt-alert-title"
              onClose={closeDeletePromptDialog}
            >
              <div className="ecg-prompt-alert-actions">
                <button
                  className="ecg-prompt-secondary"
                  ref={deleteCancelRef}
                  type="button"
                  onClick={closeDeletePromptDialog}
                >
                  Cancel
                </button>
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
              </div>
            </AlertModal>
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
