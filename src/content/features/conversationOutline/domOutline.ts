import { conversationIdFromHref, isVisible } from "../../lib/dom";
import {
  answerHeadingSelector,
  conversationPathPattern,
  messageSelector,
  outlineIdAttribute,
  turnSelector
} from "./constants";
import type { DomOutlineTurn, OutlineItem } from "./types";
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

function lastElement<T>(elements: T[]): T | null {
  return elements[elements.length - 1] ?? null;
}

function messageHasAnswerHeading(message: HTMLElement): boolean {
  return answerHeadings(message).length > 0;
}

function assistantMessageElements(turn: HTMLElement): HTMLElement[] {
  return Array.from(turn.querySelectorAll<HTMLElement>("[data-message-author-role='assistant'][data-message-id]"));
}

function messageElementFromTurn(turn: HTMLElement, role: "user" | "assistant" | null): HTMLElement | null {
  if (role === "assistant") {
    const messages = assistantMessageElements(turn);
    return (
      messages.find(messageHasAnswerHeading) ??
      turn.querySelector<HTMLElement>("[data-turn-start-message='true'][data-message-id]") ??
      lastElement(messages) ??
      turn.querySelector<HTMLElement>("[data-message-id]")
    );
  }

  if (role === "user") {
    return (
      turn.querySelector<HTMLElement>("[data-message-author-role='user'][data-message-id]") ??
      turn.querySelector<HTMLElement>("[data-message-id]")
    );
  }

  return turn.querySelector<HTMLElement>("[data-message-id]");
}

function messageIdFromTurn(turn: HTMLElement, role: "user" | "assistant" | null): string | null {
  return messageElementFromTurn(turn, role)?.getAttribute("data-message-id") ?? turn.getAttribute("data-turn-id");
}

function messageIdForHeading(element: HTMLElement, fallback: string | null): string | null {
  return element.closest<HTMLElement>("[data-message-id]")?.getAttribute("data-message-id") ?? fallback;
}

function headingIndexInMessage(element: HTMLElement, fallback: number): number {
  const message = element.closest<HTMLElement>("[data-message-id]");
  if (!message) {
    return fallback;
  }

  const headings = answerHeadings(message);
  const index = headings.indexOf(element);
  return index >= 0 ? index : fallback;
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

function answerHeadingWeight(root: HTMLElement): number {
  return answerHeadings(root).length;
}

function answerStructureItems(turn: HTMLElement, answerIndex: number): OutlineItem[] {
  const headings = answerHeadings(turn);
  const fallbackMessageId = messageIdFromTurn(turn, "assistant");

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
      messageId: messageIdForHeading(element, fallbackMessageId),
      headingIndex: headingIndexInMessage(element, headingIndex),
      element,
      source: "dom"
    }));
}

function paragenRoots(turn: HTMLElement): HTMLElement[] {
  return Array.from(turn.querySelectorAll<HTMLElement>("[data-paragen-root='true']"))
    .filter(isVisible)
    .sort(compareDocumentOrder);
}

function bestOutlineTurn(turns: DomOutlineTurn[]): DomOutlineTurn {
  return turns.reduce((best, turn) =>
    (turn.outlineWeight ?? turn.outlineItems.length) >= (best.outlineWeight ?? best.outlineItems.length) ? turn : best
  );
}

export function collectDomOutlineTurns(): DomOutlineTurn[] {
  const turns: DomOutlineTurn[] = [];
  let userIndex = 0;
  let answerIndex = 0;
  let previousTurnId: string | null = null;

  collectTurnElements().forEach((turn) => {
    const role = turnRole(turn);
    const id = messageIdFromTurn(turn, role);

    if (!id || !role || !isVisible(turn)) {
      return;
    }

    if (role === "user") {
      userIndex += 1;
      answerIndex = 0;
      turns.push({
        element: turn,
        id,
        outlineItems: [{
          id: stableOutlineId(turn, "user", userIndex),
          label: userLabel(turn, userIndex),
          level: 1,
          kind: "user",
          messageId: id,
          headingIndex: null,
          element: turn,
          source: "dom"
        }],
        parentId: previousTurnId,
        role
      });
      previousTurnId = id;
      return;
    }

    if (role === "assistant") {
      const responseRoots = paragenRoots(turn);
      if (responseRoots.length > 1) {
        const responseTurns = responseRoots.flatMap((responseRoot) => {
          const responseId = messageIdFromTurn(responseRoot, "assistant");
          if (!responseId) {
            return [];
          }

          answerIndex += 1;
          return [{
            element: responseRoot,
            id: responseId,
            outlineItems: answerStructureItems(responseRoot, answerIndex),
            outlineWeight: answerHeadingWeight(responseRoot),
            parentId: previousTurnId,
            role
          }];
        });

        if (responseTurns.length > 0) {
          turns.push(...responseTurns);
          previousTurnId = bestOutlineTurn(responseTurns).id;
          return;
        }
      }

      answerIndex += 1;
      turns.push({
        element: turn,
        id,
        outlineItems: answerStructureItems(turn, answerIndex),
        outlineWeight: answerHeadingWeight(turn),
        parentId: previousTurnId,
        role
      });
      previousTurnId = id;
    }
  });

  return turns;
}

export function collectDomOutlineItems(): OutlineItem[] {
  return collectDomOutlineTurns()
    .flatMap((turn) => turn.outlineItems)
    .filter((item) => item.element && isVisible(item.element));
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
    return visibleConnectedElement(item.element);
  }

  const message = findMessageElement(item.messageId);
  if (!message) {
    return visibleConnectedElement(item.element);
  }

  const turn = message.closest<HTMLElement>("[data-turn-id]") ?? message;
  if (item.headingIndex === null) {
    return turn;
  }

  const headings = answerHeadings(message);

  return headings[item.headingIndex] ?? visibleConnectedHeading(item);
}

function bindOutlineItem(item: OutlineItem): OutlineItem {
  if (!item.messageId) {
    return { ...item, element: visibleConnectedElement(item.element) };
  }

  const message = findMessageElement(item.messageId);
  if (!message) {
    return { ...item, element: visibleConnectedElement(item.element) };
  }

  const turn = message.closest<HTMLElement>("[data-turn-id]") ?? message;
  let element: HTMLElement = turn;

  if (item.headingIndex !== null) {
    const headings = answerHeadings(message);
    element = headings[item.headingIndex] ?? visibleConnectedHeading(item) ?? turn;
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
      element,
      source: apiItem?.source ?? "dom"
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

function visibleConnectedElement(element: HTMLElement | null | undefined): HTMLElement | null {
  const liveElement = connectedElement(element);
  return liveElement && isVisible(liveElement) ? liveElement : null;
}

function visibleConnectedHeading(item: OutlineItem): HTMLElement | null {
  const liveElement = visibleConnectedElement(item.element);
  return liveElement?.matches(answerHeadingSelector) ? liveElement : null;
}
