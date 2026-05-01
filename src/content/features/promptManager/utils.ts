import type { PromptDraft } from "./types";

export function createPromptId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function composeInsertedText(current: string, promptBody: string): string {
  const withoutSlash = current.replace(/\/\s*$/, "").trimEnd();

  if (!withoutSlash) {
    return promptBody;
  }

  return `${withoutSlash}\n\n${promptBody}`;
}

export function emptyDraft(): PromptDraft {
  return { body: "", submitted: false, title: "" };
}

export function draftHasContent(draft: PromptDraft): boolean {
  return draft.title.trim().length > 0 || draft.body.trim().length > 0;
}
