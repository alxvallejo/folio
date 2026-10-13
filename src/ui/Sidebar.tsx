import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Tree, TreeNode } from "../lib/api";
import { basename } from "../lib/paths";
import { ancestorDirs } from "./tree";

interface Props {
  root: string;
  tree: Tree | null;
  currentPath: string | null;
  onOpen: (path: string) => void;
}

export function Sidebar({ root, tree, currentPath, onOpen }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Reveal the open file: expand its ancestors, then scroll its row into view.
  useEffect(() => {
    if (!tree || !currentPath) return;
    const dirs = ancestorDirs(tree.root, currentPath);
    setExpanded((prev) => (dirs.every((d) => prev.has(d)) ? prev : new Set([...prev, ...dirs])));
  }, [tree, currentPath]);

  useEffect(() => {
    listRef.current?.querySelector(".tree-row.active")?.scrollIntoView({ block: "nearest" });
  }, [currentPath, expanded]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <nav className="sidebar" aria-label="Files">
      <div className="sidebar-title" title={root}>
        {basename(root) || root}
      </div>
      <div className="sidebar-tree" ref={listRef}>
        {tree && tree.root.children.length > 0 && (
          <ul role="tree">
            {tree.root.children.map((node) => (
              <Item key={node.path} node={node} depth={0} expanded={expanded} currentPath={currentPath} onToggle={toggle} onOpen={onOpen} />
            ))}
          </ul>
        )}
        {tree && tree.root.children.length === 0 && <p className="sidebar-empty">No Markdown files here.</p>}
        {tree?.truncated && <p className="sidebar-note">This folder is very large or deep, so some files aren't shown.</p>}
      </div>
    </nav>
  );
}

interface ItemProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  currentPath: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}

function Item({ node, depth, expanded, currentPath, onToggle, onOpen }: ItemProps) {
  const indent = { paddingLeft: 10 + depth * 14 };
  if (node.isDir) {
    const open = expanded.has(node.path);
    return (
      <li role="treeitem" aria-expanded={open}>
        <button className="tree-row" style={indent} onClick={() => onToggle(node.path)}>
          <ChevronRight size={14} className={open ? "chevron open" : "chevron"} />
          {node.name}
        </button>
        {open && (
          <ul role="group">
            {node.children.map((child) => (
              <Item key={child.path} node={child} depth={depth + 1} expanded={expanded} currentPath={currentPath} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li role="treeitem">
      <button className={node.path === currentPath ? "tree-row active" : "tree-row"} style={indent} onClick={() => onOpen(node.path)}>
        <FileText size={14} className="file-icon" />
        {node.name}
      </button>
    </li>
  );
}
