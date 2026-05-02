import type { DomOutlineTurn, OutlineItem, OutlineTree, OutlineTreeNode } from "./types";

function connectedElement(element: HTMLElement | null | undefined): HTMLElement | null {
  return element?.isConnected ? element : null;
}

function outlineItemKey(item: OutlineItem): string {
  if (!item.messageId) {
    return `id:${item.id}`;
  }

  return item.headingIndex === null
    ? `${item.kind}:${item.messageId}`
    : `${item.kind}:${item.messageId}:${item.headingIndex}`;
}

function cloneNode(node: OutlineTreeNode): OutlineTreeNode {
  return {
    ...node,
    children: [...node.children],
    outlineItems: [...node.outlineItems]
  };
}

function cloneNodes(nodes: ReadonlyMap<string, OutlineTreeNode>): Map<string, OutlineTreeNode> {
  return new Map(Array.from(nodes.entries()).map(([id, node]) => [id, cloneNode(node)]));
}

function mergeExistingOutlineItem(existing: OutlineItem, incoming: OutlineItem): OutlineItem {
  return {
    ...incoming,
    id: existing.id,
    element: connectedElement(incoming.element) ?? connectedElement(existing.element) ?? incoming.element
  };
}

function mergeOutlineItems(existingItems: OutlineItem[], incomingItems: OutlineItem[]): OutlineItem[] {
  if (incomingItems.length === 0) {
    return existingItems;
  }

  const existingItemsByKey = new Map(existingItems.map((item) => [outlineItemKey(item), item]));

  return incomingItems.map((item) => {
    const existing = existingItemsByKey.get(outlineItemKey(item));
    return existing ? mergeExistingOutlineItem(existing, item) : item;
  });
}

function addRootId(rootIds: string[], nodeId: string): string[] {
  return rootIds.includes(nodeId) ? rootIds : [...rootIds, nodeId];
}

function appendChild(nodes: Map<string, OutlineTreeNode>, parentId: string, childId: string): boolean {
  const parent = nodes.get(parentId);
  if (!parent || parent.children.includes(childId)) {
    return false;
  }

  parent.children = [...parent.children, childId];
  return true;
}

export function createEmptyOutlineTree(conversationId: string): OutlineTree {
  return {
    activeNodeId: null,
    conversationId,
    nodes: new Map(),
    rootIds: []
  };
}

export function treeHasOutlineItems(tree: OutlineTree | null): boolean {
  return tree ? Array.from(tree.nodes.values()).some((node) => node.outlineItems.length > 0) : false;
}

function activePathNodeIds(tree: OutlineTree): string[] {
  if (!tree.activeNodeId || !tree.nodes.has(tree.activeNodeId)) {
    return [];
  }

  const path: string[] = [];
  const seen = new Set<string>();
  let nodeId: string | null = tree.activeNodeId;

  while (nodeId && tree.nodes.has(nodeId) && !seen.has(nodeId)) {
    seen.add(nodeId);
    path.push(nodeId);
    nodeId = tree.nodes.get(nodeId)?.parentId ?? null;
  }

  return path.reverse();
}

export function activePathItems(tree: OutlineTree | null): OutlineItem[] {
  if (!tree) {
    return [];
  }

  return activePathNodeIds(tree).flatMap((nodeId) => tree.nodes.get(nodeId)?.outlineItems ?? []);
}

function sameOutlineItems(left: OutlineItem[], right: OutlineItem[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        item.id === other.id &&
        item.label === other.label &&
        item.level === other.level &&
        item.kind === other.kind &&
        item.messageId === other.messageId &&
        item.headingIndex === other.headingIndex &&
        connectedElement(item.element) === connectedElement(other.element)
      );
    })
  );
}

export function mergeDomOutlineTurns(tree: OutlineTree, turns: DomOutlineTurn[]): OutlineTree {
  const pathTurns = turns.filter((turn) => turn.id.length > 0);
  if (pathTurns.length === 0) {
    return tree;
  }

  const nodes = cloneNodes(tree.nodes);
  let rootIds = [...tree.rootIds];
  let previousTurnId: string | null = null;
  let changed = tree.activeNodeId !== pathTurns[pathTurns.length - 1].id;

  pathTurns.forEach((turn) => {
    const existing = nodes.get(turn.id);
    const parentId = existing?.parentId ?? previousTurnId;

    if (existing) {
      const nextElement = connectedElement(turn.element) ?? connectedElement(existing.element) ?? turn.element;
      const nextOutlineItems = mergeOutlineItems(existing.outlineItems, turn.outlineItems);
      changed ||= existing.role !== turn.role;
      changed ||= connectedElement(existing.element) !== connectedElement(nextElement);
      changed ||= !sameOutlineItems(existing.outlineItems, nextOutlineItems);

      nodes.set(turn.id, {
        ...existing,
        element: nextElement,
        outlineItems: nextOutlineItems,
        role: turn.role
      });
    } else {
      changed = true;
      nodes.set(turn.id, {
        children: [],
        element: turn.element,
        id: turn.id,
        outlineItems: turn.outlineItems,
        parentId,
        role: turn.role
      });
    }

    if (parentId) {
      changed = appendChild(nodes, parentId, turn.id) || changed;
    } else {
      const nextRootIds = addRootId(rootIds, turn.id);
      changed ||= nextRootIds !== rootIds;
      rootIds = nextRootIds;
    }

    previousTurnId = turn.id;
  });

  if (!changed) {
    return tree;
  }

  return {
    ...tree,
    activeNodeId: pathTurns[pathTurns.length - 1].id,
    nodes,
    rootIds
  };
}
