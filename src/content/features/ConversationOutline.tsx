import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchConversationInPageContext } from "../lib/chatGptApiBridge";
import { conversationIdFromHref, debounce, isVisible } from "../lib/dom";

type OutlineKind = "user" | "assistant" | "heading";
type OutlineMode = "api" | "dom";

type OutlineItem = {
  id: string;
  label: string;
  level: number;
  kind: OutlineKind;
  messageId: string | null;
  headingIndex: number | null;
  element: HTMLElement | null;
};

type OutlineSource = {
  conversationId: string | null;
  mode: OutlineMode;
  items: OutlineItem[];
};

type ConversationLocation = {
  conversationId: string | null;
  changedAt: number;
};

type RenderedOutlineItem = OutlineItem & {
  hasChildren: boolean;
  originalIndex: number;
};

type OutlineDepthStyle = CSSProperties & {
  "--ecg-depth": number;
};

const outlineIdAttribute = "data-ecg-outline-id";
const maxLabelLength = 88;
const turnSelector = "[data-turn='user'], [data-turn='assistant']";
const messageSelector = "[data-message-author-role='user'], [data-message-author-role='assistant']";
const answerHeadingSelector = ".markdown :is(h1, h2, h3, h4, h5, h6)";
const conversationPathPattern = /^\/c\/([^/?#]+)/;
const locationChangeSource = "enhance-chatgpt:location-changed";
const outlineScrollTopOffset = 90;

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

type MarkdownHeading = {
  label: string;
  level: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function headingLevel(element: HTMLElement): number {
  const level = Number(element.tagName.replace("H", ""));
  return Number.isFinite(level) ? Math.min(Math.max(level, 1), 6) : 2;
}

function normalizeLabel(text: string | null | undefined, fallback: string): string {
  const normalized = text?.replace(/\s+/g, " ").trim();
  const label = normalized && normalized.length > 0 ? normalized : fallback;

  return label.length > maxLabelLength ? `${label.slice(0, maxLabelLength - 1)}...` : label;
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function compareDocumentOrder(a: HTMLElement, b: HTMLElement): number {
  if (a === b) {
    return 0;
  }

  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
}

function collectTurnElements(): HTMLElement[] {
  const root = document.querySelector<HTMLElement>("#thread") ?? document.querySelector<HTMLElement>("main");
  if (!root) {
    return [];
  }

  const turns = Array.from(root.querySelectorAll<HTMLElement>(turnSelector));
  if (turns.length > 0) {
    return turns.sort(compareDocumentOrder);
  }

  const elements = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>(messageSelector).forEach((message) => {
    const turn =
      message.closest<HTMLElement>("[data-turn-id]") ??
      message.closest<HTMLElement>("section") ??
      message.closest<HTMLElement>("article") ??
      message;

    elements.add(turn);
  });

  return Array.from(elements).sort(compareDocumentOrder);
}

function conversationMutationRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("#thread") ?? document.querySelector<HTMLElement>("main") ?? document.body;
}

function conversationIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    const match = parsedUrl.pathname.match(conversationPathPattern);
    return match?.[1] ?? conversationIdFromHref(parsedUrl.href);
  } catch {
    return conversationIdFromHref(url);
  }
}

function conversationIdFromLocation(): string | null {
  return conversationIdFromUrl(window.location.href);
}

function turnRole(turn: HTMLElement): "user" | "assistant" | null {
  const turnValue = turn.getAttribute("data-turn");
  if (turnValue === "user" || turnValue === "assistant") {
    return turnValue;
  }

  const messageRole = turn.querySelector<HTMLElement>(messageSelector)?.getAttribute("data-message-author-role");
  return messageRole === "user" || messageRole === "assistant" ? messageRole : null;
}

function stableOutlineId(element: HTMLElement, prefix: string, index: number): string {
  const existing = element.getAttribute(outlineIdAttribute);
  if (existing) {
    return existing;
  }

  const sectionId =
    element.getAttribute("data-section-id") ??
    element.closest<HTMLElement>("[data-section-id]")?.getAttribute("data-section-id");
  const messageId =
    element.closest<HTMLElement>("[data-message-id]")?.getAttribute("data-message-id") ??
    element.closest<HTMLElement>("[data-turn-id]")?.getAttribute("data-turn-id");
  const start = element.getAttribute("data-start");
  const id = `outline-${prefix}-${sectionId ?? messageId ?? "item"}-${start ?? index}`;

  element.setAttribute(outlineIdAttribute, id);
  return id;
}

function messageIdFromTurn(turn: HTMLElement): string | null {
  return (
    turn.querySelector<HTMLElement>("[data-message-id]")?.getAttribute("data-message-id") ??
    turn.getAttribute("data-turn-id")
  );
}

function userLabel(turn: HTMLElement, index: number): string {
  const source =
    turn.querySelector<HTMLElement>("[data-message-author-role='user'] .whitespace-pre-wrap") ??
    turn.querySelector<HTMLElement>("[data-message-author-role='user']") ??
    turn;

  return normalizeLabel(source.textContent, `User message ${index}`);
}

function answerStructureItems(turn: HTMLElement, answerIndex: number): OutlineItem[] {
  const headings = Array.from(turn.querySelectorAll<HTMLElement>(answerHeadingSelector))
    .filter(isVisible)
    .sort(compareDocumentOrder);

  if (headings.length === 0) {
    return [];
  }

  const topHeadingLevel = Math.min(...headings.map(headingLevel));

  return headings
    .map((element, headingIndex) => ({ element, headingIndex }))
    .filter(({ element }) => headingLevel(element) === topHeadingLevel)
    .map(({ element, headingIndex }) => ({
      id: stableOutlineId(element, "heading", headingIndex),
      label: normalizeLabel(element.textContent, `ChatGPT response ${answerIndex}`),
      level: 2,
      kind: "heading",
      messageId: messageIdFromTurn(turn),
      headingIndex,
      element
    }));
}

function collectDomOutlineItems(): OutlineItem[] {
  const items: OutlineItem[] = [];
  let userIndex = 0;
  let answerIndex = 0;

  collectTurnElements().forEach((turn) => {
    const role = turnRole(turn);

    if (role === "user") {
      userIndex += 1;
      answerIndex = 0;
      items.push({
        id: stableOutlineId(turn, "user", userIndex),
        label: userLabel(turn, userIndex),
        level: 1,
        kind: "user",
        messageId: messageIdFromTurn(turn),
        headingIndex: null,
        element: turn
      });
      return;
    }

    if (role === "assistant") {
      answerIndex += 1;
      items.push(...answerStructureItems(turn, answerIndex));
    }
  });

  return items.filter((item) => item.element && isVisible(item.element));
}

function apiMessageRole(message: ApiMessage): ApiAuthorRole | null {
  const role = message.author?.role;
  return role === "user" || role === "assistant" || role === "system" || role === "tool"
    ? role
    : null;
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

function markdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let inFence = false;

  markdown.split(/\r?\n/).forEach((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }

    if (inFence) {
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

function orderedApiMessages(conversation: ApiConversation): ApiMessage[] {
  const mapping = apiMapping(conversation);
  const currentPathMessages = currentNodePath(conversation, mapping)
    .map((nodeId) => mapping.get(nodeId)?.message)
    .filter(isRecord) as ApiMessage[];

  if (currentPathMessages.length > 0) {
    return currentPathMessages;
  }

  const seen = new Set<string>();
  const orderedMessages: ApiMessage[] = [];

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
      orderedMessages.push(node.message as ApiMessage);
    }

    nodeChildren(node).forEach(visit);
  };

  rootNodeIds(mapping).forEach(visit);

  const unvisitedMessages = Array.from(mapping.entries())
    .filter(([id, node]) => !seen.has(id) && isRecord(node.message))
    .map(([, node]) => node.message as ApiMessage)
    .sort((a, b) => numberValue(a.create_time) - numberValue(b.create_time));

  return [...orderedMessages, ...unvisitedMessages];
}

function messageId(message: ApiMessage, fallback: string): string {
  return stringValue(message.id) ?? fallback;
}

function itemsFromApiConversation(conversation: ApiConversation): OutlineItem[] {
  const items: OutlineItem[] = [];
  let userIndex = 0;
  let answerIndex = 0;

  orderedApiMessages(conversation).forEach((message, index) => {
    if (isHiddenApiMessage(message)) {
      return;
    }

    const role = apiMessageRole(message);
    if (role !== "user" && role !== "assistant") {
      return;
    }

    const id = messageId(message, `message-${index}`);
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

async function fetchConversationOutlineWithRetry(
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

function findMessageElement(messageId: string): HTMLElement | null {
  const escaped = cssEscape(messageId);
  const message = document.querySelector<HTMLElement>(`[data-message-id="${escaped}"]`);
  if (message) {
    return message;
  }

  return document.querySelector<HTMLElement>(`[data-turn-id="${escaped}"]`);
}

function bindOutlineItem(item: OutlineItem): OutlineItem {
  if (!item.messageId) {
    return item;
  }

  const message = findMessageElement(item.messageId);
  if (!message) {
    return { ...item, element: null };
  }

  const turn = message.closest<HTMLElement>("[data-turn-id]") ?? message;
  let element: HTMLElement = turn;

  if (item.headingIndex !== null) {
    const headings = Array.from(message.querySelectorAll<HTMLElement>(answerHeadingSelector))
      .filter(isVisible)
      .sort(compareDocumentOrder);
    element = headings[item.headingIndex] ?? turn;
  }

  return { ...item, element };
}

function bindOutlineItems(items: OutlineItem[]): OutlineItem[] {
  return items.map(bindOutlineItem);
}

function nearestMountedElement(items: OutlineItem[], index: number): HTMLElement | null {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const element = items[cursor]?.element;
    if (element) {
      return element;
    }
  }

  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const element = items[cursor]?.element;
    if (element) {
      return element;
    }
  }

  return document.querySelector<HTMLElement>("#thread") ?? document.querySelector<HTMLElement>("main");
}

function isScrollableElement(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  return /auto|scroll|overlay/.test(overflowY) && element.scrollHeight > element.clientHeight;
}

function scrollContainerFor(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (isScrollableElement(parent)) {
      return parent;
    }
  }

  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollToOutlineItem(items: OutlineItem[], index: number): void {
  const element = items[index]?.element ?? nearestMountedElement(items, index);
  if (!element) {
    return;
  }

  const container = scrollContainerFor(element);
  const elementTop = element.getBoundingClientRect().top;
  const containerTop = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
  const top = container.scrollTop + elementTop - containerTop - outlineScrollTopOffset;

  container.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

function itemHasChildren(items: OutlineItem[], index: number): boolean {
  const nextItem = items[index + 1];
  return nextItem ? nextItem.level > items[index].level : false;
}

function visibleOutlineItems(items: OutlineItem[], expandedIds: ReadonlySet<string>): RenderedOutlineItem[] {
  const visibleItems: RenderedOutlineItem[] = [];
  const ancestors: Array<{ level: number; expanded: boolean }> = [];

  items.forEach((item, index) => {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= item.level) {
      ancestors.pop();
    }

    const hasAncestor = ancestors.length > 0;
    const visible =
      item.level <= 1 ||
      (!hasAncestor && visibleItems.length === 0) ||
      (hasAncestor && ancestors.every((ancestor) => ancestor.expanded));
    const hasChildren = itemHasChildren(items, index);

    if (visible) {
      visibleItems.push({ ...item, hasChildren, originalIndex: index });
    }

    ancestors.push({
      level: item.level,
      expanded: expandedIds.has(item.id)
    });
  });

  return visibleItems;
}

function visibleActiveItemId(items: OutlineItem[], index: number, visibleIds: ReadonlySet<string>): string | null {
  const item = items[index];
  if (!item) {
    return null;
  }

  if (visibleIds.has(item.id)) {
    return item.id;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const ancestor = items[cursor];
    if (ancestor.level < item.level && visibleIds.has(ancestor.id)) {
      return ancestor.id;
    }
  }

  return null;
}

function isRightSidePanelElement(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
    if (current.closest(".ecg-outline")) {
      return false;
    }

    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);
    const isVisibleElement =
      style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
    const rightAligned = rect.left > window.innerWidth * 0.52 && rect.right > window.innerWidth - 96;
    const sidePanelSized =
      rect.width >= 280 && rect.width <= window.innerWidth * 0.52 && rect.height >= window.innerHeight * 0.45;

    if (isVisibleElement && rightAligned && sidePanelSized) {
      return true;
    }
  }

  return false;
}

function hasRightSidePanel(): boolean {
  const sampleX = window.innerWidth - 32;
  const sampleYs = [96, window.innerHeight * 0.5, window.innerHeight - 96].filter(
    (y) => y > 0 && y < window.innerHeight
  );

  return sampleYs.some((sampleY) =>
    document
      .elementsFromPoint(sampleX, sampleY)
      .some((element) => element instanceof HTMLElement && isRightSidePanelElement(element))
  );
}

function useRightSidePanel(): boolean {
  const [isOpen, setIsOpen] = useState(() => hasRightSidePanel());

  useEffect(() => {
    const update = () => setIsOpen(hasRightSidePanel());
    const scheduleUpdate = debounce(update, 100);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return isOpen;
}

function useConversationLocation(): ConversationLocation {
  const [location, setLocation] = useState<ConversationLocation>(() => ({
    conversationId: conversationIdFromLocation(),
    changedAt: Date.now() - 1_500
  }));

  useEffect(() => {
    const update = (changedAt = Date.now()) => {
      const conversationId = conversationIdFromLocation();
      setLocation((current) =>
        current.conversationId === conversationId
          ? current
          : {
              conversationId,
              changedAt
            }
      );
    };
    const handleLocationMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data)) {
        return;
      }

      if (event.data.source !== locationChangeSource) {
        return;
      }

      const href = typeof event.data.href === "string" ? event.data.href : window.location.href;
      const changedAt = typeof event.data.changedAt === "number" ? event.data.changedAt : Date.now();
      const conversationId = conversationIdFromUrl(href);
      setLocation((current) =>
        current.conversationId === conversationId
          ? current
          : {
              conversationId,
              changedAt
            }
      );
    };
    const updateFromWindow = () => update();
    const updateFromPoll = () => update(Date.now() - 250);
    const timer = window.setInterval(updateFromPoll, 250);

    window.addEventListener("message", handleLocationMessage);
    window.addEventListener("popstate", updateFromWindow);
    window.addEventListener("hashchange", updateFromWindow);
    update();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", handleLocationMessage);
      window.removeEventListener("popstate", updateFromWindow);
      window.removeEventListener("hashchange", updateFromWindow);
    };
  }, []);

  return location;
}

