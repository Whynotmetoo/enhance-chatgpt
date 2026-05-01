import { conversationIdFromHref, isVisible } from "../../lib/dom";
import type { ConversationItem, HeaderControls } from "./types";

export const checkboxClass = "ecg-conversation-checkbox";
export const selectedRowClass = "ecg-conversation-row-selected";
export const bulkManagerIconPath = "icons/icon-transparent.svg";

const headerActionsHostAttribute = "data-ecg-bulk-actions-host";
const headerClass = "ecg-recents-header-row";
const headerSelectHostAttribute = "data-ecg-bulk-select-host";
const recentsButtonClass = "ecg-recents-trigger";
const rowClass = "ecg-conversation-row";

type ExtensionGlobal = typeof globalThis & {
  browser?: { runtime?: { getURL?: (path: string) => string } };
  chrome?: { runtime?: { getURL?: (path: string) => string } };
};

export function extensionResourceUrl(path: string): string {
  const scope = globalThis as ExtensionGlobal;
  try {
    return (scope.chrome ?? scope.browser)?.runtime?.getURL?.(path) ?? path;
  } catch {
    return path;
  }
}

function findSidebar(): HTMLElement | null {
  const history = document.querySelector<HTMLElement>("#history");
  const historySidebar = history?.closest<HTMLElement>("[data-testid='sidebar'], #stage-slideover-sidebar, aside, nav");
  if (historySidebar) {
    return historySidebar;
  }

  return (
    document.querySelector<HTMLElement>("[data-testid='sidebar']") ??
    document.querySelector<HTMLElement>("aside") ??
    document.querySelector<HTMLElement>("nav")
  );
}

function findHistoryContainer(sidebar: HTMLElement): HTMLElement | null {
  return sidebar.querySelector<HTMLElement>("#history");
}

function findHistoryHeader(history: HTMLElement): HTMLElement | null {
  const previousSibling = history.previousElementSibling;
  if (previousSibling instanceof HTMLElement) {
    return previousSibling;
  }

  const section = history.closest<HTMLElement>("[class*='sidebar-expando-section']");
  const header = section?.querySelector<HTMLElement>("button[aria-expanded]")?.parentElement ?? null;
  return header instanceof HTMLElement ? header : null;
}

function findRecentsContainer(sidebar: HTMLElement): HTMLElement | null {
  return findHistoryContainer(sidebar);
}

export function sameHeaderControls(current: HeaderControls | null, next: HeaderControls | null): boolean {
  return (
    current?.actionsHost === next?.actionsHost &&
    current?.recentsButton === next?.recentsButton &&
    current?.selectHost === next?.selectHost
  );
}

export function ensureHeaderControls(): HeaderControls | null {
  const sidebar = findSidebar();
  if (!sidebar) {
    return null;
  }

  const history = findHistoryContainer(sidebar);
  const header = history ? findHistoryHeader(history) : null;
  const recentsButton = header?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? null;
  if (!recentsButton || !header) {
    return null;
  }

  header.classList.add(headerClass);
  recentsButton.classList.add(recentsButtonClass);

  let selectHost = header.querySelector<HTMLElement>(`[${headerSelectHostAttribute}]`);
  if (!selectHost) {
    selectHost = document.createElement("span");
    selectHost.setAttribute(headerSelectHostAttribute, "true");
    recentsButton.before(selectHost);
  }

  let actionsHost = header.querySelector<HTMLElement>(`[${headerActionsHostAttribute}]`);
  if (!actionsHost) {
    actionsHost = document.createElement("span");
    actionsHost.setAttribute(headerActionsHostAttribute, "true");
    recentsButton.after(actionsHost);
  }

  return { actionsHost, recentsButton, selectHost };
}

function rowForAnchor(anchor: HTMLAnchorElement): HTMLElement {
  return (
    anchor.closest<HTMLElement>("[role='listitem']") ??
    anchor.closest<HTMLElement>("li") ??
    anchor.parentElement ??
    anchor
  );
}

export function collectConversationItems(): ConversationItem[] {
  const sidebar = findSidebar();
  if (!sidebar) {
    return [];
  }

  const recentsContainer = findRecentsContainer(sidebar);
  if (!recentsContainer) {
    return [];
  }

  const seen = new Set<string>();

  return Array.from(recentsContainer.querySelectorAll<HTMLAnchorElement>("a[href*='/c/']"))
    .map((anchor) => {
      const id = conversationIdFromHref(anchor.href);
      if (!id || seen.has(id) || !isVisible(anchor)) {
        return null;
      }

      seen.add(id);

      return {
        id,
        title: anchor.textContent?.trim() || "Untitled chat",
        href: anchor.href,
        row: rowForAnchor(anchor)
      };
    })
    .filter((item): item is ConversationItem => Boolean(item));
}

function ensureCheckbox(item: ConversationItem): void {
  let button = item.row.querySelector<HTMLButtonElement>(`.${checkboxClass}`);

  if (!button) {
    const mark = document.createElement("span");
    button = document.createElement("button");
    button.type = "button";
    button.className = checkboxClass;
    mark.className = "ecg-conversation-checkbox-mark";
    button.append(mark);
    item.row.append(button);
  }

  button.dataset.ecgConversationId = item.id;
  button.setAttribute("aria-label", `Select conversation: ${item.title}`);

  item.row.classList.add(rowClass);
}

export function syncConversationCheckboxes(items: ConversationItem[]): void {
  const itemRows = new Set(items.map((item) => item.row));

  document.querySelectorAll<HTMLButtonElement>(`.${checkboxClass}[data-ecg-conversation-id]`).forEach((button) => {
    const row = button.parentElement;
    if (row && itemRows.has(row)) {
      return;
    }

    button.remove();
    row?.classList.remove(rowClass, selectedRowClass);
  });

  items.forEach(ensureCheckbox);
}

export function clearConversationControls(): void {
  document.querySelectorAll(`.${checkboxClass}[data-ecg-conversation-id]`).forEach((element) => element.remove());
  document.querySelectorAll(`.${rowClass}`).forEach((element) => {
    element.classList.remove(rowClass, selectedRowClass);
  });
}

export function clearHeaderControls(): void {
  document
    .querySelectorAll<HTMLElement>(`[${headerSelectHostAttribute}], [${headerActionsHostAttribute}]`)
    .forEach((element) => {
      element.remove();
    });
  document
    .querySelectorAll<HTMLElement>(`.${headerClass}`)
    .forEach((element) => element.classList.remove(headerClass));
  document.querySelectorAll<HTMLElement>(`.${recentsButtonClass}`).forEach((element) => {
    element.classList.remove(recentsButtonClass);
  });
}

export function currentConversationId(): string | null {
  return conversationIdFromHref(window.location.href);
}

function findNewConversationElement(): HTMLElement | null {
  const selectors = [
    "a[aria-label*='New chat' i]",
    "button[aria-label*='New chat' i]",
    "a[href='/']",
    "a[href='https://chatgpt.com/']",
    "a[href='https://chat.openai.com/']"
  ];

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    if (element) {
      return element;
    }
  }

  return null;
}

export function navigateToNewConversation(): void {
  const target = findNewConversationElement();
  if (target) {
    target.click();
    return;
  }

  window.history.pushState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function removeConversationItem(item: ConversationItem): void {
  item.row.remove();
}
