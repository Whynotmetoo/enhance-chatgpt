import type { OutlineItem, OutlineTree, OutlineTreeNode } from "./types";

const maxCachedDomOutlineTrees = 100;
const domOutlineTreeCache = new Map<string, OutlineTree>();

function cloneOutlineItemWithoutElement(item: OutlineItem): OutlineItem {
  return {
    ...item,
    element: null
  };
}

function cloneNodeWithoutElement(node: OutlineTreeNode): OutlineTreeNode {
  return {
    ...node,
    children: [...node.children],
    element: null,
    outlineItems: node.outlineItems.map(cloneOutlineItemWithoutElement)
  };
}

function cloneTreeWithoutElements(tree: OutlineTree): OutlineTree {
  return {
    ...tree,
    nodes: new Map(Array.from(tree.nodes.entries()).map(([id, node]) => [id, cloneNodeWithoutElement(node)])),
    rootIds: [...tree.rootIds]
  };
}

export function rememberDomOutlineTree(conversationId: string, tree: OutlineTree): void {
  if (tree.conversationId !== conversationId) {
    return;
  }

  domOutlineTreeCache.delete(conversationId);
  domOutlineTreeCache.set(conversationId, cloneTreeWithoutElements(tree));

  while (domOutlineTreeCache.size > maxCachedDomOutlineTrees) {
    const oldestConversationId = domOutlineTreeCache.keys().next().value;
    if (!oldestConversationId) {
      return;
    }

    domOutlineTreeCache.delete(oldestConversationId);
  }
}

export function cachedDomOutlineTree(conversationId: string): OutlineTree | null {
  const tree = domOutlineTreeCache.get(conversationId);
  return tree ? cloneTreeWithoutElements(tree) : null;
}

export function forgetDomOutlineTree(conversationId: string): void {
  domOutlineTreeCache.delete(conversationId);
}
