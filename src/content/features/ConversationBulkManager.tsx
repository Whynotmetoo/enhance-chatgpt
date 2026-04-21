import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { ARCHIVE_PAGE_URL } from "../../shared/constants";
import { ArchiveIcon, DeleteIcon, DotsIcon } from "../lib/icons";
import { conversationIdFromHref, debounce, isVisible } from "../lib/dom";
import { useElementRect } from "../lib/useElementRect";

type ConversationItem = {
  id: string;
  title: string;
  href: string;
  row: HTMLElement;
};

type BulkAction = "delete" | "archive";

const checkboxClass = "ecg-conversation-checkbox";
const rowClass = "ecg-conversation-row";
const selectedRowClass = "ecg-conversation-row-selected";

function findSidebar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("[data-testid='sidebar']") ??
    document.querySelector<HTMLElement>("nav[aria-label*='Chat']") ??
    document.querySelector<HTMLElement>("aside") ??
    document.querySelector<HTMLElement>("nav")
  );
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

function clearInjectedControls(): void {
  document.querySelectorAll(`.${checkboxClass}`).forEach((element) => element.remove());
  document.querySelectorAll(`.${rowClass}`).forEach((element) => {
    element.classList.remove(rowClass, selectedRowClass);
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

export function ConversationBulkManager(): ReactElement | null {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const sidebarRect = useElementRect(findSidebar, [items.length, selectedIds.size], 300);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  useEffect(() => {
    const update = () => {
      const nextItems = collectConversationItems();
      nextItems.forEach(ensureCheckbox);
      setItems(nextItems);
    };

    const scheduleUpdate = debounce(update, 120);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearInjectedControls();
    };
  }, []);

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
    document.documentElement.toggleAttribute("data-ecg-selection-active", selectedIds.size > 0);

    items.forEach((item) => {
      const isSelected = selectedIds.has(item.id);
      const checkbox = item.row.querySelector<HTMLButtonElement>(`.${checkboxClass}`);

      item.row.classList.toggle(selectedRowClass, isSelected);
      checkbox?.setAttribute("aria-pressed", String(isSelected));
      checkbox?.toggleAttribute("data-selected", isSelected);
    });

    return () => {
      document.documentElement.removeAttribute("data-ecg-selection-active");
    };
  }, [items, selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(items.map((item) => item.id));
      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    if (selectedIds.size === 0) {
      setIsMoreOpen(false);
    }
  }, [selectedIds.size]);

  if (!sidebarRect || selectedItems.length === 0) {
    return null;
  }

  const barTop = Math.min(
    Math.max(sidebarRect.top + 332, sidebarRect.top + 96),
    sidebarRect.bottom - 86
  );

  return (
    <div
      aria-label="Selected conversation actions"
      className="ecg-action-bar"
      role="toolbar"
      style={{
        left: sidebarRect.left + 12,
        top: barTop,
        width: Math.max(196, Math.min(268, sidebarRect.width - 24))
      }}
    >
      <span className="ecg-action-count">{selectedItems.length}</span>
      <button
        aria-label="Delete selected conversations"
        className="ecg-action-button"
        type="button"
        onClick={() => dispatchBulkAction("delete", selectedItems)}
      >
        <DeleteIcon />
      </button>
      <button
        aria-label="Archive selected conversations"
        className="ecg-action-button"
        type="button"
        onClick={() => dispatchBulkAction("archive", selectedItems)}
      >
        <ArchiveIcon />
      </button>
      <div className="ecg-more-wrap">
        <button
          aria-expanded={isMoreOpen}
          aria-label="More conversation actions"
          className="ecg-action-button"
          type="button"
          onClick={() => setIsMoreOpen((value) => !value)}
        >
          <DotsIcon />
        </button>
        {isMoreOpen ? (
          <div className="ecg-more-menu" role="menu">
            <a href={ARCHIVE_PAGE_URL} rel="noreferrer" role="menuitem" target="_blank">
              Open native Archive
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
