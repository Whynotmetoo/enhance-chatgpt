import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ARCHIVE_PAGE_URL } from "../../shared/constants";
import { ArchiveIcon, ArchivePageIcon, DeleteIcon, PluginIcon } from "../lib/icons";
import { conversationIdFromHref, debounce, isVisible } from "../lib/dom";

type ConversationItem = {
  id: string;
  title: string;
  href: string;
  row: HTMLElement;
};

type BulkAction = "delete" | "archive";

const checkboxClass = "ecg-conversation-checkbox";
const headerActionsHostAttribute = "data-ecg-bulk-actions-host";
const headerClass = "ecg-recents-header-row";
const headerSelectHostAttribute = "data-ecg-bulk-select-host";
const recentsButtonClass = "ecg-recents-trigger";
const rowClass = "ecg-conversation-row";
const selectedRowClass = "ecg-conversation-row-selected";

type HeaderControls = {
  actionsHost: HTMLElement;
  recentsButton: HTMLButtonElement;
  selectHost: HTMLElement;
};

function findSidebar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("[data-testid='sidebar']") ??
    document.querySelector<HTMLElement>("nav[aria-label*='Chat']") ??
    document.querySelector<HTMLElement>("aside") ??
    document.querySelector<HTMLElement>("nav")
  );
}

function isRecentsButton(button: HTMLButtonElement): boolean {
  const label =
    button.querySelector("h2.__menu-label")?.textContent?.trim() ??
    button.textContent?.trim() ??
    "";
  return /^recents?$/i.test(label);
}

function findRecentsButton(sidebar: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(sidebar.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find(isRecentsButton) ??
    null
  );
}

function sameHeaderControls(current: HeaderControls | null, next: HeaderControls | null): boolean {
  return (
    current?.actionsHost === next?.actionsHost &&
    current?.recentsButton === next?.recentsButton &&
    current?.selectHost === next?.selectHost
  );
}

