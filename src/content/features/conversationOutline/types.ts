export type OutlineKind = "user" | "assistant" | "heading";
export type OutlineMode = "api" | "dom";
export type OutlineNodeRole = "user" | "assistant" | "system" | "tool" | null;

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
  tree: OutlineTree | null;
};

export type OutlineTreeNode = {
  children: string[];
  element: HTMLElement | null;
  id: string;
  outlineItems: OutlineItem[];
  parentId: string | null;
  role: OutlineNodeRole;
};

export type OutlineTree = {
  activeNodeId: string | null;
  conversationId: string;
  nodes: Map<string, OutlineTreeNode>;
  rootIds: string[];
};

export type DomOutlineTurn = {
  element: HTMLElement;
  id: string;
  outlineItems: OutlineItem[];
  role: Extract<OutlineNodeRole, "user" | "assistant">;
};

export type PendingScroll = {
  attempts: number;
  id: string;
  index: number;
};

export type ConversationLocation = {
  conversationId: string | null;
  changedAt: number;
  previousConversationId: string | null;
};

export type RenderedOutlineItem = OutlineItem & {
  hasChildren: boolean;
  originalIndex: number;
};
