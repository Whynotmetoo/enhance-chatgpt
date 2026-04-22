import { fetchConversationInPageContext } from "../../lib/chatGptApiBridge";
import type { OutlineItem } from "./types";
import { isRecord, normalizeLabel, numberValue, stringValue } from "./utils";

type ApiAuthorRole = "user" | "assistant" | "system" | "tool";

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

type OrderedApiMessage = {
  nodeId: string;
  message: ApiMessage;
};

type MarkdownHeading = {
  label: string;
  level: number;
};

type MarkdownFence = {
  marker: "`" | "~";
  length: number;
};

function apiMessageRole(message: ApiMessage): ApiAuthorRole | null {
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
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
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

function currentNodePath(conversation: ApiConversation, mapping: Map<string, ApiMappingNode>): string[] {
  const currentNodeId = stringValue(conversation.current_node);
  if (!currentNodeId || !mapping.has(currentNodeId)) {
    return [];
  }

  const path: string[] = [];
  const seen = new Set<string>();
  let nodeId: string | null = currentNodeId;

  while (nodeId && mapping.has(nodeId) && !seen.has(nodeId)) {
    seen.add(nodeId);
    path.push(nodeId);
    nodeId = stringValue(mapping.get(nodeId)?.parent);
  }

  return path.reverse();
}

function orderedApiMessages(conversation: ApiConversation): OrderedApiMessage[] {
  const mapping = apiMapping(conversation);
  const currentPathMessages = currentNodePath(conversation, mapping)
    .map((nodeId) => {
      const message = mapping.get(nodeId)?.message;
      return isRecord(message) ? { nodeId, message: message as ApiMessage } : null;
    })
    .filter((message): message is OrderedApiMessage => message !== null);

  if (currentPathMessages.length > 0) {
    return currentPathMessages;
  }

  const seen = new Set<string>();
  const orderedMessages: OrderedApiMessage[] = [];

  const visit = (nodeId: string) => {
    if (seen.has(nodeId)) {
      return;
    }

    const node = mapping.get(nodeId);
    if (!node) {
      return;
    }

    seen.add(nodeId);
    if (isRecord(node.message)) {
      orderedMessages.push({ nodeId, message: node.message as ApiMessage });
    }

    nodeChildren(node).forEach(visit);
  };

  rootNodeIds(mapping).forEach(visit);

  const unvisitedMessages = Array.from(mapping.entries())
    .filter(([id, node]) => !seen.has(id) && isRecord(node.message))
    .map(([nodeId, node]) => ({ nodeId, message: node.message as ApiMessage }))
    .sort((a, b) => numberValue(a.message.create_time) - numberValue(b.message.create_time));

  return [...orderedMessages, ...unvisitedMessages];
}

function messageId(message: ApiMessage, fallback: string): string {
  return stringValue(message.id) ?? fallback;
}

function itemsFromApiConversation(conversation: ApiConversation): OutlineItem[] {
  const items: OutlineItem[] = [];
  let userIndex = 0;
  let answerIndex = 0;

  orderedApiMessages(conversation).forEach(({ nodeId, message }, index) => {
    if (isHiddenApiMessage(message)) {
      return;
    }

    const role = apiMessageRole(message);
    if (role !== "user" && role !== "assistant") {
      return;
    }

    const id = nodeId || messageId(message, `message-${index}`);
    const text = textFromMessage(message);

    if (role === "user") {
      userIndex += 1;
      answerIndex = 0;
      items.push({
        id: `outline-user-${id}`,
        label: normalizeLabel(text, `User message ${userIndex}`),
        level: 1,
        kind: "user",
        messageId: id,
        headingIndex: null,
        element: null
      });
      return;
    }

    if (!isTextualMessage(message) || !text.trim()) {
      return;
    }

    answerIndex += 1;
    const headings = markdownHeadings(text);
    if (headings.length === 0) {
      return;
    }

    const topHeadingLevel = Math.min(...headings.map((heading) => heading.level));
    headings.forEach((heading, headingIndex) => {
      if (heading.level !== topHeadingLevel) {
        return;
      }

      items.push({
        id: `outline-heading-${id}-${headingIndex}`,
        label: normalizeLabel(heading.label, `ChatGPT response ${answerIndex}`),
        level: 2,
        kind: "heading",
        messageId: id,
        headingIndex,
        element: null
      });
    });
  });

  return items;
}

async function fetchConversationOutline(
  conversationId: string,
  signal: AbortSignal,
  minCapturedAt: number
): Promise<OutlineItem[]> {
  const conversation = (await fetchConversationInPageContext(
    conversationId,
    signal,
    minCapturedAt
  )) as ApiConversation;
  return itemsFromApiConversation(conversation);
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

export async function fetchConversationOutlineWithRetry(
  conversationId: string,
  signal: AbortSignal,
  minCapturedAt: number
): Promise<OutlineItem[]> {
  const retryDelays = [0, 350, 900];
  let lastError: unknown = null;

  for (const delay of retryDelays) {
    if (delay > 0) {
      await waitForRetry(delay, signal);
    }

    try {
      return await fetchConversationOutline(conversationId, signal, minCapturedAt);
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError ?? new Error("Conversation request failed");
}
