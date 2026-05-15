import { fetchConversationInPageContext } from "../../lib/chatGptApiBridge";
import type { OutlineItem, OutlineNodeRole, OutlineTree, OutlineTreeNode } from "./types";
import { isRecord, normalizeLabel, stringValue } from "./utils";

type ApiMessage = {
  id?: unknown;
  author?: {
    role?: unknown;
  };
  content?: unknown;
  create_time?: unknown;
  metadata?: unknown;
};

type ApiMappingNode = {
  id?: unknown;
  message?: unknown;
  parent?: unknown;
  children?: unknown;
};

type ApiConversation = {
  current_node?: unknown;
  mapping?: unknown;
};

type MarkdownHeading = {
  label: string;
  level: number;
};

type MarkdownFence = {
  marker: "`" | "~";
  length: number;
};

function apiMessageRole(message: ApiMessage): OutlineNodeRole {
  const role = message.author?.role;
  return role === "user" || role === "assistant" || role === "system" || role === "tool" ? role : null;
}

function isHiddenApiMessage(message: ApiMessage): boolean {
  const metadata = message.metadata;
  if (!isRecord(metadata)) {
    return false;
  }

  return (
    metadata.is_visually_hidden_from_conversation === true ||
    metadata.is_hidden === true ||
    metadata.hidden === true
  );
}

function textFromContentPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }

  if (!isRecord(part)) {
    return "";
  }

  const contentType = part.content_type;
  if (contentType === "text" && typeof part.text === "string") {
    return part.text;
  }

  if (contentType === undefined && typeof part.text === "string") {
    return part.text;
  }

  return "";
}

function textFromMessage(message: ApiMessage): string {
  const content = message.content;
  if (!isRecord(content)) {
    return "";
  }

  const contentType = content.content_type;
  if (contentType !== "text" && contentType !== "multimodal_text") {
    return "";
  }

  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts.map(textFromContentPart).filter(Boolean).join("\n\n");
}

function isTextualMessage(message: ApiMessage): boolean {
  const content = message.content;
  if (!isRecord(content)) {
    return false;
  }

  return content.content_type === "text" || content.content_type === "multimodal_text";
}

function cleanMarkdownHeadingLabel(label: string): string {
  return label
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownFence(line: string): MarkdownFence | null {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }

  const fence = match[1];
  return {
    marker: fence[0] as "`" | "~",
    length: fence.length
  };
}

function markdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let activeFence: MarkdownFence | null = null;

  markdown.split(/\r?\n/).forEach((line) => {
    const fence = markdownFence(line);
    if (fence && activeFence) {
      if (fence.marker === activeFence.marker && fence.length >= activeFence.length) {
        activeFence = null;
      }

      return;
    }

    if (fence) {
      activeFence = fence;
      return;
    }

    if (activeFence) {
      return;
    }

    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      return;
    }

    const label = cleanMarkdownHeadingLabel(match[2]);
    if (!label) {
      return;
    }

    headings.push({
      label,
      level: match[1].length
    });
  });

  return headings;
}

function apiMapping(conversation: ApiConversation): Map<string, ApiMappingNode> {
  const mapping = new Map<string, ApiMappingNode>();
  if (!isRecord(conversation.mapping)) {
    return mapping;
  }

  Object.entries(conversation.mapping).forEach(([id, node]) => {
    if (isRecord(node)) {
      mapping.set(id, node as ApiMappingNode);
    }
  });

  return mapping;
}

function nodeChildren(node: ApiMappingNode): string[] {
  return Array.isArray(node.children) ? node.children.filter((child) => typeof child === "string") : [];
}

function rootNodeIds(mapping: Map<string, ApiMappingNode>): string[] {
  const roots = Array.from(mapping.entries())
    .filter(([, node]) => {
      const parent = stringValue(node.parent);
      return parent === null || !mapping.has(parent);
    })
    .map(([id]) => id);

  return roots.length > 0 ? roots : Array.from(mapping.keys());
}

