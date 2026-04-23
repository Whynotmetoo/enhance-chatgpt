import { conversationIdFromHref, isVisible } from "../../lib/dom";
import {
  answerHeadingSelector,
  conversationPathPattern,
  messageSelector,
  outlineIdAttribute,
  turnSelector
} from "./constants";
import type { OutlineItem } from "./types";
import { compareDocumentOrder, cssEscape, headingLevel, normalizeLabel } from "./utils";

export function collectTurnElements(): HTMLElement[] {
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

export function conversationMutationRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("#thread") ?? document.querySelector<HTMLElement>("main") ?? document.body;
}

export function conversationIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    const match = parsedUrl.pathname.match(conversationPathPattern);
    return match?.[1] ?? conversationIdFromHref(parsedUrl.href);
  } catch {
    return conversationIdFromHref(url);
  }
}

export function conversationIdFromLocation(): string | null {
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

function answerHeadings(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(answerHeadingSelector))
    .filter(isVisible)
    .filter((heading) => !heading.closest("pre, code, [data-testid='code-block']"))
    .sort(compareDocumentOrder);
}

function answerStructureItems(turn: HTMLElement, answerIndex: number): OutlineItem[] {
  const headings = answerHeadings(turn);

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

export function collectDomOutlineItems(): OutlineItem[] {
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

function findMessageElement(messageId: string): HTMLElement | null {
  const escaped = cssEscape(messageId);
  const message = document.querySelector<HTMLElement>(`[data-message-id="${escaped}"]`);
  if (message) {
    return message;
  }

  return document.querySelector<HTMLElement>(`[data-turn-id="${escaped}"]`);
}

export function exactOutlineElement(item: OutlineItem): HTMLElement | null {
  if (!item.messageId) {
    return item.element;
  }

  const message = findMessageElement(item.messageId);
  if (!message) {
    return null;
  }

  const turn = message.closest<HTMLElement>("[data-turn-id]") ?? message;
  if (item.headingIndex === null) {
    return turn;
  }

  const headings = answerHeadings(message);

  return headings[item.headingIndex] ?? null;
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
    const headings = answerHeadings(message);
    element = headings[item.headingIndex] ?? turn;
  }

  return { ...item, element };
}

function domHeadingItemsForMessage(messageId: string, apiItems: OutlineItem[]): OutlineItem[] | null {
  const message = findMessageElement(messageId);
  if (!message) {
    return null;
  }

  const headings = answerHeadings(message);
  if (headings.length === 0) {
    return null;
  }

  const topHeadingLevel = Math.min(...headings.map(headingLevel));
  const topHeadings = headings
    .map((element, headingIndex) => ({ element, headingIndex }))
    .filter(({ element }) => headingLevel(element) === topHeadingLevel);

  if (topHeadings.length < apiItems.length) {
    return null;
  }

  const apiItemsByHeadingIndex = new Map<number, OutlineItem>();
  apiItems.forEach((item) => {
    if (item.headingIndex !== null) {
      apiItemsByHeadingIndex.set(item.headingIndex, item);
    }
  });

  return topHeadings.map(({ element, headingIndex }, index) => {
    const apiItem = apiItemsByHeadingIndex.get(headingIndex) ?? apiItems[index];

    return {
      id: apiItem?.id ?? stableOutlineId(element, "heading", headingIndex),
      label: normalizeLabel(element.textContent, apiItem?.label ?? "ChatGPT response"),
      level: apiItem?.level ?? 2,
      kind: "heading",
      messageId,
      headingIndex,
      element
    };
  });
}

export function bindOutlineItems(items: OutlineItem[]): OutlineItem[] {
  const boundItems: OutlineItem[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];
    if (!item.messageId || item.kind !== "heading") {
      boundItems.push(bindOutlineItem(item));
      index += 1;
      continue;
    }

    const messageId = item.messageId;
    const messageItems: OutlineItem[] = [];

    while (index < items.length && items[index].messageId === messageId && items[index].kind === "heading") {
      messageItems.push(items[index]);
      index += 1;
    }

    const domHeadingItems = domHeadingItemsForMessage(messageId, messageItems);
    boundItems.push(...(domHeadingItems ?? messageItems.map(bindOutlineItem)));
  }

  return boundItems;
}

export function connectedElement(element: HTMLElement | null | undefined): HTMLElement | null {
  return element?.isConnected ? element : null;
}
