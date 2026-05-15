import type { CSSProperties, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { debounce } from "../lib/dom";
import { fetchConversationOutlineTreeWithRetry } from "./conversationOutline/apiOutline";
import { pendingScrollDelayMs } from "./conversationOutline/constants";
import {
  bindOutlineItems,
  collectDomOutlineTurns,
  connectedElement,
  conversationMutationRoot
} from "./conversationOutline/domOutline";
import {
  cachedDomOutlineTree,
  forgetDomOutlineTree,
  rememberDomOutlineTree
} from "./conversationOutline/domOutlineCache";
import {
  useConversationLocation,
  useConversationStateActivity,
  useNewConversationStateActivity,
  useRightSidePanel
} from "./conversationOutline/hooks";
import { visibleActiveItemId, visibleOutlineItems } from "./conversationOutline/rendering";
import { nextPendingScroll, scrollContainerFor, scrollToOutlineItem } from "./conversationOutline/scroll";
import { activePathItems, createEmptyOutlineTree, mergeDomOutlineTurns, treeHasOutlineItems } from "./conversationOutline/tree";
import type { DomOutlineTurn, OutlineItem, OutlineSource, OutlineTree, PendingScroll, RenderedOutlineItem } from "./conversationOutline/types";

type OutlineDepthStyle = CSSProperties & {
  "--ecg-depth": number;
};

const initialActiveRefreshDelays = [80, 240, 600, 1000];
const domFallbackDelayMs = 8_000;

function turnsOverlapTree(turns: DomOutlineTurn[], tree: OutlineTree): boolean {
  if (tree.nodes.size === 0) {
    return true;
  }

  return turns.some((turn) => tree.nodes.has(turn.id));
}

export function ConversationOutline(): ReactElement | null {
  const conversationLocation = useConversationLocation();
  const { conversationId } = conversationLocation;
  const [source, setSource] = useState<OutlineSource>({ conversationId: null, mode: "api", tree: null });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<PendingScroll | null>(null);
  const [cachedDomConversationId, setCachedDomConversationId] = useState<string | null>(null);
  const isRightSidePanelOpen = useRightSidePanel();
  const hasConversationStateActivity = useConversationStateActivity(conversationId, conversationLocation.changedAt);
  const hasNewConversationStateActivity = useNewConversationStateActivity(conversationId, conversationLocation.changedAt);
  const shouldUseImmediateDomFallback =
    conversationLocation.previousConversationId === null && hasNewConversationStateActivity;
  const [domFallbackReady, setDomFallbackReady] = useState(false);
  const isUsingCachedDomTree =
    cachedDomConversationId === conversationId && source.mode === "dom" && source.tree !== null;
  const items = useMemo<OutlineItem[]>(() => bindOutlineItems(activePathItems(source.tree)), [source.tree]);
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
      setSource({ conversationId: null, mode: "dom", tree: null });
      setActiveId(null);
      setPendingScroll(null);
      setCachedDomConversationId(null);
      return;
    }

    const cachedTree = cachedDomOutlineTree(conversationId);
    if (cachedTree) {
      setSource({ conversationId, mode: "dom", tree: cachedTree });
      setActiveId(null);
      setPendingScroll(null);
      setCachedDomConversationId(conversationId);
      return;
    }

    if (shouldUseImmediateDomFallback) {
      setSource({ conversationId, mode: "dom", tree: null });
      setActiveId(null);
      setPendingScroll(null);
      setCachedDomConversationId(conversationId);
      return;
    }

    const controller = new AbortController();
    setSource({ conversationId, mode: "api", tree: null });
    setActiveId(null);
    setPendingScroll(null);
    setCachedDomConversationId(null);

    fetchConversationOutlineTreeWithRetry(conversationId, controller.signal, conversationLocation.changedAt)
      .then((tree) => {
        if (!controller.signal.aborted) {
          setSource({
            conversationId,
            mode: treeHasOutlineItems(tree) ? "api" : "dom",
            tree
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSource({ conversationId, mode: "dom", tree: null });
          setCachedDomConversationId(null);
        }
      });

    return () => controller.abort();
  }, [conversationId, conversationLocation.changedAt, shouldUseImmediateDomFallback]);

  useEffect(() => {
    setExpandedIds(new Set());
  }, [conversationId]);

  useEffect(() => {
    if (!source.conversationId) {
      return;
    }

    if (
      source.mode === "dom" &&
      source.conversationId === cachedDomConversationId &&
      source.tree &&
      treeHasOutlineItems(source.tree)
    ) {
      rememberDomOutlineTree(source.conversationId, source.tree);
      return;
    }

    if (source.mode === "api" && treeHasOutlineItems(source.tree)) {
      forgetDomOutlineTree(source.conversationId);
    }
  }, [cachedDomConversationId, source]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    if (source.conversationId !== conversationId) {
      return;
    }

    if (source.mode === "dom") {
      if (!hasConversationStateActivity && !shouldUseImmediateDomFallback && !domFallbackReady && !isUsingCachedDomTree) {
        return;
      }

      const update = () => {
        const turns = collectDomOutlineTurns();
        if (turns.length === 0) {
          return;
        }

        setSource((current) => {
          if (current.conversationId !== conversationId || current.mode !== "dom") {
            return current;
          }

          const tree = current.tree ?? createEmptyOutlineTree(conversationId);
          if (isUsingCachedDomTree && !turnsOverlapTree(turns, tree)) {
            return current;
          }

          const nextTree = mergeDomOutlineTurns(tree, turns);
          if (nextTree === tree) {
            return current;
          }

          return {
            ...current,
            tree: nextTree
          };
        });
      };
      const scheduleUpdate = debounce(update, 150);
      const observer = new MutationObserver(scheduleUpdate);

      update();
      observer.observe(conversationMutationRoot(), { attributes: true, characterData: true, childList: true, subtree: true });

      return () => {
        scheduleUpdate.cancel();
        observer.disconnect();
      };
    }

    const update = () => {
      const turns = collectDomOutlineTurns();
      if (turns.length === 0) {
        return;
      }

      setSource((current) => {
        if (current.conversationId !== conversationId || current.mode !== "api" || !current.tree) {
          return current;
        }

        const nextTree = mergeDomOutlineTurns(current.tree, turns, { preserveExistingStructure: true });
        if (nextTree === current.tree) {
          return current;
        }

        return {
          ...current,
          tree: nextTree
        };
      });
    };
    const scheduleUpdate = debounce(update, 150);
    const observer = new MutationObserver(scheduleUpdate);

    update();
    observer.observe(conversationMutationRoot(), { attributes: true, characterData: true, childList: true, subtree: true });

    return () => {
      scheduleUpdate.cancel();
      observer.disconnect();
    };
  }, [
    conversationId,
    domFallbackReady,
    hasConversationStateActivity,
    isUsingCachedDomTree,
    shouldUseImmediateDomFallback,
    source.conversationId,
    source.mode
  ]);

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
      const viewportTop = window.innerHeight * 0.10;
      const viewportBottom = window.innerHeight * 0.35;
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
