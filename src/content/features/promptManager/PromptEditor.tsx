import type { ReactElement, RefObject } from "react";
import type { PromptDraft, PromptEditorMode } from "./types";

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

export function PromptEditor({
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
  const isSaveDisabled = draft.title.trim() === "" || draft.body.trim() === "";

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
        <button
          className="ecg-prompt-primary"
          data-invalid={isSaveDisabled ? "true" : undefined}
          disabled={isSaveDisabled}
          type="button"
          onClick={onSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
