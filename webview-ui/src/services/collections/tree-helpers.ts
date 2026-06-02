/** Tree traversal helpers for collection nodes */

export interface CollectionTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children: CollectionTreeNode[];
  requests: CollectionRequest[];
}

export interface CollectionRequest {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  data?: string;
}

/** Find a node by ID in a tree */
export function findNodeById(nodes: CollectionTreeNode[], id: string): CollectionTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Find the parent node that contains a specific request */
export function findParentOfRequest(nodes: CollectionTreeNode[], requestId: string): CollectionTreeNode | undefined {
  for (const n of nodes) {
    if (n.requests.some(r => r.id === requestId)) return n;
    const found = findParentOfRequest(n.children, requestId);
    if (found) return found;
  }
  return undefined;
}

/** Find a request anywhere in the tree */
export function findRequestById(nodes: CollectionTreeNode[], requestId: string): CollectionRequest | undefined {
  for (const n of nodes) {
    const found = n.requests.find(r => r.id === requestId);
    if (found) return found;
    const sub = findRequestById(n.children, requestId);
    if (sub) return sub;
  }
  return undefined;
}

/** Filter tree by search query (matches names and URLs) */
export function filterTree(nodes: CollectionTreeNode[], query: string): CollectionTreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  return nodes.reduce<CollectionTreeNode[]>((acc, node) => {
    const nameMatch = node.name.toLowerCase().includes(q);
    const filteredRequests = node.requests.filter(r =>
      r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q)
    );
    const filteredChildren = filterTree(node.children, query);
    if (nameMatch || filteredRequests.length > 0 || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren, requests: nameMatch ? node.requests : filteredRequests });
    }
    return acc;
  }, []);
}

/** Collect all node IDs from a tree (for expand-all) */
export function collectAllIds(nodes: CollectionTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (ns: CollectionTreeNode[]) => {
    for (const n of ns) { ids.add(n.id); walk(n.children); }
  };
  walk(nodes);
  return ids;
}

/** Check if a node or any of its children has at least one request */
export function hasAnyRequests(node: CollectionTreeNode): boolean {
  if (node.requests.length > 0) return true;
  return node.children.some(hasAnyRequests);
}