function ensureHeaderControls(): HeaderControls | null {
  const sidebar = findSidebar();
  if (!sidebar) {
    return null;
  }

  const recentsButton = findRecentsButton(sidebar);
  const header = recentsButton?.parentElement ?? null;
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

function collectConversationItems(): ConversationItem[] {
  const sidebar = findSidebar();
  if (!sidebar) {
    return [];
  }

  const seen = new Set<string>();

  return Array.from(sidebar.querySelectorAll<HTMLAnchorElement>("a[href*='/c/']"))
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

function syncConversationCheckboxes(items: ConversationItem[]): void {
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

function clearConversationControls(): void {
  document.querySelectorAll(`.${checkboxClass}[data-ecg-conversation-id]`).forEach((element) => element.remove());
  document.querySelectorAll(`.${rowClass}`).forEach((element) => {
    element.classList.remove(rowClass, selectedRowClass);
  });
}

function clearHeaderControls(): void {
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

function dispatchBulkAction(action: BulkAction, items: ConversationItem[]): void {
  window.dispatchEvent(
    new CustomEvent("ecg:bulk-conversation-action", {
      detail: {
        action,
        conversations: items.map(({ id, title, href }) => ({ id, title, href }))
      }
    })
  );
}

function actionLabel(action: BulkAction): string {
  return action === "delete" ? "Delete" : "Archive";
}

export function ConversationBulkManager(): ReactElement | null {
  const [headerControls, setHeaderControls] = useState<HeaderControls | null>(null);
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );
  const hasSelectedItems = selectedItems.length > 0;
  const allVisibleSelected = items.length > 0 && selectedIds.size === items.length;
  const partiallySelected = selectedIds.size > 0 && !allVisibleSelected;

  useEffect(() => {
    const update = () => {
      const nextControls = ensureHeaderControls();
      setHeaderControls((current) => (sameHeaderControls(current, nextControls) ? current : nextControls));
    };

    const scheduleUpdate = debounce(update, 120);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearHeaderControls();
    };
  }, []);

  useEffect(() => {
    const update = () => {
      const nextItems = collectConversationItems();
      if (isSelectionModeActive) {
        syncConversationCheckboxes(nextItems);
      } else {
        clearConversationControls();
      }
      setItems(nextItems);
    };

    const scheduleUpdate = debounce(update, 120);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearConversationControls();
    };
  }, [isSelectionModeActive]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const checkbox = target.closest<HTMLButtonElement>(`.${checkboxClass}`);
      if (!checkbox?.dataset.ecgConversationId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const id = checkbox.dataset.ecgConversationId;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-ecg-bulk-active", isSelectionModeActive);

    items.forEach((item) => {
      const isSelected = selectedIds.has(item.id);
      const checkbox = item.row.querySelector<HTMLButtonElement>(`.${checkboxClass}`);

      item.row.classList.toggle(selectedRowClass, isSelected);
      checkbox?.setAttribute("aria-pressed", String(isSelected));
      checkbox?.toggleAttribute("data-selected", isSelected);
    });

    return () => {
      document.documentElement.removeAttribute("data-ecg-bulk-active");
    };
  }, [isSelectionModeActive, items, selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(items.map((item) => item.id));
      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    if (!isSelectionModeActive) {
      setSelectedIds(new Set());
      setPendingAction(null);
    }
  }, [isSelectionModeActive]);

  const toggleAllVisibleConversations = () => {
    setSelectedIds((current) => {
      if (items.length > 0 && current.size === items.length) {
        return new Set();
      }

      return new Set(items.map((item) => item.id));
    });
  };

  const requestBulkAction = (action: BulkAction) => {
    if (hasSelectedItems) {
      setPendingAction(action);
    }
  };

  const confirmBulkAction = () => {
    if (pendingAction && selectedItems.length > 0) {
      dispatchBulkAction(pendingAction, selectedItems);
    }
    setPendingAction(null);
  };

  const selectAllControl = headerControls
    ? createPortal(
        isSelectionModeActive ? (
          <button
            aria-label="Select all conversations"
            aria-pressed={allVisibleSelected}
            className="ecg-conversation-checkbox ecg-conversation-select-all"
            data-mixed={partiallySelected ? "true" : undefined}
            data-selected={allVisibleSelected ? "true" : undefined}
            type="button"
            onClick={toggleAllVisibleConversations}
          >
            <span className="ecg-conversation-checkbox-mark" />
          </button>
        ) : null,
        headerControls.selectHost
      )
    : null;

  const actionControls = headerControls
    ? createPortal(
        <div aria-label="Conversation batch operations" className="ecg-bulk-header-actions" role="toolbar">
          <button
            aria-label={isSelectionModeActive ? "Disable batch operations" : "Enable batch operations"}
            aria-pressed={isSelectionModeActive}
            className="ecg-bulk-action-button"
            data-active={isSelectionModeActive}
            type="button"
            onClick={() => setIsSelectionModeActive((value) => !value)}
          >
            <PluginIcon />
          </button>
          {isSelectionModeActive ? (
            <>
              <button
                aria-label="Delete selected conversations"
                className="ecg-bulk-action-button"
                disabled={!hasSelectedItems}
                type="button"
                onClick={() => requestBulkAction("delete")}
              >
                <DeleteIcon />
              </button>
              <button
                aria-label="Archive selected conversations"
                className="ecg-bulk-action-button"
                disabled={!hasSelectedItems}
                type="button"
                onClick={() => requestBulkAction("archive")}
              >
                <ArchiveIcon />
              </button>
            </>
          ) : null}
          <a
            aria-label="Open ChatGPT Archive management"
            className="ecg-bulk-action-button"
            href={ARCHIVE_PAGE_URL}
            rel="noreferrer"
            target="_blank"
          >
            <ArchivePageIcon />
          </a>
        </div>,
        headerControls.actionsHost
      )
    : null;

  return (
    <>
      {selectAllControl}
      {actionControls}
      <AlertDialog.Root open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="ecg-prompt-alert-overlay" />
          <AlertDialog.Content className="ecg-prompt-alert">
            <AlertDialog.Title className="ecg-prompt-alert-title">
              {pendingAction ? `${actionLabel(pendingAction)} selected conversations?` : "Confirm batch action"}
            </AlertDialog.Title>
            <AlertDialog.Description className="ecg-prompt-alert-description">
              {selectedItems.length} conversation{selectedItems.length === 1 ? "" : "s"} selected.
            </AlertDialog.Description>
            <div className="ecg-prompt-alert-actions">
              <AlertDialog.Cancel className="ecg-prompt-secondary">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action className="ecg-prompt-danger" onClick={confirmBulkAction}>
                Confirm
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
