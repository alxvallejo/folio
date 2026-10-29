import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const tree = { root: { name: "Folio", path: "/u/Folio", isDir: true, children: [] }, truncated: false };

function show(props: Partial<ComponentProps<typeof Sidebar>>) {
  act(() => root.render(createElement(Sidebar, { root: "/u/Folio", tree, currentPath: null, onOpen: () => {}, ...props })));
}

const recentList = () => container.querySelector('[aria-label="Recent files"]');
const recentRows = () => [...container.querySelectorAll('[aria-label="Recent files"] button')];

describe("Recent", () => {
  it("is hidden when nothing has been opened", () => {
    show({ recent: [] });
    expect(container.querySelector(".sidebar-recent")).toBeNull();
  });

  it("lists each file with its folder, newest first, and marks the open one", () => {
    show({ recent: ["/u/Folio/Reports/2026-10-28.md", "/u/Folio/Posts/Hello.md"], currentPath: "/u/Folio/Posts/Hello.md" });
    expect(recentRows().map((b) => b.textContent)).toEqual(["2026-10-28.mdReports", "Hello.mdPosts"]);
    expect(recentRows()[1].classList.contains("active")).toBe(true);
  });

  it("opens a file through onOpenRecent", () => {
    const onOpenRecent = vi.fn();
    show({ recent: ["/u/Folio/Reports/2026-10-28.md"], onOpenRecent });
    act(() => (recentRows()[0] as HTMLButtonElement).click());
    expect(onOpenRecent).toHaveBeenCalledWith("/u/Folio/Reports/2026-10-28.md");
  });

  it("collapses to just its header, and asks to toggle when the header is clicked", () => {
    const onToggleRecent = vi.fn();
    show({ recent: ["/u/Folio/Reports/2026-10-28.md"], recentOpen: false, onToggleRecent });
    expect(recentList()).toBeNull();
    const header = container.querySelector(".recent-toggle") as HTMLButtonElement;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    act(() => header.click());
    expect(onToggleRecent).toHaveBeenCalledOnce();
  });
});
