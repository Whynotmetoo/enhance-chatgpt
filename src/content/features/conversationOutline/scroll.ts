import {
  maxPendingScrollAttempts,
  outlineScrollAlignmentTolerance,
  outlineScrollTopOffset,
  pendingHeadingScrollMinStep,
  pendingScrollMinStep,
  pendingScrollStepRatio
} from "./constants";
import { connectedElement, exactOutlineElement } from "./domOutline";
import type { OutlineItem, PendingScroll } from "./types";

type MountedOutlineAnchor = {
  element: HTMLElement;
  index: number;
};

function mountedAnchors(items: OutlineItem[]): MountedOutlineAnchor[] {
  return items.flatMap((item, index) => {
    const element = connectedElement(item.element);
    return element ? [{ element, index }] : [];
  });
}

function distanceToViewportAnchor(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const anchorY = window.innerHeight * 0.35;

  if (rect.top <= anchorY && rect.bottom >= anchorY) {
    return 0;
  }

  return Math.min(Math.abs(rect.top - anchorY), Math.abs(rect.bottom - anchorY));
}

function currentMountedAnchor(items: OutlineItem[], fallbackIndex: number): MountedOutlineAnchor | null {
  const anchors = mountedAnchors(items);
  if (anchors.length > 0) {
    return anchors.sort((a, b) => distanceToViewportAnchor(a.element) - distanceToViewportAnchor(b.element))[0];
  }

  const root = document.querySelector<HTMLElement>("#thread") ?? document.querySelector<HTMLElement>("main");
  return root ? { element: root, index: fallbackIndex } : null;
}

function parentSectionAnchor(items: OutlineItem[], index: number): MountedOutlineAnchor | null {
  const item = items[index];
  if (!item || item.level <= 1) {
    return null;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (items[cursor].level < item.level) {
      const element = exactOutlineElement(items[cursor]) ?? connectedElement(items[cursor].element);
      return element ? { element, index: cursor } : null;
    }
  }

  return null;
}

function isScrollableElement(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  return /auto|scroll|overlay/.test(overflowY) && element.scrollHeight > element.clientHeight;
}

export function scrollContainerFor(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (isScrollableElement(parent)) {
      return parent;
    }
  }

  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollTargetTop(element: HTMLElement, container: HTMLElement): number {
  const elementTop = element.getBoundingClientRect().top;
  const containerTop = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
  const top = container.scrollTop + elementTop - containerTop - outlineScrollTopOffset;

  return clampScrollTop(container, top);
}

function clampScrollTop(container: HTMLElement, top: number): number {
  const maxTop = Math.max(container.scrollHeight - container.clientHeight, 0);

  return Math.min(Math.max(top, 0), maxTop);
}

function isElementScrollAligned(element: HTMLElement, container: HTMLElement): boolean {
  return Math.abs(container.scrollTop - scrollTargetTop(element, container)) <= outlineScrollAlignmentTolerance;
}

function scrollElementIntoView(element: HTMLElement, behavior: ScrollBehavior): boolean {
  const container = scrollContainerFor(element);
  const isAligned = isElementScrollAligned(element, container);

  if (!isAligned) {
    container.scrollTo({ top: scrollTargetTop(element, container), behavior });
  }

  return isAligned;
}

function pendingScrollStep(container: HTMLElement, anchorIndex: number, targetIndex: number, targetLevel: number): number {
  const indexDistance = Math.abs(targetIndex - anchorIndex);
  const baseStep = Math.max(
    container.clientHeight * pendingScrollStepRatio,
    targetLevel > 1 ? pendingHeadingScrollMinStep : pendingScrollMinStep
  );
  const indexMultiplier = targetLevel > 1 ? 1 + Math.min(indexDistance, 6) * 0.25 : 1;

  return baseStep * indexMultiplier;
}

function scrollTowardAnchor(
  anchor: MountedOutlineAnchor,
  targetIndex: number,
  targetLevel: number,
  behavior: ScrollBehavior
): void {
  const container = scrollContainerFor(anchor.element);
  const direction = anchor.index < targetIndex ? 1 : -1;
  const step = pendingScrollStep(container, anchor.index, targetIndex, targetLevel);

  if (anchor.index === targetIndex) {
    scrollElementIntoView(anchor.element, behavior);
    return;
  }

  container.scrollTo({ top: clampScrollTop(container, container.scrollTop + direction * step), behavior });
}

export function scrollToOutlineItem(items: OutlineItem[], index: number, behavior: ScrollBehavior): boolean {
  const item = items[index];
  const exactElement = item ? exactOutlineElement(item) : null;
  if (exactElement) {
    return scrollElementIntoView(exactElement, behavior);
  }

  const sectionAnchor = parentSectionAnchor(items, index);
  if (sectionAnchor) {
    const container = scrollContainerFor(sectionAnchor.element);
    if (!isElementScrollAligned(sectionAnchor.element, container)) {
      scrollElementIntoView(sectionAnchor.element, behavior);
      return false;
    }

    scrollTowardAnchor(sectionAnchor, index, item?.level ?? 1, behavior);
    return false;
  }

  const anchor = currentMountedAnchor(items, index);
  if (!anchor) {
    return false;
  }

  scrollTowardAnchor(anchor, index, item?.level ?? 1, behavior);
  return false;
}

export function nextPendingScroll(items: OutlineItem[], pendingScroll: PendingScroll): PendingScroll | null {
  const index = items.findIndex((item) => item.id === pendingScroll.id);
  const nextIndex = index >= 0 ? index : pendingScroll.index;
  const reachedExactTarget = scrollToOutlineItem(items, nextIndex, "auto");
  if (reachedExactTarget || pendingScroll.attempts + 1 >= maxPendingScrollAttempts) {
    return null;
  }

  return {
    ...pendingScroll,
    attempts: pendingScroll.attempts + 1,
    index: nextIndex
  };
}
