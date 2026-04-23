import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "../lib/dom";
import { fetchConversationOutlineWithRetry } from "./conversationOutline/apiOutline";
import { pendingScrollDelayMs } from "./conversationOutline/constants";
import {
  bindOutlineItems,
  collectDomOutlineItems,
  connectedElement,
  conversationMutationRoot
} from "./conversationOutline/domOutline";
import { useConversationLocation, useConversationStateActivity, useRightSidePanel } from "./conversationOutline/hooks";
import { visibleActiveItemId, visibleOutlineItems } from "./conversationOutline/rendering";
import { nextPendingScroll, scrollContainerFor, scrollToOutlineItem } from "./conversationOutline/scroll";
import type { OutlineItem, OutlineSource, PendingScroll, RenderedOutlineItem } from "./conversationOutline/types";

type OutlineDepthStyle = CSSProperties & {
  "--ecg-depth": number;
};

const initialActiveRefreshDelays = [80, 240, 600, 1000];
const domFallbackDelayMs = 12_000;

function outlineItemKey(item: OutlineItem): string {
  if (!item.messageId) {
    return `id:${item.id}`;
  }

  return item.headingIndex === null
    ? `${item.kind}:${item.messageId}`
    : `${item.kind}:${item.messageId}:${item.headingIndex}`;
}

function mergeExistingOutlineItem(existing: OutlineItem, incoming: OutlineItem): OutlineItem {
  return {
    ...incoming,
    element: connectedElement(incoming.element) ?? connectedElement(existing.element) ?? incoming.element
  };
}

function outlineItemIndexes(items: OutlineItem[]): Map<string, number> {
  return new Map(items.map((item, index) => [outlineItemKey(item), index]));
}

function outlineInsertionIndex(
  itemIndexes: ReadonlyMap<string, number>,
  incomingItems: OutlineItem[],
  incomingIndex: number,
  fallbackIndex: number
): number {
  for (let cursor = incomingIndex - 1; cursor >= 0; cursor -= 1) {
    const previousIndex = itemIndexes.get(outlineItemKey(incomingItems[cursor]));
    if (previousIndex !== undefined) {
      return previousIndex + 1;
    }
  }

  for (let cursor = incomingIndex + 1; cursor < incomingItems.length; cursor += 1) {
    const nextIndex = itemIndexes.get(outlineItemKey(incomingItems[cursor]));
    if (nextIndex !== undefined) {
      return nextIndex;
    }
  }

  return fallbackIndex;
}

function mergeOutlineItems(currentItems: OutlineItem[], incomingItems: OutlineItem[]): OutlineItem[] {
  const mergedItems = [...currentItems];
  let itemIndexes = outlineItemIndexes(mergedItems);

  incomingItems.forEach((item, incomingIndex) => {
    const key = outlineItemKey(item);
    const existingIndex = itemIndexes.get(key);

    if (existingIndex === undefined) {
      const insertionIndex = outlineInsertionIndex(itemIndexes, incomingItems, incomingIndex, mergedItems.length);
      mergedItems.splice(insertionIndex, 0, item);
      itemIndexes = outlineItemIndexes(mergedItems);
      return;
    }

    mergedItems[existingIndex] = mergeExistingOutlineItem(mergedItems[existingIndex], item);
  });

  return mergedItems;
}

function appendMissingOutlineItems(baseItems: OutlineItem[], extraItems: OutlineItem[]): OutlineItem[] {
  const mergedItems = [...baseItems];
  const itemIndexes = new Map(mergedItems.map((item, index) => [outlineItemKey(item), index]));

  extraItems.forEach((item) => {
    const key = outlineItemKey(item);
    const existingIndex = itemIndexes.get(key);

    if (existingIndex === undefined) {
      itemIndexes.set(key, mergedItems.length);
      mergedItems.push(item);
      return;
    }

    const existing = mergedItems[existingIndex];
    mergedItems[existingIndex] = {
      ...existing,
      element: connectedElement(existing.element) ?? connectedElement(item.element) ?? existing.element
    };
  });

  return mergedItems;
}

function liveOutlineItems(apiItems: OutlineItem[], currentItems: OutlineItem[], includeDomItems: boolean): OutlineItem[] {
  const boundApiItems = bindOutlineItems(apiItems);
  if (!includeDomItems) {
    return boundApiItems;
  }

  const accumulatedItems = appendMissingOutlineItems(boundApiItems, currentItems);

  return mergeOutlineItems(accumulatedItems, collectDomOutlineItems());
}

