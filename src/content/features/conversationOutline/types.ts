export type OutlineKind = "user" | "assistant" | "heading";
export type OutlineMode = "api" | "dom";

export type OutlineItem = {
  id: string;
  label: string;
  level: number;
  kind: OutlineKind;
  messageId: string | null;
  headingIndex: number | null;
  element: HTMLElement | null;
};

export type OutlineSource = {
  conversationId: string | null;
  mode: OutlineMode;
  items: OutlineItem[];
};

export type PendingScroll = {
  attempts: number;
  id: string;
  index: number;
};

export type ConversationLocation = {
  conversationId: string | null;
  changedAt: number;
};

export type RenderedOutlineItem = OutlineItem & {
  hasChildren: boolean;
  originalIndex: number;
};
