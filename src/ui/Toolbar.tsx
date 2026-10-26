import { PanelLeft, PanelRight, Search, Settings2, SquarePen } from "lucide-react";
import type { SaveState } from "../editor/autosave";
import { saveSuffix } from "../editor/writer";
import type { PostStatus } from "../posts/frontmatter";
import { THEMES, type ThemeId } from "../themes/catalog";

interface Props {
  title: string;
  /** Writing mode: whether the post is saved, shown after the title. */
  saveState?: SaveState;
  /** The theme currently shown. */
  theme: ThemeId;
  /** Themes available for the current appearance; picking one sets that appearance's slot. */
  themes: ThemeId[];
  onTheme: (theme: ThemeId) => void;
  canToggleSidebar: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  hasDocument: boolean;
  onFind: () => void;
  onOpenInEditor: () => void;
  tocOpen: boolean;
  onToggleToc: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  /** Writing mode: the post's status and what its buttons do. */
  post?: { status: PostStatus; onCopy: () => void; onToggleStatus: () => void };
}

export function Toolbar(props: Props) {
  return (
    <header className="toolbar">
      <button
        className="icon-button"
        title="Toggle sidebar (⌘\)"
        aria-pressed={props.sidebarOpen}
        disabled={!props.canToggleSidebar}
        onClick={props.onToggleSidebar}
      >
        <PanelLeft size={16} />
      </button>
      <div className="toolbar-title">
        {props.title}
        {props.saveState && saveSuffix(props.saveState)}
      </div>
      <select className="theme-select" aria-label="Theme" value={props.theme} onChange={(e) => props.onTheme(e.target.value as ThemeId)}>
        {props.themes.map((id) => (
          <option key={id} value={id}>
            {THEMES[id].label}
          </option>
        ))}
      </select>
      {props.post && (
        <>
          <button className="text-button" title="Copy for Substack (⇧⌘C)" onClick={props.post.onCopy}>
            Copy for Substack
          </button>
          <button className="text-button solid" onClick={props.post.onToggleStatus}>
            {props.post.status === "published" ? "Mark as draft" : "Mark published"}
          </button>
        </>
      )}
      <button className="icon-button" title="Find (⌘F)" disabled={!props.hasDocument} onClick={props.onFind}>
        <Search size={16} />
      </button>
      <button className="icon-button" title="Open in editor (⌘E)" disabled={!props.hasDocument} onClick={props.onOpenInEditor}>
        <SquarePen size={16} />
      </button>
      <button className="icon-button" title="Toggle contents (⌥⌘\)" aria-pressed={props.tocOpen} onClick={props.onToggleToc}>
        <PanelRight size={16} />
      </button>
      <button className="icon-button" title="Settings (⌘,)" aria-pressed={props.settingsOpen} onClick={props.onSettings}>
        <Settings2 size={16} />
      </button>
    </header>
  );
}