export function ConversationOutline(): ReactElement | null {
  const conversationLocation = useConversationLocation();
  const { conversationId } = conversationLocation;
  const [source, setSource] = useState<OutlineSource>({ conversationId: null, mode: "api", items: [] });
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<PendingScroll | null>(null);
  const lastApiItemsRef = useRef<OutlineItem[] | null>(null);
  const isRightSidePanelOpen = useRightSidePanel();
  const hasConversationStateActivity = useConversationStateActivity(conversationId, conversationLocation.changedAt);
  const [domFallbackReady, setDomFallbackReady] = useState(false);
  const renderedItems = useMemo(() => visibleOutlineItems(items, expandedIds), [items, expandedIds]);

  useEffect(() => {
    setDomFallbackReady(false);
    if (!conversationId) {
      return;
    }

    const timer = window.setTimeout(() => setDomFallbackReady(true), domFallbackDelayMs);
    return () => window.clearTimeout(timer);
  }, [conversationId, conversationLocation.changedAt]);

  useEffect(() => {
    if (!conversationId) {
      lastApiItemsRef.current = null;
      setSource({ conversationId: null, mode: "dom", items: [] });
      setItems([]);
      setActiveId(null);
      setPendingScroll(null);
      return;
    }

    const controller = new AbortController();
    lastApiItemsRef.current = null;
    setSource({ conversationId, mode: "api", items: [] });
    setItems([]);
    setActiveId(null);
    setPendingScroll(null);

    fetchConversationOutlineWithRetry(conversationId, controller.signal, conversationLocation.changedAt)
      .then((outlineItems) => {
        if (!controller.signal.aborted) {
          setSource({
            conversationId,
            mode: outlineItems.length > 0 ? "api" : "dom",
            items: outlineItems
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSource({ conversationId, mode: "dom", items: [] });
        }
      });

    return () => controller.abort();
  }, [conversationId, conversationLocation.changedAt]);

  useEffect(() => {
    setExpandedIds(new Set());
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      lastApiItemsRef.current = null;
      setItems([]);
      return;
    }

    if (source.conversationId !== conversationId) {
      lastApiItemsRef.current = null;
      setItems([]);
      return;
    }

    if (source.mode === "dom") {
      lastApiItemsRef.current = null;
      if (!hasConversationStateActivity && !domFallbackReady) {
        setItems([]);
        return;
      }

      const update = () => setItems((currentItems) => mergeOutlineItems(currentItems, collectDomOutlineItems()));
      const scheduleUpdate = debounce(update, 150);
      const observer = new MutationObserver(scheduleUpdate);

      update();
      observer.observe(conversationMutationRoot(), { childList: true, subtree: true });

      return () => observer.disconnect();
    }

    const update = () => {
      const apiItemsChanged = lastApiItemsRef.current !== source.items;
      lastApiItemsRef.current = source.items;
      setItems((currentItems) =>
        liveOutlineItems(source.items, apiItemsChanged ? [] : currentItems, hasConversationStateActivity)
      );
    };
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
  }, [conversationId, conversationLocation.changedAt, domFallbackReady, hasConversationStateActivity, source]);

  useEffect(() => {
    const observableItems = items
      .map((item, index) => ({ element: connectedElement(item.element), index }))
      .filter((item): item is { element: HTMLElement; index: number } => item.element !== null);
    if (observableItems.length === 0) {
      setActiveId(null);
      return;
    }

    const visibleIds = new Set(renderedItems.map((item) => item.id));
    const updateActiveFromViewport = () => {
      const viewportTop = window.innerHeight * 0.18;
      const viewportBottom = window.innerHeight * 0.38;
      const candidates = observableItems
        .map(({ element, index }) => {
          const rect = element.getBoundingClientRect();
          return { element, index, rect };
        })
        .filter(({ element, rect }) => element.isConnected && rect.height > 0)
        .sort((a, b) => a.rect.top - b.rect.top);

      if (candidates.length === 0) {
        setActiveId(null);
        return;
      }

      const visibleHeading = candidates.find(({ rect }) => rect.bottom >= viewportTop && rect.top <= viewportBottom);
      let active = visibleHeading;
      if (!active) {
        for (const candidate of candidates) {
          if (candidate.rect.top <= viewportBottom) {
            active = candidate;
          }
        }
      }
      active ??= candidates[0];

      const nextActiveId = visibleActiveItemId(items, active.index, visibleIds);
      if (nextActiveId) {
        setActiveId((current) => (current === nextActiveId ? current : nextActiveId));
      }
    };
    let frame: number | null = null;
    const scheduleActiveUpdate = () => {
      if (frame !== null) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateActiveFromViewport();
      });
    };
    const observer = new IntersectionObserver(
      () => scheduleActiveUpdate(),
      {
        rootMargin: "-10% 0px -62% 0px",
        threshold: [0, 0.1, 0.5, 1]
      }
    );
    const scrollTargets = new Set<EventTarget>([window]);

    observableItems.forEach((item) => {
      observer.observe(item.element);
      const container = scrollContainerFor(item.element);
      scrollTargets.add(container === document.scrollingElement ? window : container);
    });
    scrollTargets.forEach((target) => target.addEventListener("scroll", scheduleActiveUpdate, { passive: true }));
    window.addEventListener("resize", scheduleActiveUpdate);

    updateActiveFromViewport();
    scheduleActiveUpdate();
    const timers = initialActiveRefreshDelays.map((delay) => window.setTimeout(scheduleActiveUpdate, delay));

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      scrollTargets.forEach((target) => target.removeEventListener("scroll", scheduleActiveUpdate));
      window.removeEventListener("resize", scheduleActiveUpdate);
    };
  }, [items, renderedItems]);

  useEffect(() => {
    if (!pendingScroll) {
      return;
    }

    const continuePendingScroll = () => {
      setPendingScroll((current) => (current ? nextPendingScroll(items, current) : null));
    };
    const timer = window.setTimeout(continuePendingScroll, pendingScrollDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [items, pendingScroll]);

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

  const handleOutlineItemNavigation = (item: RenderedOutlineItem) => {
    const reachedExactTarget = scrollToOutlineItem(items, item.originalIndex, "smooth");
    setPendingScroll(
      reachedExactTarget
        ? null
        : {
            attempts: 0,
            id: item.id,
            index: item.originalIndex
          }
    );
  };

  if (!conversationId || source.conversationId !== conversationId || items.length === 0 || isRightSidePanelOpen) {
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
            <button className="ecg-outline-label" type="button" onClick={() => handleOutlineItemNavigation(item)}>
              {item.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
