export type PromptComposerAnchors = {
  panelHost: HTMLElement;
  triggerHost: HTMLElement;
};

export type PromptEditorMode = { kind: "create" } | { kind: "edit"; promptId: string };

export type PromptDraft = {
  body: string;
  submitted: boolean;
  title: string;
};