export function ConversationOutline(): ReactElement | null {
  const conversationLocation = useConversationLocation();
  const { conversationId } = conversationLocation;
  const [source, setSource] = useState<OutlineSource>({ conversationId: null, mode: "api", items: [] });
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const isRightSidePanelOpen = useRightSidePanel();
  const renderedItems = useMemo(() => visibleOutlineItems(items, expandedIds), [items, expandedIds]);

  useEffect(() => {
    if (!conversationId) {
      setSource({ conversationId: null, mode: "dom", items: collectDomOutlineItems() });
      return;
    }

    const controller = new AbortController();
    setSource({ conversationId, mode: "api", items: [] });
    setItems([]);
    setActiveId(null);

    fetchConversationOutlineWithRetry(conversationId, controller.signal, conversationLocation.changedAt)
      .then((outlineItems) => {
        if (!controller.signal.aborted) {
          setSource({
            conversationId,
            mode: outlineItems.length > 0 ? "api" : "dom",
            items: outlineItems.length > 0 ? outlineItems : collectDomOutlineItems()
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSource({ conversationId, mode: "dom", items: collectDomOutlineItems() });
        }
      });

    return () => controller.abort();
  }, [conversationId, conversationLocation.changedAt]);

  useEffect(() => {
    setExpandedIds(new Set());
  }, [conversationId]);

  useEffect(() => {
    if (source.conversationId !== conversationId) {
      setItems([]);
      return;
    }

    if (source.mode === "dom") {
      const update = () => setItems(collectDomOutlineItems());
      const scheduleUpdate = debounce(update, 150);
      const observer = new MutationObserver(scheduleUpdate);

      update();
      observer.observe(conversationMutationRoot(), { childList: true, subtree: true });

      return () => observer.disconnect();
    }

    const update = () => setItems(bindOutlineItems(source.items));
    const scheduleUpdate = debounce(update, 150);
    const controller = new AbortController();
    let refreshing = false;
    const refresh = () => {
      if (!conversationId || refreshing) {
        return;
      }

      refreshing = true;
      fetchConversationOutlineWithRetry(conversationId, controller.signal, Date.now() - 250)
        .then((outlineItems) => {
          if (!controller.signal.aborted && outlineItems.length > 0) {
            setSource({ conversationId, mode: "api", items: outlineItems });
          }
        })
        .catch(() => {
          // Keep the current API outline; transient refresh failures should not downgrade to partial DOM data.
        })
        .finally(() => {
          refreshing = false;
        });
    };
    const scheduleRefresh = debounce(refresh, 900);
    const observer = new MutationObserver(() => {
      scheduleUpdate();
      scheduleRefresh();
    });

    update();
    observer.observe(conversationMutationRoot(), { childList: true, subtree: true });

    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [conversationId, conversationLocation.changedAt, source]);

  useEffect(() => {
    const observableItems = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.element);
    if (observableItems.length === 0) {
      setActiveId(null);
      return;
    }

    const targetIds = new Map<HTMLElement, string>();
    const visibleIds = new Set(renderedItems.map((item) => item.id));
    const updateActiveFromViewport = () => {
      const viewportTop = window.innerHeight * 0.18;
      const viewportBottom = window.innerHeight * 0.38;
      const visible = observableItems
        .map(({ item }) => item.element)
        .filter((element): element is HTMLElement => element !== null)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom >= viewportTop && rect.top <= viewportBottom;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

      if (visible[0]) {
        setActiveId(targetIds.get(visible[0]) ?? null);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target instanceof HTMLElement) {
          setActiveId(targetIds.get(visible[0].target) ?? null);
        }
      },
      {
        rootMargin: "-10% 0px -62% 0px",
        threshold: [0, 0.1, 0.5, 1]
      }
    );

    observableItems.forEach((item) => {
      if (item.item.element) {
        targetIds.set(item.item.element, visibleActiveItemId(items, item.index, visibleIds) ?? item.item.id);
        observer.observe(item.item.element);
      }
    });

    updateActiveFromViewport();
    const frame = window.requestAnimationFrame(updateActiveFromViewport);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [items, renderedItems]);

  const toggleOutlineItem = (item: RenderedOutlineItem) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }

      return next;
    });
  };

  if (source.conversationId !== conversationId || items.length === 0 || isRightSidePanelOpen) {
    return null;
  }

  return (
    <nav aria-label="Conversation outline" className="ecg-outline">
      {renderedItems.map((item) => {
        const isExpanded = expandedIds.has(item.id);

        return (
          <div
            className="ecg-outline-item"
            data-active={activeId === item.id}
            data-has-children={item.hasChildren}
            data-kind={item.kind}
            key={item.id}
            style={{ "--ecg-depth": Math.max(item.level - 1, 0) } as OutlineDepthStyle}
          >
            {item.hasChildren ? (
              <button
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                className="ecg-outline-disclosure"
                type="button"
                onClick={() => toggleOutlineItem(item)}
              />
            ) : (
              <span aria-hidden="true" className="ecg-outline-disclosure" />
            )}
            <button className="ecg-outline-label" type="button" onClick={() => scrollToOutlineItem(items, item.originalIndex)}>
              {item.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
