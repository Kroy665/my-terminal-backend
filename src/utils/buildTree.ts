
import { NodeResponse } from "../services/contentService";
import { NodeType } from "@prisma/client";

export function buildTree(nodes: NodeResponse[]): NodeResponse[] {
  // Create a map for quick lookup by id
  const nodeMap = new Map<string, NodeResponse>();
  const rootNodes: NodeResponse[] = [];

  // First pass: Create tree nodes and add to map
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  // Second pass: Build parent-child relationships
  nodes.forEach(node => {
    const treeNode = nodeMap.get(node.id)!;
    
    if (!node.parentId) {
      // Root level node
      rootNodes.push(treeNode);
    } else {
      // Child node - add to parent's children array
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(treeNode);
      } else {
        // Parent not found, treat as root
        rootNodes.push(treeNode);
      }
    }
  });

  // Sort children by type (directories first) and then by name
  const sortNodes = (nodes: NodeResponse[]) => {
    nodes.sort((a, b) => {
      // Directories come before files
      if (a.type !== b.type) {
        return a.type === NodeType.DIRECTORY ? -1 : 1;
      }
      // Then sort alphabetically by name
      return a.name.localeCompare(b.name);
    });

    // Recursively sort children
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(rootNodes);

  return rootNodes;
}
