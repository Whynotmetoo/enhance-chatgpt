import type { OutlineItem, RenderedOutlineItem } from "./types";

function itemHasChildren(items: OutlineItem[], index: number): boolean {
  const nextItem = items[index + 1];
  return nextItem ? nextItem.level > items[index].level : false;
}

export function visibleOutlineItems(
  items: OutlineItem[],
  expandedIds: ReadonlySet<string>
): RenderedOutlineItem[] {
  const visibleItems: RenderedOutlineItem[] = [];
  const ancestors: Array<{ level: number; expanded: boolean }> = [];

  items.forEach((item, index) => {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= item.level) {
      ancestors.pop();
    }

    const hasAncestor = ancestors.length > 0;
    const visible =
      item.level <= 1 ||
      (!hasAncestor && visibleItems.length === 0) ||
      (hasAncestor && ancestors.every((ancestor) => ancestor.expanded));
    const hasChildren = itemHasChildren(items, index);

    if (visible) {
      visibleItems.push({ ...item, hasChildren, originalIndex: index });
    }

    ancestors.push({
      level: item.level,
      expanded: expandedIds.has(item.id)
    });
  });

  return visibleItems;
}

export function visibleActiveItemId(
  items: OutlineItem[],
  index: number,
  visibleIds: ReadonlySet<string>
): string | null {
  const item = items[index];
  if (!item) {
    return null;
  }

  if (visibleIds.has(item.id)) {
    return item.id;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const ancestor = items[cursor];
    if (ancestor.level < item.level && visibleIds.has(ancestor.id)) {
      return ancestor.id;
    }
  }

  return null;
}
