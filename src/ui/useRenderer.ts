import { useEffect, useState } from "react";
import { createRenderer, type Render } from "../render";

/** The renderer, once Shiki has loaded; null until then. */
export function useRenderer(notify: (message: string) => void): Render | null {
  const [render, setRender] = useState<Render | null>(null);
  useEffect(() => {
    let alive = true;
    createRenderer().then(
      (r) => {
        if (alive) setRender(() => r);
      },
      (e) => notify(`Couldn't start the renderer: ${String(e)}`),
    );
    return () => {
      alive = false;
    };
  }, [notify]);
  return render;
}
