import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { debounce } from "../lib/dom";
import { fetchConversationOutlineWithRetry } from "./conversationOutline/apiOutline";
import { pendingScrollDelayMs } from "./conversationOutline/constants";
import {
  bindOutlineItems,
  collectDomOutlineItems,
  connectedElement,
  conversationMutationRoot
} from "./conversationOutline/domOutline";
import { useConversationLocation, useRightSidePanel } from "./conversationOutline/hooks";
import { visibleActiveItemId, visibleOutlineItems } from "./conversationOutline/rendering";
import { nextPendingScroll, scrollContainerFor, scrollToOutlineItem } from "./conversationOutline/scroll";
import type { OutlineItem, OutlineSource, PendingScroll, RenderedOutlineItem } from "./conversationOutline/types";

type OutlineDepthStyle = CSSProperties & {
  "--ecg-depth": number;
};

const initialActiveRefreshDelays = [80, 240, 600, 1000];

export function ConversationOutline(): ReactElement | null {
  const conversationLocation = useConversationLocation();
  const { conversationId } = conversationLocation;
  const [source, setSource] = useState<OutlineSource>({ conversationId: null, mode: "api", items: [] });
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<PendingScroll | null>(null);
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
    setPendingScroll(null);

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
            <button className="ecg-outline-label" type="button" onClick={() => handleOutlineItemNavigation(item)}>
              {item.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
