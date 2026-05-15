import type { DomOutlineTurn, OutlineItem, OutlineTree, OutlineTreeNode } from "./types";

type MergeDomOutlineTurnsOptions = {
  preserveExistingStructure?: boolean;
};

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
    element: connectedElement(incoming.element) ?? connectedElement(existing.element) ?? incoming.element,
    source: existing.source
  };
}

function mergeOutlineItems(existingItems: OutlineItem[], incomingItems: OutlineItem[]): OutlineItem[] {
  if (incomingItems.length === 0) {
    return existingItems.filter((item) => item.source !== "dom");
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

function removeRootId(rootIds: string[], nodeId: string): string[] {
  return rootIds.includes(nodeId) ? rootIds.filter((id) => id !== nodeId) : rootIds;
}

function appendChild(nodes: Map<string, OutlineTreeNode>, parentId: string, childId: string): boolean {
  const parent = nodes.get(parentId);
  if (!parent || parent.children.includes(childId)) {
    return false;
  }

  parent.children = [...parent.children, childId];
  return true;
}

function removeChild(nodes: Map<string, OutlineTreeNode>, parentId: string, childId: string): boolean {
  const parent = nodes.get(parentId);
  if (!parent || !parent.children.includes(childId)) {
    return false;
  }

  parent.children = parent.children.filter((id) => id !== childId);
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
        item.source === other.source &&
        connectedElement(item.element) === connectedElement(other.element)
      );
    })
  );
}

function outlineTurnWeight(turn: DomOutlineTurn): number {
  return turn.outlineWeight ?? turn.outlineItems.length;
}

function activeDomTurnId(pathTurns: DomOutlineTurn[]): string {
  const lastTurn = pathTurns[pathTurns.length - 1];
  const branchParentId = lastTurn.parentId;
  if (!branchParentId || lastTurn.role !== "assistant") {
    return lastTurn.id;
  }

  let firstBranchIndex = pathTurns.length - 1;
  while (
    firstBranchIndex > 0 &&
    pathTurns[firstBranchIndex - 1].role === lastTurn.role &&
    pathTurns[firstBranchIndex - 1].parentId === branchParentId
  ) {
    firstBranchIndex -= 1;
  }

  return pathTurns.slice(firstBranchIndex).reduce((best, turn) =>
    outlineTurnWeight(turn) >= outlineTurnWeight(best) ? turn : best
  ).id;
}

export function mergeDomOutlineTurns(
  tree: OutlineTree,
  turns: DomOutlineTurn[],
  options: MergeDomOutlineTurnsOptions = {}
): OutlineTree {
  const pathTurns = turns.filter((turn) => turn.id.length > 0);
  if (pathTurns.length === 0) {
    return tree;
  }

  const nodes = cloneNodes(tree.nodes);
  let rootIds = [...tree.rootIds];
  let previousTurnId: string | null = null;
  let changed = tree.activeNodeId !== activeDomTurnId(pathTurns);
  const preserveExistingStructure = options.preserveExistingStructure ?? false;

  pathTurns.forEach((turn) => {
    const existing = nodes.get(turn.id);
    const parentId =
      preserveExistingStructure && existing
        ? existing.parentId
        : turn.parentId === undefined
          ? (existing?.parentId ?? previousTurnId)
          : turn.parentId;

    if (existing) {
      const nextElement = connectedElement(turn.element) ?? connectedElement(existing.element) ?? turn.element;
      const nextOutlineItems = mergeOutlineItems(existing.outlineItems, turn.outlineItems);
      changed ||= existing.role !== turn.role;
      changed ||= existing.parentId !== parentId;
      changed ||= connectedElement(existing.element) !== connectedElement(nextElement);
      changed ||= !sameOutlineItems(existing.outlineItems, nextOutlineItems);
      if (existing.parentId && existing.parentId !== parentId) {
        changed = removeChild(nodes, existing.parentId, turn.id) || changed;
      }
      if (!existing.parentId && parentId) {
        const nextRootIds = removeRootId(rootIds, turn.id);
        changed ||= nextRootIds !== rootIds;
        rootIds = nextRootIds;
      }

      nodes.set(turn.id, {
        ...existing,
        element: nextElement,
        outlineItems: nextOutlineItems,
        parentId,
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
    activeNodeId: activeDomTurnId(pathTurns),
    nodes,
    rootIds
  };
}
