import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ARCHIVED_CHATS_SETTINGS_HASH, SUPPORT_EXTENSION_URL } from "../../shared/constants";
import { AlertModal } from "../components/AlertModal";
import { ChatGptArchiveIcon, ChatGptDataControlsIcon, ChatGptMoreIcon, ChatGptTrashIcon, HeartIcon } from "../lib/icons";
import { debounce } from "../lib/dom";
import {
  clearAllConversationsInPageContext,
  performConversationActionInPageContext,
  subscribeConversationListActivity
} from "../lib/chatGptApiBridge";
import {
  bulkManagerIconPath,
  checkboxClass,
  clearConversationControls,
  clearHeaderControls,
  collectConversationItems,
  conversationPageCenterX,
  currentConversationId,
  ensureHeaderControls,
  extensionResourceUrl,
  navigateToNewConversation,
  restoreSuppressedConversationRows,
  sameHeaderControls,
  selectedRowClass,
  suppressConversationItem,
  syncSuppressedConversationRows,
  syncConversationCheckboxes
} from "./conversationBulk/dom";
import {
  actionConfirmLabel,
  bulkDialogDescription,
  bulkDialogTitle,
  completionToastMessage
} from "./conversationBulk/labels";
import type {
  ArchiveMenuPosition,
  BulkAction,
  BulkDialogState,
  BulkFailure,
  BulkScope,
  BulkToast,
  ConversationItem,
  HeaderControls
} from "./conversationBulk/types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation action failed";
}