function messageId(message: ApiMessage, fallback: string): string {
  return stringValue(message.id) ?? fallback;
}

function outlineItemsFromApiMessage(nodeId: string, message: ApiMessage): OutlineItem[] {
  const items: OutlineItem[] = [];

  if (isHiddenApiMessage(message)) {
    return items;
  }

  const role = apiMessageRole(message);
  if (role !== "user" && role !== "assistant") {
    return items;
  }

  const id = nodeId || messageId(message, "message");
  const text = textFromMessage(message);

  if (role === "user") {
    items.push({
      id: `outline-user-${id}`,
      label: normalizeLabel(text, "User message"),
      level: 1,
      kind: "user",
      messageId: id,
      headingIndex: null,
      element: null,
      source: "api"
    });
    return items;
  }

  if (!isTextualMessage(message) || !text.trim()) {
    return items;
  }

  const headings = markdownHeadings(text);
  if (headings.length === 0) {
    return items;
  }

  const topHeadingLevel = Math.min(...headings.map((heading) => heading.level));
  headings.forEach((heading, headingIndex) => {
    if (heading.level !== topHeadingLevel) {
      return;
    }

    items.push({
      id: `outline-heading-${id}-${headingIndex}`,
      label: normalizeLabel(heading.label, "ChatGPT response"),
      level: 2,
      kind: "heading",
      messageId: id,
      headingIndex,
      element: null,
      source: "api"
    });
  });

  return items;
}

function fallbackActiveNodeId(nodes: ReadonlyMap<string, OutlineTreeNode>, roots: string[]): string | null {
  const leaves = Array.from(nodes.values()).filter((node) => node.children.length === 0);
  return leaves[leaves.length - 1]?.id ?? roots[roots.length - 1] ?? null;
}

function treeFromApiConversation(conversationId: string, conversation: ApiConversation): OutlineTree | null {
  const mapping = apiMapping(conversation);
  if (mapping.size === 0) {
    return null;
  }

  const nodes = new Map<string, OutlineTreeNode>();

  mapping.forEach((node, nodeId) => {
    const message = isRecord(node.message) ? (node.message as ApiMessage) : null;
    const parentId = stringValue(node.parent);

    nodes.set(nodeId, {
      children: nodeChildren(node).filter((childId) => mapping.has(childId)),
      element: null,
      id: nodeId,
      outlineItems: message ? outlineItemsFromApiMessage(nodeId, message) : [],
      parentId: parentId && mapping.has(parentId) ? parentId : null,
      role: message ? apiMessageRole(message) : null
    });
  });

  const roots = rootNodeIds(mapping);
  const currentNodeId = stringValue(conversation.current_node);

  return {
    activeNodeId: currentNodeId && nodes.has(currentNodeId) ? currentNodeId : fallbackActiveNodeId(nodes, roots),
    conversationId,
    nodes,
    rootIds: roots
  };
}

async function fetchConversationOutlineTree(
  conversationId: string,
  signal: AbortSignal,
  minCapturedAt: number
): Promise<OutlineTree | null> {
  const conversation = (await fetchConversationInPageContext(
    conversationId,
    signal,
    minCapturedAt
  )) as ApiConversation;
  return treeFromApiConversation(conversationId, conversation);
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new Error("Conversation request aborted"));
      },
      { once: true }
    );
  });
}

export async function fetchConversationOutlineTreeWithRetry(
  conversationId: string,
  signal: AbortSignal,
  minCapturedAt: number
): Promise<OutlineTree | null> {
  const retryDelays = [0, 350, 900];
  let lastError: unknown = null;

  for (const delay of retryDelays) {
    if (delay > 0) {
      await waitForRetry(delay, signal);
    }

    try {
      return await fetchConversationOutlineTree(conversationId, signal, minCapturedAt);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError ?? new Error("Conversation request failed");
}
