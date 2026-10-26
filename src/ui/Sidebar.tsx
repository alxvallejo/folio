import { ChevronRight, FileText } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Tree, TreeNode } from "../lib/api";
import { basename } from "../lib/paths";
import type { PostStatus } from "../posts/frontmatter";
import { ancestorDirs } from "./tree";

interface Props {
  root: string;
  tree: Tree | null;
  currentPath: string | null;
  onOpen: (path: string) => void;
  /** Draft/Published tags by path; files not in the map get no tag. */
  statuses?: Map<string, PostStatus>;
  /** Set only when the open folder is the posts folder or inside it; shows "+ New post". */
  onNewPost?: () => void;
  /** The inline title box, shown under the header while a new post is being named. */
  newPostBox?: ReactNode;
}

export function Sidebar({ root, tree, currentPath, onOpen, statuses, onNewPost, newPostBox }: Props) {
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
      <div className="sidebar-header">
        <div className="sidebar-title" title={root}>
          {basename(root) || root}
        </div>
        {onNewPost && (
          <button className="new-post-button" onClick={onNewPost}>
            + New post
          </button>
        )}
      </div>
      {newPostBox}
      <div className="sidebar-tree" ref={listRef}>
        {tree && tree.root.children.length > 0 && (
          <ul role="tree">
            {tree.root.children.map((node) => (
              <Item key={node.path} node={node} depth={0} expanded={expanded} currentPath={currentPath} statuses={statuses} onToggle={toggle} onOpen={onOpen} />
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
  statuses?: Map<string, PostStatus>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}

function Item({ node, depth, expanded, currentPath, statuses, onToggle, onOpen }: ItemProps) {
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
              <Item key={child.path} node={child} depth={depth + 1} expanded={expanded} currentPath={currentPath} statuses={statuses} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </li>
    );
  }
  const status = statuses?.get(node.path);
  return (
    <li role="treeitem">
      <button className={node.path === currentPath ? "tree-row active" : "tree-row"} style={indent} onClick={() => onOpen(node.path)}>
        <FileText size={14} className="file-icon" />
        {node.name}
        {status && <span className={`post-tag ${status}`}>{status === "draft" ? "Draft" : "Published"}</span>}
      </button>
    </li>
  );
}