export function ConversationBulkManager(): ReactElement | null {
  const [headerControls, setHeaderControls] = useState<HeaderControls | null>(null);
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [isArchiveMenuOpen, setIsArchiveMenuOpen] = useState(false);
  const [archiveMenuPosition, setArchiveMenuPosition] = useState<ArchiveMenuPosition | null>(null);
  const [bulkDialog, setBulkDialog] = useState<BulkDialogState | null>(null);
  const [toast, setToast] = useState<BulkToast | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [suppressedConversations, setSuppressedConversations] = useState<Map<string, number>>(() => new Map());
  const archiveMenuRootRef = useRef<HTMLDivElement>(null);
  const archiveMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const archiveMenuRef = useRef<HTMLDivElement>(null);
  const authoritativeVisibleIdsRef = useRef<Set<string> | null>(null);
  const bulkAbortControllerRef = useRef<AbortController | null>(null);
  const bulkCancelRef = useRef<HTMLButtonElement>(null);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );
  const hasSelectedItems = selectedItems.length > 0;
  const allVisibleSelected = items.length > 0 && selectedIds.size === items.length;
  const partiallySelected = selectedIds.size > 0 && !allVisibleSelected;
  const isBulkRunning = bulkDialog?.status === "running";
  const suppressedIds = useMemo(() => new Set(suppressedConversations.keys()), [suppressedConversations]);

  const activeSuppressedIds = () => {
    const authoritativeVisibleIds = authoritativeVisibleIdsRef.current;
    if (!authoritativeVisibleIds) {
      return suppressedIds;
    }

    return new Set(Array.from(suppressedIds).filter((id) => !authoritativeVisibleIds.has(id)));
  };

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
      syncSuppressedConversationRows(activeSuppressedIds());
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
  }, [isSelectionModeActive, suppressedIds]);

  useEffect(() => {
    return subscribeConversationListActivity((activity) => {
      if (
        activity.context.isArchived === "true" ||
        activity.context.isStarred === "true" ||
        (activity.context.offset !== null && activity.context.offset !== "0")
      ) {
        return;
      }

      const visibleIds = new Set(activity.conversationIds);
      authoritativeVisibleIdsRef.current = visibleIds;
      restoreSuppressedConversationRows(visibleIds);

      setSuppressedConversations((current) => {
        let next: Map<string, number> | null = null;

        current.forEach((suppressedAt, id) => {
          if (!visibleIds.has(id) || activity.requestedAt < suppressedAt) {
            return;
          }

          next ??= new Map(current);
          next.delete(id);
        });

        return next ?? current;
      });

      setItems((current) => current.filter((item) => visibleIds.has(item.id)));
      setSelectedIds((current) => {
        const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
        return next.size === current.size ? current : next;
      });
    });
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

      if (isBulkRunning) {
        return;
      }

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
  }, [isBulkRunning]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-ecg-bulk-active", isSelectionModeActive);

    items.forEach((item) => {
      const isSelected = selectedIds.has(item.id);
      const checkbox = item.row.querySelector<HTMLButtonElement>(`.${checkboxClass}`);

      item.row.classList.toggle(selectedRowClass, isSelected);
      checkbox?.setAttribute("aria-pressed", String(isSelected));
      if (isSelected) {
        checkbox?.setAttribute("data-selected", "true");
      } else {
        checkbox?.removeAttribute("data-selected");
      }
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
      if (!isBulkRunning) {
        setBulkDialog(null);
      }
    }
  }, [isBulkRunning, isSelectionModeActive]);

  useEffect(() => {
    if (!headerControls || isBulkRunning) {
      setIsArchiveMenuOpen(false);
    }
  }, [headerControls, isBulkRunning]);

  useEffect(() => {
    if (!isArchiveMenuOpen) {
      setArchiveMenuPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const trigger = archiveMenuTriggerRef.current;
      if (!trigger) {
        setArchiveMenuPosition(null);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 188;
      const viewportPadding = 8;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
      const left = Math.min(Math.max(rect.left - 8, viewportPadding), maxLeft);
      const top = Math.max(rect.bottom + 6, viewportPadding);

      setArchiveMenuPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isArchiveMenuOpen]);

  useEffect(() => {
    if (!isArchiveMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && archiveMenuRootRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && archiveMenuRef.current?.contains(target)) {
        return;
      }

      setIsArchiveMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsArchiveMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isArchiveMenuOpen]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => bulkAbortControllerRef.current?.abort();
  }, []);

  const toggleAllVisibleConversations = () => {
    if (isBulkRunning) {
      return;
    }

    setSelectedIds((current) => {
      if (items.length > 0 && current.size === items.length) {
        return new Set();
      }

      return new Set(items.map((item) => item.id));
    });
  };

  const requestBulkAction = (action: BulkAction) => {
    if (hasSelectedItems && !isBulkRunning) {
      setBulkDialog({ action, items: selectedItems, scope: "selected", status: "confirm" });
    }
  };

  const requestDeleteAllConversations = () => {
    if (isBulkRunning) {
      return;
    }

    setIsArchiveMenuOpen(false);
    setBulkDialog({ action: "delete", items, scope: "all", status: "confirm" });
  };

  const showCompletionToast = (action: BulkAction, succeeded: number, failed: BulkFailure[], scope: BulkScope) => {
    setToast({
      id: Date.now(),
      left: conversationPageCenterX(),
      message: completionToastMessage(action, succeeded, failed, scope),
      tone: failed.length > 0 ? "error" : "info"
    });
  };

  const suppressSucceededConversations = (actionItems: ConversationItem[]) => {
    const succeededIds = new Set(actionItems.map((item) => item.id));
    const suppressedAt = Date.now();

    actionItems.forEach((item) => authoritativeVisibleIdsRef.current?.delete(item.id));
    actionItems.forEach(suppressConversationItem);

    setSuppressedConversations((current) => {
      const next = new Map(current);
      actionItems.forEach((item) => next.set(item.id, suppressedAt));
      return next;
    });
    setItems((current) => current.filter((conversation) => !succeededIds.has(conversation.id)));
    setSelectedIds((current) => {
      if (!Array.from(succeededIds).some((id) => current.has(id))) {
        return current;
      }

      const next = new Set(current);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const runClearAllConversations = async (actionItems: ConversationItem[]) => {
    const controller = new AbortController();
    const activeConversationId = currentConversationId();
    const failed: BulkFailure[] = [];

    bulkAbortControllerRef.current = controller;
    setIsArchiveMenuOpen(false);
    setBulkDialog({
      action: "delete",
      failed: [],
      remaining: 1,
      scope: "all",
      status: "running",
      succeeded: 0,
      total: 1
    });

    try {
      const result = await clearAllConversationsInPageContext(controller.signal);
      if (result.ok) {
        suppressSucceededConversations(actionItems);
      } else {
        failed.push({
          error: result.error ?? `Request failed${result.status ? ` with status ${result.status}` : ""}`,
          id: "__all__",
          status: result.status,
          title: "All chats"
        });
      }
    } catch (error) {
      failed.push({
        error: errorMessage(error),
        id: "__all__",
        title: "All chats"
      });
    }

    bulkAbortControllerRef.current = null;
    setBulkDialog(null);
    setIsSelectionModeActive(false);
    setSelectedIds(new Set());
    showCompletionToast("delete", failed.length === 0 ? actionItems.length : 0, failed, "all");

    if (failed.length === 0 && activeConversationId) {
      navigateToNewConversation();
    }
  };

  const runBulkAction = async (action: BulkAction, actionItems: ConversationItem[], scope: BulkScope) => {
    if (action === "delete" && scope === "all") {
      await runClearAllConversations(actionItems);
      return;
    }

    const controller = new AbortController();
    const activeConversationId = currentConversationId();
    const succeededItems: ConversationItem[] = [];
    const failed: BulkFailure[] = [];

    bulkAbortControllerRef.current = controller;
    setIsArchiveMenuOpen(false);
    setBulkDialog({
      action,
      failed: [],
      remaining: actionItems.length,
      scope,
      status: "running",
      succeeded: 0,
      total: actionItems.length
    });

    for (const item of actionItems) {
      try {
        const result = await performConversationActionInPageContext(item.id, action, controller.signal);
        if (result.ok) {
          succeededItems.push(item);
          suppressSucceededConversations([item]);
        } else {
          failed.push({
            error: result.error ?? `Request failed${result.status ? ` with status ${result.status}` : ""}`,
            id: item.id,
            status: result.status,
            title: item.title
          });
        }
      } catch (error) {
        failed.push({
          error: errorMessage(error),
          id: item.id,
          title: item.title
        });
      }

      setBulkDialog({
        action,
        failed: [...failed],
        remaining: actionItems.length - succeededItems.length - failed.length,
        scope,
        status: "running",
        succeeded: succeededItems.length,
        total: actionItems.length
      });
    }

    bulkAbortControllerRef.current = null;
    setBulkDialog(null);
    setIsSelectionModeActive(false);
    setSelectedIds(new Set());
    showCompletionToast(action, succeededItems.length, failed, scope);

    if (activeConversationId && succeededItems.some((item) => item.id === activeConversationId)) {
      navigateToNewConversation();
    }
  };

  const confirmBulkAction = () => {
    if (bulkDialog?.status !== "confirm" || bulkDialog.items.length === 0) {
      return;
    }

    void runBulkAction(bulkDialog.action, bulkDialog.items, bulkDialog.scope);
  };

  const closeBulkDialog = () => {
    if (!isBulkRunning) {
      setBulkDialog(null);
    }
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
            disabled={isBulkRunning}
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
            disabled={isBulkRunning}
            type="button"
            onClick={() => setIsSelectionModeActive((value) => !value)}
          >
            <span
              aria-hidden="true"
              className="ecg-bulk-manager-icon"
              style={{
                WebkitMaskImage: `url("${extensionResourceUrl(bulkManagerIconPath)}")`,
                maskImage: `url("${extensionResourceUrl(bulkManagerIconPath)}")`
              }}
            />
          </button>
          {isSelectionModeActive ? (
            <>
              <button
                aria-label="Delete selected conversations"
                className="ecg-bulk-action-button ecg-bulk-native-action-button"
                disabled={!hasSelectedItems || isBulkRunning}
                type="button"
                onClick={() => requestBulkAction("delete")}
              >
                <ChatGptTrashIcon />
              </button>
              <button
                aria-label="Archive selected conversations"
                className="ecg-bulk-action-button ecg-bulk-native-action-button"
                disabled={!hasSelectedItems || isBulkRunning}
                type="button"
                onClick={() => requestBulkAction("archive")}
              >
                <ChatGptArchiveIcon />
              </button>
            </>
          ) : null}
          <div className="ecg-bulk-menu-root" ref={archiveMenuRootRef}>
            <button
              aria-expanded={isArchiveMenuOpen}
              aria-haspopup="menu"
              aria-label="Open archive options"
              className="ecg-bulk-action-button"
              data-active={isArchiveMenuOpen}
              disabled={isBulkRunning}
              ref={archiveMenuTriggerRef}
              type="button"
              onClick={() => setIsArchiveMenuOpen((value) => !value)}
            >
              <ChatGptMoreIcon />
            </button>
          </div>
        </div>,
        headerControls.actionsHost
      )
    : null;

  const archiveMenu =
    isArchiveMenuOpen && archiveMenuPosition
      ? createPortal(
          <div
            aria-label="Archive options"
            className="ecg-bulk-menu"
            ref={archiveMenuRef}
            role="menu"
            style={{ left: archiveMenuPosition.left, top: archiveMenuPosition.top }}
          >
            <button
              className="ecg-bulk-menu-item ecg-bulk-menu-item-danger"
              disabled={isBulkRunning}
              role="menuitem"
              type="button"
              onClick={requestDeleteAllConversations}
            >
              <ChatGptTrashIcon />
              <span className="ecg-bulk-menu-item-label">Delete all chats</span>
            </button>
            <a
              className="ecg-bulk-menu-item"
              href={ARCHIVED_CHATS_SETTINGS_HASH}
              role="menuitem"
              onClick={(event) => {
                event.preventDefault();
                setIsArchiveMenuOpen(false);
                window.location.hash = ARCHIVED_CHATS_SETTINGS_HASH;
              }}
            >
              <ChatGptDataControlsIcon />
              <span className="ecg-bulk-menu-item-label">Manage archived chats</span>
            </a>
            <div className="ecg-bulk-menu-separator" role="separator" />
            <a
              className="ecg-bulk-menu-item"
              href={SUPPORT_EXTENSION_URL}
              rel="noreferrer"
              role="menuitem"
              target="_blank"
              onClick={() => setIsArchiveMenuOpen(false)}
            >
              <HeartIcon />
              <span className="ecg-bulk-menu-item-label">Support this extension</span>
            </a>
          </div>,
          document.body
        )
      : null;

  const dialogTitle = bulkDialogTitle(bulkDialog);
  const dialogDescription = bulkDialogDescription(bulkDialog);
  const confirmButtonLabel =
    bulkDialog?.status === "confirm" ? actionConfirmLabel(bulkDialog.action) : "Confirm";
  const toastElement = toast
    ? createPortal(
        <div
          className="ecg-bulk-toast"
          data-tone={toast.tone}
          key={toast.id}
          role="status"
          style={{ left: toast.left }}
        >
          {toast.message}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {selectAllControl}
      {actionControls}
      {archiveMenu}
      {toastElement}
      <AlertModal
        contentClassName="ecg-bulk-dialog"
        description={dialogDescription}
        descriptionClassName="ecg-bulk-dialog-description"
        disableEscape={isBulkRunning}
        initialFocusRef={bulkDialog?.status === "confirm" ? bulkCancelRef : undefined}
        open={bulkDialog !== null}
        overlayClassName="ecg-bulk-dialog-overlay"
        title={dialogTitle}
        titleClassName="ecg-bulk-dialog-title"
        onClose={closeBulkDialog}
      >
        {bulkDialog?.status === "running" ? (
          <div aria-hidden="true" className="ecg-bulk-dialog-progress">
            <span className="ecg-bulk-dialog-spinner" />
          </div>
        ) : (
          <div className="ecg-bulk-dialog-actions">
            <button
              className="ecg-bulk-dialog-secondary"
              ref={bulkCancelRef}
              type="button"
              onClick={closeBulkDialog}
            >
              Cancel
            </button>
            <button className="ecg-bulk-dialog-danger" type="button" onClick={confirmBulkAction}>
              {confirmButtonLabel}
            </button>
          </div>
        )}
      </AlertModal>
    </>
  );
}
